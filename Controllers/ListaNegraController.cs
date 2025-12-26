using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Web;
using FrontendQuickpass.Models;
using FrontendQuickpass.Models.Configurations;
using FrontendQuickpass.Services;
using FrontendQuickpass.Helpers;
using System.Text;
using System.Text.RegularExpressions;

namespace FrontendQuickpass.Controllers
{
    public class ListaNegraController : BaseController
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ApiSettings _apiSettings;
        private readonly LoginService _loginService;

        // Obtener nombre completo desde JWT en lugar de cookie
        private string UsuarioName
        {
            get
            {
                var sessionHelper = HttpContext.GetSessionHelper(_loginService);
                return sessionHelper.FullName;
            }
        }

        public ListaNegraController(
            IHttpClientFactory httpClientFactory,
            IOptions<ApiSettings> apiOptions,
            LoginService loginService
        )
        {
            _httpClientFactory = httpClientFactory;
            _apiSettings = apiOptions.Value;
            _loginService = loginService;
        }

        // GET /ListaNegra
        public async Task<IActionResult> Index(
            int page = 1,
            int size = 10,
            string? search = null
        )
        {
            var client = _httpClientFactory.CreateClient();

            client.DefaultRequestHeaders.Accept.Clear();
            client.DefaultRequestHeaders.Accept.Add(
                new MediaTypeWithQualityHeaderValue("application/json")
            );
            if (!string.IsNullOrWhiteSpace(_apiSettings.Token))
            {
                client.DefaultRequestHeaders.Authorization =
                    new AuthenticationHeaderValue("Bearer", _apiSettings.Token);
            }

            page = Math.Max(1, page);
            size = Math.Max(10, Math.Min(50, size));

            var nvc = HttpUtility.ParseQueryString(string.Empty);
            nvc["page"] = page.ToString();
            nvc["size"] = size.ToString();
            nvc["includeAttachments"] = "true";
            if (!string.IsNullOrWhiteSpace(search)) nvc["search"] = search;

            var baseUrl = (_apiSettings.BaseUrl ?? string.Empty).TrimEnd('/');
            var url = $"{baseUrl}/blacklist/reports/active?{nvc}";

            var model = new List<ActiveBlacklistDto>();
            var pager = new Pager { Page = page, Size = size, TotalItems = 0, TotalPages = 1 };

            try
            {
                var resp = await client.GetAsync(url);
                if (!resp.IsSuccessStatusCode)
                {
                    ViewBag.Error = $"Error al obtener datos ({(int)resp.StatusCode} {resp.ReasonPhrase})";
                    SetViewBags(pager, search);
                    return View("Index", model);
                }

                var json = await resp.Content.ReadAsStringAsync();

                try
                {
                    var opts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                    var paged = JsonSerializer.Deserialize<ApiPaginatedResponse<ActiveBlacklistDto>>(json, opts);

                    if (paged?.Data != null)
                    {
                        model = paged.Data;
                        pager.TotalItems = paged.Total ?? model.Count;
                        pager.TotalPages = paged.TotalPages ??
                            (int)Math.Ceiling((double)pager.TotalItems / size);
                        pager.Page = paged.CurrentPage ?? page;
                    }
                    else
                    {
                        throw new JsonException("Formato no paginado");
                    }
                }
                catch
                {
                    var opts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                    model = JsonSerializer.Deserialize<List<ActiveBlacklistDto>>(json, opts) ?? new List<ActiveBlacklistDto>();
                    pager.TotalItems = model.Count;
                    pager.TotalPages = model.Count == size ? page + 1 : page;
                }

                foreach (var report in model)
                {
                    ProcessReportUrls(report, baseUrl);
                }

                ViewBag.ApiToken = _apiSettings.Token;
                ViewBag.BaseUrl = baseUrl;

                SetViewBags(pager, search);
                return View("Index", model);
            }
            catch
            {
                ViewBag.Error = "Error inesperado al obtener datos.";
                SetViewBags(pager, search);
                return View("Index", model);
            }
        }

