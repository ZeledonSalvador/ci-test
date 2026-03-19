using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Newtonsoft.Json;
using System.Net.Http.Headers;
using System.Text;
using FrontendQuickpass.Models;
using FrontendQuickpass.Models.Configurations;
using FrontendQuickpass.Services;
using FrontendQuickpass.Helpers;

namespace FrontendQuickpass.Controllers
{
    public class AutorizacionIngresoMelazaController : Controller
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ILogger<AutorizacionIngresoMelazaController> _logger;
        private readonly ApiSettings _apiSettings;
        private readonly ITransactionLogService _logService;
        private readonly IShipmentAuditService _auditService;
        private readonly LoginService _loginService;

        // Obtener código de usuario desde JWT en lugar de cookie
        private string Usuario
        {
            get
            {
                var sessionHelper = HttpContext.GetSessionHelper(_loginService);
                return sessionHelper.CodUsuario;
            }
        }

        // Obtener username desde JWT en lugar de cookie
        private string UsuarioName
        {
            get
            {
                var sessionHelper = HttpContext.GetSessionHelper(_loginService);
                return sessionHelper.Username;
            }
        }

        public AutorizacionIngresoMelazaController(
            IHttpClientFactory httpClientFactory,
            ILogger<AutorizacionIngresoMelazaController> logger,
            IOptions<ApiSettings> apiOptions,
            ITransactionLogService logService,
            IShipmentAuditService auditService,
            LoginService loginService)
        {
            _httpClientFactory = httpClientFactory;
            _logger = logger;
            _apiSettings = apiOptions.Value;
            _logService = logService;
            _auditService = auditService;
            _loginService = loginService;
        }

        /// <summary>
        /// Obtiene el código de usuario autenticado desde el contexto HTTP.
        /// </summary>
        /// <returns>Código de usuario o 0 si no está disponible</returns>
        private int GetUserId()
        {
            if (HttpContext.Items.TryGetValue("UserInfo", out var userInfo))
            {
                try
                {
                    // userInfo es un objeto anónimo con la propiedad CodUsuario
                    var expandoDict = userInfo as IDictionary<string, object>;
                    if (expandoDict != null && expandoDict.ContainsKey("CodUsuario"))
                    {
                        return Convert.ToInt32(expandoDict["CodUsuario"]);
                    }

                    // Intentar acceso directo usando reflexión
                    if (userInfo != null)
                    {
                        var type = userInfo.GetType();
                        var prop = type.GetProperty("CodUsuario");
                        if (prop != null)
                        {
                            return Convert.ToInt32(prop.GetValue(userInfo));
                        }
                    }
                }
                catch
                {
                    return 0;
                }
            }
            return 0;
        }

