using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Web;
using FrontendQuickpass.Models;
using FrontendQuickpass.Services;
using FrontendQuickpass.Helpers;
using FrontendQuickpass.Models.Configurations;
using System.Net;
using System.Text;

namespace FrontendQuickpass.Controllers
{
    public class ListaCamionesController : BaseController
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ApiSettings _apiSettings;
        private readonly ITransactionLogService _logService;
        private readonly ILogger<ListaCamionesController> _logger;
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

        // Constantes para validación
        private const int MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB
        private const int MAX_FILES = 10;
        private static readonly string[] ALLOWED_IMAGE_TYPES = { "image/jpeg", "image/png", "image/gif", "image/webp" };
        private static readonly string[] ALLOWED_VIDEO_TYPES = { "video/mp4", "video/quicktime", "video/x-m4v", "video/hevc" };

        public ListaCamionesController(
            IHttpClientFactory httpClientFactory,
            IOptions<ApiSettings> apiOptions,
            ITransactionLogService logService,
            ILogger<ListaCamionesController> logger,
            LoginService loginService)
        {
            _httpClientFactory = httpClientFactory;
            _apiSettings = apiOptions.Value;
            _logService = logService;
            _logger = logger;
            _loginService = loginService;
        }

        // ========== LISTA (GET) ==========
        public async Task<IActionResult> Index(
            int page = 1,
            int size = 10,
            string? startDate = null,
            string? endDate = null,
            string? search = null)
        {
            var client = _httpClientFactory.CreateClient();

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
            nvc["excludeStatus"] = "1";
            nvc["includeStatuses"] = "true";
            if (!string.IsNullOrWhiteSpace(startDate)) nvc["startDate"] = startDate;
            if (!string.IsNullOrWhiteSpace(endDate)) nvc["endDate"] = endDate;
            if (!string.IsNullOrWhiteSpace(search)) nvc["search"] = search;

            var qs = nvc.ToString();
            var url = $"{_apiSettings.BaseUrl}shipping?{qs}";

            var pageData = new List<ListaCamiones>();
            var paginationResult = new ListaCamionesPager
            {
                Page = page,
                Size = size,
                TotalItems = 0,
                TotalPages = 1
            };

            try
            {
                var response = await client.GetAsync(url);
                if (!response.IsSuccessStatusCode)
                {
                    var raw = await response.Content.ReadAsStringAsync();
                    _logger.LogWarning("API error: {StatusCode} - {Response}", response.StatusCode, raw);
                    ViewBag.Error = $"Error {(int)response.StatusCode} {response.ReasonPhrase}. Respuesta: {raw}";
                    ViewBag.Pager = paginationResult;
                    ViewBag.Filters = new { page, size, startDate, endDate, search };
                    return View("Index", pageData);
                }

                var json = await response.Content.ReadAsStringAsync();

                try
                {
                    var paginatedResponse = JsonSerializer.Deserialize<ApiPaginatedResponse>(json, new JsonSerializerOptions
                    {
                        PropertyNameCaseInsensitive = true
                    });

                    if (paginatedResponse?.Data != null)
                    {
                        pageData = paginatedResponse.Data;
                        paginationResult.TotalItems = paginatedResponse.Total ?? pageData.Count;
                        paginationResult.TotalPages = paginatedResponse.TotalPages ??
                            (int)Math.Ceiling((double)paginationResult.TotalItems / size);
                        paginationResult.Page = paginatedResponse.CurrentPage ?? page;
                    }
                    else
                    {
                        throw new JsonException("Formato inesperado");
                    }
                }
                catch
                {
                    pageData = JsonSerializer.Deserialize<List<ListaCamiones>>(json, new JsonSerializerOptions
                    {
                        PropertyNameCaseInsensitive = true
                    }) ?? new List<ListaCamiones>();

                    paginationResult.TotalItems = pageData.Count;
                    paginationResult.TotalPages = pageData.Count == size ? page + 1 : page;
                }

                ViewBag.Pager = paginationResult;
                ViewBag.Filters = new
                {
                    page = paginationResult.Page,
                    size = paginationResult.Size,
                    startDate,
                    endDate,
                    search
                };

                ViewBag.ApiToken = _apiSettings.Token;

                return View("Index", pageData);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error en Index de ListaCamiones");
                ViewBag.Error = "Error al cargar los datos. Por favor, intente nuevamente.";
                ViewBag.Pager = paginationResult;
                ViewBag.Filters = new { page, size, startDate, endDate, search };
                return View("Index", pageData);
            }
        }

