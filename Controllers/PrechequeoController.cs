using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using System.Net.Http.Headers;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;
using FrontendQuickpass.Models;
using FrontendQuickpass.Models.Configurations;
using System.Text;
using System.Globalization;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.WebUtilities;
using FrontendQuickpass.Services;
using System.Net.Http;

namespace FrontendQuickpass.Controllers
{
    public class PrechequeoController : Controller
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ApiSettings _apiSettings;
        private readonly ILogger<PrechequeoController> _logger;
        private readonly ITransactionLogService _logService;

        // Regex UUID - Acepta UUIDs con 8-10 caracteres en el primer segmento
        private static readonly Regex UuidRe = new Regex(
            "[0-9A-Fa-f]{8,10}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}",
            RegexOptions.Compiled);

        private const string DestHost = "admin.factura.gob.sv";

        // Extrae UUID desde un string/URL
        private static string? ExtractUuid(string raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return null;

            if (Uri.TryCreate(raw, UriKind.Absolute, out var u))
            {
                var q = QueryHelpers.ParseQuery(u.Query);
                if (q.TryGetValue("codigoGeneracion", out var v) || q.TryGetValue("codGen", out v))
                {
                    var p = v.ToString();
                    if (UuidRe.IsMatch(p)) return NormalizeUuid(p);
                }
            }

            var m = UuidRe.Match(raw);
            return m.Success ? NormalizeUuid(m.Value) : null;
        }

        // Normaliza UUID a mayúsculas
        private static string NormalizeUuid(string uuid)
        {
            if (string.IsNullOrWhiteSpace(uuid)) return uuid;

            // Solo convertir a mayúsculas, mantener formato original
            return uuid.ToUpperInvariant();
        }

