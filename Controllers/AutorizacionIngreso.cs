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
    public class AutorizacionIngresoController : Controller
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ILogger<AutorizacionIngresoController> _logger;
        private readonly ApiSettings _apiSettings;
        private readonly ITransactionLogService _logService;
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

        public AutorizacionIngresoController(
            IHttpClientFactory httpClientFactory,
            ILogger<AutorizacionIngresoController> logger,
            IOptions<ApiSettings> apiOptions,
            ITransactionLogService logService,
            LoginService loginService)
        {
            _httpClientFactory = httpClientFactory;
            _logger = logger;
            _apiSettings = apiOptions.Value;
            _logService = logService;
            _loginService = loginService;
        }

        public async Task<IActionResult> Index()
        {
            var model = new AutorizacionIngresoModel();
            var validIngenios = new[] { "001001-003", "007001-001", "007001-003", "001001-001", "001001-004", "001001-002" };

            string token = _apiSettings.Token;
            string url1 = $"{_apiSettings.BaseUrl}shipping/status/3?page=1&size=10000&includeAttachments=true";
            string url2 = $"{_apiSettings.BaseUrl}queue/count/";

            try
            {
                var client = _httpClientFactory.CreateClient();
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var response1 = await client.GetStringAsync(url1);
                var posts = JsonConvert.DeserializeObject<List<Post>>(response1)?
                    .Where(p => p.vehicle?.truckType == "R" || p.vehicle?.truckType == "V")
                    .ToList();

                TimeZoneInfo gmtMinus6 = TimeZoneInfo.CreateCustomTimeZone("GMT-6", TimeSpan.FromHours(-6), "GMT-6", "GMT-6");

                if (posts != null)
                {
                    foreach (var item in posts)
                    {
                        if (item.dateTimePrecheckeo.HasValue && item.dateTimePrecheckeo.Value != DateTime.MinValue)
                        {
                            item.dateTimePrecheckeo = TimeZoneInfo.ConvertTimeFromUtc(
                                DateTime.SpecifyKind(item.dateTimePrecheckeo.Value, DateTimeKind.Utc), 
                                gmtMinus6
                            );
                        }
                    }

                    // CORECCIÓN: Ordenar solo los elementos que tienen fecha válida
                    posts = posts.OrderBy(p => p.dateTimePrecheckeo ?? DateTime.MaxValue).ToList();
                    
                    model.TruckTypeR = posts.Where(p => p.vehicle?.truckType == "R").ToList();
                    model.TruckTypeV = posts.Where(p => p.vehicle?.truckType == "V").ToList();
                    model.CountPlanas = model.TruckTypeR.Count;
                    model.CountVolteo = model.TruckTypeV.Count;

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
                var queueData = JsonConvert.DeserializeObject<QueueDataWrapper>(response2);

                model.ColaV = queueData?.data?.V ?? 0;
                model.ColaR = queueData?.data?.R ?? 0;
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
                    observationsChangeStatus = "Autorizacion ingreso AZUCAR"
                };
                
                var jsonContent = JsonConvert.SerializeObject(requestBody);
                var content = new StringContent(jsonContent, Encoding.UTF8, "application/json");

                var response = await client.PostAsync(url, content);
                var responseContent = await response.Content.ReadAsStringAsync();
                _logger.LogInformation("Respuesta del API - Status: {statusCode}, Content: {content}", 
                                    response.StatusCode, responseContent);
                if (response.IsSuccessStatusCode)
                {
                    _logService.LogActivityAsync(codeGen ?? string.Empty, responseContent, Usuario, 4);
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