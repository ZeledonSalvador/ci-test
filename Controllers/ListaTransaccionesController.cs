using Microsoft.AspNetCore.Mvc;
using FrontendQuickpass.Models;
using System.Net.Http.Headers;
using Microsoft.Extensions.Options;
using FrontendQuickpass.Models.Configurations;
using Newtonsoft.Json;
using Microsoft.Extensions.Logging;
using System.Text.Json;

namespace FrontendQuickpass.Controllers
{
    public class ListaTransaccionesController(IHttpClientFactory httpClientFactory, IOptions<ApiSettings> apiOptions, Services.LoginService loginService, ILogger<ListaTransaccionesController> logger) : BaseController
    {
        private readonly IHttpClientFactory _httpClientFactory = httpClientFactory;
        private readonly ApiSettings _apiSettings = apiOptions.Value;
        private readonly Services.LoginService _loginService = loginService;
        private readonly ILogger<ListaTransaccionesController> _logger = logger;

        public async Task<IActionResult> Index()
        {
            try
            {
                // Obtener productos desde el nuevo endpoint correlatives/products
                ViewBag.Products = await ObtenerProductosApi();

                // Inicializar paginación
                ViewBag.Pager = new ListaTransaccionesPager
                {
                    Page = 1,
                    Size = 10,
                    TotalItems = 0,
                    TotalPages = 0
                };

                ViewBag.Filters = new TransaccionesFilters
                {
                    Page = 1,
                    Size = 10
                };

                return View();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "ERROR en ListaTransacciones Index: {Message}", ex.Message);

                // En caso de error, mostrar vista con listas vacías
                ViewBag.Products = new List<ProductFilter>();
                ViewBag.Pager = new ListaTransaccionesPager { Page = 1, Size = 10, TotalItems = 0, TotalPages = 0 };
                ViewBag.Filters = new TransaccionesFilters { Page = 1, Size = 10 };
                ViewBag.Error = "No se pudo cargar la lista de transacciones. Por favor, intente nuevamente.";

                return View();
            }
        }