        // ========== CREAR REPORTE (POST) ==========
        [HttpPost]
        [ValidateAntiForgeryToken]
        public async Task<IActionResult> CreateIncidentReport()
        {
            // Obtener username desde el contexto (ya validado por el middleware)
            var username = GetUsername();
            if (string.IsNullOrWhiteSpace(username))
            {
                return JsonErrorUnauthorized("Debe iniciar sesión");
            }

            var rawBase = _apiSettings.BaseUrl ?? "";
            var baseUrl = rawBase.TrimEnd('/');
            if (string.IsNullOrWhiteSpace(baseUrl))
            {
                _logger.LogError("ApiSettings.BaseUrl está vacío");
                return Json(new { success = false, error = "Config inválida", message = "ApiSettings.BaseUrl vacío" });
            }

            // Validar archivos antes de procesarlos
            var files = Request.Form.Files.GetFiles("evidenceFiles");
            var validationResult = ValidateFiles(files);
            if (!validationResult.IsValid)
            {
                return Json(new { success = false, error = "Validación fallida", message = validationResult.ErrorMessage });
            }

            var handler = new SocketsHttpHandler
            {
                AutomaticDecompression = DecompressionMethods.None,
                UseCookies = false,
                PooledConnectionLifetime = TimeSpan.FromMinutes(2),
                UseProxy = false,
                Proxy = null
            };

            using var http = new HttpClient(handler)
            {
                Timeout = TimeSpan.FromMinutes(5),
                DefaultRequestVersion = HttpVersion.Version11,
                DefaultVersionPolicy = HttpVersionPolicy.RequestVersionOrLower
            };

            http.DefaultRequestHeaders.ExpectContinue = false;
            http.DefaultRequestHeaders.ConnectionClose = true;
            http.DefaultRequestHeaders.Accept.Clear();
            http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
            
            if (!http.DefaultRequestHeaders.Contains("Accept-Encoding"))
                http.DefaultRequestHeaders.TryAddWithoutValidation("Accept-Encoding", "identity");

            if (!string.IsNullOrWhiteSpace(_apiSettings.Token))
                http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _apiSettings.Token);

