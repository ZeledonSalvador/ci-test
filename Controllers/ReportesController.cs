using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using FrontendQuickpass.Models;
using FrontendQuickpass.Models.Configurations;

namespace FrontendQuickpass.Controllers
{
    [Route("[controller]")] // => /Reportes/...
    public class ReportesController : Controller
    {
        private readonly ILogger<ReportesController> _logger;
        private readonly ApiSettings _api;
        private readonly IHttpClientFactory _httpFactory;

        public ReportesController(
            ILogger<ReportesController> logger,
            IOptions<ApiSettings> apiOptions,
            IHttpClientFactory httpFactory)
        {
            _logger = logger;
            _api = apiOptions?.Value ?? new ApiSettings();
            _httpFactory = httpFactory;
        }

        // GET /Reportes
        [HttpGet("")]
        public IActionResult Index() => View();

        // ✅ SOLO RECEPCIONES:
        // GET /Reportes/Consultar?mode=1&from=YYYY-MM-DD&to=YYYY-MM-DD&ingenioCode=...&productoCodigo=...&almacenCodigo=...[&page=1&limit=50]
        [HttpGet("Consultar")]
        public async Task<IActionResult> Consultar(
            int mode = 1,
            string? from = null,
            string? to = null,
            string? ingenioCode = null,
            string? productoCodigo = null,
            string? almacenCodigo = null,
            int? page = null,
            int? limit = null
        )
        {
            try
            {
                var baseUrl = _api.BaseUrl?.TrimEnd('/') ?? "";
                if (string.IsNullOrWhiteSpace(baseUrl))
                    return StatusCode(500, "BaseUrl no configurada.");

                // Endpoint API: /reports/reception-report-detail
                var qs = new Dictionary<string, string?>();

                // filtros opcionales
                if (!string.IsNullOrWhiteSpace(from)) qs["from"] = $"{from}T00:00:00";
                if (!string.IsNullOrWhiteSpace(to)) qs["to"] = $"{to}T23:59:59";
                if (!string.IsNullOrWhiteSpace(ingenioCode)) qs["clienteCodigo"] = ingenioCode;
                if (!string.IsNullOrWhiteSpace(productoCodigo)) qs["productoCodigo"] = productoCodigo;
                if (!string.IsNullOrWhiteSpace(almacenCodigo)) qs["almacenCodigo"] = almacenCodigo;

                // paginación (por si ya la implementas en API; no afecta si no existe)
                if (page.HasValue && page.Value > 0) qs["page"] = page.Value.ToString();
                if (limit.HasValue && limit.Value > 0) qs["limit"] = limit.Value.ToString();

                var apiUrl = QueryHelpers.AddQueryString($"{baseUrl}/reports/reception-report-detail", qs);

                var http = _httpFactory.CreateClient();
                http.Timeout = TimeSpan.FromSeconds(60);

                // Token para API externa
                if (!string.IsNullOrWhiteSpace(_api.Token))
                    http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _api.Token);

                _logger.LogInformation("Consultando API externa (Recepciones): {ApiUrl}", apiUrl);

                var resp = await http.GetAsync(apiUrl);
                var payload = await resp.Content.ReadAsStringAsync();

                if (!resp.IsSuccessStatusCode)
                {
                    _logger.LogWarning("Error en API externa (Recepciones). Status: {StatusCode}, Response: {Response}",
                        resp.StatusCode, payload);
                    return StatusCode((int)resp.StatusCode, payload);
                }

                // Transformar los datos con headers legibles y valores formateados
                var transformedResponse = ReceptionReportTransformer.Transform(payload);

                return Json(transformedResponse);
            }
            catch (TaskCanceledException ex)
            {
                _logger.LogError(ex, "Timeout al consultar API externa (Recepciones)");
                return StatusCode(504, new { success = false, message = "La consulta tardó demasiado tiempo. Intenta con un rango menor." });
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "Error de conexión con API externa (Recepciones)");
                return StatusCode(503, new { success = false, message = "No se pudo conectar con el servidor. Verifica tu conexión." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inesperado en Consultar (Recepciones)");
                return StatusCode(500, new { success = false, message = "Ocurrió un error inesperado al procesar la solicitud." });
            }
        }

