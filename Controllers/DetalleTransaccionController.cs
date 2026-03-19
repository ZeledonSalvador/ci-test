using Microsoft.AspNetCore.Mvc;
using FrontendQuickpass.Models;
using System.Net.Http.Headers;
using System.Text;
using Microsoft.Extensions.Options;
using FrontendQuickpass.Models.Configurations;
using Newtonsoft.Json;
using Microsoft.Extensions.Logging;
using FrontendQuickpass.Helpers;
using System.IO;
using System.Diagnostics;

namespace FrontendQuickpass.Controllers
{
    public class DetalleTransaccionController : BaseController
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ApiSettings _apiSettings;
        private readonly Services.LoginService _loginService;
        private readonly ILogger<DetalleTransaccionController> _logger;
        private readonly Services.IShipmentAuditService _auditService;
        private readonly Services.ITransactionLogService _transactionLogService;

        public DetalleTransaccionController(IHttpClientFactory httpClientFactory, IOptions<ApiSettings> apiOptions, Services.LoginService loginService, ILogger<DetalleTransaccionController> logger, Services.IShipmentAuditService auditService, Services.ITransactionLogService transactionLogService)
        {
            _httpClientFactory = httpClientFactory;
            _apiSettings = apiOptions.Value;
            _loginService = loginService;
            _logger = logger;
            _auditService = auditService;
            _transactionLogService = transactionLogService;
        }

