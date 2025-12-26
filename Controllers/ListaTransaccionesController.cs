using Microsoft.AspNetCore.Mvc;
using FrontendQuickpass.Models;
using System.Net.Http.Headers;
using Microsoft.Extensions.Options;
using FrontendQuickpass.Models.Configurations;
using Newtonsoft.Json;
using Microsoft.Extensions.Logging;

namespace FrontendQuickpass.Controllers
{
    public class ListaTransaccionesController : BaseController
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ApiSettings _apiSettings;
        private readonly Services.LoginService _loginService;
        private readonly ILogger<ListaTransaccionesController> _logger;

        public ListaTransaccionesController(IHttpClientFactory httpClientFactory, IOptions<ApiSettings> apiOptions, Services.LoginService loginService, ILogger<ListaTransaccionesController> logger)
        {
            _httpClientFactory = httpClientFactory;
            _apiSettings = apiOptions.Value;
            _loginService = loginService;
            _logger = logger;
        }

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

                // VALIDACIONES DE SEGURIDAD PARA PESADOR
                if (userRole.ToUpper() == "PESADOR")
                {
                    // Forzar estado 11 (ignorar cualquier otro estado que venga del cliente)
                    estado = "11";

                    // Ignorar filtro de actividad para Pesador
                    actividad = null;
                }

                // Determinar el status a consultar (por defecto 11 = En Proceso)
                string statusToQuery = string.IsNullOrWhiteSpace(estado) ? "11" : estado;

                // Construir URL con parámetros de query para el nuevo endpoint
                var queryParams = new List<string>
                {
                    $"currentStatus={statusToQuery}",
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

                // Construir URL completa con el nuevo endpoint
                string baseUrl = _apiSettings.BaseUrl + "shipments/transactions";
                string queryString = "?" + string.Join("&", queryParams);
                string url = baseUrl + queryString;

                var response = await client.GetAsync(url);

                if (!response.IsSuccessStatusCode)
                {
                    // Si es 404, devolver lista vacía con el mensaje del API
                    if ((int)response.StatusCode == 404)
                    {
                        string mensaje = "No se encontraron transacciones.";

                        try
                        {
                            var errorJson = await response.Content.ReadAsStringAsync();
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

                    return Json(new
                    {
                        success = false,
                        message = $"Error al obtener transacciones: {response.StatusCode}"
                    });
                }

                var json = await response.Content.ReadAsStringAsync();

                // El nuevo API devuelve: { data: [...], pagination: { page, limit, total, totalPages } }
                var apiResponse = JsonConvert.DeserializeObject<TransactionsApiResponse>(json);

                if (apiResponse == null || apiResponse.Data == null)
                {
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
                        message = "No se encontraron transacciones."
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
                    fechaEntrada = t.FechaEntrada?.ToLocalTime().ToString("dd/MM/yyyy HH:mm") ?? "",
                    transaccion = t.Transacciones != null && t.Transacciones.Count > 0
                        ? string.Join(", ", t.Transacciones)
                        : t.Transaccion?.ToString() ?? "",
                    producto = FormatProductName(t.ProductoNombre).ToUpper(),
                    productoCodigo = (t.ProductoCodigo ?? "").ToUpper(),
                    cliente = (t.Cliente?.Replace("_", " ") ?? "").ToUpper(),
                    clienteCodigo = (t.ClienteCodigo ?? "").ToUpper(),
                    tarjeta = t.Tarjeta?.ToString() ?? "",
                    actividad = GetActivityName(t.Actividad).ToUpper(),
                    placaCamion = (t.PlacaCamion ?? "").ToUpper(),
                    placaRemolque = (t.PlacaRemolque ?? "").ToUpper(),
                    currentStatus = t.CurrentStatus
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
            }).ToList() ?? new List<ProductFilter>();
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
    }

    // Modelos para la respuesta de la API
    public class FiltersResponse
    {
        [JsonProperty("products")]
        public List<ProductFilter> Products { get; set; } = new();

        [JsonProperty("activities")]
        public List<ActivityFilter> Activities { get; set; } = new();
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
        public List<ShippingQueryItem> Data { get; set; } = new();

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
        public List<TransactionItem> Data { get; set; } = new();

        [JsonProperty("pagination")]
        public TransactionsPagination? Pagination { get; set; }
    }

    public class TransactionItem
    {
        [JsonProperty("id")]
        public int Id { get; set; }

        [JsonProperty("codeGen")]
        public string CodeGen { get; set; } = string.Empty;

        [JsonProperty("fechaEntrada")]
        public DateTime? FechaEntrada { get; set; }

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

        [JsonProperty("currentStatus")]
        public int CurrentStatus { get; set; }
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
}