            try
            {
                var boundary = "----QuickpassBoundary" + DateTime.UtcNow.Ticks.ToString("x");
                using var form = new MultipartFormDataContent(boundary);

                string GetFormValue(string key) => Request.Form[key].FirstOrDefault() ?? string.Empty;

                // Campos del formulario
                AddUtf8String(form, "license", GetFormValue("license"));
                AddUtf8String(form, "shipmentId", GetFormValue("shipmentId"));
                AddUtf8String(form, "reportDatetime", GetFormValue("reportDatetime"));
                AddUtf8String(form, "eventType", GetFormValue("eventType"));
                AddUtf8String(form, "faultType", GetFormValue("faultType"));
                AddUtf8String(form, "eventLocation", GetFormValue("eventLocation"));
                AddUtf8String(form, "description", GetFormValue("description"));
                AddUtf8String(form, "reportedBy", username);

                // Procesar archivos
                foreach (var file in files)
                {
                    if (file?.Length > 0)
                    {
                        await AddFileToForm(form, file);
                    }
                }

                form.Headers.ContentType = MediaTypeHeaderValue.Parse($"multipart/form-data; boundary={boundary}");

                var apiUrl = $"{baseUrl}/blacklist/reports";
                _logger.LogInformation("Enviando reporte a: {ApiUrl}", apiUrl);

                using var req = new HttpRequestMessage(HttpMethod.Post, apiUrl)
                {
                    Content = form,
                    Version = HttpVersion.Version11,
                    VersionPolicy = HttpVersionPolicy.RequestVersionOrLower
                };

                using var res = await http.SendAsync(req, HttpCompletionOption.ResponseHeadersRead);

                if (res.IsSuccessStatusCode)
                {
                    res.Headers.TryGetValues("Request-Id", out var reqIds);
                    _logger.LogInformation("Reporte creado exitosamente. Status: {Status}, RequestId: {RequestId}", 
                        res.StatusCode, reqIds?.FirstOrDefault());
                    
                    return Json(new
                    {
                        success = true,
                        message = "Reporte creado exitosamente",
                        reference = new
                        {
                            status = (int)res.StatusCode,
                            requestId = reqIds?.FirstOrDefault()
                        }
                    });
                }

                string responseText = await SafeReadResponseContent(res);
                _logger.LogWarning("Error al crear reporte. Status: {Status}, Response: {Response}", 
                    res.StatusCode, responseText);

                return Json(new
                {
                    success = false,
                    error = $"Error de la API: {(int)res.StatusCode} {res.ReasonPhrase}",
                    message = responseText
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al crear reporte de incidente");
                return Json(new
                {
                    success = false,
                    error = "Error interno del servidor",
                    message = ex.Message
                });
            }
        }

        // ================== Helpers ==================

        private static void AddUtf8String(MultipartFormDataContent form, string name, string value)
        {
            var sc = new StringContent(value ?? string.Empty, Encoding.UTF8);
            sc.Headers.ContentDisposition = new ContentDispositionHeaderValue("form-data")
            {
                Name = $"\"{name}\""
            };
            form.Add(sc);
        }

        private async Task AddFileToForm(MultipartFormDataContent form, IFormFile file)
        {
            using var ms = new MemoryStream();
            await file.CopyToAsync(ms);
            var bytes = ms.ToArray();

            var realMime = DetectMimeType(bytes, file.FileName, file.ContentType);

            var part = new ByteArrayContent(bytes);
            part.Headers.ContentType = new MediaTypeHeaderValue(realMime);

            var cd = new ContentDispositionHeaderValue("form-data")
            {
                Name = "\"evidenceFiles\"",
                FileName = $"\"{SanitizeFileName(file.FileName)}\""
            };
            part.Headers.ContentDisposition = cd;

            form.Add(part);
        }

        private (bool IsValid, string ErrorMessage) ValidateFiles(IReadOnlyList<IFormFile> files)
        {
            if (files.Count > MAX_FILES)
            {
                return (false, $"Máximo {MAX_FILES} archivos permitidos");
            }

            foreach (var file in files)
            {
                if (file.Length > MAX_FILE_SIZE)
                {
                    return (false, $"El archivo {file.FileName} excede el tamaño máximo de 20MB");
                }

                var isValidType = ALLOWED_IMAGE_TYPES.Contains(file.ContentType) || 
                                ALLOWED_VIDEO_TYPES.Contains(file.ContentType);

                if (!isValidType)
                {
                    return (false, $"Tipo de archivo no permitido: {file.ContentType}");
                }
            }

            return (true, string.Empty);
        }

        private static string DetectMimeType(byte[] bytes, string fileName, string providedMime)
        {
            if (bytes.Length < 12) return providedMime ?? "application/octet-stream";

            bool StartsWithBytes(params byte[] pattern) => 
                bytes.Length >= pattern.Length && bytes.AsSpan(0, pattern.Length).SequenceEqual(pattern);

            // Imágenes
            if (StartsWithBytes(0xFF, 0xD8, 0xFF)) return "image/jpeg";
            if (StartsWithBytes(0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)) return "image/png";
            if (StartsWithBytes(0x47, 0x49, 0x46, 0x38)) return "image/gif";
            
            // WEBP
            if (bytes.Length >= 12 &&
                StartsWithBytes(0x52, 0x49, 0x46, 0x46) && // "RIFF"
                bytes[8] == 0x57 && bytes[9] == 0x45 && bytes[10] == 0x42 && bytes[11] == 0x50) // "WEBP"
            {
                return "image/webp";
            }

            // Videos MP4/MOV (ISO Base Media File Format)
            if (bytes.Length >= 12 && bytes[4] == 0x66 && bytes[5] == 0x74 && bytes[6] == 0x79 && bytes[7] == 0x70) // "ftyp"
            {
                // Detectar subtipos específicos
                var brandCode = Encoding.ASCII.GetString(bytes, 8, 4);
                return brandCode switch
                {
                    "isom" or "iso2" or "mp41" or "mp42" or "avc1" => "video/mp4",
                    "qt  " or "MSNV" => "video/quicktime",
                    _ => "video/mp4" // Default para ISO BMFF
                };
            }

            // Videos AVI
            if (StartsWithBytes(0x52, 0x49, 0x46, 0x46) && 
                bytes.Length >= 12 && bytes[8] == 0x41 && bytes[9] == 0x56 && bytes[10] == 0x49 && bytes[11] == 0x20)
            {
                return "video/x-msvideo";
            }

            // Videos WebM
            if (StartsWithBytes(0x1A, 0x45, 0xDF, 0xA3)) return "video/webm";

            // Videos MPEG
            if (StartsWithBytes(0x00, 0x00, 0x01, 0xBA) || StartsWithBytes(0x00, 0x00, 0x01, 0xB3))
            {
                return "video/mpeg";
            }

            // Fallback al MIME proporcionado o genérico
            return !string.IsNullOrWhiteSpace(providedMime) ? providedMime : "application/octet-stream";
        }

        private static string SanitizeFileName(string fileName)
        {
            if (string.IsNullOrWhiteSpace(fileName)) return "file";

            var invalidChars = Path.GetInvalidFileNameChars();
            var cleaned = new string(fileName.Select(ch => invalidChars.Contains(ch) ? '_' : ch).ToArray());
            
            // Limitar longitud
            const int maxLength = 120;
            if (cleaned.Length > maxLength)
            {
                var extension = Path.GetExtension(cleaned);
                var nameWithoutExt = Path.GetFileNameWithoutExtension(cleaned);
                cleaned = nameWithoutExt.Substring(0, maxLength - extension.Length) + extension;
            }

            return cleaned;
        }

        private static async Task<string> SafeReadResponseContent(HttpResponseMessage response)
        {
            try
            {
                var content = await (response.Content?.ReadAsStringAsync() ?? Task.FromResult(string.Empty));
                return string.IsNullOrWhiteSpace(content) ? "(sin contenido)" : content;
            }
            catch (IOException ioex)
            {
                return $"[Respuesta truncada] {ioex.Message}";
            }
            catch (Exception ex)
            {
                return $"[Error al leer respuesta] {ex.Message}";
            }
        }
    }
}