        private void ProcessReportUrls(ActiveBlacklistDto report, string baseUrl)
        {
            if (report == null) return;

            var evidenceUrls = new List<string>();
            var attachmentUrls = new List<string>();

            // 1. Procesar EVIDENCIAS del reporte (incidente)
            if (report.EvidenceUrls != null)
            {
                foreach (var url in report.EvidenceUrls)
                {
                    if (!string.IsNullOrWhiteSpace(url))
                    {
                        var processedUrl = ProcessUrl(url, baseUrl);
                        if (!string.IsNullOrEmpty(processedUrl))
                        {
                            evidenceUrls.Add(processedUrl);
                        }
                    }
                }
            }

            // 2. Procesar ATTACHMENTS del shipment (posibles fotos del conductor)
            if (report.Shipment?.Attachments != null)
            {
                foreach (var attachment in report.Shipment.Attachments)
                {
                    if (!string.IsNullOrWhiteSpace(attachment.FileUrl))
                    {
                        var processedUrl = ProcessUrl(attachment.FileUrl, baseUrl);
                        if (!string.IsNullOrEmpty(processedUrl))
                        {
                            attachmentUrls.Add(processedUrl);
                        }
                    }
                }
            }

            // 3. Determinar FOTO DEL CONDUCTOR
            //    - Usa primero el campo DriverPhotoUrl si viene del API
            //    - Si no, toma la primera imagen de attachments
            var photoCandidate = report.DriverPhotoUrl;
            if (string.IsNullOrWhiteSpace(photoCandidate))
            {
                photoCandidate = attachmentUrls.FirstOrDefault(url => IsImageUrl(url));
            }

            // 3.1 Normalizar cuando venga base64 sin prefijo data:
            photoCandidate = NormalizeMaybeBase64Image(photoCandidate);

            // 3.2 Asignar al DTO para que la vista lo tenga disponible
            report.DriverPhotoUrl = photoCandidate ?? string.Empty;

            // 4. Construir listas finales:
            //    - EvidenceUrlsProcessed: SIEMPRE evidencias del evento
            //    - Si hay foto del conductor, la inyectamos al inicio SOLO para miniaturas/preview
            var finalEvidence = new List<string>();
            if (!string.IsNullOrEmpty(report.DriverPhotoUrl))
            {
                finalEvidence.Add(report.DriverPhotoUrl);
            }
            finalEvidence.AddRange(evidenceUrls);

            // De-dup por si la foto ya venía también en evidencias
            report.EvidenceUrlsProcessed = finalEvidence
                .Where(u => !string.IsNullOrWhiteSpace(u))
                .Distinct()
                .ToList();

            // 5. Mantener lista "all" usada por el visor
            report.ProcessedUrls = new List<string>(report.EvidenceUrlsProcessed);
        }

        private string ProcessUrl(string url, string baseUrl)
        {
            if (string.IsNullOrWhiteSpace(url)) return string.Empty;

            // data URLs (incluye base64)
            if (url.StartsWith("data:"))
            {
                return url;
            }

            // URLs absolutas
            if (url.StartsWith("http://") || url.StartsWith("https://"))
            {
                return url;
            }

            // Paths relativos
            if (url.StartsWith("/"))
            {
                return baseUrl + url;
            }
            else
            {
                return baseUrl + "/" + url;
            }
        }

        private static readonly Regex _maybeBareBase64 =
            new Regex(@"^[A-Za-z0-9+/=\r\n]+$", RegexOptions.Compiled);

