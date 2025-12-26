using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Web;
using FrontendQuickpass.Models;
using FrontendQuickpass.Models.Configurations;
using System.Text.RegularExpressions;

namespace FrontendQuickpass.Controllers
{
    public class ListaNegraMotoristasController : Controller
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ApiSettings _apiSettings;

        public ListaNegraMotoristasController(
            IHttpClientFactory httpClientFactory,
            IOptions<ApiSettings> apiOptions
        )
        {
            _httpClientFactory = httpClientFactory;
            _apiSettings = apiOptions.Value;
        }

        // GET /ListaNegraMotoristas
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

            // 1) Evidencias del reporte
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

            // 2) Attachments del shipment (posibles fotos del conductor)
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

            // 3) Foto del conductor (prioridad: DriverPhotoUrl, si no la primera imagen de attachments)
            var photoCandidate = report.DriverPhotoUrl;
            if (string.IsNullOrWhiteSpace(photoCandidate))
            {
                photoCandidate = attachmentUrls.FirstOrDefault(url => IsImageUrl(url));
            }

            // Normalizar base64 "crudo" a data:image/jpeg;base64,...
            report.DriverPhotoUrl = NormalizeMaybeBase64Image(photoCandidate);

            // 4) Construir listas: foto del conductor SOLO para miniaturas/preview (se preprende)
            var finalEvidence = new List<string>();
            if (!string.IsNullOrWhiteSpace(report.DriverPhotoUrl))
            {
                finalEvidence.Add(report.DriverPhotoUrl);
            }
            finalEvidence.AddRange(evidenceUrls);

            // De-dup y asignar
            report.EvidenceUrlsProcessed = finalEvidence
                .Where(u => !string.IsNullOrWhiteSpace(u))
                .Distinct()
                .ToList();

            // 5) ProcessedUrls (usado por visor): mismo orden
            report.ProcessedUrls = new List<string>(report.EvidenceUrlsProcessed);
        }

        private string ProcessUrl(string url, string baseUrl)
        {
            if (string.IsNullOrWhiteSpace(url)) return string.Empty;

            if (url.StartsWith("data:")) return url; // base64/data URL

            if (url.StartsWith("http://") || url.StartsWith("https://"))
            {
                return url;
            }

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
        /// Si parece base64 crudo y no trae prefijo ni URL, lo convierte a data:image/jpeg;base64,...
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

            // Si parece ruta (contiene /, \ o :)
            if (val.Contains("/") || val.Contains("\\") || val.Contains(":"))
                return val;

            // Heurística: base64 razonablemente largo y válido
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

        private void SetViewBags(Pager p, string? search)
        {
            ViewBag.Pager = p;
            ViewBag.Filters = new { Page = p.Page, Size = p.Size, search = search ?? string.Empty };
        }
    }
}