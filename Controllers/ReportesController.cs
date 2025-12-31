using System;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using FrontendQuickpass.Models.Configurations;
using Microsoft.AspNetCore.WebUtilities;

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
        [HttpGet("")]   // o [HttpGet] con plantilla vacía
        public IActionResult Index() => View();

        // GET /Reportes/Consultar?mode=1|2|3&from=YYYY-MM-DD&to=YYYY-MM-DD&ingenioCode=XXX[&onlyCompleted=true]
        [HttpGet("Consultar")]
        public async Task<IActionResult> Consultar(int mode = 2, string? from = null, string? to = null, string? ingenioCode = null, bool? onlyCompleted = null)
        {
            // Validación de parámetros requeridos
            if (string.IsNullOrWhiteSpace(from) || string.IsNullOrWhiteSpace(to))
            {
                return BadRequest(new { success = false, message = "Los parámetros 'from' y 'to' son obligatorios" });
            }

            var baseUrl = _api.BaseUrl?.TrimEnd('/') ?? "";
            string apiUrl;

            // mode=3 es "Requiere Barrido"
            if (mode == 3)
            {
                // Validación específica para Requiere Barrido
                if (string.IsNullOrWhiteSpace(ingenioCode))
                {
                    return BadRequest(new { success = false, message = "El parámetro 'ingenioCode' es obligatorio para el reporte Requiere Barrido" });
                }

                // Endpoint: api/reports/requires-sweeping
                var qs = new Dictionary<string, string?>
                {
                    ["ingenioCode"] = ingenioCode,
                    ["from"] = from,
                    ["to"] = to
                };
                apiUrl = QueryHelpers.AddQueryString($"{baseUrl}/reports/requires-sweeping", qs);
            }
            else
            {
                // Endpoints existentes (mode=1 o mode=2)
                var endpoint = baseUrl + "/shipping/report";
                var qs = new Dictionary<string, string?>
                {
                    ["mode"] = mode.ToString(),
                    ["from"] = from,
                    ["to"] = to
                };
                if (onlyCompleted.GetValueOrDefault() && mode == 2) qs["onlyCompleted"] = "true";

                apiUrl = QueryHelpers.AddQueryString(endpoint, qs);
            }

            try
            {
                var http = _httpFactory.CreateClient();
                http.Timeout = TimeSpan.FromSeconds(60); // Timeout de 60 segundos

                // Usar el token de la API externa (no el token de sesión del usuario)
                if (!string.IsNullOrWhiteSpace(_api.Token))
                    http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _api.Token);

                _logger.LogInformation("Consultando API externa: {ApiUrl}", apiUrl);

                var resp = await http.GetAsync(apiUrl);
                var payload = await resp.Content.ReadAsStringAsync();

                if (!resp.IsSuccessStatusCode)
                {
                    _logger.LogWarning("Error en API externa. Status: {StatusCode}, Response: {Response}",
                        resp.StatusCode, payload);
                    return StatusCode((int)resp.StatusCode, payload);
                }

                return Content(payload, "application/json");
            }
            catch (TaskCanceledException ex)
            {
                _logger.LogError(ex, "Timeout al consultar API externa");
                return StatusCode(504, new { success = false, message = "La consulta tardó demasiado tiempo. Intenta con un rango de fechas menor." });
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "Error de conexión con API externa");
                return StatusCode(503, new { success = false, message = "No se pudo conectar con el servidor. Verifica tu conexión." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inesperado en Consultar");
                return StatusCode(500, new { success = false, message = "Ocurrió un error inesperado al procesar la solicitud." });
            }
        }

        // GET /Reportes/Export?mode=1|2|3&from=...&to=...&ingenioCode=...&format=pdf|excel
        [HttpGet("Export")]
        public async Task<IActionResult> Export(int mode, string? from, string? to, string? ingenioCode = null, string? format = null)
        {
            format = (format ?? "pdf").ToLowerInvariant();

            // Validación de parámetros
            if (string.IsNullOrWhiteSpace(from) || string.IsNullOrWhiteSpace(to))
            {
                return BadRequest("Los parámetros 'from' y 'to' son obligatorios");
            }

            var baseUrl = _api.BaseUrl?.TrimEnd('/') ?? "";
            string apiUrl;
            string defaultFileName;

            // mode=3 es "Requiere Barrido"
            if (mode == 3)
            {
                // Validación específica
                if (string.IsNullOrWhiteSpace(ingenioCode))
                {
                    return BadRequest("El parámetro 'ingenioCode' es obligatorio para el reporte Requiere Barrido");
                }

                // Endpoint: api/reports/requires-sweeping/export
                var qs = new Dictionary<string, string?>
                {
                    ["format"] = format,
                    ["ingenioCode"] = ingenioCode,
                    ["from"] = from,
                    ["to"] = to
                };
                apiUrl = QueryHelpers.AddQueryString($"{baseUrl}/reports/requires-sweeping/export", qs);

                // Nombre de archivo sugerido: RequiereBarrido_ICHP_2024-01-01_2025-12-30.pdf
                var ext = format == "excel" ? "xlsx" : "pdf";
                defaultFileName = $"RequiereBarrido_{ingenioCode}_{from}_{to}.{ext}";
            }
            else
            {
                // Endpoints existentes (mode=1 o mode=2)
                var qs = new Dictionary<string, string?>
                {
                    ["mode"] = mode.ToString(),
                    ["from"] = from ?? "",
                    ["to"] = to ?? "",
                    ["format"] = format
                };
                if (mode == 2) qs["onlyCompleted"] = "true";

                apiUrl = QueryHelpers.AddQueryString($"{baseUrl}/shipping/report", qs);

                var ext = format == "excel" ? "xlsx" : "pdf";
                defaultFileName = mode == 1 ? $"reporte_lista_negra.{ext}" : $"reporte_ingreso_camiones.{ext}";
            }

            try
            {
                var http = _httpFactory.CreateClient();
                http.Timeout = TimeSpan.FromSeconds(120); // Timeout mayor para exportación

                // Usar el token de la API externa (no el token de sesión del usuario)
                if (!string.IsNullOrWhiteSpace(_api.Token))
                    http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _api.Token);

                _logger.LogInformation("Exportando desde API externa: {ApiUrl}", apiUrl);

                var resp = await http.GetAsync(apiUrl);
                var bytes = await resp.Content.ReadAsByteArrayAsync();

                if (!resp.IsSuccessStatusCode)
                {
                    var err = System.Text.Encoding.UTF8.GetString(bytes);
                    _logger.LogWarning("Error en exportación. Status: {StatusCode}, Response: {Response}",
                        resp.StatusCode, err);
                    return StatusCode((int)resp.StatusCode, err);
                }

                // 1) Content-Type desde API (fallback por formato)
                var contentType = resp.Content.Headers.ContentType?.MediaType
                    ?? (format == "excel"
                        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                        : "application/pdf");

                // 2) Intentar obtener filename desde Content-Disposition
                string? fileName = null;
                var cdHeader = resp.Content.Headers.ContentDisposition;
                if (cdHeader != null)
                {
                    fileName = cdHeader.FileNameStar ?? cdHeader.FileName;
                }
                else if (resp.Content.Headers.TryGetValues("Content-Disposition", out var cdValues))
                {
                    var raw = cdValues?.FirstOrDefault();
                    if (!string.IsNullOrWhiteSpace(raw))
                    {
                        var parsed = ContentDispositionHeaderValue.Parse(raw);
                        fileName = parsed.FileNameStar ?? parsed.FileName;
                    }
                }
                fileName = fileName?.Trim('"');

                // 3) Fallback al nombre por defecto
                if (string.IsNullOrWhiteSpace(fileName))
                {
                    fileName = defaultFileName;
                }

                _logger.LogInformation("Exportación exitosa. Archivo: {FileName}, Tamaño: {Size} bytes", fileName, bytes.Length);

                return File(bytes, contentType, fileName);
            }
            catch (TaskCanceledException ex)
            {
                _logger.LogError(ex, "Timeout al exportar desde API externa");
                return StatusCode(504, "La exportación tardó demasiado tiempo. Intenta con un rango de fechas menor.");
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "Error de conexión al exportar");
                return StatusCode(503, "No se pudo conectar con el servidor para generar el archivo.");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inesperado en Export");
                return StatusCode(500, "Ocurrió un error inesperado al generar el archivo.");
            }
        }
    }
}
