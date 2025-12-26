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

namespace FrontendQuickpass.Controllers
{
    public class ReportesIncidentesController : BaseController
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

        public ReportesIncidentesController(
            IHttpClientFactory httpClientFactory,
            IOptions<ApiSettings> apiOptions,
            LoginService loginService
        )
        {
            _httpClientFactory = httpClientFactory;
            _apiSettings = apiOptions.Value;
            _loginService = loginService;
        }

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
            var url = $"{baseUrl}/blacklist/reports/pending?{nvc}";

            var model = new List<PendingReportDto>();
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
                    var paged = JsonSerializer.Deserialize<ApiPaginatedResponse<PendingReportDto>>(json, opts);

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
                    model = JsonSerializer.Deserialize<List<PendingReportDto>>(json, opts) ?? new List<PendingReportDto>();
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

        private void ProcessReportUrls(PendingReportDto report, string baseUrl)
        {
            if (report == null) return;

            var evidenceUrls = new List<string>();
            var attachmentUrls = new List<string>();

            // Procesar evidencias
            if (report.EvidenceUrls != null)
            {
                foreach (var url in report.EvidenceUrls)
                {
                    if (string.IsNullOrWhiteSpace(url)) continue;

                    var processedUrl = ProcessUrl(url, baseUrl);
                    processedUrl = EnsureDataUrl(processedUrl);

                    if (!string.IsNullOrEmpty(processedUrl))
                    {
                        evidenceUrls.Add(AddMediaTypeMarker(processedUrl));
                    }
                }
            }

            // Procesar attachments
            if (report.Shipment?.Attachments != null)
            {
                foreach (var attachment in report.Shipment.Attachments)
                {
                    if (string.IsNullOrWhiteSpace(attachment.FileUrl)) continue;

                    var processedUrl = ProcessUrl(attachment.FileUrl, baseUrl);
                    processedUrl = EnsureDataUrl(processedUrl);

                    if (!string.IsNullOrEmpty(processedUrl))
                    {
                        attachmentUrls.Add(AddMediaTypeMarker(processedUrl));
                    }
                }
            }

            // Asignar foto del conductor (primera imagen de attachments)
            report.DriverPhotoUrl = attachmentUrls.FirstOrDefault(IsImageUrl);

            // Asignar evidencias del incidente
            report.EvidenceUrlsProcessed = evidenceUrls;

            // Todas las URLs procesadas (foto + evidencias)
            report.ProcessedUrls = new List<string>();
            if (!string.IsNullOrEmpty(report.DriverPhotoUrl))
            {
                report.ProcessedUrls.Add(report.DriverPhotoUrl);
            }
            report.ProcessedUrls.AddRange(evidenceUrls);
        }

        /// <summary>
        /// Agregar marcador de tipo de media (#media-type=image|video|unknown)
        /// </summary>
        private string AddMediaTypeMarker(string url)
        {
            if (string.IsNullOrEmpty(url)) return url;
            if (url.Contains("#media-type=")) return url; // Ya tiene marcador

            var mediaType = DetermineMediaType(url);
            return $"{url}#media-type={mediaType}";
        }

        /// <summary>
        /// Determinar tipo de media basado en la URL
        /// Prioridad: 1) Data URLs, 2) Query param &k=, 3) Extensión
        /// </summary>
        private string DetermineMediaType(string url)
        {
            if (string.IsNullOrEmpty(url)) return "unknown";

            // 1. Data URLs (más confiable)
            if (url.StartsWith("data:video/", StringComparison.OrdinalIgnoreCase)) return "video";
            if (url.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase)) return "image";

            // 2. Query parameter &k=v|i (viene del backend API)
            if (url.Contains("&k=v", StringComparison.OrdinalIgnoreCase)) return "video";
            if (url.Contains("&k=i", StringComparison.OrdinalIgnoreCase)) return "image";

            // 3. Fallback: detectar por extensión
            if (IsVideoUrl(url)) return "video";
            if (IsImageUrl(url)) return "image";

            return "unknown";
        }

        private bool IsImageUrl(string url)
        {
            if (string.IsNullOrEmpty(url)) return false;

            // Data URL de imagen
            if (url.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase)) return true;

            // Base64 crudo (heurística)
            if (IsProbablyBase64(url)) return true;

            // Extensiones de imagen
            return System.Text.RegularExpressions.Regex.IsMatch(
                url,
                @"\.(jpg|jpeg|png|gif|webp|heic|heif|bmp|svg)(\?.*)?($|#)",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase
            );
        }

        private bool IsVideoUrl(string url)
        {
            if (string.IsNullOrEmpty(url)) return false;

            // Data URL de video
            if (url.StartsWith("data:video/", StringComparison.OrdinalIgnoreCase)) return true;

            // Extensiones de video
            return System.Text.RegularExpressions.Regex.IsMatch(
                url,
                @"\.(mp4|m4v|mov|webm|ogg|ogv|avi|mkv)(\?|#|$)",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase
            );
        }

        private bool IsProbablyBase64(string s)
        {
            if (string.IsNullOrWhiteSpace(s)) return false;
            if (s.StartsWith("http", StringComparison.OrdinalIgnoreCase)) return false;
            if (s.StartsWith("data:", StringComparison.OrdinalIgnoreCase)) return false;
            if (s.StartsWith("/")) return false;
            if (s.Length < 100) return false;

            return System.Text.RegularExpressions.Regex.IsMatch(s, "^[A-Za-z0-9+/=\\r\\n]+$");
        }

        private string EnsureDataUrl(string url)
        {
            if (string.IsNullOrWhiteSpace(url)) return string.Empty;

            // Ya es una URL válida
            if (url.StartsWith("data:", StringComparison.OrdinalIgnoreCase) ||
                url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                url.StartsWith("https://", StringComparison.OrdinalIgnoreCase) ||
                url.StartsWith("/"))
            {
                return url;
            }

            // Si parece base64 crudo, convertir a data URL
            if (IsProbablyBase64(url))
            {
                var clean = url.Replace("\r", "").Replace("\n", "");
                return $"data:image/jpeg;base64,{clean}";
            }

            return url;
        }

        private string ProcessUrl(string url, string baseUrl)
        {
            if (string.IsNullOrWhiteSpace(url)) return string.Empty;

            // Base64 o data URL (retornar sin modificar)
            if (url.StartsWith("data:", StringComparison.OrdinalIgnoreCase) || IsProbablyBase64(url))
            {
                return url;
            }

            // URL absoluta (retornar sin modificar)
            if (url.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                url.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
            {
                return url;
            }

            // URL relativa: construir URL completa
            return url.StartsWith("/") ? baseUrl + url : $"{baseUrl}/{url}";
        }

        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> ApplyPenalty([FromBody] ApplyPenaltyRequest request)
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
            var url = $"{baseUrl}/blacklist/reports/apply-penalty";

            try
            {
                request.AppliedBy = UsuarioName;

                var jsonContent = JsonSerializer.Serialize(request, new JsonSerializerOptions
                {
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                });
                var content = new StringContent(jsonContent, Encoding.UTF8, "application/json");

                var response = await client.PostAsync(url, content);
                var responseContent = await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode)
                {
                    return Json(new { success = true, message = "Amonestación aplicada exitosamente" });
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
                        errorResponse["message"] = "Error al aplicar la amonestación";
                    }

                    var errorMessage = errorResponse.ContainsKey("message")
                        ? errorResponse["message"].ToString()
                        : "Error al aplicar la amonestación";

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