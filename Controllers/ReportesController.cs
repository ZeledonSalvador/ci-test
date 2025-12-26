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

        // GET /Reportes/Consultar?mode=1|2&from=YYYY-MM-DD&to=YYYY-MM-DD[&onlyCompleted=true]
        [HttpGet("Consultar")]
        public async Task<IActionResult> Consultar(int mode = 2, string from = null, string to = null, bool? onlyCompleted = null)
        {
            var baseUrl = _api.BaseUrl?.TrimEnd('/') + "/shipping/report?onlyCompleted=true";

            var qs = new Dictionary<string, string>();
            qs["mode"] = mode.ToString();
            if (!string.IsNullOrWhiteSpace(from)) qs["from"] = from;
            if (!string.IsNullOrWhiteSpace(to)) qs["to"] = to;
            if (onlyCompleted.GetValueOrDefault() && mode == 2) qs["onlyCompleted"] = "true";

            var apiUrl = QueryHelpers.AddQueryString(baseUrl, qs);

            var http = _httpFactory.CreateClient();
            var token = Request.Cookies["auth_token"] ?? Request.Headers["Authorization"].ToString().Replace("Bearer ", "");
            if (!string.IsNullOrWhiteSpace(token))
                http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

            var resp = await http.GetAsync(apiUrl);
            var payload = await resp.Content.ReadAsStringAsync();
            if (!resp.IsSuccessStatusCode)
                return StatusCode((int)resp.StatusCode, payload);

            return Content(payload, "application/json");
        }

        // GET /Reportes/Export?mode=2&from=...&to=...&format=pdf|excel
        // GET /Reportes/Export?mode=1|2&from=...&to=...&format=pdf|excel
        [HttpGet("Export")]
        public async Task<IActionResult> Export(int mode, string from, string to, string format)
        {
            format = (format ?? "pdf").ToLowerInvariant();

            var baseUrl = _api.BaseUrl?.TrimEnd('/') ?? "";
            var qs = new Dictionary<string, string>
            {
                ["mode"] = mode.ToString(),
                ["from"] = from ?? "",
                ["to"] = to ?? "",
                ["format"] = format
            };
            // onlyCompleted solo aplica para el mode=2 (ingreso camiones)
            if (mode == 2) qs["onlyCompleted"] = "true";

            var apiUrl = Microsoft.AspNetCore.WebUtilities.QueryHelpers
                .AddQueryString($"{baseUrl}/shipping/report", qs);

            var http = _httpFactory.CreateClient();
            var token = Request.Cookies["auth_token"] ?? Request.Headers["Authorization"].ToString().Replace("Bearer ", "");
            if (!string.IsNullOrWhiteSpace(token))
                http.DefaultRequestHeaders.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);

            var resp = await http.GetAsync(apiUrl);
            var bytes = await resp.Content.ReadAsByteArrayAsync();
            if (!resp.IsSuccessStatusCode)
            {
                var err = System.Text.Encoding.UTF8.GetString(bytes);
                return StatusCode((int)resp.StatusCode, err);
            }

            // 1) Content-Type desde API (fallback por formato)
            var contentType = resp.Content.Headers.ContentType?.MediaType
                ?? (format == "excel"
                    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    : "application/pdf");

            // 2) Intentar obtener filename desde Content-Disposition
            string fileName = null;
            var cdHeader = resp.Content.Headers.ContentDisposition;
            if (cdHeader != null)
            {
                fileName = cdHeader.FileNameStar ?? cdHeader.FileName;
            }
            else if (resp.Content.Headers.TryGetValues("Content-Disposition", out var cdValues))
            {
                var raw = cdValues.FirstOrDefault();
                if (!string.IsNullOrWhiteSpace(raw))
                {
                    var parsed = System.Net.Http.Headers.ContentDispositionHeaderValue.Parse(raw);
                    fileName = parsed.FileNameStar ?? parsed.FileName;
                }
            }
            fileName = fileName?.Trim('"');

            // 3) Fallback amigable por modo
            if (string.IsNullOrWhiteSpace(fileName))
            {
                var ext = (format == "excel") ? "xlsx" : "pdf";
                fileName = mode == 1 ? $"reporte_lista_negra.{ext}" : $"reporte_ingreso_camiones.{ext}";
            }

            return File(bytes, contentType, fileName);
        }
    }
}
