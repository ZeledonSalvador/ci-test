using Microsoft.AspNetCore.Mvc;
using FrontendQuickpass.Models;
using System.Net.Http.Headers;
using Microsoft.Extensions.Options;
using FrontendQuickpass.Models.Configurations;
using Newtonsoft.Json;
using Microsoft.Extensions.Logging;

namespace FrontendQuickpass.Controllers
{
    public class DetalleTransaccionController : BaseController
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ApiSettings _apiSettings;
        private readonly Services.LoginService _loginService;
        private readonly ILogger<DetalleTransaccionController> _logger;

        public DetalleTransaccionController(IHttpClientFactory httpClientFactory, IOptions<ApiSettings> apiOptions, Services.LoginService loginService, ILogger<DetalleTransaccionController> logger)
        {
            _httpClientFactory = httpClientFactory;
            _apiSettings = apiOptions.Value;
            _loginService = loginService;
            _logger = logger;
        }

        [HttpGet]
        public IActionResult Index()
        {
            // Si llegan por GET sin datos, redirigir a lista
            return RedirectToAction("Index", "ListaTransacciones");
        }

        [HttpPost]
        public async Task<IActionResult> Index(string codeGen, string actividad)
        {
            Console.WriteLine($"DetalleTransaccion POST - CodeGen: {codeGen}, Actividad: {actividad}");

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
                    string errorMessage = $"Error al obtener transacción: {response.StatusCode}";

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

                // Información General - Obtener todos los idNavRecord de cada pesaje
                var transaccionIds = new List<string>();
                if (data.pesajes != null)
                {
                    // Ordenar pesajes por número y extraer idNavRecord de cada uno
                    var pesajesOrdenados = ((IEnumerable<dynamic>)data.pesajes).OrderBy(p => (int?)p.numero ?? 0).ToList();
                    foreach (var pesaje in pesajesOrdenados)
                    {
                        if (pesaje.idNavRecord != null)
                        {
                            transaccionIds.Add(pesaje.idNavRecord.ToString());
                        }
                    }
                }
                // Si no hay pesajes, usar el idNavRecord principal
                if (transaccionIds.Count == 0 && data.idNavRecord != null)
                {
                    transaccionIds.Add(data.idNavRecord.ToString());
                }
                ViewBag.Transaccion = string.Join(", ", transaccionIds);
                ViewBag.Cliente = data.ingenio?.name?.ToString()?.Replace("_", " ") ?? "";
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

                    // Verificar si navRecord es un objeto con propiedades antes de acceder
                    if (data.navRecord != null && data.navRecord is Newtonsoft.Json.Linq.JObject)
                    {
                        var navRecordObj = (Newtonsoft.Json.Linq.JObject)data.navRecord;
                        pesoBrutoCliente = ToDouble(navRecordObj["pesoin"]);
                        pesoTaraCliente = ToDouble(navRecordObj["pesoout"]);
                        pesoNetoCliente = ToDouble(navRecordObj["pesoneto"]) > 0
                            ? ToDouble(navRecordObj["pesoneto"])
                            : ToDouble(data.productQuantityKg);
                    }
                    else
                    {
                        // Si navRecord no es un objeto o es null, usar valores por defecto
                        pesoBrutoCliente = 0;
                        pesoTaraCliente = 0;
                        pesoNetoCliente = ToDouble(data.productQuantityKg);
                    }

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
                ViewBag.Almacen = data.navRecord?.descAlmacen?.ToString() ?? "";

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

                    Console.WriteLine($"DEBUG - Marchamos cargados desde data.marchamos: M1={ViewBag.Marchamo1}, M2={ViewBag.Marchamo2}, M3={ViewBag.Marchamo3}, M4={ViewBag.Marchamo4}");
                }
                else
                {
                    // Fallback a navRecord si no hay marchamos en el array
                    ViewBag.Marchamo1 = data.navRecord?.marchamo1?.ToString() ?? "";
                    ViewBag.Marchamo2 = data.navRecord?.marchamo2?.ToString() ?? "";
                    ViewBag.Marchamo3 = data.navRecord?.marchamo3?.ToString() ?? "";
                    ViewBag.Marchamo4 = data.navRecord?.marchamo4?.ToString() ?? "";

                    // Verificar si tiene al menos un marchamo en navRecord
                    ViewBag.TieneMarchamos = !string.IsNullOrEmpty(ViewBag.Marchamo1) ||
                                            !string.IsNullOrEmpty(ViewBag.Marchamo2) ||
                                            !string.IsNullOrEmpty(ViewBag.Marchamo3) ||
                                            !string.IsNullOrEmpty(ViewBag.Marchamo4);

                    Console.WriteLine($"DEBUG - Marchamos cargados desde navRecord: M1={ViewBag.Marchamo1}, M2={ViewBag.Marchamo2}, M3={ViewBag.Marchamo3}, M4={ViewBag.Marchamo4}");
                }