        public async Task<IActionResult> Index()
        {
            var model = new AutorizacionIngresoModel();
            var validIngenios = new[] { "001001-003", "007001-001", "007001-003", "001001-001", "001001-004", "001001-002" };

            string token = _apiSettings.Token;
            string url1 = $"{_apiSettings.BaseUrl}shipping/status/3?page=1&size=2000&includeAttachments=true";
            string url2 = $"{_apiSettings.BaseUrl}queue/count/";

            try
            {
                var client = _httpClientFactory.CreateClient();
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var response1 = await client.GetStringAsync(url1);
                var posts = JsonConvert.DeserializeObject<List<Post>>(response1)?
                    .Where(p => p.vehicle?.truckType == "P")
                    .ToList();

                TimeZoneInfo gmtMinus6 = TimeZoneInfo.CreateCustomTimeZone("GMT-6", TimeSpan.FromHours(-6), "GMT-6", "GMT-6");

                if (posts != null)
                {
                    foreach (var item in posts)
                    {
                        // CORREGIDO: Manejo correcto de DateTime nullable
                        if (item.dateTimePrecheckeo.HasValue && item.dateTimePrecheckeo.Value != DateTime.MinValue)
                        {
                            item.dateTimePrecheckeo = TimeZoneInfo.ConvertTimeFromUtc(
                                DateTime.SpecifyKind(item.dateTimePrecheckeo.Value, DateTimeKind.Utc), 
                                gmtMinus6
                            );
                        }
                    }

                    // Ordenamiento seguro con DateTime nullable
                    posts = posts.OrderBy(p => p.dateTimePrecheckeo ?? DateTime.MaxValue).ToList();
                    model.TruckTypeP = posts.Where(p => p.vehicle?.truckType == "P").ToList();
                    model.CountPipa = model.TruckTypeP.Count;
                    
                    foreach (var post in posts)
                    {
                        var code = post.ingenio?.ingenioNavCode;
                        if (!string.IsNullOrEmpty(code) && validIngenios.Contains(code))
                        {
                            if (!model.IngenioCounts.ContainsKey(code))
                                model.IngenioCounts[code] = 0;
                            model.IngenioCounts[code]++;
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al consumir la API de status");
                _logService.LogActivityAsync("", ex.Message, Usuario, 0);
            }

            try
            {
                var client = _httpClientFactory.CreateClient();
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var response2 = await client.GetStringAsync(url2);
                var queue = JsonConvert.DeserializeObject<QueueDataWrapper>(response2);

                model.ColaP = queue?.data?.P ?? 0;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al consumir la API de cola");
                _logService.LogActivityAsync("", ex.Message, Usuario, 0);
            }

            return View(model);
        }

        [HttpPost]
        public async Task<IActionResult> ChangeTransactionStatus([FromBody] ChangeTransactionRequest request)
        {
            var codeGen = request.CodeGen?.Trim();
            
            if (string.IsNullOrWhiteSpace(request.CodeGen))
            {
                _logService.LogActivityAsync("", request, Usuario, 0);
                return BadRequest("El parámetro 'codeGen' no puede ser nulo o vacío.");
            }

            try
            {
                string url = $"{_apiSettings.BaseUrl}queue/send/{request.CodeGen}";
                var client = _httpClientFactory.CreateClient();
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _apiSettings.Token);

                // Crear el body 
                var requestBody = new
                {
                    //leveransUsernameChangeStatus = UsuarioName, 
                    observationsChangeStatus = "Autorizacion ingreso MELAZA" 
                };

                var jsonContent = JsonConvert.SerializeObject(requestBody);
                var content = new StringContent(jsonContent, Encoding.UTF8, "application/json");

                var response = await client.PostAsync(url, content);
                var responseContent = await response.Content.ReadAsStringAsync();
                _logger.LogInformation("Respuesta del API - Status: {statusCode}, Content: {content}", 
                                    response.StatusCode, responseContent);
                if (response.IsSuccessStatusCode)
                {
                    // Registrar en auditoría de cambio de estado (reemplaza transactionlogs para casos exitosos)
                    var userId = GetUserId();
                    if (userId == 0)
                    {
                        _logger.LogWarning("No se pudo obtener userId para codeGen: {CodeGen}", codeGen);
                        return StatusCode(401, new { errorMessage = "Usuario no autenticado" });
                    }
                    _auditService.RegisterStatusChange(codeGen ?? string.Empty, 4, userId, "internal");
                    return Ok(new { successMessage = "Cambio de estatus exitoso", response = responseContent });
                }

                _logService.LogActivityAsync(codeGen ?? string.Empty, responseContent, Usuario, (int)response.StatusCode);
                return StatusCode((int)response.StatusCode, new { errorMessage = responseContent });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inesperado en ChangeTransactionStatus");
                _logService.LogActivityAsync(codeGen ?? string.Empty, request, Usuario, 0);
                return StatusCode(500, new { errorMessage = "Error inesperado: " + ex.Message });
            }
        }

        public class ChangeTransactionRequest
        {
            public string? CodeGen { get; set; }
        }

        private class QueueDataWrapper
        {
            public QueueDataModel? data { get; set; }
        }
    }
}