        private async Task<(string? effectiveUrl, string? uuid)> FollowRedirectsAndExtractAsync(string url)
        {
            try
            {
                var client = _httpClientFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(10);
                client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0");

                using var req = new HttpRequestMessage(HttpMethod.Get, url);
                using var resp = await client.SendAsync(req, HttpCompletionOption.ResponseHeadersRead);

                var effective = resp.RequestMessage?.RequestUri?.ToString();

                var uuid = effective is null ? null : ExtractUuid(effective);
                if (!string.IsNullOrEmpty(uuid))
                    return (effective, uuid);

                if (resp.Content.Headers.ContentType?.MediaType?.Contains("html") == true)
                {
                    var html = await resp.Content.ReadAsStringAsync();

                    string? targetUrl = null;

                    // Preferir destino de Hacienda
                    var mHrefPrefer = Regex.Match(html,
                       "href\\s*=\\s*\"(?<u>https?://" + DestHost.Replace(".", "\\.") + "[^\"]+)\"",
                       RegexOptions.IgnoreCase);
                    if (mHrefPrefer.Success)
                        targetUrl = mHrefPrefer.Groups["u"].Value;

                    // Primer href http(s)
                    if (string.IsNullOrEmpty(targetUrl))
                    {
                        var mAnyHref = Regex.Match(html, "href\\s*=\\s*\"(?<u>https?://[^\"]+)\"", RegexOptions.IgnoreCase);
                        if (mAnyHref.Success)
                            targetUrl = mAnyHref.Groups["u"].Value;
                    }

                    // Meta refresh
                    if (string.IsNullOrEmpty(targetUrl))
                    {
                        var mMeta = Regex.Match(
                            html,
                            "http-equiv\\s*=\\s*\"refresh\"[^>]*content\\s*=\\s*\"[^\"]*url=(?<u>https?://[^\"]+)\"",
                            RegexOptions.IgnoreCase);
                        if (mMeta.Success)
                            targetUrl = mMeta.Groups["u"].Value;
                    }

                    if (!string.IsNullOrEmpty(targetUrl))
                    {
                        var uuidFromTarget = ExtractUuid(targetUrl);
                        if (!string.IsNullOrEmpty(uuidFromTarget))
                            return (targetUrl, uuidFromTarget);
                    }

                    var inside = UuidRe.Match(html);
                    if (inside.Success)
                        return (effective, inside.Value.ToUpperInvariant());
                }

                return (effective, null);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "FollowRedirectsAndExtractAsync falló para {url}", url);
                return (null, null);
            }
        }

        // Normaliza previews conocidos (por ahora TinyURL)
        private static string NormalizePreviewShortUrl(string url)
        {
            var mTiny = Regex.Match(url, @"tinyurl\.com/preview/[A-Za-z0-9\-_]+/(?<slug>[A-Za-z0-9]+)", RegexOptions.IgnoreCase);
            if (mTiny.Success)
                return $"https://tinyurl.com/{mTiny.Groups["slug"].Value}";
            return url;
        }

        public PrechequeoController(IHttpClientFactory httpClientFactory, IOptions<ApiSettings> apiSettings, ILogger<PrechequeoController> logger, ITransactionLogService logService)
        {
            _httpClientFactory = httpClientFactory;
            _apiSettings = apiSettings.Value;
            _logger = logger;
            _logService = logService;
        }

        public IActionResult Index()
        {
            var userAgent = Request.Headers["User-Agent"].ToString();
            var isMobile = IsMobileDevice(userAgent);

            ViewBag.IsMobile = isMobile;
            return View("Prechequeo");
        }

        private bool IsMobileDevice(string userAgent)
        {
            return userAgent.Contains("Mobile") ||
                userAgent.Contains("Android") ||
                userAgent.Contains("iPhone") ||
                userAgent.Contains("iPad");
        }

        [HttpPost]
        public async Task<IActionResult> BuscarTransaccion([FromBody] BuscarTransaccionRequest request)
        {
            var transaccion = request.Transaccion?.Trim();

            if (string.IsNullOrEmpty(transaccion))
            {
                return Json(new { success = false, message = "Código no proporcionado." });
            }

            var client = _httpClientFactory.CreateClient();
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _apiSettings.Token);

            try
            {
                var url = $"{_apiSettings.BaseUrl}shipping/{transaccion}";
                var response = await client.GetAsync(url);

                if (!response.IsSuccessStatusCode)
                {
                    var errorRequest = new
                    {
                        transaccion = transaccion,
                        url = url,
                        httpStatus = response.StatusCode,
                        error = "Error al consultar transacción"
                    };
                    _logService.LogActivityAsync(transaccion, errorRequest, "SISTEMA", (int)response.StatusCode);

                    if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
                    {
                        return Json(new { success = false, message = "El código de generación ingresado no existe." });
                    }
                    return Json(new { success = false, message = "Error al consultar la transacción." });
                }

                var content = await response.Content.ReadAsStringAsync();
                var data = JsonConvert.DeserializeObject<Post>(content);

                if (data == null || string.IsNullOrEmpty(data.transporter))
                {
                    var errorData = new
                    {
                        transaccion = transaccion,
                        apiResponse = content,
                        error = "Datos incompletos de la API"
                    };
                    _logService.LogActivityAsync(transaccion, errorData, data?.driver?.name ?? "", 0);
                    return Json(new { success = false, message = "La transacción no se encontró en la API." });
                }

                if (data.currentStatus != 1)
                {
                    var statusError = new
                    {
                        codeGen = data.codeGen,
                        currentStatus = data.currentStatus,
                        motorista = data.driver?.name,
                        licencia = data.driver?.license,
                        transporter = data.transporter,
                        ingenio = data.ingenio?.name,
                        placaCamion = data.vehicle?.plate,
                        dateTimeCurrentStatus = data.dateTimeCurrentStatus,
                        producto = data.nameProduct,
                        error = "Transacción ya prechequeada"
                    };
                    _logService.LogActivityAsync(data.codeGen, statusError, data.driver?.name ?? "", data.currentStatus);

                    return Json(new
                    {
                        success = false,
                        message = "Esta transacción ya ha sido prechequeada.",
                        currentStatus = data.currentStatus
                    });
                }

                var model = new PrechequeoModel
                {
                    Ingenio = data.ingenio?.name?.Replace("_", " ") ?? "",
                    Fecha = DateTime.Now.ToString("dd-MM-yyyy"),
                    Transporte = data.transporter ?? "",
                    Hora = DateTime.Now.ToString("hh:mm tt", CultureInfo.InvariantCulture),
                    PlacaCamion = data.vehicle?.plate ?? "",
                    PlacaRemolque = data.vehicle?.trailerPlate ?? "",
                    Licencia = data.driver?.license ?? "",
                    Motorista = data.driver?.name ?? "",
                    TruckType = data.truckType ?? "",
                    Producto = data.product
                };

                return Json(new
                {
                    success = true,
                    message = "Código válido para prechequeo.",
                    currentStatus = data.currentStatus,
                    data = model
                });
            }
            catch (Exception ex)
            {
                var exceptionData = new
                {
                    transaccion = transaccion,
                    exception = ex.Message,
                    stackTrace = ex.StackTrace,
                    error = "Excepción en búsqueda de transacción"
                };
                _logService.LogActivityAsync(transaccion, exceptionData, "", 0);
                return Json(new { success = false, message = $"Ocurrió un error: {ex.Message}" });
            }
        }

        [HttpPost]
        public async Task<IActionResult> ResolverCodigoGeneracion([FromBody] ResolveCodigoGeneracionRequest req)
        {
            string raw = req?.Raw?.Trim() ?? "";
            if (string.IsNullOrWhiteSpace(raw))
                return Json(new { success = false, message = "Valor vacío." });

            var uuidRe = new Regex(
                "[0-9A-Fa-f]{8,10}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}",
                RegexOptions.Compiled);

            // 0) UUID directo
            var mDirect = uuidRe.Match(raw);
            if (mDirect.Success)
                return Json(new { success = true, codigoGeneracion = NormalizeUuid(mDirect.Value) });

            // 1) URL con ?codigoGeneracion= o ?codGen=
            if (Uri.TryCreate(raw, UriKind.Absolute, out var uriRaw))
            {
                var q = QueryHelpers.ParseQuery(uriRaw.Query);
                if (q.TryGetValue("codigoGeneracion", out var vv) || q.TryGetValue("codGen", out vv))
                {
                    var p = vv.ToString();
                    if (uuidRe.IsMatch(p))
                        return Json(new { success = true, codigoGeneracion = NormalizeUuid(p) });
                }
            }

            // 2) Normalizar TinyURL preview -> URL canónica corta y seguir redirecciones
            string candidate = raw;
            // a) tinyurl.com/preview/<algo>/<slug>  -> tinyurl.com/<slug>
            var mPreview = Regex.Match(raw, @"tinyurl\.com/preview/[A-Za-z0-9\-_]+/(?<slug>[A-Za-z0-9]+)", RegexOptions.IgnoreCase);
            if (mPreview.Success)
            {
                var slug = mPreview.Groups["slug"].Value;
                candidate = $"https://tinyurl.com/{slug}";
            }
            // b) tinyurl.com/<slug>?...  -> tinyurl.com/<slug> (limpio)
            var mShort = Regex.Match(candidate, @"^https?://tinyurl\.com/(?<slug>[A-Za-z0-9]+)", RegexOptions.IgnoreCase);
            if (mShort.Success)
                candidate = $"https://tinyurl.com/{mShort.Groups["slug"].Value}";

            // 2.1) Intentar seguir la redirección de la URL corta para obtener la URL final
            try
            {
                var client = _httpClientFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(10);
                client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0");

                // Hacemos GET; HttpClient sigue redirects por defecto y al final
                // response.RequestMessage.RequestUri es la URL efectiva
                using (var request = new HttpRequestMessage(HttpMethod.Get, candidate))
                using (var resp = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead))
                {
                    var effective = resp.RequestMessage?.RequestUri?.ToString();

                    // Si la URL final existe, pruebo extraer UUID desde ella o sus query params
                    if (!string.IsNullOrEmpty(effective))
                    {
                        // 1) Query param
                        if (Uri.TryCreate(effective, UriKind.Absolute, out var finalUri))
                        {
                            var qf = QueryHelpers.ParseQuery(finalUri.Query);
                            if (qf.TryGetValue("codigoGeneracion", out var cv) || qf.TryGetValue("codGen", out cv))
                            {
                                var pv = cv.ToString();
                                if (uuidRe.IsMatch(pv))
                                    return Json(new { success = true, codigoGeneracion = NormalizeUuid(pv), target = effective });
                            }
                        }
                        // 2) UUID en la propia URL
                        var mUrl = uuidRe.Match(effective);
                        if (mUrl.Success)
                            return Json(new { success = true, codigoGeneracion = NormalizeUuid(mUrl.Value), target = effective });
                    }

                    // Si no se pudo por Location/effective, como *último* recurso, leo el HTML y busco meta/anchors
                    var html = await resp.Content.ReadAsStringAsync();

                    // anchor a admin.factura.gob.sv
                    var href = Regex.Match(
                        html,
                        "href\\s*=\\s*\"(?<u>https?://admin\\.factura\\.gob\\.sv[^\"]+)\"",
                        RegexOptions.IgnoreCase);
                    string targetUrl = href.Success ? href.Groups["u"].Value : null;

                    if (string.IsNullOrEmpty(targetUrl))
                    {
                        // meta refresh
                        var meta = Regex.Match(
                            html,
                            "http-equiv\\s*=\\s*\"refresh\"[^>]*content\\s*=\\s*\"[^\"]*url=(?<u>https?://[^\"]+)\"",
                            RegexOptions.IgnoreCase);
                        if (meta.Success)
                            targetUrl = meta.Groups["u"].Value;
                    }
                    if (string.IsNullOrEmpty(targetUrl))
                    {
                        var any = Regex.Match(html, "(https?://admin\\.factura\\.gob\\.sv[^\\s\"'<>)]+)", RegexOptions.IgnoreCase);
                        if (any.Success)
                            targetUrl = any.Value;
                    }

                    if (!string.IsNullOrEmpty(targetUrl))
                    {
                        if (Uri.TryCreate(targetUrl, UriKind.Absolute, out var tu))
                        {
                            var q2 = QueryHelpers.ParseQuery(tu.Query);
                            if (q2.TryGetValue("codigoGeneracion", out var v2) || q2.TryGetValue("codGen", out v2))
                            {
                                var p2 = v2.ToString();
                                if (uuidRe.IsMatch(p2))
                                    return Json(new { success = true, codigoGeneracion = NormalizeUuid(p2), target = targetUrl });
                            }
                        }
                        var m2 = uuidRe.Match(targetUrl);
                        if (m2.Success)
                            return Json(new { success = true, codigoGeneracion = NormalizeUuid(m2.Value), target = targetUrl });
                    }

                    // Último último recurso: UUID en el HTML
                    var inside = uuidRe.Match(html);
                    if (inside.Success)
                        return Json(new { success = true, codigoGeneracion = NormalizeUuid(inside.Value), target = effective });
                }
            }
            catch (Exception ex)
            {
                // seguimos al plan B (parseo del preview original), abajo
                _logger.LogWarning(ex, "Fallo al seguir redirección TinyURL: {raw}", raw);
            }

            // 3) Plan B: si no logramos con URL corta (o no era tinyurl), intentamos parsear HTML del 'raw'
            try
            {
                var client = _httpClientFactory.CreateClient();
                client.Timeout = TimeSpan.FromSeconds(8);
                client.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0");

                var resp = await client.GetAsync(raw);
                var html = await resp.Content.ReadAsStringAsync();

                // anchors a admin.factura.gob.sv
                var href = Regex.Match(
                    html,
                    "href\\s*=\\s*\"(?<u>https?://admin\\.factura\\.gob\\.sv[^\"]+)\"",
                    RegexOptions.IgnoreCase);
                string targetUrl = href.Success ? href.Groups["u"].Value : null;

                if (string.IsNullOrEmpty(targetUrl))
                {
                    var meta = Regex.Match(
                        html,
                        "http-equiv\\s*=\\s*\"refresh\"[^>]*content\\s*=\\s*\"[^\"]*url=(?<u>https?://[^\"]+)\"",
                        RegexOptions.IgnoreCase);
                    if (meta.Success)
                        targetUrl = meta.Groups["u"].Value;
                }
                if (string.IsNullOrEmpty(targetUrl))
                {
                    var any = Regex.Match(html, "(https?://admin\\.factura\\.gob\\.sv[^\\s\"'<>)]+)", RegexOptions.IgnoreCase);
                    if (any.Success)
                        targetUrl = any.Value;
                }

                if (!string.IsNullOrEmpty(targetUrl))
                {
                    if (Uri.TryCreate(targetUrl, UriKind.Absolute, out var tu))
                    {
                        var q2 = QueryHelpers.ParseQuery(tu.Query);
                        if (q2.TryGetValue("codigoGeneracion", out var v2) || q2.TryGetValue("codGen", out v2))
                        {
                            var p2 = v2.ToString();
                            if (uuidRe.IsMatch(p2))
                                return Json(new { success = true, codigoGeneracion = NormalizeUuid(p2), target = targetUrl });
                        }
                    }
                    var m2 = uuidRe.Match(targetUrl);
                    if (m2.Success)
                        return Json(new { success = true, codigoGeneracion = NormalizeUuid(m2.Value), target = targetUrl });
                }

                var inside = uuidRe.Match(html);
                if (inside.Success)
                    return Json(new { success = true, codigoGeneracion = NormalizeUuid(inside.Value) });

                return Json(new { success = false, message = "No se pudo extraer el UUID del preview." });
            }
            catch (Exception ex)
            {
                return Json(new { success = false, message = $"Error resolviendo preview (plan B): {ex.Message}" });
            }
        }


        [HttpPost]
        public async Task<IActionResult> ChangeTransactionStatus([FromBody] ChangeStatusRequest request)
        {
            var codeGen = request.CodeGen?.Trim();
            var predefinedStatusId = request.PredefinedStatusId;
            var imageData = request.ImageData;
            string motoristaName = "";
            bool hasLogged = false;

            if (string.IsNullOrEmpty(codeGen))
            {
                var validationError = new
                {
                    request = request,
                    error = "La transacción no puede estar vacía"
                };
                _logService.LogActivityAsync("", validationError, "", 0);
                return Json("Error: La transacción no puede estar vacía.");
            }

            if (string.IsNullOrEmpty(imageData) || imageData == "data:,")
            {
                var imageError = new
                {
                    codeGen = codeGen,
                    predefinedStatusId = predefinedStatusId,
                    imageDataLength = imageData?.Length ?? 0,
                    error = "No se puede cambiar el estado sin haber subido una foto"
                };
                _logService.LogActivityAsync(codeGen, imageError, "", 0);
                return Json("Error: No se puede cambiar el estado sin haber subido una foto.");
            }

            var client = _httpClientFactory.CreateClient();
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _apiSettings.Token);

            try
            {
                var url = $"{_apiSettings.BaseUrl}status/push/";
                var requestBody = new { codeGen = codeGen, predefinedStatusId = predefinedStatusId, imageData = imageData };
                var json = JsonConvert.SerializeObject(requestBody);

                var httpContent = new StringContent(json, Encoding.UTF8, "application/json");
                var response = await client.PostAsync(url, httpContent);

                var infoUrl = $"{_apiSettings.BaseUrl}shipping/{codeGen}";
                var infoResponse = await client.GetAsync(infoUrl);
                if (infoResponse.IsSuccessStatusCode)
                {
                    var infoContent = await infoResponse.Content.ReadAsStringAsync();
                    var infoData = JsonConvert.DeserializeObject<Post>(infoContent);
                    motoristaName = infoData?.driver?.name ?? "";
                }

                if (response.IsSuccessStatusCode)
                {
                    var responseContent = await response.Content.ReadAsStringAsync();
                    var successData = new
                    {
                        codeGen = codeGen,
                        predefinedStatusId = predefinedStatusId,
                        newStatus = predefinedStatusId,
                        apiResponse = responseContent,
                        action = "Cambio de estado exitoso"
                    };
                    _logService.LogActivityAsync(codeGen, successData, motoristaName, predefinedStatusId);
                    hasLogged = true;
                    return Json("Cambio de estatus realizado con éxito");
                }
                else
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    var errorData = new
                    {
                        codeGen = codeGen,
                        predefinedStatusId = predefinedStatusId,
                        httpStatus = response.StatusCode,
                        requestBody = requestBody,
                        errorResponse = errorContent,
                        error = "Error en cambio de estado"
                    };
                    _logService.LogActivityAsync(codeGen, errorData, motoristaName, (int)response.StatusCode);
                    hasLogged = true;
                    return Json(errorContent);
                }
            }
            catch (Exception ex)
            {
                if (!hasLogged)
                {
                    var exceptionData = new
                    {
                        codeGen = codeGen,
                        predefinedStatusId = predefinedStatusId,
                        exception = ex.Message,
                        stackTrace = ex.StackTrace,
                        error = "Excepción al cambiar estado"
                    };
                    _logService.LogActivityAsync(codeGen, exceptionData, motoristaName, 0);
                }
                return Json($"Error inesperado: {ex.Message}");
            }
        }

        [HttpPost]
        public async Task<IActionResult> UploadPhoto([FromBody] UploadPhotoRequest request)
        {
            var imageData = request.ImageData;
            var codeGen = request.CodeGen?.Trim();
            string motoristaName = "";

            if (string.IsNullOrEmpty(imageData))
            {
                var imageError = new
                {
                    request = request,
                    error = "La imagen no fue recibida"
                };
                _logService.LogActivityAsync(codeGen ?? "", imageError, "", 0);
                return Json("Error: La imagen no fue recibida.");
            }

            if (string.IsNullOrEmpty(codeGen))
            {
                var codeError = new
                {
                    imageDataLength = imageData?.Length ?? 0,
                    error = "Código de generación no proporcionado"
                };
                _logService.LogActivityAsync("", codeError, "", 0);
                return Json("Error: Código de generación no proporcionado.");
            }

            var client = _httpClientFactory.CreateClient();
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _apiSettings.Token);

            try
            {
                var uploadPayload = new
                {
                    urlfileOrbase64file = imageData,
                    type = "P",
                    isBase64 = true,
                    codeGen = codeGen
                };

                var json = JsonConvert.SerializeObject(uploadPayload);
                var httpContent = new StringContent(json, Encoding.UTF8, "application/json");

                var response = await client.PostAsync($"{_apiSettings.BaseUrl}shipping/upload", httpContent);

                var infoUrl = $"{_apiSettings.BaseUrl}shipping/{codeGen}";
                var infoResponse = await client.GetAsync(infoUrl);
                if (infoResponse.IsSuccessStatusCode)
                {
                    var infoContent = await infoResponse.Content.ReadAsStringAsync();
                    var infoData = JsonConvert.DeserializeObject<Post>(infoContent);
                    motoristaName = infoData?.driver?.name ?? "";
                }

                if (response.IsSuccessStatusCode)
                {
                    var uploadResponse = await response.Content.ReadAsStringAsync();
                    return Json("success");
                }
                else
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    var errorData = new
                    {
                        codeGen = codeGen,
                        uploadPayload = new { type = "P", isBase64 = true, codeGen = codeGen, imageSize = imageData.Length },
                        httpStatus = response.StatusCode,
                        errorResponse = errorContent,
                        error = "Error al subir foto"
                    };
                    _logService.LogActivityAsync(codeGen, errorData, motoristaName, (int)response.StatusCode);
                    return Json("error");
                }
            }
            catch (Exception ex)
            {
                var exceptionData = new
                {
                    codeGen = codeGen,
                    imageSize = imageData?.Length ?? 0,
                    exception = ex.Message,
                    stackTrace = ex.StackTrace,
                    error = "Excepción al subir foto"
                };
                _logService.LogActivityAsync(codeGen, exceptionData, motoristaName, 0);
                return Json("error");
            }
        }

        [HttpPost]
        public async Task<IActionResult> GetMotoristaRanking([FromBody] RankingRequest request)
        {
            var license = request.License?.Trim();

            if (string.IsNullOrEmpty(license))
            {
                return Json(new { success = false, message = "Licencia no proporcionada." });
            }

            var client = _httpClientFactory.CreateClient();
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _apiSettings.Token);

            try
            {
                var url = $"{_apiSettings.BaseUrl}shipping/ranking/motoristas?license={license}";

                var response = await client.GetAsync(url);

                if (!response.IsSuccessStatusCode)
                {
                    return Json(new { success = false, message = "Error al obtener ranking del motorista." });
                }

                var content = await response.Content.ReadAsStringAsync();

                var settings = new JsonSerializerSettings
                {
                    ContractResolver = new DefaultContractResolver
                    {
                        NamingStrategy = new DefaultNamingStrategy()
                    },
                    MissingMemberHandling = MissingMemberHandling.Ignore
                };

                var rankingData = JsonConvert.DeserializeObject<List<MotoristaRankingModel>>(content, settings);

                if (rankingData == null || !rankingData.Any())
                {
                    return Json(new { success = false, message = "No se encontraron datos de ranking." });
                }

                return Json(new { success = true, data = rankingData });
            }
            catch (Exception ex)
            {
                return Json(new { success = false, message = $"Error: {ex.Message}" });
            }
        }
    }

    public class BuscarTransaccionRequest
    {
        public string Transaccion { get; set; } = string.Empty;
    }

    public class ChangeStatusRequest
    {
        public string CodeGen { get; set; } = string.Empty;
        public int PredefinedStatusId { get; set; }
        public string ImageData { get; set; } = string.Empty;
    }

    public class UploadPhotoRequest
    {
        public string ImageData { get; set; } = string.Empty;
        public string CodeGen { get; set; } = string.Empty;
    }

    public class MotoristaRankingModel
    {
        public string Licencia { get; set; } = string.Empty;
        public string Motorista { get; set; } = string.Empty;
        public string product { get; set; } = string.Empty;
        public int N_Veces { get; set; }
        public string Estatus { get; set; } = string.Empty;
    }

    public class RankingRequest
    {
        public string License { get; set; } = string.Empty;
    }
    public class ResolveCodigoGeneracionRequest
    {
        public string Raw { get; set; } = string.Empty;
    }

}