                // Fechas para impresión
                // Buscar la fecha del status 5 "Chequeo de Entrada" en el array statuses
                string fechaEntrada = "";
                if (data.statuses != null)
                {
                    foreach (var status in data.statuses)
                    {
                        int? statusId = status.id;
                        if (statusId == 5)
                        {
                            DateTime? createdAt = status.createdAt;
                            fechaEntrada = createdAt?.ToString("o") ?? ""; // Formato ISO 8601
                            break;
                        }
                    }
                }

                ViewBag.FechaEntra = fechaEntrada;
                ViewBag.PesoIn = pesoBrutoCliente;
                ViewBag.FechaSale = data.navRecord?.fechasale?.ToString() ?? "";

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

                    Console.WriteLine($"DEBUG - Comprobante cargado desde data.comprobante: {ViewBag.Comprobante}, impreso: {ViewBag.ComprobanteImpreso}");
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

                // Bitácora
                var bitacora = new List<dynamic>();
                if (data.statuses != null)
                {
                    foreach (var status in data.statuses)
                    {
                        DateTime? createdAt = status.createdAt;
                        bitacora.Add(new
                        {
                            Fecha = createdAt?.ToLocalTime().ToString("dd/MM/yyyy HH:mm:ss") ?? "",
                            Usuario = data.ingenio?.name?.ToString()?.Replace("_", " ") ?? "Sistema",
                            Accion = status.status?.ToString() ?? ""
                        });
                    }
                }
                ViewBag.Bitacora = bitacora.OrderByDescending(b => b.Fecha).ToList();

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

                    Console.WriteLine($"DEBUG Marchamos - Response Status: {responsePostMarchamos.StatusCode}");
                    var responseContent = await responsePostMarchamos.Content.ReadAsStringAsync();
                    Console.WriteLine($"DEBUG Marchamos - Response Body: {responseContent}");

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

                // 5. DESPUÉS: Validar que venga el número de comprobante
                Console.WriteLine($"DEBUG Comprobante - request.Comprobante: '{request.Comprobante}'");

                if (string.IsNullOrEmpty(request.Comprobante) || !int.TryParse(request.Comprobante, out int numeroComprobante))
                {
                    Console.WriteLine("DEBUG Comprobante - Número de comprobante vacío o inválido");
                    return Json(new { success = false, message = "No se pudo obtener el número de comprobante" });
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

                Console.WriteLine($"DEBUG Comprobante - Response Status: {responsePostComprobante.StatusCode}");
                var responseComprobanteContent = await responsePostComprobante.Content.ReadAsStringAsync();
                Console.WriteLine($"DEBUG Comprobante - Response Body: {responseComprobanteContent}");

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

                return Json(new {
                    success = true,
                    message = "Transacción guardada correctamente",
                    comprobante = numeroComprobante
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
                var client = _httpClientFactory.CreateClient();
                string token = _apiSettings.Token;
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

                // Obtener username del usuario logueado
                var sessionHelper = new Helpers.SessionHelper(_loginService, HttpContext);
                string username = sessionHelper.Username ?? "Sistema";

                // Cambiar estado a 12 (Terminada) usando el endpoint estándar status/push
                var payload = new
                {
                    codeGen = request.CodeGen,
                    predefinedStatusId = 12,
                    leveransUsername = username
                };

                string url = _apiSettings.BaseUrl + "status/push";
                var content = new StringContent(
                    JsonConvert.SerializeObject(payload),
                    System.Text.Encoding.UTF8,
                    "application/json"
                );

                var response = await client.PostAsync(url, content);

                if (response.IsSuccessStatusCode)
                {
                    return Json(new { success = true, message = "Transacción completada correctamente" });
                }
                else
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    string errorMessage = "Error al completar transacción";
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
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "ERROR al completar transacción: {Message}", ex.Message);
                return Json(new { success = false, message = "Ocurrió un error al completar la transacción. Por favor, intente nuevamente." });
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
                // Aquí iría la lógica para agregar observación
                return Json(new { success = true, message = "Observación agregada correctamente" });
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

                // Enviar body vacío en lugar de null (algunos APIs lo requieren)
                var emptyContent = new StringContent("{}", System.Text.Encoding.UTF8, "application/json");
                var response = await client.PostAsync(url, emptyContent);

                Console.WriteLine($"DEBUG - Response Status: {response.StatusCode}");
                var responseBody = await response.Content.ReadAsStringAsync();
                Console.WriteLine($"DEBUG - Response Body: {responseBody}");

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