        [HttpGet]
        public async Task<IActionResult> Index()
        {
            // Leer codeGen y actividad desde Session
            var codeGen = HttpContext.Session.GetString("DetalleTransaccion_CodeGen");
            var actividad = HttpContext.Session.GetString("DetalleTransaccion_Actividad");

            // Si no hay codeGen en Session, redirigir a lista
            if (string.IsNullOrEmpty(codeGen))
            {
                return RedirectToAction("Index", "ListaTransacciones");
            }

            Console.WriteLine($"DetalleTransaccion GET - CodeGen: {codeGen}, Actividad: {actividad}");

            ViewBag.Actividad = actividad ?? "Detalle de Transacción";
            ViewBag.CodeGen = codeGen ?? "";

            try
            {
                var client = _httpClientFactory.CreateClient();
                string token = _apiSettings.Token;
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

                string url = _apiSettings.BaseUrl + $"shipping/{codeGen}";
                var response = await client.GetAsync(url);

                if (!response.IsSuccessStatusCode)
                {
                    // Intentar leer el mensaje de error del API
                    string errorMessage = (int)response.StatusCode == 403
                        ? "No se pudo obtener los datos de la transacción. Por favor, vuelva a la lista de transacciones e intente nuevamente."
                        : $"Error al obtener transacción: {response.StatusCode}";

                    try
                    {
                        var errorJson = await response.Content.ReadAsStringAsync();
                        var errorData = JsonConvert.DeserializeObject<dynamic>(errorJson);

                        // Si es un 404, mostrar como información en lugar de error
                        if ((int)response.StatusCode == 404)
                        {
                            string mensaje = errorData?.message?.ToString() ?? "No se encontraron envíos";
                            ViewBag.InfoMessage = mensaje;
                            ViewBag.IsInfo = true;
                        }
                        else
                        {
                            // Para otros errores, mostrar como error normal
                            errorMessage = errorData?.message?.ToString() ?? errorMessage;
                            ViewBag.Error = errorMessage;
                        }
                    }
                    catch
                    {
                        // Si no se puede leer el JSON, usar mensaje genérico
                        if ((int)response.StatusCode == 404)
                        {
                            ViewBag.InfoMessage = "No se encontraron envíos";
                            ViewBag.IsInfo = true;
                        }
                        else
                        {
                            ViewBag.Error = errorMessage;
                        }
                    }

                    return View();
                }

                var json = await response.Content.ReadAsStringAsync();
                var data = JsonConvert.DeserializeObject<dynamic>(json);

                if (data == null)
                {
                    ViewBag.Error = "No se encontró la transacción";
                    return View();
                }

                // Obtener código de producto del shipping (ej: AZ-001, MEL-001)
                string productCode = data.product?.ToString() ?? "";

                // Obtener umbral de repesaje desde system-config usando el código de producto
                int umbralRepesaje = -100; // Valor por defecto
                try
                {
                    string urlConfig = _apiSettings.BaseUrl + "system-config";
                    var responseConfig = await client.GetAsync(urlConfig);
                    if (responseConfig.IsSuccessStatusCode)
                    {
                        var jsonConfig = await responseConfig.Content.ReadAsStringAsync();
                        var configItems = JsonConvert.DeserializeObject<List<dynamic>>(jsonConfig);
                        if (configItems != null)
                        {
                            foreach (var item in configItems)
                            {
                                // Buscar el umbral que coincida con el código de producto
                                if (item.key?.ToString() == productCode && item.active == true)
                                {
                                    int.TryParse(item.value?.ToString(), out umbralRepesaje);
                                    break;
                                }
                            }
                        }
                    }
                }
                catch (Exception exConfig)
                {
                    _logger.LogWarning(exConfig, "No se pudieron obtener umbrales de system-config, usando valores por defecto");
                }
                ViewBag.UmbralRepesaje = umbralRepesaje;
                ViewBag.ProductCode = productCode;

                // Función helper para convertir a double de forma segura
                double ToDouble(dynamic value)
                {
                    if (value == null) return 0;
                    try
                    {
                        return Convert.ToDouble(value);
                    }
                    catch
                    {
                        return 0;
                    }
                }

                // Información General - Obtener ID del envío
                // REFACTOR: Usar solo el ID del envío (data.id)
                var transaccionIds = new List<string>();
                if (data.id != null)
                {
                    transaccionIds.Add(data.id.ToString());
                }
                ViewBag.Transaccion = string.Join(", ", transaccionIds);
                ViewBag.Envio = data.id?.ToString() ?? "-";
                ViewBag.Cliente = data.ingenio?.name?.ToString()?.Replace("_", " ") ?? "";
                ViewBag.IngenioCode = data.ingenio?.ingenioCode?.ToString() ?? "";
                ViewBag.Producto = data.nameProduct?.ToString()?.Replace("_", " ") ?? "";
                ViewBag.CodigoGeneracion = data.codeGen?.ToString() ?? "";
                ViewBag.Transportista = data.transporter?.ToString() ?? "";
                ViewBag.Camion = data.vehicle?.plate?.ToString() ?? "";
                ViewBag.Remolque = data.vehicle?.trailerPlate?.ToString() ?? "";
                ViewBag.Motorista = data.driver?.name?.ToString() ?? "";
                ViewBag.Licencia = data.driver?.license?.ToString() ?? "";

                // Control de Pesaje - usar datos de Pesos[0] si existe
                double pesoBrutoAlmapac = 0;
                double pesoTaraAlmapac = 0;
                double pesoNetoAlmapac = 0;
                double pesoBrutoCliente = 0;
                double pesoTaraCliente = 0;
                double pesoNetoCliente = 0;
                double difBruto = 0;
                double difTara = 0;
                double difNeto = 0;

                // Intentar obtener datos del array Pesos
                if (data.Pesos != null && data.Pesos.Count > 0)
                {
                    var primerPesaje = data.Pesos[0];

                    // Almapac (datos del navRecord)
                    pesoBrutoAlmapac = ToDouble(primerPesaje.pesoEntradaNav);
                    pesoTaraAlmapac = ToDouble(primerPesaje.pesoSalidaNav);
                    pesoNetoAlmapac = ToDouble(primerPesaje.pesoNetoNav);

                    // Cliente (datos del ingenio)
                    pesoBrutoCliente = ToDouble(primerPesaje.pesoBrutoIngenio);
                    pesoTaraCliente = ToDouble(primerPesaje.pesoTaraIngenio);
                    pesoNetoCliente = ToDouble(primerPesaje.pesoNetoIngenio);

                    // Diferencias desde la API
                    difBruto = ToDouble(primerPesaje.pesoBrutoDiferencia);
                    difTara = ToDouble(primerPesaje.pesoTaraDiferencia);
                    difNeto = ToDouble(primerPesaje.pesoNetoDiferencia);
                }
                else
                {
                    // Fallback a datos directos si no existe el array Pesos
                    pesoBrutoAlmapac = ToDouble(data.pesoBruto);
                    pesoTaraAlmapac = ToDouble(data.pesoTara);
                    pesoNetoAlmapac = pesoBrutoAlmapac - pesoTaraAlmapac;

                    // Cliente: Usar peso neto del envío (productQuantityKg)
                    pesoBrutoCliente = 0;
                    pesoTaraCliente = 0;
                    pesoNetoCliente = ToDouble(data.productQuantityKg);

                    // Calcular diferencias manualmente
                    difBruto = pesoBrutoAlmapac - pesoBrutoCliente;
                    difTara = pesoTaraAlmapac - pesoTaraCliente;
                    difNeto = pesoNetoAlmapac - pesoNetoCliente;
                }

                ViewBag.PesoBrutoAlmapac = pesoBrutoAlmapac;
                ViewBag.PesoBrutoCliente = pesoBrutoCliente;
                ViewBag.PesoNetoAlmapac = pesoNetoAlmapac;
                ViewBag.PesoNetoCliente = pesoNetoCliente;
                ViewBag.PesoTaraAlmapac = pesoTaraAlmapac;
                ViewBag.PesoTaraCliente = pesoTaraCliente;
                ViewBag.DifBruto = difBruto;
                ViewBag.DifTara = difTara;
                ViewBag.DifNeto = difNeto;

                // Estado actual de la transacción
                ViewBag.CurrentStatus = data.currentStatus != null ? Convert.ToInt32(data.currentStatus) : 0;

                // Control de Despacho
                ViewBag.Tarjeta = data.magneticCard?.ToString() ?? "";

                // Validar que navRecord sea un objeto antes de acceder a sus propiedades
                // REFACTOR: Eliminada dependencia de navRecord.descAlmacen. 
                // La vista usa ViewBag.WarehouseId y ViewBag.Warehouses para mostrar el nombre.
                ViewBag.Almacen = "";


                // Humedad desde data.humidity (si existe) o data.brix como fallback
                ViewBag.Humedad = data.humidity != null ? ToDouble(data.humidity) : ToDouble(data.brix);

                // Marchamos: priorizar data.marchamos (array con numero/posicion), si no existe usar shipmentSeals o navRecord
                ViewBag.Marchamo1 = "";
                ViewBag.Marchamo2 = "";
                ViewBag.Marchamo3 = "";
                ViewBag.Marchamo4 = "";
                ViewBag.TieneMarchamos = false;

                if (data.marchamos != null && ((IEnumerable<dynamic>)data.marchamos).Count() > 0)
                {
                    // Cargar marchamos asignados desde el array marchamos (formato: { numero, posicion })
                    var marchamosArray = ((IEnumerable<dynamic>)data.marchamos).OrderBy(m => (int?)m.posicion ?? 0).ToList();
                    ViewBag.TieneMarchamos = true;

                    // Usar "numero" en lugar de "code"
                    if (marchamosArray.Count > 0) ViewBag.Marchamo1 = marchamosArray[0].numero?.ToString() ?? "";
                    if (marchamosArray.Count > 1) ViewBag.Marchamo2 = marchamosArray[1].numero?.ToString() ?? "";
                    if (marchamosArray.Count > 2) ViewBag.Marchamo3 = marchamosArray[2].numero?.ToString() ?? "";
                    if (marchamosArray.Count > 3) ViewBag.Marchamo4 = marchamosArray[3].numero?.ToString() ?? "";
                }

                // Información del último barrido
                ViewBag.TipoBarrido = "";
                ViewBag.ComentarioBarrido = "";

                if (data.barrido != null && ((IEnumerable<dynamic>)data.barrido).Count() > 0)
                {
                    // El array viene ordenado del más reciente al más antiguo, tomar el primero
                    var ultimoBarrido = ((IEnumerable<dynamic>)data.barrido).First();
                    ViewBag.TipoBarrido = ultimoBarrido.tipo?.ToString() ?? "";
                    ViewBag.ComentarioBarrido = ultimoBarrido.razon?.ToString() ?? "";
                }

                // Fechas para impresión
                // Buscar el PRIMER status 7 para entrada y el ÚLTIMO status 11 para salida en el array statuses
                string fechaEntrada = "";
                string fechaSalida = "";
                if (data.statuses != null)
                {
                    var statusesArray = ((IEnumerable<dynamic>)data.statuses).ToList();

                    // Primer status 7 (fecha de entrada)
                    var primerStatus7 = statusesArray.FirstOrDefault(s => (int?)s.id == 7);
                    if (primerStatus7 != null)
                    {
                        DateTime? fechaCreacion = primerStatus7.createdAt;
                        fechaEntrada = fechaCreacion?.ToString("o") ?? ""; // Formato ISO 8601
                    }

                    // Último status 11 (fecha de salida)
                    var ultimoStatus11 = statusesArray.LastOrDefault(s => (int?)s.id == 11);
                    if (ultimoStatus11 != null)
                    {
                        DateTime? fechaCreacion = ultimoStatus11.createdAt;
                        fechaSalida = fechaCreacion?.ToString("o") ?? ""; // Formato ISO 8601
                    }
                }

                ViewBag.FechaEntra = fechaEntrada;
                ViewBag.FechaSale = fechaSalida;
                ViewBag.PesoIn = pesoBrutoCliente;

                // Comprobante: priorizar data.comprobante, si no existe obtener el siguiente
                ViewBag.Comprobante = "";
                ViewBag.TieneComprobante = false;
                ViewBag.ComprobanteImpreso = false;

                if (data.comprobante != null && data.comprobante.numero != null)
                {
                    // Ya tiene comprobante asignado (formato: { numero, impreso, fechaImpresion })
                    ViewBag.Comprobante = data.comprobante.numero.ToString();
                    ViewBag.TieneComprobante = true;

                    // Verificar si el comprobante ha sido impreso
                    ViewBag.ComprobanteImpreso = data.comprobante.impreso == true;
                }
                else
                {
                    // No tiene comprobante, obtener el siguiente según la báscula del usuario
                    try
                    {
                        var sessionHelper = new Helpers.SessionHelper(_loginService, HttpContext);
                        string codBascula = sessionHelper.CodBascula;

                        Console.WriteLine($"DEBUG - Obteniendo siguiente comprobante. CodBascula: '{codBascula}'");

                        if (!string.IsNullOrEmpty(codBascula) && int.TryParse(codBascula, out int idBascula))
                        {
                            string urlComprobante = _apiSettings.BaseUrl + $"correlatives/vouchers/next/{idBascula}";
                            Console.WriteLine($"DEBUG - URL Comprobante: {urlComprobante}");

                            var responseComprobante = await client.GetAsync(urlComprobante);
                            Console.WriteLine($"DEBUG - Response Status: {responseComprobante.StatusCode}");

                            if (responseComprobante.IsSuccessStatusCode)
                            {
                                var jsonComprobante = await responseComprobante.Content.ReadAsStringAsync();
                                Console.WriteLine($"DEBUG - Response JSON: {jsonComprobante}");

                                var comprobanteData = JsonConvert.DeserializeObject<dynamic>(jsonComprobante);
                                // El API retorna { "voucherNumber": 15 }

                                if (comprobanteData?.voucherNumber != null)
                                {
                                    ViewBag.Comprobante = comprobanteData.voucherNumber.ToString();
                                    Console.WriteLine($"DEBUG - Comprobante asignado: {ViewBag.Comprobante}");
                                }
                                else
                                {
                                    ViewBag.Comprobante = "";
                                    Console.WriteLine("DEBUG - No se encontró voucherNumber en la respuesta");
                                }
                            }
                            else
                            {
                                var errorContent = await responseComprobante.Content.ReadAsStringAsync();
                                Console.WriteLine($"DEBUG - Error al obtener comprobante: {errorContent}");

                                // Intentar parsear el mensaje de error
                                try
                                {
                                    var errorData = JsonConvert.DeserializeObject<dynamic>(errorContent);
                                    string errorMsg = errorData?.message?.ToString() ?? "No se pudo obtener el siguiente comprobante.";
                                    ViewBag.WarningComprobante = errorMsg;
                                }
                                catch
                                {
                                    ViewBag.WarningComprobante = "Actualmente no hay comprobantes asignados a esta báscula. Para continuar, comuníquese con el auditor y solicite la asignación de nuevos comprobantes.";
                                }
                            }
                        }
                        else
                        {
                            Console.WriteLine($"DEBUG - CodBascula inválido o vacío");
                        }
                    }
                    catch (Exception exComprobante)
                    {
                        _logger.LogError(exComprobante, "ERROR al obtener siguiente comprobante: {Message}", exComprobante.Message);
                        // Si falla, dejar el comprobante vacío
                        ViewBag.Comprobante = "";
                    }
                }

                // Pesajes - datos para el historial de pesajes
                ViewBag.PesajesJson = data.pesajes != null
                    ? JsonConvert.SerializeObject(data.pesajes)
                    : "[]";

                // Consolidado - datos para el consolidado de pesos
                ViewBag.ConsolidadoJson = data.consolidado != null
                    ? JsonConvert.SerializeObject(data.consolidado)
                    : "{\"detalle\":[],\"total\":0}";

                // Almacén para MELAZA - obtener warehouseId del envío y lista de warehouses
                ViewBag.WarehouseId = null;
                ViewBag.Warehouses = new List<dynamic>();

                string nombreProducto = data.nameProduct?.ToString()?.ToUpper() ?? "";
                bool esMelaza = nombreProducto.Contains("MELAZA");

                if (esMelaza)
                {
                    // Obtener warehouseId del envío si ya tiene asignado
                    if (data.warehouseId != null)
                    {
                        ViewBag.WarehouseId = (int?)data.warehouseId;
                    }

                    // Obtener lista de warehouses desde la API
                    try
                    {
                        string urlWarehouses = _apiSettings.BaseUrl + "warehouses";
                        var responseWarehouses = await client.GetAsync(urlWarehouses);

                        if (responseWarehouses.IsSuccessStatusCode)
                        {
                            var jsonWarehouses = await responseWarehouses.Content.ReadAsStringAsync();
                            var warehousesList = JsonConvert.DeserializeObject<List<dynamic>>(jsonWarehouses);

                            if (warehousesList != null)
                            {
                                // Filtrar solo los activos
                                ViewBag.Warehouses = warehousesList.Where(w => w.isActive == true).ToList();
                            }
                        }
                        else
                        {
                            _logger.LogWarning("No se pudieron obtener warehouses: Status {Status}", responseWarehouses.StatusCode);
                        }
                    }
                    catch (Exception exWarehouses)
                    {
                        _logger.LogWarning(exWarehouses, "Error al obtener warehouses");
                    }
                }

                // Observaciones - Obtener del envío
                ViewBag.Observaciones = data.observations?.ToString() ?? "";

                // Bitácora - Obtener desde el endpoint de events (cronológico, con 1 reintento)
                var bitacora = await ObtenerEventsConRetry(client, codeGen);
                ViewBag.Bitacora = bitacora;

                // Obtener el código del usuario de la sesión para mostrar como PESADOR (con fallback a fullName)
                var sessionHelperUsuario = new Helpers.SessionHelper(_loginService, HttpContext);
                ViewBag.NombreUsuario = !string.IsNullOrEmpty(sessionHelperUsuario.UserCode)
                    ? sessionHelperUsuario.UserCode
                    : sessionHelperUsuario.FullName ?? "Sistema";

                Console.WriteLine($"Datos cargados correctamente. Transaccion: {ViewBag.Transaccion}");
                return View();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "ERROR en DetalleTransaccion: {Message}", ex.Message);
                ViewBag.Error = "No se pudo cargar la información de la transacción. Por favor, intente nuevamente.";
                return View();
            }
        }

        /// <summary>
        /// POST que guarda en Session y redirige a GET (patrón PRG para evitar reenvío de formulario)
        /// </summary>
        [HttpPost]
        [ActionName("Index")]
        public IActionResult IndexPost(string codeGen, string actividad)
        {
            // Guardar en Session para que no aparezca en la URL
            HttpContext.Session.SetString("DetalleTransaccion_CodeGen", codeGen ?? "");
            HttpContext.Session.SetString("DetalleTransaccion_Actividad", actividad ?? "");

            return RedirectToAction("Index");
        }

        /// <summary>
        /// Guarda los cambios de la transacción (marchamos y comprobante)
        /// </summary>
        [HttpPost]
        public async Task<IActionResult> Guardar([FromBody] GuardarTransaccionRequest request)
        {
            try
            {
                var client = _httpClientFactory.CreateClient();
                string token = _apiSettings.Token;
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

                // 1. Obtener el idShipment del API usando el codeGen
                string urlGet = _apiSettings.BaseUrl + $"shipping/{request.CodeGen}";
                var responseGet = await client.GetAsync(urlGet);

                if (!responseGet.IsSuccessStatusCode)
                {
                    return Json(new { success = false, message = "Error al obtener información del envío" });
                }

                var jsonGet = await responseGet.Content.ReadAsStringAsync();
                var shipmentData = JsonConvert.DeserializeObject<dynamic>(jsonGet);

                if (shipmentData?.id == null)
                {
                    return Json(new { success = false, message = "No se pudo obtener el ID del envío" });
                }

                int idShipment = shipmentData.id;

                // 2. Obtener id_bascula del usuario logueado
                var sessionHelper = new Helpers.SessionHelper(_loginService, HttpContext);
                string codBascula = sessionHelper.CodBascula;

                if (string.IsNullOrEmpty(codBascula) || !int.TryParse(codBascula, out int idBascula))
                {
                    return Json(new { success = false, message = "No se pudo obtener la báscula del usuario" });
                }

                // 3. PRIMERO: Guardar marchamos con shipmentId, weighbridgeId y sealNumbers (solo los que no están vacíos y son válidos)
                Console.WriteLine($"DEBUG Marchamos - M1: '{request.Marchamo1}', M2: '{request.Marchamo2}', M3: '{request.Marchamo3}', M4: '{request.Marchamo4}'");

                var sealNumbers = new List<int>();
                if (!string.IsNullOrWhiteSpace(request.Marchamo1) && int.TryParse(request.Marchamo1, out int seal1)) sealNumbers.Add(seal1);
                if (!string.IsNullOrWhiteSpace(request.Marchamo2) && int.TryParse(request.Marchamo2, out int seal2)) sealNumbers.Add(seal2);
                if (!string.IsNullOrWhiteSpace(request.Marchamo3) && int.TryParse(request.Marchamo3, out int seal3)) sealNumbers.Add(seal3);
                if (!string.IsNullOrWhiteSpace(request.Marchamo4) && int.TryParse(request.Marchamo4, out int seal4)) sealNumbers.Add(seal4);

                Console.WriteLine($"DEBUG Marchamos - sealNumbers count: {sealNumbers.Count}, values: [{string.Join(", ", sealNumbers)}]");

                if (sealNumbers.Count > 0)
                {
                    var payloadMarchamos = new
                    {
                        sealNumbers = sealNumbers,
                        shipmentId = idShipment,
                        weighbridgeId = idBascula
                    };

                    string urlPostMarchamos = _apiSettings.BaseUrl + "correlatives/seals/assign";
                    string jsonPayloadMarchamos = JsonConvert.SerializeObject(payloadMarchamos);

                    Console.WriteLine($"DEBUG Marchamos - URL: {urlPostMarchamos}");
                    Console.WriteLine($"DEBUG Marchamos - Payload: {jsonPayloadMarchamos}");

                    var contentMarchamos = new StringContent(
                        jsonPayloadMarchamos,
                        System.Text.Encoding.UTF8,
                        "application/json"
                    );

                    var responsePostMarchamos = await client.PostAsync(urlPostMarchamos, contentMarchamos);

                    var responseContent = await responsePostMarchamos.Content.ReadAsStringAsync();

                    if (!responsePostMarchamos.IsSuccessStatusCode)
                    {
                        // Intentar parsear el error para mostrar mensaje más claro
                        string errorMessage = $"Error al guardar marchamos";
                        try
                        {
                            var errorData = JsonConvert.DeserializeObject<dynamic>(responseContent);
                            errorMessage = errorData?.message?.ToString() ?? errorMessage;
                        }
                        catch
                        {
                            errorMessage = responseContent;
                        }

                        return Json(new { success = false, message = errorMessage });
                    }

                    // Verificar si la respuesta indica que la validación falló (aunque el status sea 2xx)
                    try
                    {
                        var responseData = JsonConvert.DeserializeObject<dynamic>(responseContent);
                        if (responseData?.valid == false)
                        {
                            string errorMessage = responseData?.message?.ToString() ?? "Error de validación al guardar marchamos";
                            return Json(new { success = false, message = errorMessage });
                        }
                    }
                    catch
                    {
                        // Si no se puede parsear, continuar normalmente
                    }
                }
                else
                {
                    Console.WriteLine("DEBUG Marchamos - No hay marchamos válidos para guardar");
                }

                // 4. Guardar humedad solo si el producto es AZÚCAR
                string nombreProducto = shipmentData?.nameProduct?.ToString()?.ToUpper() ?? "";

                if (nombreProducto.Contains("AZUCAR") || nombreProducto.Contains("AZÚCAR"))
                {
                    // Solo guardar humedad si viene el valor
                    if (!string.IsNullOrWhiteSpace(request.Humedad) && double.TryParse(request.Humedad, out double humedadValue))
                    {
                        var payloadHumedad = new
                        {
                            humidity = humedadValue
                        };

                        string urlPostHumedad = _apiSettings.BaseUrl + $"shipping/humedad/{request.CodeGen}";
                        var contentHumedad = new StringContent(
                            JsonConvert.SerializeObject(payloadHumedad),
                            System.Text.Encoding.UTF8,
                            "application/json"
                        );

                        Console.WriteLine($"DEBUG - Guardando humedad para producto AZÚCAR: {humedadValue}");
                        Console.WriteLine($"DEBUG - URL: {urlPostHumedad}");

                        var responsePostHumedad = await client.PostAsync(urlPostHumedad, contentHumedad);

                        if (!responsePostHumedad.IsSuccessStatusCode)
                        {
                            var errorContent = await responsePostHumedad.Content.ReadAsStringAsync();
                            Console.WriteLine($"WARNING - Error al guardar humedad: {errorContent}");
                            // No detener el proceso si falla la humedad, solo registrar el error
                        }
                        else
                        {
                            Console.WriteLine("DEBUG - Humedad guardada exitosamente");
                        }
                    }
                }
                else
                {
                    Console.WriteLine($"DEBUG - Producto '{nombreProducto}' no requiere humedad");
                }

                // 5. DESPUÉS: Solo procesar comprobante si viene en el request
                Console.WriteLine($"DEBUG Comprobante - request.Comprobante: '{request.Comprobante}'");

                // Solo procesar el comprobante si se envió desde el frontend (no está vacío)
                if (!string.IsNullOrWhiteSpace(request.Comprobante))
                {
                    if (!int.TryParse(request.Comprobante, out int numeroComprobante))
                    {
                        Console.WriteLine("DEBUG Comprobante - Número de comprobante inválido");
                        return Json(new { success = false, message = "El número de comprobante no es válido." });
                    }

                    // 6. Obtener userId del usuario logueado
                    int userId = 0;
                    int.TryParse(sessionHelper.CodUsuario, out userId);

                    Console.WriteLine($"DEBUG Comprobante - numeroComprobante: {numeroComprobante}, shipmentId: {idShipment}, weighbridgeId: {idBascula}, userId: {userId}");

                    // 7. Guardar comprobante con voucherNumber, shipmentId, weighbridgeId, userId
                    var payloadComprobante = new
                    {
                        voucherNumber = numeroComprobante,
                        shipmentId = idShipment,
                        weighbridgeId = idBascula,
                        userId = userId
                    };

                    string urlPostComprobante = _apiSettings.BaseUrl + "correlatives/vouchers/assign";
                    string jsonPayloadComprobante = JsonConvert.SerializeObject(payloadComprobante);

                    Console.WriteLine($"DEBUG Comprobante - URL: {urlPostComprobante}");
                    Console.WriteLine($"DEBUG Comprobante - Payload: {jsonPayloadComprobante}");

                    var contentComprobante = new StringContent(
                        jsonPayloadComprobante,
                        System.Text.Encoding.UTF8,
                        "application/json"
                    );

                    var responsePostComprobante = await client.PostAsync(urlPostComprobante, contentComprobante);

                    var responseComprobanteContent = await responsePostComprobante.Content.ReadAsStringAsync();

                    if (!responsePostComprobante.IsSuccessStatusCode)
                    {
                        // Intentar parsear el error para mostrar mensaje más claro
                        string errorMessage = $"Error al guardar comprobante";
                        try
                        {
                            var errorData = JsonConvert.DeserializeObject<dynamic>(responseComprobanteContent);
                            errorMessage = errorData?.message?.ToString() ?? errorMessage;
                        }
                        catch
                        {
                            errorMessage = responseComprobanteContent;
                        }

                        return Json(new { success = false, message = errorMessage });
                    }

                    // Verificar si la respuesta indica que la validación falló (aunque el status sea 2xx)
                    try
                    {
                        var responseData = JsonConvert.DeserializeObject<dynamic>(responseComprobanteContent);
                        if (responseData?.valid == false)
                        {
                            string errorMessage = responseData?.message?.ToString() ?? "Error de validación al guardar comprobante";
                            Console.WriteLine($"DEBUG Comprobante - Validación falló: {errorMessage}");
                            return Json(new { success = false, message = errorMessage });
                        }
                    }
                    catch
                    {
                        // Si no se puede parsear, continuar normalmente
                    }

                    Console.WriteLine("DEBUG Comprobante - Comprobante guardado exitosamente");
                }
                else
                {
                    Console.WriteLine("DEBUG Comprobante - No se envió comprobante para guardar (ya está asignado)");
                }

                // 8. Asignar almacén si viene warehouseId (solo para MELAZA)
                if (request.WarehouseId.HasValue && request.WarehouseId.Value > 0)
                {
                    var payloadWarehouse = new
                    {
                        shipmentId = idShipment,
                        warehouseId = request.WarehouseId.Value
                    };

                    string urlPostWarehouse = _apiSettings.BaseUrl + "warehouses/assign";
                    string jsonPayloadWarehouse = JsonConvert.SerializeObject(payloadWarehouse);

                    var contentWarehouse = new StringContent(
                        jsonPayloadWarehouse,
                        System.Text.Encoding.UTF8,
                        "application/json"
                    );

                    var responsePostWarehouse = await client.PostAsync(urlPostWarehouse, contentWarehouse);

                    if (!responsePostWarehouse.IsSuccessStatusCode)
                    {
                        var responseWarehouseContent = await responsePostWarehouse.Content.ReadAsStringAsync();
                        string errorMessage = "Error al asignar almacén";
                        try
                        {
                            var errorData = JsonConvert.DeserializeObject<dynamic>(responseWarehouseContent);
                            errorMessage = errorData?.message?.ToString() ?? errorMessage;
                        }
                        catch
                        {
                            errorMessage = responseWarehouseContent;
                        }
                        _logger.LogWarning("Error al asignar almacén: {Error}", errorMessage);
                    }
                }

                // 9. Guardar observaciones si viene en el request
                if (!string.IsNullOrWhiteSpace(request.Observaciones))
                {
                    try
                    {
                        var payloadObservaciones = new
                        {
                            shipmentId = idShipment,
                            observations = request.Observaciones
                        };

                        string urlPostObservaciones = _apiSettings.BaseUrl + "shipping/observations";
                        var contentObservaciones = new StringContent(
                            JsonConvert.SerializeObject(payloadObservaciones),
                            System.Text.Encoding.UTF8,
                            "application/json"
                        );

                        var responseObservaciones = await client.PostAsync(urlPostObservaciones, contentObservaciones);

                        if (!responseObservaciones.IsSuccessStatusCode)
                        {
                            var responseObservacionesContent = await responseObservaciones.Content.ReadAsStringAsync();
                            _logger.LogWarning("Error al guardar observaciones: {Error}", responseObservacionesContent);
                        }
                    }
                    catch (Exception exObs)
                    {
                        _logger.LogWarning(exObs, "Error al guardar observaciones");
                    }
                }

                return Json(new
                {
                    success = true,
                    message = "Transacción guardada correctamente"
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "ERROR al guardar transacción: {Message}", ex.Message);
                return Json(new { success = false, message = "Ocurrió un error al guardar la transacción. Por favor, intente nuevamente." });
            }
        }

        /// <summary>
        /// Completar transacción (cambiar a estado 12)
        /// </summary>
        [HttpPost]
        public async Task<IActionResult> CompletarTransaccion([FromBody] CompletarTransaccionRequest request)
        {
            try
            {
                if (request == null || string.IsNullOrWhiteSpace(request.CodeGen))
                    return Json(new { success = false, message = "CodeGen es requerido." });

                var client = _httpClientFactory.CreateClient();
                string token = _apiSettings.Token;
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

                // Usuario logueado
                var sessionHelper = new Helpers.SessionHelper(_loginService, HttpContext);
                string username = string.IsNullOrEmpty(sessionHelper.Username) ? "Sistema" : sessionHelper.Username;

                // 1) Cambiar a estado 12
                var payload = new
                {
                    codeGen = request.CodeGen,
                    predefinedStatusId = 12,
                    leveransUsername = username
                };

                string statusUrl = _apiSettings.BaseUrl.TrimEnd('/') + "/status/push";
                var content = new StringContent(
                    JsonConvert.SerializeObject(payload),
                    Encoding.UTF8,
                    "application/json"
                );

                var response = await client.PostAsync(statusUrl, content);

                if (!response.IsSuccessStatusCode)
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    return Json(new { success = false, message = ParseApiErrorMessage(errorContent) });
                }

                // Auditoría del cambio de estado
                var userId = GetUserId();
                if (userId == 0)
                {
                    _logger.LogWarning("No se pudo obtener userId para codeGen: {CodeGen}", request.CodeGen);
                    return Json(new { success = false, message = "Error: Usuario no autenticado" });
                }
                _auditService.RegisterStatusChange(request.CodeGen, 12, userId, "internal");

                // 2) Disparar Excalibur en background con logging de errores
                _ = DispararExcaliburAsync(request.CodeGen, username);

                return Json(new { success = true, message = "Transacción completada correctamente" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "ERROR al completar transacción: {Message}", ex.Message);
                return Json(new { success = false, message = "Ocurrió un error al completar la transacción. Por favor, intente nuevamente." });
            }
        }

        /// <summary>
        /// Dispara el envío a Excalibur de forma asíncrona en background
        /// </summary>
        private async Task DispararExcaliburAsync(string codeGen, string username)
        {
            try
            {
                // Crear un nuevo HttpClient específico para esta operación
                using var client = _httpClientFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(30); // Timeout de 30 segundos
                
                string token = _apiSettings.Token;
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var safeCodeGen = Uri.EscapeDataString(codeGen);
                string excUrl = _apiSettings.BaseUrl.TrimEnd('/') + $"/status/{safeCodeGen}/excalibur/receipt/send";

                using var excContent = new StringContent("{}", Encoding.UTF8, "application/json");
                var excResp = await client.PostAsync(excUrl, excContent);

                var excBody = await excResp.Content.ReadAsStringAsync();

                // Verificar tanto el status HTTP como el campo "success" del JSON
                bool isSuccess = false;
                string message = "";
                
                if (excResp.IsSuccessStatusCode)
                {
                    try
                    {
                        var responseData = JsonConvert.DeserializeObject<dynamic>(excBody);
                        isSuccess = responseData?.success == true;
                        message = responseData?.message?.ToString() ?? "";
                    }
                    catch
                    {
                        // Si no se puede parsear, considerar como error
                        isSuccess = false;
                    }
                }

                if (isSuccess)
                {
                    // Registrar éxito real en el log de transacciones
                    var successData = new
                    {
                        url = excUrl,
                        statusCode = (int)excResp.StatusCode,
                        response = excBody,
                        message = message,
                        eventType = "EXCALIBUR_SEND_SUCCESS"
                    };
                    
                    _transactionLogService.LogActivityAsync(
                        codeGen, 
                        successData, 
                        username, 
                        (int)excResp.StatusCode
                    );
                }
                else
                {
                    // Registrar error en el log de transacciones
                    var errorData = new
                    {
                        url = excUrl,
                        statusCode = (int)excResp.StatusCode,
                        response = excBody,
                        message = message,
                        errorType = "EXCALIBUR_SEND_FAILED"
                    };
                    
                    _transactionLogService.LogActivityAsync(
                        codeGen, 
                        errorData, 
                        username, 
                        (int)excResp.StatusCode
                    );
                }
            }
            catch (TaskCanceledException tex)
            {
                // Registrar timeout en el log
                var timeoutData = new
                {
                    errorType = "EXCALIBUR_TIMEOUT",
                    message = "La petición excedió los 30 segundos",
                    exception = tex.Message
                };
                
                _transactionLogService.LogActivityAsync(codeGen, timeoutData, username, 408);
            }
            catch (HttpRequestException hex)
            {
                // Registrar error HTTP en el log
                var httpErrorData = new
                {
                    errorType = "EXCALIBUR_HTTP_ERROR",
                    message = hex.Message,
                    innerException = hex.InnerException?.Message
                };
                
                _transactionLogService.LogActivityAsync(codeGen, httpErrorData, username, 500);
            }
            catch (Exception ex)
            {
                // Registrar error crítico en el log
                var criticalErrorData = new
                {
                    errorType = "EXCALIBUR_CRITICAL_ERROR",
                    exceptionType = ex.GetType().Name,
                    message = ex.Message,
                    stackTrace = ex.StackTrace
                };
                
                _transactionLogService.LogActivityAsync(codeGen, criticalErrorData, username, 500);
            }
        }

        private string ParseApiErrorMessage(string errorContent)
        {
            if (string.IsNullOrWhiteSpace(errorContent)) return "Error al completar transacción";

            try
            {
                dynamic errorData = JsonConvert.DeserializeObject<dynamic>(errorContent);
                return errorData?.message?.ToString() ?? errorContent;
            }
            catch
            {
                return errorContent;
            }
        }

        /// <summary>
        /// Agregar observación a la bitácora
        /// </summary>
        [HttpPost]
        public async Task<IActionResult> AgregarObservacion([FromBody] DetalleObservacionRequest request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.CodeGen))
                {
                    return Json(new { success = false, message = "Código de generación es requerido" });
                }

                if (string.IsNullOrWhiteSpace(request.Observacion))
                {
                    return Json(new { success = false, message = "La observación no puede estar vacía" });
                }

                // Obtener userId del usuario autenticado
                var userId = GetUserId();
                if (userId == 0)
                {
                    _logger.LogWarning("No se pudo obtener userId para agregar observación en codeGen: {CodeGen}", request.CodeGen);
                    return Json(new { success = false, message = "Usuario no autenticado" });
                }

                var client = _httpClientFactory.CreateClient();
                string token = _apiSettings.Token;
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

                // Registrar observación en el endpoint de audit
                var url = $"{_apiSettings.BaseUrl}shipment-audit/register";
                var payload = new
                {
                    codeGen = request.CodeGen,
                    actionType = "COMMENT_ADDED",
                    description = request.Observacion,
                    userId = userId,
                    userType = "internal",
                    visibleTo = "INTERNAL"
                };

                var json = JsonConvert.SerializeObject(payload);
                var httpContent = new StringContent(json, System.Text.Encoding.UTF8, "application/json");

                var response = await client.PostAsync(url, httpContent);

                if (response.IsSuccessStatusCode)
                {
                    _logger.LogInformation("Observación agregada exitosamente para codeGen: {CodeGen} por usuario: {UserId}",
                        request.CodeGen, userId);
                    return Json(new { success = true, message = "Observación agregada correctamente" });
                }
                else
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    _logger.LogWarning("Error al agregar observación. Status: {StatusCode}, CodeGen: {CodeGen}, Error: {Error}",
                        response.StatusCode, request.CodeGen, errorContent);
                    return Json(new { success = false, message = "No se pudo registrar la observación" });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "ERROR al agregar observación: {Message}", ex.Message);
                return Json(new { success = false, message = "Ocurrió un error al agregar la observación. Por favor, intente nuevamente." });
            }
        }

        /// <summary>
        /// Anular un marchamo específico
        /// </summary>
        [HttpPost]
        public async Task<IActionResult> AnularMarchamo([FromBody] AnularMarchamoRequest request)
        {
            try
            {
                var client = _httpClientFactory.CreateClient();
                string token = _apiSettings.Token;
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

                // Obtener userId del usuario logueado
                var sessionHelper = new Helpers.SessionHelper(_loginService, HttpContext);
                string codUsuarioStr = sessionHelper.CodUsuario;
                int userId = 0;
                int.TryParse(codUsuarioStr, out userId);

                Console.WriteLine($"Anulando marchamo: {request.SealCode} para codeGen: {request.CodeGen}");
                Console.WriteLine($"Motivo: {request.Motivo}");
                Console.WriteLine($"CodUsuario string: '{codUsuarioStr}', UserId parsed: {userId}");

                // Validar que el userId sea válido
                if (userId <= 0)
                {
                    return Json(new { success = false, message = "No se pudo obtener el usuario de la sesión" });
                }

                // Payload para anular marchamo: api/correlatives/seals/void/:numero
                var payload = new
                {
                    reason = request.Motivo + (!string.IsNullOrEmpty(request.Observacion) ? $" - {request.Observacion}" : ""),
                    userId = userId
                };

                string url = _apiSettings.BaseUrl + $"correlatives/seals/void/{request.SealCode}";
                string jsonPayload = JsonConvert.SerializeObject(payload);

                Console.WriteLine($"DEBUG - URL Anular Marchamo: {url}");
                Console.WriteLine($"DEBUG - Payload: {jsonPayload}");

                var content = new StringContent(
                    jsonPayload,
                    System.Text.Encoding.UTF8,
                    "application/json"
                );

                // POST api/correlatives/seals/void/:numero
                var response = await client.PostAsync(url, content);
                Console.WriteLine($"DEBUG - Response Status: {response.StatusCode}");

                if (!response.IsSuccessStatusCode)
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    string errorMessage = "Error al anular marchamo";
                    try
                    {
                        var errorData = JsonConvert.DeserializeObject<dynamic>(errorContent);
                        errorMessage = errorData?.message?.ToString() ?? errorContent;
                    }
                    catch
                    {
                        errorMessage = errorContent;
                    }
                    return Json(new { success = false, message = errorMessage });
                }

                return Json(new { success = true, message = "Marchamo anulado correctamente" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "ERROR al anular marchamo: {Message}", ex.Message);
                return Json(new { success = false, message = "Ocurrió un error al anular el marchamo. Por favor, intente nuevamente." });
            }
        }

        /// <summary>
        /// Anular el comprobante de la transacción
        /// Permite anular incluso si el comprobante no ha sido asignado al shipment (caso de daño o asignación a otra actividad)
        /// </summary>
        [HttpPost]
        public async Task<IActionResult> AnularComprobante([FromBody] AnularComprobanteRequest request)
        {
            try
            {
                var client = _httpClientFactory.CreateClient();
                string token = _apiSettings.Token;
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

                string numeroComprobante = "";

                // Si viene el número de comprobante directamente, usarlo
                if (!string.IsNullOrEmpty(request.NumeroComprobante))
                {
                    numeroComprobante = request.NumeroComprobante;
                    Console.WriteLine($"Usando número de comprobante del request: {numeroComprobante}");
                }
                else
                {
                    // Intentar obtener el comprobante del shipment
                    string urlGet = _apiSettings.BaseUrl + $"shipping/{request.CodeGen}";
                    var responseGet = await client.GetAsync(urlGet);

                    if (responseGet.IsSuccessStatusCode)
                    {
                        var jsonGet = await responseGet.Content.ReadAsStringAsync();
                        var shipmentData = JsonConvert.DeserializeObject<dynamic>(jsonGet);

                        if (shipmentData?.comprobante?.numero != null)
                        {
                            numeroComprobante = shipmentData.comprobante.numero.ToString();
                            Console.WriteLine($"Comprobante obtenido del shipment: {numeroComprobante}");
                        }
                    }
                }

                // Si aún no tenemos el número de comprobante, retornar error
                if (string.IsNullOrEmpty(numeroComprobante))
                {
                    return Json(new { success = false, message = "No se proporcionó el número de comprobante a anular" });
                }

                // Obtener userId del usuario logueado
                var sessionHelper = new Helpers.SessionHelper(_loginService, HttpContext);
                string codUsuarioStr = sessionHelper.CodUsuario;
                int userId = 0;
                int.TryParse(codUsuarioStr, out userId);

                Console.WriteLine($"Anulando comprobante {numeroComprobante} para codeGen: {request.CodeGen}");
                Console.WriteLine($"Motivo: {request.Motivo}");
                Console.WriteLine($"CodUsuario string: '{codUsuarioStr}', UserId parsed: {userId}");

                // Validar que el userId sea válido
                if (userId <= 0)
                {
                    return Json(new { success = false, message = "No se pudo obtener el usuario de la sesión" });
                }

                // Payload para anular comprobante: api/correlatives/vouchers/void/:numero
                var payload = new
                {
                    reason = request.Motivo + (!string.IsNullOrEmpty(request.Observacion) ? $" - {request.Observacion}" : ""),
                    userId = userId
                };

                string url = _apiSettings.BaseUrl + $"correlatives/vouchers/void/{numeroComprobante}";
                string jsonPayload = JsonConvert.SerializeObject(payload);

                Console.WriteLine($"DEBUG - URL Anular Comprobante: {url}");
                Console.WriteLine($"DEBUG - Payload: {jsonPayload}");

                var content = new StringContent(
                    jsonPayload,
                    System.Text.Encoding.UTF8,
                    "application/json"
                );

                // POST api/correlatives/vouchers/void/:numero
                var response = await client.PostAsync(url, content);
                Console.WriteLine($"DEBUG - Response Status: {response.StatusCode}");

                if (!response.IsSuccessStatusCode)
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    string errorMessage = "Error al anular comprobante";
                    try
                    {
                        var errorData = JsonConvert.DeserializeObject<dynamic>(errorContent);
                        errorMessage = errorData?.message?.ToString() ?? errorContent;
                    }
                    catch
                    {
                        errorMessage = errorContent;
                    }
                    return Json(new { success = false, message = errorMessage });
                }

                return Json(new { success = true, message = "Comprobante anulado correctamente" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "ERROR al anular comprobante: {Message}", ex.Message);
                return Json(new { success = false, message = "Ocurrió un error al anular el comprobante. Por favor, intente nuevamente." });
            }
        }

        /// <summary>
        /// Registrar impresión del comprobante
        /// </summary>
        [HttpPost]
        public async Task<IActionResult> RegistrarImpresion([FromBody] RegistrarImpresionRequest request)
        {
            try
            {
                // Obtener userId de la sesión
                var sessionHelper = new Helpers.SessionHelper(_loginService, HttpContext);
                int userId = 0;
                int.TryParse(sessionHelper.CodUsuario, out userId);

                var client = _httpClientFactory.CreateClient();
                string token = _apiSettings.Token;
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

                // Obtener el shipment del API usando el codeGen para obtener el número de comprobante
                string urlGet = _apiSettings.BaseUrl + $"shipping/{request.CodeGen}";
                var responseGet = await client.GetAsync(urlGet);

                if (!responseGet.IsSuccessStatusCode)
                {
                    return Json(new { success = false, message = "Error al obtener información del envío" });
                }

                var jsonGet = await responseGet.Content.ReadAsStringAsync();
                var shipmentData = JsonConvert.DeserializeObject<dynamic>(jsonGet);

                // Debug: mostrar estructura completa del comprobante
                Console.WriteLine($"DEBUG - Estructura comprobante: {JsonConvert.SerializeObject(shipmentData?.comprobante)}");

                if (shipmentData?.comprobante?.numero == null)
                {
                    return Json(new { success = false, message = "No se encontró comprobante asignado a esta transacción" });
                }

                // Usar el ID del comprobante si existe, de lo contrario usar el número
                string comprobanteParaUrl = shipmentData.comprobante.id != null
                    ? shipmentData.comprobante.id.ToString()
                    : shipmentData.comprobante.numero.ToString();

                Console.WriteLine($"Registrando impresión para codeGen: {request.CodeGen}, comprobante numero: {shipmentData.comprobante.numero}, id: {shipmentData.comprobante.id}, usando: {comprobanteParaUrl}");

                // Nuevo endpoint: api/correlatives/vouchers/print/:id
                string url = _apiSettings.BaseUrl + $"correlatives/vouchers/print/{comprobanteParaUrl}";

                Console.WriteLine($"DEBUG - URL Registrar Impresión: {url}");

                // Enviar printedBy en el body (usando userId de la sesión)
                var requestBody = new { printedBy = userId };
                var jsonContent = new StringContent(JsonConvert.SerializeObject(requestBody), System.Text.Encoding.UTF8, "application/json");
                var response = await client.PostAsync(url, jsonContent);

                var responseBody = await response.Content.ReadAsStringAsync();

                if (!response.IsSuccessStatusCode)
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    string errorMessage = "Error al registrar impresión";
                    try
                    {
                        var errorData = JsonConvert.DeserializeObject<dynamic>(errorContent);
                        errorMessage = errorData?.message?.ToString() ?? errorContent;
                    }
                    catch
                    {
                        errorMessage = errorContent;
                    }
                    return Json(new { success = false, message = errorMessage });
                }

                return Json(new { success = true, message = "Impresión registrada correctamente" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "ERROR al registrar impresión: {Message}", ex.Message);
                return Json(new { success = false, message = "Ocurrió un error al registrar la impresión. Por favor, intente nuevamente." });
            }
        }

        /// <summary>
        /// Actualizar la humedad de la transacción
        /// Solo permitido si el comprobante no ha sido impreso
        /// </summary>
        [HttpPost]
        public async Task<IActionResult> ActualizarHumedad([FromBody] ActualizarHumedadRequest request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.CodeGen))
                {
                    return Json(new { success = false, message = "El código de generación es requerido" });
                }

                if (!double.TryParse(request.Humedad, out double humedadValue))
                {
                    return Json(new { success = false, message = "El valor de humedad no es válido" });
                }

                var client = _httpClientFactory.CreateClient();
                string token = _apiSettings.Token;
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

                // Primero verificar que el comprobante no esté impreso
                string urlGet = _apiSettings.BaseUrl + $"shipping/{request.CodeGen}";
                var responseGet = await client.GetAsync(urlGet);

                if (!responseGet.IsSuccessStatusCode)
                {
                    return Json(new { success = false, message = "Error al obtener información del envío" });
                }

                var jsonGet = await responseGet.Content.ReadAsStringAsync();
                var shipmentData = JsonConvert.DeserializeObject<dynamic>(jsonGet);

                // Verificar si el comprobante ya fue impreso
                bool comprobanteImpreso = shipmentData?.comprobante?.printed == true;
                if (comprobanteImpreso)
                {
                    return Json(new { success = false, message = "No se puede modificar la humedad después de imprimir el comprobante" });
                }

                Console.WriteLine($"Actualizando humedad para codeGen: {request.CodeGen}, valor: {humedadValue}");

                // Enviar humedad al API
                var payloadHumedad = new
                {
                    humidity = humedadValue
                };

                string urlPostHumedad = _apiSettings.BaseUrl + $"shipping/humedad/{request.CodeGen}";
                var contentHumedad = new StringContent(
                    JsonConvert.SerializeObject(payloadHumedad),
                    System.Text.Encoding.UTF8,
                    "application/json"
                );

                Console.WriteLine($"DEBUG - URL Actualizar Humedad: {urlPostHumedad}");

                var responsePostHumedad = await client.PostAsync(urlPostHumedad, contentHumedad);

                if (!responsePostHumedad.IsSuccessStatusCode)
                {
                    var errorContent = await responsePostHumedad.Content.ReadAsStringAsync();
                    string errorMessage = "Error al actualizar humedad";
                    try
                    {
                        var errorData = JsonConvert.DeserializeObject<dynamic>(errorContent);
                        errorMessage = errorData?.message?.ToString() ?? errorContent;
                    }
                    catch
                    {
                        errorMessage = errorContent;
                    }
                    return Json(new { success = false, message = errorMessage });
                }

                return Json(new { success = true, message = "Humedad actualizada correctamente" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "ERROR al actualizar humedad: {Message}", ex.Message);
                return Json(new { success = false, message = "Ocurrió un error al actualizar la humedad. Por favor, intente nuevamente." });
            }
        }

        /// <summary>
        /// Solicitar repesaje de la transacción
        /// POST api/shipping/reweighing
        /// </summary>
        [HttpPost]
        public async Task<IActionResult> SolicitarRepesaje([FromBody] SolicitarRepesajeRequest request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.CodeGen))
                {
                    return Json(new { success = false, message = "El código de generación es requerido" });
                }

                // Obtener userId y weighbridgeId desde la sesión
                var sessionHelper = HttpContext.GetSessionHelper(_loginService);
                var userId = sessionHelper.UserId;
                var weighbridgeId = sessionHelper.WeighbridgeId;

                var client = _httpClientFactory.CreateClient();
                string token = _apiSettings.Token;
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var payload = new
                {
                    codeGen = request.CodeGen,
                    userId = userId,
                    weighbridgeId = weighbridgeId
                };

                string url = _apiSettings.BaseUrl + "shipping/reweighing";
                var content = new StringContent(
                    JsonConvert.SerializeObject(payload),
                    System.Text.Encoding.UTF8,
                    "application/json"
                );

                Console.WriteLine($"DEBUG - Solicitando repesaje: {url}");
                Console.WriteLine($"DEBUG - Payload: {JsonConvert.SerializeObject(payload)}");

                var response = await client.PostAsync(url, content);
                var responseContent = await response.Content.ReadAsStringAsync();


                if (!response.IsSuccessStatusCode)
                {
                    string errorMessage = "Error al solicitar repesaje";
                    try
                    {
                        var errorData = JsonConvert.DeserializeObject<dynamic>(responseContent);
                        errorMessage = errorData?.message?.ToString() ?? errorMessage;
                    }
                    catch
                    {
                        errorMessage = responseContent;
                    }
                    return Json(new { success = false, message = errorMessage });
                }

                return Json(new { success = true, message = "Nuevo pesaje solicitado correctamente" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "ERROR al solicitar repesaje: {Message}", ex.Message);
                return Json(new { success = false, message = "Ocurrió un error al solicitar el nuevo pesaje. Por favor, intente nuevamente." });
            }
        }

        /// <summary>
        /// Sincronizar pesos NAV con QuickPass
        /// POST api/nav/sync-weight-by-code?codeGen={codeGen}
        /// </summary>
        [HttpPost]
        public async Task<IActionResult> SincronizarPesosNAV([FromBody] SincronizarNAVRequest request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.CodeGen))
                {
                    return Json(new { success = false, message = "El código de generación es requerido" });
                }

                var client = _httpClientFactory.CreateClient();
                string token = _apiSettings.Token;
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

                string url = _apiSettings.BaseUrl + $"nav/sync-weight-by-code?codeGen={request.CodeGen}";
                var response = await client.PostAsync(url, null);

                if (response.IsSuccessStatusCode)
                {
                    var json = await response.Content.ReadAsStringAsync();
                    var data = JsonConvert.DeserializeObject<dynamic>(json);

                    return Json(new { success = true, message = data?.message?.ToString() ?? "Pesos sincronizados correctamente con NAV" });
                }
                else
                {
                    var errorJson = await response.Content.ReadAsStringAsync();
                    var errorData = JsonConvert.DeserializeObject<dynamic>(errorJson);
                    string errorMessage = errorData?.message?.ToString() ?? "No se pudo sincronizar con NAV";

                    _logger.LogWarning("Error al sincronizar pesos NAV: {Error}", errorMessage);
                    return Json(new { success = false, message = errorMessage });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "ERROR al sincronizar pesos NAV: {Message}", ex.Message);
                return Json(new { success = false, message = "Ocurrió un error al sincronizar con NAV. Por favor, intente nuevamente." });
            }
        }

        /// <summary>
        /// Modificar la tarjeta magnética del envío
        /// POST api/shipments/setMagneticCard
        /// </summary>
        [HttpPost]
        public async Task<IActionResult> ModificarTarjeta([FromBody] ModificarTarjetaRequest request)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(request.CodeGen))
                {
                    return Json(new { success = false, message = "El código de generación es requerido" });
                }

                if (request.CardNumber <= 0)
                {
                    return Json(new { success = false, message = "El número de tarjeta debe ser mayor a 0" });
                }

                var client = _httpClientFactory.CreateClient();
                string token = _apiSettings.Token;
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

                // Obtener tarjeta actual para el registro en bitácora
                string tarjetaAnterior = "";
                string urlGet = _apiSettings.BaseUrl + $"shipping/{request.CodeGen}";
                var responseGet = await client.GetAsync(urlGet);
                if (responseGet.IsSuccessStatusCode)
                {
                    var jsonGet = await responseGet.Content.ReadAsStringAsync();
                    var shipmentData = JsonConvert.DeserializeObject<dynamic>(jsonGet);
                    tarjetaAnterior = shipmentData?.magneticCard?.ToString() ?? "";
                }

                // Llamar al endpoint para modificar la tarjeta
                var payload = new
                {
                    codeGen = request.CodeGen,
                    cardNumber = request.CardNumber
                };

                string url = _apiSettings.BaseUrl + "shipping/updateMagneticCard";
                var content = new StringContent(
                    JsonConvert.SerializeObject(payload),
                    System.Text.Encoding.UTF8,
                    "application/json"
                );

                Console.WriteLine($"DEBUG - Modificando tarjeta: {url}");
                Console.WriteLine($"DEBUG - Payload: {JsonConvert.SerializeObject(payload)}");

                var response = await client.PostAsync(url, content);
                var responseContent = await response.Content.ReadAsStringAsync();


                if (!response.IsSuccessStatusCode)
                {
                    string errorMessage = "Error al modificar la tarjeta magnética";
                    try
                    {
                        var errorData = JsonConvert.DeserializeObject<dynamic>(responseContent);
                        errorMessage = errorData?.message?.ToString() ?? errorMessage;
                    }
                    catch
                    {
                        errorMessage = responseContent;
                    }
                    return Json(new { success = false, message = errorMessage });
                }

                // Registrar en la bitácora
                var sessionHelper = new Helpers.SessionHelper(_loginService, HttpContext);
                int userId = 0;
                int.TryParse(sessionHelper.CodUsuario, out userId);

                // Construir descripción con el motivo
                string descripcion = $"Tarjeta modificada: {tarjetaAnterior} -> {request.CardNumber}. Motivo: {request.Motivo}";

                try
                {
                    var auditPayload = new
                    {
                        codeGen = request.CodeGen,
                        actionType = "MAGNETIC_CARD_UPDATED",
                        description = descripcion,
                        userId = userId > 0 ? userId : 1,
                        userType = "internal",
                        visibleTo = "ALL"
                    };

                    string auditUrl = _apiSettings.BaseUrl + "shipment-audit/register";
                    var auditContent = new StringContent(
                        JsonConvert.SerializeObject(auditPayload),
                        System.Text.Encoding.UTF8,
                        "application/json"
                    );

                    var auditResponse = await client.PostAsync(auditUrl, auditContent);
                    Console.WriteLine($"DEBUG - Audit Response Status: {auditResponse.StatusCode}");
                }
                catch (Exception exAudit)
                {
                    _logger.LogWarning(exAudit, "Error al registrar en bitácora la modificación de tarjeta");
                }

                return Json(new { success = true, message = "Tarjeta magnética modificada correctamente" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "ERROR al modificar tarjeta magnética: {Message}", ex.Message);
                return Json(new { success = false, message = "Ocurrió un error al modificar la tarjeta magnética. Por favor, intente nuevamente." });
            }
        }

        /// <summary>
        /// Obtiene la bitácora de eventos en orden cronológico con 1 reintento automático si falla
        /// </summary>
        private async Task<List<dynamic>> ObtenerEventsConRetry(HttpClient client, string codeGen)
        {
            var eventsUrl = _apiSettings.BaseUrl + $"shipment-audit/events/{codeGen}";

            for (int intento = 1; intento <= 2; intento++)
            {
                try
                {
                    var response = await client.GetAsync(eventsUrl);

                    if (!response.IsSuccessStatusCode)
                    {
                        _logger.LogWarning("Events intento {Intento}/2 falló para {CodeGen}: {Status}",
                            intento, codeGen, response.StatusCode);
                        if (intento < 2) { await Task.Delay(500); continue; }
                        return [];
                    }

                    var json = await response.Content.ReadAsStringAsync();
                    var data = JsonConvert.DeserializeObject<dynamic>(json);
                    var resultado = new List<dynamic>();

                    if (data?.events == null) return resultado;

                    foreach (var evt in data.events)
                    {
                        resultado.Add(new
                        {
                            Fecha = evt.datetime?.ToString() ?? "",
                            Usuario = evt.user?.ToString() ?? "Sistema",
                            Accion = evt.actionDetail?.ToString() ?? "",
                            Action = evt.action?.ToString() ?? ""
                        });
                    }

                    return resultado;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Events intento {Intento}/2 error para {CodeGen}", intento, codeGen);
                    if (intento < 2) await Task.Delay(500);
                }
            }

            return [];
        }
    }

    public class ModificarTarjetaRequest
    {
        public string CodeGen { get; set; } = string.Empty;
        public int CardNumber { get; set; }
        public string Motivo { get; set; } = string.Empty;
    }

    public class SincronizarNAVRequest
    {
        public string CodeGen { get; set; } = string.Empty;
    }

    public class SolicitarRepesajeRequest
    {
        public string CodeGen { get; set; } = string.Empty;
    }

    public class ActualizarHumedadRequest
    {
        public string CodeGen { get; set; } = string.Empty;
        public string Humedad { get; set; } = string.Empty;
    }

    public class GuardarTransaccionRequest
    {
        public string CodeGen { get; set; } = string.Empty;
        public string Almacen { get; set; } = string.Empty;
        public string Comprobante { get; set; } = string.Empty;
        public string Humedad { get; set; } = string.Empty;
        public string Marchamo1 { get; set; } = string.Empty;
        public string Marchamo2 { get; set; } = string.Empty;
        public string Marchamo3 { get; set; } = string.Empty;
        public string Marchamo4 { get; set; } = string.Empty;
        public int? WarehouseId { get; set; }
        public string Observaciones { get; set; } = string.Empty;
    }

    public class DetalleObservacionRequest
    {
        public string CodeGen { get; set; } = string.Empty;
        public string Observacion { get; set; } = string.Empty;
    }

    public class AnularMarchamoRequest
    {
        public string CodeGen { get; set; } = string.Empty;
        public string SealCode { get; set; } = string.Empty;
        public string Motivo { get; set; } = string.Empty;
        public string Observacion { get; set; } = string.Empty;
    }

    public class AnularComprobanteRequest
    {
        public string CodeGen { get; set; } = string.Empty;
        public string NumeroComprobante { get; set; } = string.Empty;
        public string Motivo { get; set; } = string.Empty;
        public string Observacion { get; set; } = string.Empty;
    }

    public class CompletarTransaccionRequest
    {
        public string CodeGen { get; set; } = string.Empty;
    }

    public class RegistrarImpresionRequest
    {
        public string CodeGen { get; set; } = string.Empty;
        public string FechaImpresion { get; set; } = string.Empty;
    }
}
