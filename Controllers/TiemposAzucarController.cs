using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using System.Net.Http.Headers;
using Newtonsoft.Json;
using FrontendQuickpass.Models;
using FrontendQuickpass.Models.Configurations;
using FrontendQuickpass.Services;
using System.Text;
using FrontendQuickpass.Helpers;

namespace FrontendQuickpass.Controllers
{
    public class TiemposAzucarController : Controller
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ApiSettings _apiSettings;
        private readonly ILogger<TiemposAzucarController> _logger;
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

        public TiemposAzucarController(
            IHttpClientFactory httpClientFactory,
            IOptions<ApiSettings> apiSettings,
            ILogger<TiemposAzucarController> logger,
            ITransactionLogService logService,
            LoginService loginService)
        {
            _httpClientFactory = httpClientFactory;
            _apiSettings = apiSettings.Value;
            _logger = logger;
            _logService = logService;
            _loginService = loginService;
        }

        private HttpClient CreateApiClient()
        {
            var client = _httpClientFactory.CreateClient();
            client.DefaultRequestHeaders.Authorization =
                new AuthenticationHeaderValue("Bearer", _apiSettings.Token);
            return client;
        }

        private string ParseApiError(string errorContent, string defaultMessage = "Error en el servidor")
        {
            try
            {
                dynamic? errorData = JsonConvert.DeserializeObject(errorContent);
                if (errorData?.message != null) return errorData.message.ToString();
                if (errorData?.error != null) return errorData.error.ToString();
                return defaultMessage;
            }
            catch
            {
                return !string.IsNullOrEmpty(errorContent) ? errorContent : defaultMessage;
            }
        }

        private IActionResult JsonSuccess(string message, object? data = null, object? extra = null)
            => Json(new { success = true, message, data, extra });

        private IActionResult JsonError(string message, object? error = null, object? extra = null)
            => Json(new { success = false, message, error, extra });

        private async Task<IActionResult> HandleApiResponseAsync(
            HttpResponseMessage response,
            string defaultErrorMessage,
            Func<string, object>? onSuccessProjection = null)
        {
            var content = await response.Content.ReadAsStringAsync();

            if (response.IsSuccessStatusCode)
            {
                var data = onSuccessProjection != null ? onSuccessProjection(content) : JsonConvert.DeserializeObject(content);
                return JsonSuccess("Operación realizada correctamente.", data);
            }

            var errorMessage = ParseApiError(content, defaultErrorMessage);
            _logger.LogWarning("API Error {Status}: {Message}", response.StatusCode, errorMessage);
            return JsonError(errorMessage, content);
        }