        // ✅ SOLO RECEPCIONES:
        // GET /Reportes/Export?mode=1&from=YYYY-MM-DD&to=YYYY-MM-DD&ingenioCode=...&productoCodigo=...&almacenCodigo=...&format=pdf|excel
        [HttpGet("Export")]
        public async Task<IActionResult> Export(
            int mode = 1,
            string? from = null,
            string? to = null,
            string? ingenioCode = null,
            string? productoCodigo = null,
            string? almacenCodigo = null,
            string? format = null
        )
        {
            format = (format ?? "excel").ToLowerInvariant();

            var baseUrl = _api.BaseUrl?.TrimEnd('/') ?? "";
            if (string.IsNullOrWhiteSpace(baseUrl))
                return StatusCode(500, "BaseUrl no configurada.");

            // Endpoint API: /reports/reception-report/export
            var qs = new Dictionary<string, string?>
            {
                ["format"] = format
            };

            // NOTA: enviamos startDate/endDate porque así estaba tu controller.
            // Si tu API usa from/to, puedes cambiarlo en backend o enviar ambos.
            if (!string.IsNullOrWhiteSpace(from))
            {
                qs["startDate"] = $"{from}T00:00:00";
                qs["from"] = $"{from}T00:00:00";
            }

            if (!string.IsNullOrWhiteSpace(to))
            {
                qs["endDate"] = $"{to}T23:59:59";
                qs["to"] = $"{to}T23:59:59";
            }

            if (!string.IsNullOrWhiteSpace(ingenioCode)) qs["clienteCodigo"] = ingenioCode;
            if (!string.IsNullOrWhiteSpace(productoCodigo)) qs["productoCodigo"] = productoCodigo;
            if (!string.IsNullOrWhiteSpace(almacenCodigo)) qs["almacenCodigo"] = almacenCodigo;

            var apiUrl = QueryHelpers.AddQueryString($"{baseUrl}/reports/reception-report/export", qs);

            var ext = format == "excel" ? "xlsx" : "pdf";
            var defaultFileName = $"reporte_recepciones.{ext}";

            try
            {
                var http = _httpFactory.CreateClient();
                http.Timeout = TimeSpan.FromSeconds(120);

                if (!string.IsNullOrWhiteSpace(_api.Token))
                    http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _api.Token);

                _logger.LogInformation("Exportando desde API externa (Recepciones): {ApiUrl}", apiUrl);

                var resp = await http.GetAsync(apiUrl);
                var bytes = await resp.Content.ReadAsByteArrayAsync();

                if (!resp.IsSuccessStatusCode)
                {
                    var err = System.Text.Encoding.UTF8.GetString(bytes);
                    _logger.LogWarning("Error en exportación (Recepciones). Status: {StatusCode}, Response: {Response}",
                        resp.StatusCode, err);
                    return StatusCode((int)resp.StatusCode, err);
                }

                // Content-Type desde API (fallback por formato)
                var contentType = resp.Content.Headers.ContentType?.MediaType
                    ?? (format == "excel"
                        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                        : "application/pdf");

                // filename desde Content-Disposition si viene
                string? fileName = null;
                if (resp.Content.Headers.TryGetValues("Content-Disposition", out var cdValues))
                {
                    var raw = cdValues?.FirstOrDefault();
                    if (!string.IsNullOrWhiteSpace(raw))
                    {
                        var parsed = ContentDispositionHeaderValue.Parse(raw);
                        fileName = parsed.FileNameStar ?? parsed.FileName;
                    }
                }
                fileName = fileName?.Trim('"');

                if (string.IsNullOrWhiteSpace(fileName))
                    fileName = defaultFileName;

                _logger.LogInformation("Exportación exitosa (Recepciones). Archivo: {FileName}, Tamaño: {Size} bytes", fileName, bytes.Length);

                return File(bytes, contentType, fileName);
            }
            catch (TaskCanceledException ex)
            {
                _logger.LogError(ex, "Timeout al exportar (Recepciones)");
                return StatusCode(504, "La exportación tardó demasiado tiempo. Intenta con un rango de fechas menor.");
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "Error de conexión al exportar (Recepciones)");
                return StatusCode(503, "No se pudo conectar con el servidor para generar el archivo.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inesperado en Export (Recepciones)");
                return StatusCode(500, "Ocurrió un error inesperado al generar el archivo.");
            }
        }

        // GET /Reportes/Clientes => proxy a correlatives/clients
        [HttpGet("Clientes")]
        public async Task<IActionResult> Clientes()
        {
            try
            {
                var http = _httpFactory.CreateClient();
                if (!string.IsNullOrWhiteSpace(_api.Token))
                    http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _api.Token);

                var baseUrl = _api.BaseUrl?.TrimEnd('/') ?? "";
                var url = $"{baseUrl}/correlatives/clients";

                var resp = await http.GetAsync(url);
                var raw = await resp.Content.ReadAsStringAsync();

                if (!resp.IsSuccessStatusCode)
                {
                    _logger.LogWarning("Error al obtener clientes. Status: {Status}", resp.StatusCode);
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
                _logger.LogError(ex, "Error inesperado al obtener clientes.");
                return Json(new { success = false, message = "Error al obtener clientes." });
            }
        }

        // GET /Reportes/Productos => proxy a correlatives/products
        [HttpGet("Productos")]
        public async Task<IActionResult> Productos()
        {
            try
            {
                var http = _httpFactory.CreateClient();
                if (!string.IsNullOrWhiteSpace(_api.Token))
                    http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _api.Token);

                var baseUrl = _api.BaseUrl?.TrimEnd('/') ?? "";
                var url = $"{baseUrl}/correlatives/products";

                var resp = await http.GetAsync(url);
                var raw = await resp.Content.ReadAsStringAsync();

                if (!resp.IsSuccessStatusCode)
                {
                    _logger.LogWarning("Error al obtener productos. Status: {Status}", resp.StatusCode);
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
                            items.Add(new { code, name });
                    }
                }

                return Json(new { success = true, data = items });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inesperado al obtener productos.");
                return Json(new { success = false, message = "Error al obtener productos." });
            }
        }

        // GET /Reportes/Almacenes => proxy a warehouses
        [HttpGet("Almacenes")]
        public async Task<IActionResult> Almacenes()
        {
            try
            {
                var http = _httpFactory.CreateClient();
                if (!string.IsNullOrWhiteSpace(_api.Token))
                    http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _api.Token);

                var baseUrl = _api.BaseUrl?.TrimEnd('/') ?? "";
                var url = $"{baseUrl}/warehouses";

                var resp = await http.GetAsync(url);
                var raw = await resp.Content.ReadAsStringAsync();

                if (!resp.IsSuccessStatusCode)
                {
                    _logger.LogWarning("Error al obtener almacenes. Status: {Status}", resp.StatusCode);
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

                        var code = item.TryGetProperty("code", out var c) ? c.GetString() : null;
                        var name = item.TryGetProperty("name", out var n) ? n.GetString() : null;
                        if (!string.IsNullOrWhiteSpace(code) && !string.IsNullOrWhiteSpace(name))
                            items.Add(new { code, name });
                    }
                }

                return Json(new { success = true, data = items });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inesperado al obtener almacenes.");
                return Json(new { success = false, message = "Error al obtener almacenes." });
            }
        }
    }
}