        /// <summary>
        /// Si la cadena parece ser base64 cruda sin prefijo y no es URL, la convierte a data:image/jpeg;base64,...
        /// </summary>
        private string NormalizeMaybeBase64Image(string? candidate)
        {
            if (string.IsNullOrWhiteSpace(candidate)) return string.Empty;

            var val = candidate.Trim();

            // Ya es data URL
            if (val.StartsWith("data:image/")) return val;

            // Ya es http(s)
            if (val.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                val.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                return val;

            // Si contiene caracteres típicos de URL o ruta, no lo tratamos como base64
            if (val.Contains("/") || val.Contains("\\") || val.Contains(":"))
                return val;

            // Heurística simple: ¿parece base64?
            // - sólo caracteres base64
            // - longitud "grande" (evita tratar "ABC" como base64)
            if (val.Length >= 100 && _maybeBareBase64.IsMatch(val))
            {
                return $"data:image/jpeg;base64,{val}";
            }

            return val;
        }

        private bool IsImageUrl(string url)
        {
            if (string.IsNullOrEmpty(url)) return false;

            if (url.StartsWith("data:image/")) return true;

            return System.Text.RegularExpressions.Regex.IsMatch(
                url,
                @"\.(jpg|jpeg|png|gif|webp|heic|heif|bmp)(\?.*)?$",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase
            );
        }

        private bool IsVideoUrl(string url)
        {
            if (string.IsNullOrEmpty(url)) return false;
            if (url.StartsWith("data:video/")) return true;
            return System.Text.RegularExpressions.Regex.IsMatch(
                url,
                @"\.(mp4|m4v|mov|webm|ogg|ogv)(\?.*)?$",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase
            );
        }

        [HttpPut]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> UpdatePenalty(int id, [FromBody] UpdatePenaltyRequest request)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(new { success = false, message = "Datos inválidos" });
            }

            // Obtener username desde el contexto (ya validado por el middleware)
            var username = GetUsername();
            if (string.IsNullOrWhiteSpace(username))
            {
                return JsonErrorUnauthorized("Usuario no autenticado");
            }

            var client = _httpClientFactory.CreateClient();

            client.DefaultRequestHeaders.Accept.Clear();
            client.DefaultRequestHeaders.Accept.Add(
                new MediaTypeWithQualityHeaderValue("application/json")
            );

            if (!string.IsNullOrWhiteSpace(_apiSettings.Token))
            {
                client.DefaultRequestHeaders.Authorization =
                    new AuthenticationHeaderValue("Bearer", _apiSettings.Token);
            }

            var baseUrl = (_apiSettings.BaseUrl ?? string.Empty).TrimEnd('/');
            var url = $"{baseUrl}/blacklist/reports/active/{id}";

            try
            {
                request.ModifiedBy = UsuarioName;

                var jsonContent = JsonSerializer.Serialize(request, new JsonSerializerOptions
                {
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                });
                var content = new StringContent(jsonContent, Encoding.UTF8, "application/json");

                var response = await client.PutAsync(url, content);
                var responseContent = await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode)
                {
                    return Json(new { success = true, message = "Amonestación actualizada exitosamente" });
                }
                else
                {
                    var errorResponse = new Dictionary<string, object>();
                    try
                    {
                        errorResponse = JsonSerializer.Deserialize<Dictionary<string, object>>(responseContent,
                            new JsonSerializerOptions { PropertyNameCaseInsensitive = true }) ?? new Dictionary<string, object>();
                    }
                    catch
                    {
                        errorResponse["message"] = "Error al actualizar la amonestación";
                    }

                    var errorMessage = errorResponse.ContainsKey("message")
                        ? errorResponse["message"].ToString()
                        : "Error al actualizar la amonestación";

                    return BadRequest(new { success = false, message = errorMessage });
                }
            }
            catch (Exception)
            {
                return StatusCode(500, new { success = false, message = "Error interno del servidor" });
            }
        }

        private void SetViewBags(Pager p, string? search)
        {
            ViewBag.Pager = p;
            ViewBag.Filters = new { Page = p.Page, Size = p.Size, search = search ?? string.Empty };
        }
    }
}