        // ============================================================
        // PÁGINA PRINCIPAL
        // ============================================================
        public async Task<IActionResult> Index()
        {
            var model = new TiemposAzucarViewModel();

            try
            {
                using var client = CreateApiClient();
                TimeZoneInfo gmtMinus6 = TimeZoneInfo.CreateCustomTimeZone("GMT-6", TimeSpan.FromHours(-6), "GMT-6", "GMT-6");

                // --- Status 7 (cola)
                var responseCola = await client.GetAsync($"{_apiSettings.BaseUrl}shipping/status/7?page=1&size=10000");
                if (responseCola.IsSuccessStatusCode)
                {
                    var content = await responseCola.Content.ReadAsStringAsync();
                    var data = JsonConvert.DeserializeObject<List<PostTiemposAzucar>>(content) ?? new();

                    foreach (var item in data)
                    {
                        if (item.dateTimePrecheckeo is { } dt && dt != DateTime.MinValue)
                        {
                            var utcDate = DateTime.SpecifyKind(dt, DateTimeKind.Utc);
                            item.dateTimePrecheckeo = TimeZoneInfo.ConvertTimeFromUtc(utcDate, gmtMinus6);
                        }
                    }

                    model.UnidadesPlanasCola = data
                        .Where(p => p.currentStatus == 7 && p.vehicle != null && p.vehicle.truckType == "R")
                        .OrderBy(p => p.dateTimePrecheckeo)
                        .ToList();

                    model.UnidadesVolteoCola = data
                        .Where(p => p.currentStatus == 7 && p.vehicle != null && p.vehicle.truckType == "V")
                        .OrderBy(p => p.dateTimePrecheckeo)
                        .ToList();
                }

                // --- Status 8 (proceso)
                var responseProceso = await client.GetAsync($"{_apiSettings.BaseUrl}shipping/status/8?page=1&size=10000");
                if (responseProceso.IsSuccessStatusCode)
                {
                    var content = await responseProceso.Content.ReadAsStringAsync();
                    var data = JsonConvert.DeserializeObject<List<PostTiemposAzucar>>(content) ?? new();

                    foreach (var item in data)
                    {
                        if (item.dateTimePrecheckeo is { } dt && dt != DateTime.MinValue)
                        {
                            var utcDate = DateTime.SpecifyKind(dt, DateTimeKind.Utc);
                            item.dateTimePrecheckeo = TimeZoneInfo.ConvertTimeFromUtc(utcDate, gmtMinus6);
                        }
                    }

                    model.UnidadesPlanasProceso = data
                        .Where(p => p.currentStatus == 8 && p.vehicle != null && p.vehicle.truckType == "R")
                        .ToList();

                    model.UnidadesVolteoProceso = data
                        .Where(p => p.currentStatus == 8 && p.vehicle != null && p.vehicle.truckType == "V")
                        .ToList();
                }

                // --- Status 3 (pendientes)
                var responsePendientes = await client.GetAsync($"{_apiSettings.BaseUrl}shipping/status/3?page=1&size=10000");
                if (responsePendientes.IsSuccessStatusCode)
                {
                    var content = await responsePendientes.Content.ReadAsStringAsync();
                    var data = JsonConvert.DeserializeObject<List<PostTiemposAzucar>>(content) ?? new();

                    model.TotalRegistrosPlanas = data.Count(p => p.currentStatus == 3 && p.vehicle != null && p.vehicle.truckType == "R");
                    model.TotalRegistrosVolteo = data.Count(p => p.currentStatus == 3 && p.vehicle != null && p.vehicle.truckType == "V");
                }

                // --- Solicitudes (usando endpoint real de queue)
                var responseSolicitudes = await client.GetAsync($"{_apiSettings.BaseUrl}queue/count");
                if (responseSolicitudes.IsSuccessStatusCode)
                {
                    var content = await responseSolicitudes.Content.ReadAsStringAsync();
                    var queueData = JsonConvert.DeserializeObject<dynamic>(content);
                    
                    // El API retorna: { data: { R: number, V: number, P: number } }
                    model.NumberInputPlano = (int)(queueData?.data?.R ?? 0);
                    model.NumberInputVolteo = (int)(queueData?.data?.V ?? 0);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al cargar datos de tiempos de azúcar");
                _logService.LogActivityAsync("", ex.Message, Usuario, 0);
                model.TotalRegistrosPlanas = 0;
                model.TotalRegistrosVolteo = 0;
            }

            return View(model);
        }

        // ============================================================
        // SOFT REFRESH - COMPATIBLE CON ENDPOINTS REALES
        // ============================================================
        [HttpPost]
        public async Task<IActionResult> ObtenerDatos()
        {
            try
            {
                using var client = CreateApiClient();
                TimeZoneInfo gmtMinus6 = TimeZoneInfo.CreateCustomTimeZone("GMT-6", TimeSpan.FromHours(-6), "GMT-6", "GMT-6");

                // Llamadas paralelas a endpoints reales
                var taskCola = client.GetAsync($"{_apiSettings.BaseUrl}shipping/status/7?page=1&size=10000");
                var taskProceso = client.GetAsync($"{_apiSettings.BaseUrl}shipping/status/8?page=1&size=10000");
                var taskPendientes = client.GetAsync($"{_apiSettings.BaseUrl}shipping/status/3?page=1&size=10000");
                var taskSolicitudes = client.GetAsync($"{_apiSettings.BaseUrl}queue/count");

                await Task.WhenAll(taskCola, taskProceso, taskPendientes, taskSolicitudes);

                // ----- Cola (7)
                List<PostTiemposAzucar> colaData = new();
                if (taskCola.Result.IsSuccessStatusCode)
                {
                    var txt = await taskCola.Result.Content.ReadAsStringAsync();
                    colaData = JsonConvert.DeserializeObject<List<PostTiemposAzucar>>(txt) ?? new();
                    foreach (var item in colaData)
                    {
                        if (item.dateTimePrecheckeo is { } dt && dt != DateTime.MinValue)
                        {
                            var utcDate = DateTime.SpecifyKind(dt, DateTimeKind.Utc);
                            item.dateTimePrecheckeo = TimeZoneInfo.ConvertTimeFromUtc(utcDate, gmtMinus6);
                        }
                    }
                }

                var unidadesPlanasCola = colaData
                    .Where(p => p.currentStatus == 7 && p.vehicle != null && p.vehicle.truckType == "R")
                    .OrderBy(p => p.dateTimePrecheckeo)
                    .ToList();

                var unidadesVolteoCola = colaData
                    .Where(p => p.currentStatus == 7 && p.vehicle != null && p.vehicle.truckType == "V")
                    .OrderBy(p => p.dateTimePrecheckeo)
                    .ToList();

                // ----- Proceso (8)
                List<PostTiemposAzucar> procesoData = new();
                if (taskProceso.Result.IsSuccessStatusCode)
                {
                    var txt = await taskProceso.Result.Content.ReadAsStringAsync();
                    procesoData = JsonConvert.DeserializeObject<List<PostTiemposAzucar>>(txt) ?? new();
                    foreach (var item in procesoData)
                    {
                        if (item.dateTimePrecheckeo is { } dt && dt != DateTime.MinValue)
                        {
                            var utcDate = DateTime.SpecifyKind(dt, DateTimeKind.Utc);
                            item.dateTimePrecheckeo = TimeZoneInfo.ConvertTimeFromUtc(utcDate, gmtMinus6);
                        }
                    }
                }

                var unidadesPlanasProceso = procesoData
                    .Where(p => p.currentStatus == 8 && p.vehicle != null && p.vehicle.truckType == "R")
                    .ToList();

                var unidadesVolteoProceso = procesoData
                    .Where(p => p.currentStatus == 8 && p.vehicle != null && p.vehicle.truckType == "V")
                    .ToList();

                // ----- Pendientes (3)
                int totalPlanasPend = 0;
                int totalVolteoPend = 0;
                if (taskPendientes.Result.IsSuccessStatusCode)
                {
                    var txt = await taskPendientes.Result.Content.ReadAsStringAsync();
                    var pendData = JsonConvert.DeserializeObject<List<PostTiemposAzucar>>(txt) ?? new();

                    totalPlanasPend = pendData.Count(p => p.currentStatus == 3 && p.vehicle != null && p.vehicle.truckType == "R");
                    totalVolteoPend = pendData.Count(p => p.currentStatus == 3 && p.vehicle != null && p.vehicle.truckType == "V");
                }

                // ----- Solicitudes (usando endpoint real)
                int solicitudesPlanas = 0;
                int solicitudesVolteos = 0;
                if (taskSolicitudes.Result.IsSuccessStatusCode)
                {
                    var txt = await taskSolicitudes.Result.Content.ReadAsStringAsync();
                    var queueData = JsonConvert.DeserializeObject<dynamic>(txt);
                    solicitudesPlanas = (int)(queueData?.data?.R ?? 0);
                    solicitudesVolteos = (int)(queueData?.data?.V ?? 0);
                }

                var payload = new
                {
                    timestamp = DateTime.UtcNow,
                    cola = new { planas = unidadesPlanasCola, volteo = unidadesVolteoCola },
                    proceso = new { planas = unidadesPlanasProceso, volteo = unidadesVolteoProceso },
                    pendientes = new { planas = totalPlanasPend, volteo = totalVolteoPend },
                    solicitudes = new { planas = solicitudesPlanas, volteos = solicitudesVolteos }
                };

                return JsonSuccess("Datos obtenidos correctamente.", payload);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error en ObtenerDatos");
                _logService.LogActivityAsync("", ex.Message, Usuario, 0);
                return JsonError("Error al obtener los datos.", ex.Message);
            }
        }

        // ============================================================
        // ENDPOINTS DE SOLICITUD Y REDUCCIÓN - USANDO QUEUE API
        // ============================================================
        [HttpPost]
        public async Task<IActionResult> SolicitarUnidad([FromBody] SolicitarUnidadRequest request)
        {
            if (request == null)
            {
                _logService.LogActivityAsync("", request, Usuario, 0);
                return JsonError("Request no puede ser null");
            }

            try
            {
                using var client = CreateApiClient();
                // POST /queue/call-multiple/{type}/{quantity}
                var url = $"{_apiSettings.BaseUrl}queue/call-multiple/{request.Tipo_Unidad}/{request.CurrentValue}";

                var response = await client.PostAsync(url, new StringContent("", Encoding.UTF8, "application/json"));
                return await HandleApiResponseAsync(
                    response,
                    "Error al solicitar unidad",
                    content =>
                    {
                        try
                        {
                            // El API retorna un array de Queue objects
                            var arr = JsonConvert.DeserializeObject<Newtonsoft.Json.Linq.JArray>(content);
                            if (arr != null && arr.Count > 0)
                            {
                                return new
                                {
                                    requested = arr.Count,
                                    details = arr
                                };
                            }
                        }
                        catch (JsonException) { }
                        return JsonConvert.DeserializeObject<object>(content) ?? content;
                    });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inesperado en SolicitarUnidad");
                _logService.LogActivityAsync("", request, Usuario, 0);
                return JsonError("Error inesperado al solicitar unidad.", ex.Message);
            }
        }

        [HttpPost]
        public async Task<IActionResult> ReducirUnidad([FromBody] ReducirUnidadRequest request)
        {
            if (request == null)
            {
                _logService.LogActivityAsync("", request, Usuario, 0);
                return JsonError("Request no puede ser null");
            }

            try
            {
                using var client = CreateApiClient();
                // DELETE /queue/release-multiple/{type}/{quantity}
                var url = $"{_apiSettings.BaseUrl}queue/release-multiple/{request.Tipo_Unidad}/{request.UnidadesReducidas}";

                var response = await client.DeleteAsync(url);
                return await HandleApiResponseAsync(response, "Error al reducir unidades");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inesperado en ReducirUnidad");
                _logService.LogActivityAsync("", request, Usuario, 0);
                return JsonError("Error inesperado al reducir unidad.", ex.Message);
            }
        }

        // ============================================================
        // ENDPOINTS DE TIEMPOS Y REGISTROS
        // ============================================================
        [HttpPost]
        public async Task<IActionResult> sweepinglog([FromBody] SweepingLogRequest request)
        {
            var codeGen = request?.CodeGen?.Trim();
            
            if (request == null)
            {
                _logService.LogActivityAsync("", request, Usuario, 0);
                return JsonError("Request no puede ser null");
            }

            try
            {
                using var client = CreateApiClient();
                // POST /shipping/sweepinglog
                var url = $"{_apiSettings.BaseUrl}shipping/sweepinglog";
                
                // El API espera string "true"/"false"
                var json = JsonConvert.SerializeObject(new
                {
                    codeGen = request.CodeGen,
                    requiresSweeping = request.RequiresSweeping.ToString().ToLower(), // "true" o "false"
                    observation = request.Observation
                });
                var httpContent = new StringContent(json, Encoding.UTF8, "application/json");

                var response = await client.PostAsync(url, httpContent);
                
                if (response.IsSuccessStatusCode)
                {
                    _logService.LogActivityAsync(codeGen, request, Usuario, 8);
                }
                else
                {
                    _logService.LogActivityAsync(codeGen, request, Usuario, (int)response.StatusCode);
                }
                
                return await HandleApiResponseAsync(response, "Error al registrar sweepinglog");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inesperado en sweepinglog");
                _logService.LogActivityAsync(codeGen, request, Usuario, 0);
                return JsonError("Error inesperado al registrar sweepinglog.", ex.Message);
            }
        }

        // Método TiempoAzucar
        [HttpPost]
        public async Task<IActionResult> TiempoAzucar([FromBody] TiempoAzucarRequest request)
        {
            var codeGen = request?.CodigoGeneracion?.Trim();
            
            if (request == null)
            {
                _logService.LogActivityAsync("", request, Usuario, 0);
                return JsonError("Request no puede ser null");
            }

            if (string.IsNullOrEmpty(request.CodigoGeneracion))
            {
                _logService.LogActivityAsync("", request, Usuario, 0);
                return JsonError("Código de generación es requerido");
            }

            if (request.ShipmentId <= 0)
            {
                _logService.LogActivityAsync(codeGen, request, Usuario, 0);
                return JsonError("ID de shipment es requerido");
            }

            if (string.IsNullOrEmpty(request.TruckType))
            {
                _logService.LogActivityAsync(codeGen, request, Usuario, 0);
                return JsonError("Tipo de camión es requerido");
            }

            try
            {
                using var client = CreateApiClient();

                // POST /operation-times - usando los datos de la request directamente
                var url = $"{_apiSettings.BaseUrl}operation-times";
                
                // Crear objeto anónimo con propiedades en camelCase
                var operationTimeRequest = new
                {
                    shipmentId = request.ShipmentId,    
                    operationType = "AZ-001",               
                    duration = request.Tiempo,             
                    comment = !string.IsNullOrEmpty(request.Comentario) ? request.Comentario : "",  
                    truckType = request.TruckType     
                };

                // Configurar JsonSerializerSettings para camelCase
                var jsonSettings = new JsonSerializerSettings
                {
                    ContractResolver = new Newtonsoft.Json.Serialization.CamelCasePropertyNamesContractResolver()
                };

                var json = JsonConvert.SerializeObject(operationTimeRequest, jsonSettings);
                var httpContent = new StringContent(json, Encoding.UTF8, "application/json");

                _logger.LogInformation("Enviando tiempo de operación: shipmentId={ShipmentId}, duration={Duration}, truckType={TruckType}", 
                    operationTimeRequest.shipmentId, operationTimeRequest.duration, operationTimeRequest.truckType);

                _logger.LogDebug("JSON enviado: {Json}", json);

                var response = await client.PostAsync(url, httpContent);
                
                if (response.IsSuccessStatusCode)
                {
                    _logService.LogActivityAsync(codeGen, request, Usuario, 8);
                }
                else
                {
                    _logService.LogActivityAsync(codeGen, request, Usuario, (int)response.StatusCode);
                }
                
                return await HandleApiResponseAsync(response, "Error al registrar tiempo de operación");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inesperado en TiempoAzucar para codeGen: {CodeGen}", request.CodigoGeneracion);
                _logService.LogActivityAsync(codeGen, request, Usuario, 0);
                return JsonError("Error inesperado al registrar tiempo de operación.", ex.Message);
            }
        }

        [HttpPost]
        public async Task<IActionResult> ChangeTransactionStatus([FromBody] ChangeStatusRequest request)
        {
            var codeGen = request?.CodeGen?.Trim();
            
            if (request == null)
            {
                _logService.LogActivityAsync("", request, Usuario, 0);
                return JsonError("Request no puede ser null");
            }

            try
            {
                using var client = CreateApiClient();
                // Obtener username desde JWT en lugar de cookie
                var sessionHelper = HttpContext.GetSessionHelper(_loginService);
                var username = sessionHelper.Username;

                // POST /status/push
                var url = $"{_apiSettings.BaseUrl}status/push";
                var json = JsonConvert.SerializeObject(new
                {
                    codeGen = request.CodeGen,
                    predefinedStatusId = request.PredefinedStatusId,
                    leveransUsername = username
                });
                var httpContent = new StringContent(json, Encoding.UTF8, "application/json");

                var response = await client.PostAsync(url, httpContent);
                
                if (response.IsSuccessStatusCode)
                {
                    _logService.LogActivityAsync(codeGen, request, Usuario, request.PredefinedStatusId);
                }
                else
                {
                    _logService.LogActivityAsync(codeGen, request, Usuario, (int)response.StatusCode);
                }
                
                return await HandleApiResponseAsync(
                    response,
                    "Error al cambiar el estado",
                    content => new { raw = JsonConvert.DeserializeObject(content), username });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inesperado en ChangeTransactionStatus");
                _logService.LogActivityAsync(codeGen, request, Usuario, 0);
                return JsonError("Error inesperado al cambiar el estado.", ex.Message);
            }
        }

        // ============================================================
        // ENDPOINT DE TOTALES - USANDO APIS REALES
        // ============================================================
        [HttpPost]
        public async Task<IActionResult> ObtenerTotales()
        {
            try
            {
                using var client = CreateApiClient();

                int totalPlanas = 0, totalVolteos = 0, solicitudesPlanas = 0, solicitudesVolteos = 0;

                // Totales status 3
                var responseTotales = await client.GetAsync($"{_apiSettings.BaseUrl}shipping/status/3?page=1&size=10000");
                if (responseTotales.IsSuccessStatusCode)
                {
                    var content = await responseTotales.Content.ReadAsStringAsync();
                    var data = JsonConvert.DeserializeObject<List<PostTiemposAzucar>>(content) ?? new();

                    foreach (var item in data)
                    {
                        if (item.vehicle == null) continue;
                        if (item.vehicle.truckType == "R") totalPlanas++;
                        else if (item.vehicle.truckType == "V") totalVolteos++;
                    }
                }

                // Solicitudes usando endpoint real
                var responseSolicitudes = await client.GetAsync($"{_apiSettings.BaseUrl}queue/count");
                if (responseSolicitudes.IsSuccessStatusCode)
                {
                    var content = await responseSolicitudes.Content.ReadAsStringAsync();
                    var queueData = JsonConvert.DeserializeObject<dynamic>(content);
                    solicitudesPlanas = (int)(queueData?.data?.R ?? 0);
                    solicitudesVolteos = (int)(queueData?.data?.V ?? 0);
                }

                return JsonSuccess("Totales obtenidos correctamente.", new
                {
                    planas = totalPlanas,
                    volteos = totalVolteos,
                    solicitudesPlanas,
                    solicitudesVolteos
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al obtener totales");
                _logService.LogActivityAsync("", ex.Message, Usuario, 0);
                return JsonError("Error al obtener totales.", ex.Message, new
                {
                    planas = 0,
                    volteos = 0,
                    solicitudesPlanas = 0,
                    solicitudesVolteos = 0
                });
            }
        }
    }
}