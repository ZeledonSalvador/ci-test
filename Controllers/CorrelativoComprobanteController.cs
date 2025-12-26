using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Threading.Tasks;
using FrontendQuickpass.Models;
using FrontendQuickpass.Models.Configurations;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FrontendQuickpass.Controllers
{

    [Route("CorrelativoComprobante")]
    public class CorrelativoComprobanteController : Controller
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ILogger<CorrelativoComprobanteController> _logger;
        private readonly ApiSettings _apiSettings;
        private readonly Services.LoginService _loginService;

        public CorrelativoComprobanteController(
            IHttpClientFactory httpClientFactory,
            IOptions<ApiSettings> apiSettings,
            ILogger<CorrelativoComprobanteController> logger,
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
                _logger.LogWarning(ex, "No se pudo parsear la paginación del API de comprobantes.");
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
        [Route("")]
        [Route("Index")]
        public async Task<IActionResult> Index(int page = 1, int size = 10, string? search = null)
        {
            if (page <= 0) page = 1;
            if (size <= 0) size = 10;

            var model = new CorrelativoComprobanteViewModel();
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
                var urlBuilder = new StringBuilder($"{baseUrl}correlatives/voucher-ranges?page={page}&limit={size}&includeInactive=true");

                if (!string.IsNullOrWhiteSpace(search))
                {
                    urlBuilder.Append("&search=").Append(Uri.EscapeDataString(search));
                }

                var url = urlBuilder.ToString();

                var response = await client.GetAsync(url);

                if (!response.IsSuccessStatusCode)
                {
                    var body = await response.Content.ReadAsStringAsync();
                    _logger.LogWarning(
                        "Error al obtener correlativos de comprobante. Status {Status} - Body: {Body}",
                        response.StatusCode,
                        body
                    );

                    ViewBag.ErrorMessage = "No se pudieron cargar los correlativos de comprobante.";

                    var fallbackPager = new Pager
                    {
                        Page = page,
                        Size = size,
                        TotalItems = 0,
                        TotalPages = 1
                    };

                    ViewBag.Pager = fallbackPager;
                    ViewBag.Filters = new { Page = page, Size = size, Search = search ?? string.Empty };
                    model.Search = search ?? string.Empty;

                    return View(model);
                }

                json = await response.Content.ReadAsStringAsync();

                var apiResponse = JsonSerializer.Deserialize<CorrelativoComprobanteListResponse>(
                    json,
                    new JsonSerializerOptions
                    {
                        PropertyNameCaseInsensitive = true
                    });

                var items = apiResponse?.Data ?? new List<CorrelativoComprobanteItem>();

                model.Items = items;
                model.Search = search ?? string.Empty;

                var pagination = BuildPaginationFromJson(json, page, size, items.Count);

                var pager = new Pager
                {
                    Page = pagination.CurrentPage,
                    Size = pagination.PageSize,
                    TotalItems = pagination.TotalRecords,
                    TotalPages = pagination.TotalPages
                };

                ViewBag.Pager = pager;
                ViewBag.Filters = new
                {
                    Page = pager.Page,
                    Size = pager.Size,
                    Search = search ?? string.Empty
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inesperado al obtener los correlativos de comprobante.");

                ViewBag.ErrorMessage = "Ocurrió un error inesperado al cargar los correlativos de comprobante.";

                var fallbackPager = new Pager
                {
                    Page = page,
                    Size = size,
                    TotalItems = 0,
                    TotalPages = 1
                };

                ViewBag.Pager = fallbackPager;
                ViewBag.Filters = new { Page = page, Size = size, Search = search ?? string.Empty };
                model.Search = search ?? string.Empty;
            }

            return View(model);
        }

        [HttpPost]
        [Route("Guardar")]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Guardar(
            int? comprobanteId,
            int idBascula,
            string inicioCorrelativo,
            string finCorrelativo,
            int boxNumber)
        {
            // Validaciones básicas
            if (idBascula <= 0)
            {
                return Json(new { success = false, message = "Debe seleccionar una báscula válida." });
            }

            if (boxNumber <= 0)
            {
                return Json(new { success = false, message = "El número de caja debe ser mayor que cero." });
            }

            if (string.IsNullOrWhiteSpace(inicioCorrelativo) || string.IsNullOrWhiteSpace(finCorrelativo))
            {
                return Json(new { success = false, message = "Debe especificar el inicio y fin del correlativo." });
            }

            if (!int.TryParse(inicioCorrelativo, out var rangeStart) ||
                !int.TryParse(finCorrelativo, out var rangeEnd))
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

                var payload = new
                {
                    weighbridgeId = idBascula,
                    boxNumber = boxNumber,
                    rangeStart = rangeStart,
                    rangeEnd = rangeEnd
                };

                var jsonPayload = JsonSerializer.Serialize(payload);
                var content = new StringContent(jsonPayload, Encoding.UTF8, "application/json");

                HttpResponseMessage response;
                bool esEdicion = comprobanteId.HasValue && comprobanteId.Value > 0;

                if (!esEdicion)
                {
                    // POST: crear
                    var url = $"{baseUrl}correlatives/voucher-ranges";
                    response = await client.PostAsync(url, content);
                }
                else
                {
                    // PUT: actualizar
                    var url = $"{baseUrl}correlatives/voucher-ranges/{comprobanteId!.Value}";
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
                    // Ignorar si no es JSON o no tiene "message"
                }

                if (response.IsSuccessStatusCode)
                {
                    return Json(new
                    {
                        success = true,
                        message = apiMessage ?? (esEdicion
                            ? "Correlativo de comprobante actualizado correctamente."
                            : "Correlativo de comprobante creado correctamente.")
                    });
                }

                var mensajeError = apiMessage ?? "No se pudo guardar el correlativo de comprobante.";

                _logger.LogWarning(
                    "Error al guardar correlativo de comprobante. Edición: {EsEdicion}. Status {Status} - Body: {Body}",
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
                _logger.LogError(ex, "Error inesperado al guardar correlativo de comprobante.");

                return Json(new
                {
                    success = false,
                    message = "Ocurrió un error inesperado al guardar el correlativo de comprobante."
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
                var url = $"{baseUrl}correlatives/voucher-ranges/{id}";

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
                    // Ignorar errores al parsear JSON
                }

                if (response.IsSuccessStatusCode)
                {
                    return Json(new
                    {
                        success = true,
                        message = apiMessage ?? "El correlativo de comprobante fue eliminado correctamente."
                    });
                }

                var mensajeError = apiMessage ?? "No se pudo eliminar el correlativo de comprobante.";

                _logger.LogWarning(
                    "Error al eliminar correlativo de comprobante {Id}. Status {Status} - Body: {Body}",
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
                _logger.LogError(ex, "Error inesperado al eliminar correlativo de comprobante {Id}.", id);

                return Json(new
                {
                    success = false,
                    message = "Ocurrió un error inesperado al eliminar el correlativo de comprobante."
                });
            }
        }

        [HttpPost]
        [Route("Anular")]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> Anular(int comprobanteNumber, string motivo)
        {
            if (comprobanteNumber <= 0 || string.IsNullOrWhiteSpace(motivo))
            {
                return Json(new
                {
                    success = false,
                    message = "Debe proporcionar un número de comprobante válido y un motivo."
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

                _logger.LogInformation("Anulación de comprobante solicitada por UserId={UserId}. ComprobanteNumber={ComprobanteNumber}. Motivo={Motivo}",
                    userId, comprobanteNumber, motivo);

                var client = _httpClientFactory.CreateClient();

                if (!string.IsNullOrWhiteSpace(_apiSettings.Token))
                {
                    client.DefaultRequestHeaders.Authorization =
                        new AuthenticationHeaderValue("Bearer", _apiSettings.Token);
                }

                var baseUrl = _apiSettings.BaseUrl ?? string.Empty;
                var url = $"{baseUrl}correlatives/vouchers/void/{comprobanteNumber}";

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
                    // Ignorar errores al parsear respuesta
                }

                if (response.IsSuccessStatusCode)
                {
                    return Json(new
                    {
                        success = true,
                        message = apiMessage ?? "El comprobante ha sido anulado correctamente."
                    });
                }

                var mensajeError = apiMessage ?? "No se pudo anular el comprobante.";

                _logger.LogWarning(
                    "Error al anular comprobante {Comprobante}. Status {Status} - Body: {Body}",
                    comprobanteNumber,
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
                _logger.LogError(ex, "Error inesperado al anular comprobante {Comprobante}.", comprobanteNumber);

                return Json(new
                {
                    success = false,
                    message = "Ocurrió un error inesperado al anular el comprobante."
                });
            }
        }



        [HttpPost]
        [Route("HabilitarRango")]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> HabilitarRango([FromBody] EnableVoucherRangeRequest request)
        {
            if (request == null || request.Id <= 0)
            {
                return Json(new
                {
                    success = false,
                    message = "El identificador del rango de comprobantes no es válido."
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
                var url = $"{baseUrl}correlatives/voucher-ranges/{request.Id}/enable";

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
                        message = apiMessage ?? "El rango de comprobantes se habilitó correctamente."
                    });
                }

                var mensajeError = apiMessage ?? "No se pudo habilitar el rango de comprobantes.";

                _logger.LogWarning(
                    "Error al habilitar rango de comprobantes {Id}. Status {Status} - Body: {Body}",
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
                _logger.LogError(ex, "Error inesperado al habilitar rango de comprobantes {Id}.", request.Id);

                return Json(new
                {
                    success = false,
                    message = "Ocurrió un error inesperado al habilitar el rango de comprobantes."
                });
            }
        }

        // Modelo interno para recibir el request de habilitar rango
        public class EnableVoucherRangeRequest
        {
            public int Id { get; set; }
        }
    }
}
