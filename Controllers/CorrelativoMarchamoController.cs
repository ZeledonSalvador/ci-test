using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using FrontendQuickpass.Models;
using FrontendQuickpass.Models.Configurations;

namespace FrontendQuickpass.Controllers
{
    [Route("CorrelativoMarchamo")]
    public class CorrelativoMarchamoController : Controller
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ILogger<CorrelativoMarchamoController> _logger;
        private readonly ApiSettings _apiSettings;
        private readonly Services.LoginService _loginService;

        public CorrelativoMarchamoController(
            IHttpClientFactory httpClientFactory,
            IOptions<ApiSettings> apiSettings,
            ILogger<CorrelativoMarchamoController> logger,
            Services.LoginService loginService)
        {
            _httpClientFactory = httpClientFactory;
            _logger = logger;
            _apiSettings = apiSettings.Value;
            _loginService = loginService;
        }

        private PaginationInfoModel BuildPaginationFromJson(string json, int fallbackPage, int fallbackSize, int fallbackTotalRecords)
        {
            try
            {
                using var doc = JsonDocument.Parse(json);

                if (doc.RootElement.TryGetProperty("pagination", out var paginationElement))
                {
                    var page = paginationElement.TryGetProperty("page", out var p) ? p.GetInt32() : fallbackPage;
                    var limit = paginationElement.TryGetProperty("limit", out var l) ? l.GetInt32() : fallbackSize;
                    var total = paginationElement.TryGetProperty("total", out var t) ? t.GetInt32() : fallbackTotalRecords;
                    var totalPages = paginationElement.TryGetProperty("totalPages", out var tp) ? tp.GetInt32() : 1;

                    return new PaginationInfoModel
                    {
                        CurrentPage = page,
                        PageSize = limit,
                        TotalRecords = total,
                        TotalPages = totalPages
                    };
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "No se pudo parsear la paginación devuelta por el API de correlativos de marchamo.");
            }

            var pages = fallbackSize > 0
                ? (int)Math.Ceiling(fallbackTotalRecords / (double)fallbackSize)
                : 1;

            return new PaginationInfoModel
            {
                CurrentPage = fallbackPage,
                PageSize = fallbackSize,
                TotalRecords = fallbackTotalRecords,
                TotalPages = pages
            };
        }

      
        [HttpGet]
        public async Task<IActionResult> Index(int page = 1, int size = 10, string? search = null)
        {
            if (page <= 0) page = 1;
            if (size <= 0) size = 10;

            var model = new CorrelativoMarchamoViewModel();
            CorrelativoMarchamoListResponse? apiResponse = null;
            string json = string.Empty;

            try
            {
                var client = _httpClientFactory.CreateClient();

                if (!string.IsNullOrWhiteSpace(_apiSettings.Token))
                {
                    client.DefaultRequestHeaders.Authorization =
                        new AuthenticationHeaderValue("Bearer", _apiSettings.Token);
                }

                var baseUrl = _apiSettings.BaseUrl ?? string.Empty;

              // URL con paginación (y opcionalmente búsqueda), incluyendo rangos inactivos
            var urlBuilder = new StringBuilder($"{baseUrl}correlatives/seal-ranges?page={page}&limit={size}&includeInactive=true");

            if (!string.IsNullOrWhiteSpace(search))
            {
                // Si el backend soporta búsqueda, se envía como querystring
                urlBuilder.Append("&search=").Append(Uri.EscapeDataString(search));
            }

                var url = urlBuilder.ToString();

                var response = await client.GetAsync(url);

                if (!response.IsSuccessStatusCode)
                {
                    var body = await response.Content.ReadAsStringAsync();
                    _logger.LogWarning(
                        "Error al obtener correlativos de marchamo. Status {StatusCode} - Body: {Body}",
                        response.StatusCode,
                        body
                    );

                    ViewBag.ErrorMessage = "No se pudieron cargar los correlativos de marchamo.";
                    ViewBag.Pager = new PaginationInfoModel
                    {
                        CurrentPage = page,
                        PageSize = size,
                        TotalRecords = 0,
                        TotalPages = 1
                    };
                    ViewBag.Filters = new { Page = page, Size = size, Search = search ?? string.Empty };
                    model.Search = search ?? string.Empty;

                    return View(model);
                }

                json = await response.Content.ReadAsStringAsync();

                apiResponse = JsonSerializer.Deserialize<CorrelativoMarchamoListResponse>(
                    json,
                    new JsonSerializerOptions
                    {
                        PropertyNameCaseInsensitive = true
                    });

                var items = apiResponse?.Data ?? new System.Collections.Generic.List<CorrelativoMarchamoItem>();

                // Completar datos de vista (nombres legibles y fallback de báscula)
                foreach (var item in items)
                {
                    // Si el backend no mandara el nombre de la báscula, generamos uno genérico
                    if (string.IsNullOrWhiteSpace(item.BasculaNombre) && item.IdBascula > 0)
                    {
                        item.BasculaNombre = $"Báscula {item.IdBascula}";
                    }
                }

                model.Items = items;
                model.Search = search ?? string.Empty;

                // Construir paginación a partir del esquema { page, limit, total, totalPages }
                var pagination = BuildPaginationFromJson(json, page, size, items.Count);

                ViewBag.Pager = pagination;
                ViewBag.Filters = new
                {
                    Page = pagination.CurrentPage,
                    Size = pagination.PageSize,
                    Search = search ?? string.Empty
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inesperado al obtener la lista de correlativos de marchamo.");

                ViewBag.ErrorMessage = "Ocurrió un error inesperado al cargar los correlativos de marchamo.";
                ViewBag.Pager = new PaginationInfoModel
                {
                    CurrentPage = page,
                    PageSize = size,
                    TotalRecords = 0,
                    TotalPages = 1
                };
                ViewBag.Filters = new { Page = page, Size = size, Search = search ?? string.Empty };
                model.Search = search ?? string.Empty;
            }

            return View(model);
        }

        [HttpPost]
        [Route("Guardar")]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Guardar(
            int? marchamoId,
            int idBascula,
            string minSealnumber,
            string maxSealnumber,
            string ingenioCode,
            string productCode)
        {
            // Validaciones básicas
            if (idBascula <= 0)
            {
                return Json(new { success = false, message = "Debe seleccionar una báscula válida." });
            }

            if (string.IsNullOrWhiteSpace(ingenioCode))
            {
                return Json(new { success = false, message = "Debe seleccionar un cliente válido." });
            }

            if (string.IsNullOrWhiteSpace(productCode))
            {
                return Json(new { success = false, message = "Debe seleccionar un producto válido." });
            }

            if (string.IsNullOrWhiteSpace(minSealnumber) || string.IsNullOrWhiteSpace(maxSealnumber))
            {
                return Json(new { success = false, message = "Debe especificar el inicio y fin del rango de marchamos." });
            }

            if (!int.TryParse(minSealnumber, out var rangeStart) ||
                !int.TryParse(maxSealnumber, out var rangeEnd))
            {
                return Json(new
                {
                    success = false,
                    message = "Los valores de Inicio y Fin deben ser números válidos."
                });
            }

            if (rangeStart <= 0 || rangeEnd <= 0)
            {
                return Json(new
                {
                    success = false,
                    message = "Los valores de Inicio y Fin deben ser mayores que cero."
                });
            }

            if (rangeStart > rangeEnd)
            {
                return Json(new
                {
                    success = false,
                    message = "El valor de Inicio no puede ser mayor que el valor de Fin."
                });
            }

            try
            {
                var client = _httpClientFactory.CreateClient();

                if (!string.IsNullOrWhiteSpace(_apiSettings.Token))
                {
                    client.DefaultRequestHeaders.Authorization =
                        new AuthenticationHeaderValue("Bearer", _apiSettings.Token);
                }

                var baseUrl = _apiSettings.BaseUrl ?? string.Empty;

                // Payload para el nuevo API
                var payload = new
                {
                    weighbridgeId = idBascula,
                    clientCode = ingenioCode,   // código del cliente (IEA, ILM, etc.)
                    productCode = productCode,  // código del producto (MEL-001, AZ-001)
                    rangeStart = rangeStart,
                    rangeEnd = rangeEnd
                };

                var jsonPayload = JsonSerializer.Serialize(payload);
                var content = new StringContent(jsonPayload, Encoding.UTF8, "application/json");

                HttpResponseMessage response;
                bool esEdicion = marchamoId.HasValue && marchamoId.Value > 0;

                if (!esEdicion)
                {
                    // POST: crear
                    var url = $"{baseUrl}correlatives/seal-ranges";
                    response = await client.PostAsync(url, content);
                }
                else
                {
                    // PUT: actualizar
                    var url = $"{baseUrl}correlatives/seal-ranges/{marchamoId!.Value}";
                    response = await client.PutAsync(url, content);
                }

                var raw = await response.Content.ReadAsStringAsync();

                string? apiMessage = null;
                try
                {
                    using var doc = JsonDocument.Parse(raw);
                    if (doc.RootElement.TryGetProperty("message", out var msgProp) &&
                        msgProp.ValueKind == JsonValueKind.String)
                    {
                        apiMessage = msgProp.GetString();
                    }
                }
                catch
                {
                    // Si el body no es JSON o no tiene "message", lo ignoramos.
                }

                if (response.IsSuccessStatusCode)
                {
                    return Json(new
                    {
                        success = true,
                        message = apiMessage ?? (esEdicion
                            ? "Correlativo de marchamo actualizado correctamente."
                            : "Correlativo de marchamo creado correctamente.")
                    });
                }

                var mensajeError = apiMessage ?? "No se pudo guardar el correlativo de marchamo.";

                _logger.LogWarning(
                    "Error al guardar correlativo de marchamo. Edición: {EsEdicion}. Status {Status} - Body: {Body}",
                    esEdicion,
                    response.StatusCode,
                    raw
                );

                return Json(new
                {
                    success = false,
                    message = mensajeError
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inesperado al guardar correlativo de marchamo.");

                return Json(new
                {
                    success = false,
                    message = "Ocurrió un error inesperado al guardar el correlativo de marchamo."
                });
            }
        }

        [HttpPost]
        [Route("Eliminar")]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Eliminar(int id)
        {
            if (id <= 0)
            {
                return Json(new
                {
                    success = false,
                    message = "El identificador del correlativo no es válido."
                });
            }

            try
            {
                var client = _httpClientFactory.CreateClient();

                if (!string.IsNullOrWhiteSpace(_apiSettings.Token))
                {
                    client.DefaultRequestHeaders.Authorization =
                        new AuthenticationHeaderValue("Bearer", _apiSettings.Token);
                }

                var baseUrl = _apiSettings.BaseUrl ?? string.Empty;
                var url = $"{baseUrl}correlatives/seal-ranges/{id}";

                var response = await client.DeleteAsync(url);
                var raw = await response.Content.ReadAsStringAsync();

                string? apiMessage = null;
                try
                {
                    using var doc = JsonDocument.Parse(raw);
                    if (doc.RootElement.TryGetProperty("message", out var msgProp) &&
                        msgProp.ValueKind == JsonValueKind.String)
                    {
                        apiMessage = msgProp.GetString();
                    }
                }
                catch
                {
                    // Ignoramos errores al parsear JSON de respuesta
                }

                if (response.IsSuccessStatusCode)
                {
                    return Json(new
                    {
                        success = true,
                        message = apiMessage ?? "El correlativo de marchamo fue eliminado correctamente."
                    });
                }

                var mensajeError = apiMessage ?? "No se pudo eliminar el correlativo de marchamo.";

                _logger.LogWarning(
                    "Error al eliminar correlativo de marchamo {Id}. Status {Status} - Body: {Body}",
                    id,
                    response.StatusCode,
                    raw
                );

                return Json(new
                {
                    success = false,
                    message = mensajeError
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inesperado al eliminar correlativo de marchamo {Id}.", id);

                return Json(new
                {
                    success = false,
                    message = "Ocurrió un error inesperado al eliminar el correlativo de marchamo."
                });
            }
        }

        [HttpPost]
        [Route("Anular")]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Anular(int sealCode, string motivo)
        {
            if (sealCode <= 0 || string.IsNullOrWhiteSpace(motivo))
            {
                return Json(new
                {
                    success = false,
                    message = "Debe proporcionar un número de marchamo válido y un motivo."
                });
            }

            try
            {
                // Obtener userId del usuario logueado
                var sessionHelper = new Helpers.SessionHelper(_loginService, HttpContext);
                string codUsuarioStr = sessionHelper.CodUsuario;
                int userId = 0;
                int.TryParse(codUsuarioStr, out userId);

                // Validar que el userId sea válido
                if (userId <= 0)
                {
                    return Json(new { success = false, message = "No se pudo obtener el usuario de la sesión" });
                }

                _logger.LogInformation("Anulación de marchamo solicitada por UserId={UserId}. SealCode={SealCode}. Motivo={Motivo}",
                    userId, sealCode, motivo);

                var client = _httpClientFactory.CreateClient();

                if (!string.IsNullOrWhiteSpace(_apiSettings.Token))
                {
                    client.DefaultRequestHeaders.Authorization =
                        new AuthenticationHeaderValue("Bearer", _apiSettings.Token);
                }

                var baseUrl = _apiSettings.BaseUrl ?? string.Empty;
                var url = $"{baseUrl}correlatives/seals/void/{sealCode}";

                var payload = new
                {
                    reason = motivo,
                    userId = userId
                };

                var jsonPayload = JsonSerializer.Serialize(payload);
                var content = new StringContent(jsonPayload, Encoding.UTF8, "application/json");

                var response = await client.PostAsync(url, content);
                var raw = await response.Content.ReadAsStringAsync();

                string? apiMessage = null;
                try
                {
                    using var doc = JsonDocument.Parse(raw);
                    if (doc.RootElement.TryGetProperty("message", out var msgProp) &&
                        msgProp.ValueKind == JsonValueKind.String)
                    {
                        apiMessage = msgProp.GetString();
                    }
                }
                catch
                {
                    // Ignorar errores al parsear el body de respuesta
                }

                if (response.IsSuccessStatusCode)
                {
                    return Json(new
                    {
                        success = true,
                        message = apiMessage ?? "El marchamo ha sido anulado correctamente."
                    });
                }

                var mensajeError = apiMessage ?? "No se pudo anular el marchamo.";

                _logger.LogWarning(
                    "Error al anular marchamo {SealCode}. Status {Status} - Body: {Body}",
                    sealCode,
                    response.StatusCode,
                    raw
                );

                return Json(new
                {
                    success = false,
                    message = mensajeError
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inesperado al anular marchamo {SealCode}.", sealCode);

                return Json(new
                {
                    success = false,
                    message = "Ocurrió un error inesperado al anular el marchamo."
                });
            }
        }


        [HttpPost]
        [Route("HabilitarRango")]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> HabilitarRango([FromBody] EnableSealRangeRequest request)
        {
            if (request == null || request.Id <= 0)
            {
                return Json(new
                {
                    success = false,
                    message = "El identificador del rango de marchamos no es válido."
                });
            }

            try
            {
                var client = _httpClientFactory.CreateClient();

                if (!string.IsNullOrWhiteSpace(_apiSettings.Token))
                {
                    client.DefaultRequestHeaders.Authorization =
                        new AuthenticationHeaderValue("Bearer", _apiSettings.Token);
                }

                var baseUrl = _apiSettings.BaseUrl ?? string.Empty;
                var url = $"{baseUrl}correlatives/seal-ranges/{request.Id}/enable";

                // El endpoint de habilitar rango no requiere body adicional; usamos POST sin contenido
                var response = await client.PostAsync(url, content: null);
                var raw = await response.Content.ReadAsStringAsync();

                string? apiMessage = null;

                try
                {
                    using var doc = JsonDocument.Parse(raw);
                    if (doc.RootElement.TryGetProperty("message", out var msgProp) &&
                        msgProp.ValueKind == JsonValueKind.String)
                    {
                        apiMessage = msgProp.GetString();
                    }
                }
                catch (JsonException)
                {
                    // Si la respuesta no es JSON, usamos un mensaje genérico
                }

                if (response.IsSuccessStatusCode)
                {
                    return Json(new
                    {
                        success = true,
                        message = apiMessage ?? "El rango de marchamos se habilitó correctamente."
                    });
                }

                var mensajeError = apiMessage ?? "No se pudo habilitar el rango de marchamos.";

                _logger.LogWarning(
                    "Error al habilitar rango de marchamos {Id}. Status {Status} - Body: {Body}",
                    request.Id,
                    response.StatusCode,
                    raw
                );

                return Json(new
                {
                    success = false,
                    message = mensajeError
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inesperado al habilitar rango de marchamos {Id}.", request.Id);

                return Json(new
                {
                    success = false,
                    message = "Ocurrió un error inesperado al habilitar el rango de marchamos."
                });
            }
        }

        [HttpGet("clientes")]
        public async Task<IActionResult> ListarClientes()
        {
            try
            {
                var client = _httpClientFactory.CreateClient();

                if (!string.IsNullOrWhiteSpace(_apiSettings.Token))
                {
                    client.DefaultRequestHeaders.Authorization =
                        new AuthenticationHeaderValue("Bearer", _apiSettings.Token);
                }

                var baseUrl = _apiSettings.BaseUrl ?? string.Empty;
                var url = $"{baseUrl}correlatives/clients";

                var response = await client.GetAsync(url);
                var raw = await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode)
                {
                    try
                    {
                        using var doc = JsonDocument.Parse(raw);
                        var clients = new List<object>();

                        if (doc.RootElement.ValueKind == JsonValueKind.Array)
                        {
                            foreach (var item in doc.RootElement.EnumerateArray())
                            {
                                var ingenioCode = item.TryGetProperty("ingenioCode", out var code) ? code.GetString() : null;
                                var name = item.TryGetProperty("name", out var n) ? n.GetString() : null;

                                if (!string.IsNullOrWhiteSpace(ingenioCode) && !string.IsNullOrWhiteSpace(name))
                                {
                                    clients.Add(new { ingenioCode, name });
                                }
                            }
                        }

                        return Json(new
                        {
                            success = true,
                            data = clients
                        });
                    }
                    catch (JsonException ex)
                    {
                        _logger.LogError(ex, "Error al parsear la respuesta del API de clientes.");
                        return Json(new
                        {
                            success = false,
                            message = "Error al procesar la lista de clientes."
                        });
                    }
                }

                _logger.LogWarning(
                    "Error al obtener clientes del API. Status {Status} - Body: {Body}",
                    response.StatusCode,
                    raw
                );

                return Json(new
                {
                    success = false,
                    message = "No se pudo obtener la lista de clientes."
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inesperado al obtener lista de clientes.");

                return Json(new
                {
                    success = false,
                    message = "Ocurrió un error inesperado al obtener la lista de clientes."
                });
            }
        }

    }
}