        /// <summary>
        /// Obtiene los filtros disponibles desde la API
        /// </summary>
        [HttpGet]
        public async Task<IActionResult> ObtenerFiltros()
        {
            try
            {
                var products = await ObtenerProductosApi();
                return Json(new { success = true, data = new { products } });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "ERROR al obtener filtros: {Message}", ex.Message);
                return Json(new { success = false, message = "Ocurrió un error al obtener los filtros. Por favor, intente nuevamente." });
            }
        }

        /// <summary>
        /// Obtiene las transacciones con filtros y paginación desde la API
        /// Nuevo endpoint: api/shipments/transactions
        /// </summary>
        [HttpGet]
        [ResponseCache(NoStore = true, Location = ResponseCacheLocation.None)]
        public async Task<IActionResult> ObtenerTransacciones(
            string? search = null,
            string? actividad = null,
            string? estado = null,
            string? producto = null,
            string? fechaInicio = null,
            string? fechaFin = null,
            int page = 1,
            int size = 10)
        {
            try
            {
                var client = _httpClientFactory.CreateClient();
                string token = _apiSettings.Token;
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

                // Obtener información de sesión del usuario
                var sessionHelper = new Helpers.SessionHelper(_loginService, HttpContext);
                string userRole = sessionHelper.NombreRol;
                string codBascula = sessionHelper.CodBascula;

                // FILTRO AUTOMÁTICO DE PRODUCTO SEGÚN BÁSCULA (para todos los roles)
                // Solo aplicar si el usuario ingresó con básculas 3, 4 o 5
                if (codBascula == "3")
                {
                    producto = "MEL-001";
                }
                else if (codBascula == "4" || codBascula == "5")
                {
                    producto = "AZ-001";
                }
                // Para otras básculas (1, 2, etc.), no se aplica filtro automático

                // Determinar el status a consultar (por defecto 3, validar que sea 1, 2, 3 o 4)
                string statusToQuery = "3"; // Valor por defecto
                if (!string.IsNullOrWhiteSpace(estado))
                {
                    // Validar que el estado sea uno de los permitidos: 1, 2, 3, 4
                    if (estado == "1" || estado == "2" || estado == "3" || estado == "4")
                    {
                        statusToQuery = estado;
                    }
                    else
                    {
                        _logger.LogWarning("Estado no válido recibido: {Estado}. Usando estado por defecto 3", estado);
                    }
                }

                // Construir URL con el estado en la ruta: api/shipments/transactions/status/{estado}
                string baseUrl = _apiSettings.BaseUrl + $"shipments/transactions/status/{statusToQuery}";

                // Construir parámetros de query
                var queryParams = new List<string>
                {
                    $"page={page}",
                    $"limit={size}"
                };

                // Agregar parámetros opcionales
                if (!string.IsNullOrWhiteSpace(search))
                    queryParams.Add($"search={Uri.EscapeDataString(search)}");

                if (!string.IsNullOrWhiteSpace(actividad))
                    queryParams.Add($"activityNumber={Uri.EscapeDataString(actividad)}");

                if (!string.IsNullOrWhiteSpace(producto))
                    queryParams.Add($"product={Uri.EscapeDataString(producto)}");

                if (!string.IsNullOrWhiteSpace(fechaInicio))
                    queryParams.Add($"startDate={Uri.EscapeDataString(fechaInicio)}");

                if (!string.IsNullOrWhiteSpace(fechaFin))
                    queryParams.Add($"endDate={Uri.EscapeDataString(fechaFin)}");

                // Construir URL completa
                string queryString = "?" + string.Join("&", queryParams);
                string url = baseUrl + queryString;

                // LOG para debug - ver qué URL se está construyendo
                _logger.LogInformation("=== LISTA TRANSACCIONES ===");
                _logger.LogInformation("Estado recibido: {Estado}", estado);
                _logger.LogInformation("Status a consultar: {StatusToQuery}", statusToQuery);
                _logger.LogInformation("URL construida: {Url}", url);

                var response = await client.GetAsync(url);

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning("API respondió con código: {StatusCode}", (int)response.StatusCode);

                    // Si es 404 o 400 (no encontrado), devolver lista vacía con mensaje amigable
                    if ((int)response.StatusCode == 404 || (int)response.StatusCode == 400)
                    {
                        string mensaje = "No se encontraron transacciones con los filtros aplicados.";

                        try
                        {
                            var errorJson = await response.Content.ReadAsStringAsync();
                            _logger.LogInformation("Respuesta del API: {ErrorJson}", errorJson);
                            var errorData = JsonConvert.DeserializeObject<dynamic>(errorJson);
                            mensaje = errorData?.message?.ToString() ?? mensaje;
                        }
                        catch
                        {
                            // Si no se puede leer el JSON, usar mensaje por defecto
                        }

                        return Json(new
                        {
                            success = true,
                            data = new List<object>(),
                            pagination = new
                            {
                                currentPage = page,
                                pageSize = size,
                                totalRecords = 0,
                                totalPages = 0
                            },
                            message = mensaje
                        });
                    }

                    // Para otros errores del servidor, devolver lista vacía con mensaje amigable
                    string errorMessage = "No se pudieron obtener las transacciones. Intente nuevamente.";
                    try
                    {
                        var errorJson = await response.Content.ReadAsStringAsync();
                        var errorData = JsonConvert.DeserializeObject<dynamic>(errorJson);
                        errorMessage = errorData?.message?.ToString() ?? errorMessage;
                    }
                    catch { }

                    return Json(new
                    {
                        success = true,
                        data = new List<object>(),
                        pagination = new
                        {
                            currentPage = page,
                            pageSize = size,
                            totalRecords = 0,
                            totalPages = 0
                        },
                        message = errorMessage
                    });
                }

                var json = await response.Content.ReadAsStringAsync();

                // El nuevo API devuelve: { data: [...], pagination: { page, limit, total, totalPages } }
                var apiResponse = JsonConvert.DeserializeObject<TransactionsApiResponse>(json);

                if (apiResponse == null || apiResponse.Data == null || apiResponse.Data.Count == 0)
                {
                    return Json(new
                    {
                        success = true,
                        data = new List<object>(),
                        pagination = new
                        {
                            currentPage = page,
                            pageSize = size,
                            totalRecords = apiResponse?.Pagination?.Total ?? 0,
                            totalPages = apiResponse?.Pagination?.TotalPages ?? 0
                        },
                        message = "No se encontraron transacciones con los filtros aplicados."
                    });
                }

                var transacciones = apiResponse.Data;
                var paginationInfo = apiResponse.Pagination ?? new TransactionsPagination
                {
                    Page = page,
                    Limit = size,
                    Total = 0,
                    TotalPages = 0
                };

                // Transformar datos para la vista (todos los textos en mayúsculas)
                var resultado = transacciones.Select(t => new
                {
                    id = t.Id,
                    codeGen = (t.CodeGen ?? "").ToUpper(),
                    fechaCreacion = t.FechaCreacion?.ToLocalTime().ToString("dd/MM/yyyy HH:mm") ?? "",
                    fechaEntrada = t.FechaEntrada?.ToLocalTime().ToString("dd/MM/yyyy HH:mm") ?? "",
                    fechaSalida = t.FechaSalida?.ToLocalTime().ToString("dd/MM/yyyy HH:mm") ?? "",
                    envio = t.Id,
                    productoNombre = FormatProductName(t.ProductoNombre).ToUpper(),
                    productoCodigo = (t.ProductoCodigo ?? "").ToUpper(),
                    cliente = (t.Cliente?.Replace("_", " ") ?? "").ToUpper(),
                    clienteCodigo = (t.ClienteCodigo ?? "").ToUpper(),
                    tarjeta = t.Tarjeta?.ToString() ?? "",
                    actividad = GetActivityName(t.Actividad).ToUpper(),
                    placaCamion = (t.PlacaCamion ?? "").ToUpper(),
                    placaRemolque = (t.PlacaRemolque ?? "").ToUpper(),
                    currentStatus = t.CurrentStatus,
                    noComprobante = t.NoComprobante,
                    pesajeEntrada = t.PesajeEntrada,
                    pesajeSalida = t.PesajeSalida,
                    pesoNeto = t.PesoNeto
                }).ToList();

                return Json(new
                {
                    success = true,
                    data = resultado,
                    pagination = new
                    {
                        currentPage = paginationInfo.Page,
                        pageSize = paginationInfo.Limit,
                        totalRecords = paginationInfo.Total,
                        totalPages = paginationInfo.TotalPages
                    }
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "ERROR al obtener transacciones: {Message}", ex.Message);
                return Json(new
                {
                    success = false,
                    message = "Ocurrió un error al obtener las transacciones. Por favor, intente nuevamente."
                });
            }
        }

        /// <summary>
        /// Método privado para obtener productos desde correlatives/products
        /// </summary>
        private async Task<List<ProductFilter>> ObtenerProductosApi()
        {
            var client = _httpClientFactory.CreateClient();
            string token = _apiSettings.Token;
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

            string url = _apiSettings.BaseUrl + "correlatives/products";
            var response = await client.GetAsync(url);

            if (!response.IsSuccessStatusCode)
            {
                throw new Exception($"Error al obtener productos: {response.StatusCode}");
            }

            var json = await response.Content.ReadAsStringAsync();
            var products = JsonConvert.DeserializeObject<List<CorrelativeProduct>>(json);

            // Mapear al formato esperado por la vista
            return products?.Where(p => p.IsActive).Select(p => new ProductFilter
            {
                Code = p.Code,
                Name = p.Name
            }).ToList() ?? [];
        }

        private static string FormatProductName(string? nameProduct)
        {
            if (string.IsNullOrWhiteSpace(nameProduct)) return "";

            return nameProduct.ToUpper() switch
            {
                "AZUCAR_CRUDO_GRANEL" => "Azúcar crudo granel",
                "MELAZA" => "Melaza",
                _ => nameProduct.Replace("_", " ")
            };
        }

        private static string GetActivityName(string? activityNumber)
        {
            return activityNumber switch
            {
                "2" => "Recepción de Azúcar y Melaza",
                _ => activityNumber ?? ""
            };
        }

        /// <summary>
        /// Obtiene el reporte de cuotas de almacenaje
        /// Endpoint: api/warehouse-storage/report
        /// </summary>
        [HttpGet]
        public async Task<IActionResult> ObtenerCuotasAlmacenaje(
            string? startDate = null,
            string? endDate = null,
            string? warehouseId = null,
            string? client = null,
            string? product = null)
        {
            try
            {
                var client2 = _httpClientFactory.CreateClient();
                string token = _apiSettings.Token;
                client2.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

                // Construir URL base
                string baseUrl = _apiSettings.BaseUrl + "warehouse-storage/report";

                // Construir parámetros de query
                var queryParams = new List<string>();

                if (!string.IsNullOrWhiteSpace(startDate))
                    queryParams.Add($"startDate={Uri.EscapeDataString(startDate)}");

                if (!string.IsNullOrWhiteSpace(endDate))
                    queryParams.Add($"endDate={Uri.EscapeDataString(endDate)}");

                if (!string.IsNullOrWhiteSpace(warehouseId))
                    queryParams.Add($"warehouseId={Uri.EscapeDataString(warehouseId)}");

                if (!string.IsNullOrWhiteSpace(client))
                    queryParams.Add($"clientCode={Uri.EscapeDataString(client)}");

                if (!string.IsNullOrWhiteSpace(product))
                    queryParams.Add($"product={Uri.EscapeDataString(product)}");

                // Construir URL completa
                string url = queryParams.Count > 0
                    ? baseUrl + "?" + string.Join("&", queryParams)
                    : baseUrl;

                _logger.LogInformation("=== CUOTAS ALMACENAJE ===");
                _logger.LogInformation("URL construida: {Url}", url);

                var response = await client2.GetAsync(url);

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning("API respondió con código: {StatusCode}", (int)response.StatusCode);

                    if ((int)response.StatusCode == 404 || (int)response.StatusCode == 400)
                    {
                        return Json(new
                        {
                            success = true,
                            data = new
                            {
                                totalsByWarehouse = new List<object>(),
                                totalsByClient = new List<object>(),
                                grandTotal = 0
                            },
                            message = "No se encontraron datos con los filtros aplicados."
                        });
                    }

                    return Json(new
                    {
                        success = false,
                        message = "Error al consultar el reporte de almacenaje."
                    });
                }

                var json = await response.Content.ReadAsStringAsync();
                var apiResponse = JsonConvert.DeserializeObject<WarehouseStorageReportResponse>(json);

                if (apiResponse == null)
                {
                    return Json(new
                    {
                        success = true,
                        data = new
                        {
                            totalsByWarehouse = new List<object>(),
                            totalsByClient = new List<object>(),
                            grandTotal = 0
                        },
                        message = "No se encontraron datos."
                    });
                }

                // Transformar datos para la respuesta
                var warehouseData = apiResponse.TotalsByWarehouse?.Select(w => new
                {
                    warehouseId = w.WarehouseId,
                    warehouseName = w.WarehouseName?.ToUpper() ?? "",
                    warehouseCode = w.WarehouseCode?.ToUpper() ?? "",
                    totalReceived = w.TotalReceived,
                    details = (w.Details ?? []).Select(d => new
                    {
                        fecha = d.Fecha ?? "",
                        almacen = d.Almacen?.ToUpper() ?? "",
                        producto = d.Producto?.ToUpper() ?? "",
                        cantidad = d.Cantidad
                    }).ToList()
                }).ToList();

                var clientData = apiResponse.TotalsByClient?.Select(c => new
                {
                    clientCode = c.ClientCode?.ToUpper() ?? "",
                    clientName = c.ClientName?.ToUpper() ?? "",
                    totalReceived = c.TotalReceived,
                    details = (c.Details ?? []).Select(d => new
                    {
                        producto = d.Producto?.ToUpper() ?? "",
                        fecha = d.Fecha ?? "",
                        cliente = d.Cliente?.ToUpper() ?? "",
                        almacen = d.Almacen?.ToUpper() ?? "",
                        cantidad = d.Cantidad
                    }).ToList()
                }).ToList();

                return Json(new
                {
                    success = true,
                    data = new
                    {
                        startDate = apiResponse.StartDate,
                        endDate = apiResponse.EndDate,
                        product = apiResponse.Product,
                        totalsByWarehouse = warehouseData,
                        totalsByClient = clientData,
                        grandTotal = apiResponse.GrandTotal
                    }
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "ERROR al obtener cuotas de almacenaje: {Message}", ex.Message);
                return Json(new
                {
                    success = false,
                    message = "Ocurrió un error al obtener el reporte de almacenaje. Por favor, intente nuevamente."
                });
            }
        }

        /// <summary>
        /// Obtiene la lista de almacenes desde la API
        /// Endpoint: api/warehouses
        /// </summary>
        [HttpGet]
        public async Task<IActionResult> ObtenerAlmacenes()
        {
            try
            {
                var client = _httpClientFactory.CreateClient();
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _apiSettings.Token);

                string url = _apiSettings.BaseUrl + "warehouses";
                var response = await client.GetAsync(url);
                var raw = await response.Content.ReadAsStringAsync();

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning("Error al obtener almacenes. Status: {Status}", (int)response.StatusCode);
                    return Json(new { success = false, message = "No se pudo obtener la lista de almacenes." });
                }

                using var doc = JsonDocument.Parse(raw);
                var items = new List<object>();

                if (doc.RootElement.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in doc.RootElement.EnumerateArray())
                    {
                        var isActive = item.TryGetProperty("isActive", out var a) && a.GetBoolean();
                        if (!isActive) continue;

                        var id = item.TryGetProperty("id", out var i) ? i.GetInt32() : 0;
                        var name = item.TryGetProperty("name", out var n) ? n.GetString() : null;

                        if (id > 0 && !string.IsNullOrWhiteSpace(name))
                            items.Add(new { id, name });
                    }
                }

                return Json(new { success = true, data = items });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener almacenes: {Message}", ex.Message);
                return Json(new { success = false, message = "Error al obtener almacenes." });
            }
        }

        /// <summary>
        /// Obtiene la lista de clientes desde la API
        /// Endpoint: api/correlatives/clients
        /// </summary>
        [HttpGet]
        public async Task<IActionResult> ObtenerClientes()
        {
            try
            {
                var client = _httpClientFactory.CreateClient();
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _apiSettings.Token);

                string url = _apiSettings.BaseUrl + "correlatives/clients";
                var response = await client.GetAsync(url);
                var raw = await response.Content.ReadAsStringAsync();

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning("Error al obtener clientes. Status: {Status}", (int)response.StatusCode);
                    return Json(new { success = false, message = "No se pudo obtener la lista de clientes." });
                }

                using var doc = JsonDocument.Parse(raw);
                var items = new List<object>();

                if (doc.RootElement.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in doc.RootElement.EnumerateArray())
                    {
                        var code = item.TryGetProperty("ingenioCode", out var c) ? c.GetString() : null;
                        var name = item.TryGetProperty("name", out var n) ? n.GetString() : null;

                        if (!string.IsNullOrWhiteSpace(code) && !string.IsNullOrWhiteSpace(name))
                            items.Add(new { code, name });
                    }
                }

                return Json(new { success = true, data = items });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener clientes: {Message}", ex.Message);
                return Json(new { success = false, message = "Error al obtener clientes." });
            }
        }

        /// <summary>
        /// Obtiene la lista de productos desde la API
        /// Endpoint: api/correlatives/products
        /// </summary>
        [HttpGet]
        public async Task<IActionResult> ObtenerProductos()
        {
            try
            {
                var client = _httpClientFactory.CreateClient();
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _apiSettings.Token);

                string url = _apiSettings.BaseUrl + "correlatives/products";
                var response = await client.GetAsync(url);
                var raw = await response.Content.ReadAsStringAsync();

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogWarning("Error al obtener productos. Status: {Status}", (int)response.StatusCode);
                    return Json(new { success = false, message = "No se pudo obtener la lista de productos." });
                }

                using var doc = JsonDocument.Parse(raw);
                var items = new List<object>();

                if (doc.RootElement.ValueKind == JsonValueKind.Array)
                {
                    foreach (var item in doc.RootElement.EnumerateArray())
                    {
                        var isActive = item.TryGetProperty("isActive", out var a) && a.GetBoolean();
                        if (!isActive) continue;

                        var code = item.TryGetProperty("code", out var c) ? c.GetString() : null;
                        var name = item.TryGetProperty("name", out var n) ? n.GetString() : null;

                        if (!string.IsNullOrWhiteSpace(code) && !string.IsNullOrWhiteSpace(name))
                            items.Add(new { code, name = name.Replace("_", " ") });
                    }
                }

                return Json(new { success = true, data = items });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener productos: {Message}", ex.Message);
                return Json(new { success = false, message = "Error al obtener productos." });
            }
        }
    }

    // Modelos para la respuesta de la API
    public class FiltersResponse
    {
        [JsonProperty("products")]
        public List<ProductFilter> Products { get; set; } = [];

        [JsonProperty("activities")]
        public List<ActivityFilter> Activities { get; set; } = [];
    }

    public class ProductFilter
    {
        [JsonProperty("code")]
        public string Code { get; set; } = string.Empty;

        [JsonProperty("name")]
        public string Name { get; set; } = string.Empty;
    }

    public class ActivityFilter
    {
        [JsonProperty("code")]
        public string Code { get; set; } = string.Empty;

        [JsonProperty("name")]
        public string Name { get; set; } = string.Empty;
    }

    public class ShippingQueryItem
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("codeGen")]
        public string CodeGen { get; set; } = string.Empty;

        [JsonProperty("productCode")]
        public string ProductCode { get; set; } = string.Empty;

        [JsonProperty("nameProduct")]
        public string NameProduct { get; set; } = string.Empty;

        [JsonProperty("activityNumber")]
        public string ActivityNumber { get; set; } = string.Empty;

        [JsonProperty("currentStatus")]
        public int CurrentStatus { get; set; }

        [JsonProperty("createdAt")]
        public DateTime? CreatedAt { get; set; }

        [JsonProperty("entryDate")]
        public DateTime? EntryDate { get; set; }

        [JsonProperty("driver")]
        public DriverInfo? Driver { get; set; }

        [JsonProperty("vehicle")]
        public VehicleInfo? Vehicle { get; set; }

        [JsonProperty("ingenio")]
        public IngenioInfo? Ingenio { get; set; }

        [JsonProperty("shipmentSeals")]
        public List<SealInfo>? ShipmentSeals { get; set; }

        [JsonProperty("transporter")]
        public string Transporter { get; set; } = string.Empty;

        [JsonProperty("productQuantity")]
        public double ProductQuantity { get; set; }

        [JsonProperty("productQuantityKg")]
        public double ProductQuantityKg { get; set; }

        [JsonProperty("unitMeasure")]
        public string UnitMeasure { get; set; } = string.Empty;

        [JsonProperty("magneticCard")]
        public int? MagneticCard { get; set; }

        [JsonProperty("idNavRecord")]
        public int? IdNavRecord { get; set; }

        [JsonProperty("pesoBruto")]
        public double PesoBruto { get; set; }

        [JsonProperty("pesoTara")]
        public double PesoTara { get; set; }
    }

    public class DriverInfo
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; } = string.Empty;

        [JsonProperty("license")]
        public string License { get; set; } = string.Empty;
    }

    public class VehicleInfo
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("plate")]
        public string Plate { get; set; } = string.Empty;

        [JsonProperty("trailerPlate")]
        public string TrailerPlate { get; set; } = string.Empty;

        [JsonProperty("truckType")]
        public string TruckType { get; set; } = string.Empty;
    }

    public class IngenioInfo
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("ingenioCode")]
        public string IngenioCode { get; set; } = string.Empty;

        [JsonProperty("name")]
        public string Name { get; set; } = string.Empty;
    }

    public class SealInfo
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("sealCode")]
        public string SealCode { get; set; } = string.Empty;

        [JsonProperty("sealDescription")]
        public string? SealDescription { get; set; }
    }

    public class ApiShippingResponse
    {
        [JsonProperty("success")]
        public bool Success { get; set; }

        [JsonProperty("data")]
        public List<ShippingQueryItem> Data { get; set; } = [];

        [JsonProperty("message")]
        public string? Message { get; set; }

        [JsonProperty("pagination")]
        public PaginationInfo? Pagination { get; set; }
    }

    public class PaginationInfo
    {
        [JsonProperty("currentPage")]
        public int CurrentPage { get; set; }

        [JsonProperty("pageSize")]
        public int PageSize { get; set; }

        [JsonProperty("totalRecords")]
        public int TotalRecords { get; set; }

        [JsonProperty("totalPages")]
        public int TotalPages { get; set; }
    }

    // ============ Modelos para el nuevo endpoint api/shipments/transactions ============

    public class TransactionsApiResponse
    {
        [JsonProperty("data")]
        public List<TransactionItem> Data { get; set; } = [];

        [JsonProperty("pagination")]
        public TransactionsPagination? Pagination { get; set; }
    }

    public class TransactionItem
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("codeGen")]
        public string CodeGen { get; set; } = string.Empty;

        [JsonProperty("fechaCreacion")]
        public DateTime? FechaCreacion { get; set; }

        [JsonProperty("fechaEntrada")]
        public DateTime? FechaEntrada { get; set; }

        [JsonProperty("fechaSalida")]
        public DateTime? FechaSalida { get; set; }

        [JsonProperty("transaccion")]
        public int? Transaccion { get; set; }

        [JsonProperty("transacciones")]
        public List<int>? Transacciones { get; set; }

        [JsonProperty("productoCodigo")]
        public string? ProductoCodigo { get; set; }

        [JsonProperty("productoNombre")]
        public string? ProductoNombre { get; set; }

        [JsonProperty("cliente")]
        public string? Cliente { get; set; }

        [JsonProperty("clienteCodigo")]
        public string? ClienteCodigo { get; set; }

        [JsonProperty("tarjeta")]
        public int? Tarjeta { get; set; }

        [JsonProperty("actividad")]
        public string? Actividad { get; set; }

        [JsonProperty("placaCamion")]
        public string? PlacaCamion { get; set; }

        [JsonProperty("placaRemolque")]
        public string? PlacaRemolque { get; set; }

        [JsonProperty("noComprobante")]
        public int? NoComprobante { get; set; }

        [JsonProperty("currentStatus")]
        public int CurrentStatus { get; set; }

        [JsonProperty("pesajeEntrada")]
        public double? PesajeEntrada { get; set; }

        [JsonProperty("pesajeSalida")]
        public double? PesajeSalida { get; set; }

        [JsonProperty("pesoNeto")]
        public double? PesoNeto { get; set; }
    }

    public class TransactionsPagination
    {
        [JsonProperty("page")]
        public int Page { get; set; }

        [JsonProperty("limit")]
        public int Limit { get; set; }

        [JsonProperty("total")]
        public int Total { get; set; }

        [JsonProperty("totalPages")]
        public int TotalPages { get; set; }
    }

    // Modelo para el endpoint correlatives/products
    public class CorrelativeProduct
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("code")]
        public string Code { get; set; } = string.Empty;

        [JsonProperty("name")]
        public string Name { get; set; } = string.Empty;

        [JsonProperty("description")]
        public string? Description { get; set; }

        [JsonProperty("isActive")]
        public bool IsActive { get; set; }

        [JsonProperty("createdAt")]
        public DateTime? CreatedAt { get; set; }
    }

    // ============ Modelos para el endpoint api/warehouse-storage/report ============

    public class WarehouseStorageReportResponse
    {
        [JsonProperty("startDate")]
        public string? StartDate { get; set; }

        [JsonProperty("endDate")]
        public string? EndDate { get; set; }

        [JsonProperty("product")]
        public string? Product { get; set; }

        [JsonProperty("totalsByWarehouse")]
        public List<WarehouseTotalItem>? TotalsByWarehouse { get; set; }

        [JsonProperty("totalsByClient")]
        public List<ClientTotalItem>? TotalsByClient { get; set; }

        [JsonProperty("grandTotal")]
        public double GrandTotal { get; set; }
    }

    public class WarehouseTotalItem
    {
        [JsonProperty("warehouseId")]
        public int WarehouseId { get; set; }

        [JsonProperty("warehouseName")]
        public string? WarehouseName { get; set; }

        [JsonProperty("warehouseCode")]
        public string? WarehouseCode { get; set; }

        [JsonProperty("totalReceived")]
        public double TotalReceived { get; set; }

        [JsonProperty("details")]
        public List<WarehouseDetailItem>? Details { get; set; }
    }

    public class WarehouseDetailItem
    {
        [JsonProperty("fecha")]
        public string? Fecha { get; set; }

        [JsonProperty("almacen")]
        public string? Almacen { get; set; }

        [JsonProperty("producto")]
        public string? Producto { get; set; }

        [JsonProperty("cantidad")]
        public double Cantidad { get; set; }
    }

    public class ClientTotalItem
    {
        [JsonProperty("clientCode")]
        public string? ClientCode { get; set; }

        [JsonProperty("clientName")]
        public string? ClientName { get; set; }

        [JsonProperty("totalReceived")]
        public double TotalReceived { get; set; }

        [JsonProperty("details")]
        public List<ClientDetailItem>? Details { get; set; }
    }

    public class ClientDetailItem
    {
        [JsonProperty("producto")]
        public string? Producto { get; set; }

        [JsonProperty("fecha")]
        public string? Fecha { get; set; }

        [JsonProperty("cliente")]
        public string? Cliente { get; set; }

        [JsonProperty("almacen")]
        public string? Almacen { get; set; }

        [JsonProperty("cantidad")]
        public double Cantidad { get; set; }
    }
}
