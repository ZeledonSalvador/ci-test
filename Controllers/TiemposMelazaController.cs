using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using System.Net.Http.Headers;
using Newtonsoft.Json;
using FrontendQuickpass.Models;
using FrontendQuickpass.Models.Configurations;
using FrontendQuickpass.Services;
using System.Text;
using Microsoft.Extensions.Caching.Memory;
using FrontendQuickpass.Helpers;

namespace FrontendQuickpass.Controllers
{
    public class TiemposMelazaController : Controller
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ApiSettings _apiSettings;
        private readonly ILogger<TiemposMelazaController> _logger;
        private readonly IPiletasService _piletasService;
        private readonly IMemoryCache _memoryCache;
        private readonly ITransactionLogService _logService;
        private readonly ITimerSyncService _timerSyncService;
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

        // Zona horaria de El Salvador (UTC-6)
        private static readonly TimeZoneInfo SalvadorTimeZone = TimeZoneInfo.CreateCustomTimeZone("GMT-6", TimeSpan.FromHours(-6), "GMT-6", "GMT-6");

        public TiemposMelazaController(
            IHttpClientFactory httpClientFactory,
            IOptions<ApiSettings> apiSettings,
            ILogger<TiemposMelazaController> logger,
            IPiletasService piletasService,
            IMemoryCache memoryCache,
            ITransactionLogService logService,
            ITimerSyncService timerSyncService,
            LoginService loginService)
        {
            _httpClientFactory = httpClientFactory;
            _apiSettings = apiSettings.Value;
            _logger = logger;
            _piletasService = piletasService;
            _memoryCache = memoryCache;
            _logService = logService;
            _timerSyncService = timerSyncService;
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

        // Convierte una fecha UTC a zona horaria de El Salvador (UTC-6)
        private DateTime ConvertToSalvadorTime(DateTime utcDateTime)
        {
            if (utcDateTime == DateTime.MinValue) return utcDateTime;
            var utcDate = DateTime.SpecifyKind(utcDateTime, DateTimeKind.Utc);
            return TimeZoneInfo.ConvertTimeFromUtc(utcDate, SalvadorTimeZone);
        }

        private void ProcessShipmentDates(List<PostTiemposMelaza> shipments)
        {
            foreach (var item in shipments)
            {
                if (item.dateTimePrecheckeo.HasValue && item.dateTimePrecheckeo.Value != DateTime.MinValue)
                {
                    item.dateTimePrecheckeo = ConvertToSalvadorTime(item.dateTimePrecheckeo.Value);
                }
            }
        }

        // ============================================================
        // PÁGINA PRINCIPAL - CARGAR DATOS INICIALES
        // ============================================================
        public async Task<IActionResult> Index()
        {
            var model = new TiemposMelazaViewModel();

            try
            {
                using var client = CreateApiClient();

                // Cargar unidades para descarga (status 7 y 8)
                var unidadesDescarga = await CargarUnidadesDescargaAsync(client);
                
                // FILTRAR SOLO UNIDADES VÁLIDAS
                var unidadesValidas = unidadesDescarga
                    .Where(u => u != null && u.id > 0)
                    .ToList();

                model.UnidadesPorPileta = unidadesValidas.Any() 
                    ? unidadesValidas.ToDictionary(u => u.id, u => u) 
                    : new Dictionary<int, PostTiemposMelaza>();
                
                // IMPORTANTE: Asignar lista vacía explícitamente si no hay unidades
                model.UnidadesDescarga = unidadesValidas.Any() ? unidadesValidas : new List<PostTiemposMelaza>();

                // Cargar pendientes (status 3)
                var responsePendientes = await client.GetAsync($"{_apiSettings.BaseUrl}shipping/status/3?page=1&size=10000");
                if (responsePendientes.IsSuccessStatusCode)
                {
                    var content = await responsePendientes.Content.ReadAsStringAsync();
                    var data = JsonConvert.DeserializeObject<List<PostTiemposMelaza>>(content) ?? new();
                    model.TotalRegistrosPipa = data.Count(p => p.currentStatus == 3 && p.vehicle != null && p.vehicle.truckType == "P");
                }

                // Cargar solicitudes
                var responseSolicitudes = await client.GetAsync($"{_apiSettings.BaseUrl}queue/count");
                if (responseSolicitudes.IsSuccessStatusCode)
                {
                    var content = await responseSolicitudes.Content.ReadAsStringAsync();
                    var queueData = JsonConvert.DeserializeObject<dynamic>(content);
                    model.NumberInputPipa = (int)(queueData?.data?.P ?? 0);
                }

                // Serializar solo si hay unidades válidas
                var jsonData = unidadesValidas.Any() 
                    ? JsonConvert.SerializeObject(unidadesValidas, new JsonSerializerSettings
                    {
                        ContractResolver = new Newtonsoft.Json.Serialization.CamelCasePropertyNamesContractResolver()
                    })
                    : "[]";

                ViewBag.InitialUnidadesDescarga = jsonData;

                _logger.LogInformation("Datos cargados - Descarga: {Descarga}, Enfriamiento: {Enfriamiento}, Pendientes: {Pendientes}",
                    unidadesValidas.Count, model.UnidadesPipaEnfriamiento?.Count ?? 0, model.TotalRegistrosPipa);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al cargar datos de tiempos de melaza");
                _logService.LogActivityAsync("", ex.Message, Usuario, 0);
                ViewBag.InitialUnidadesDescarga = "[]"; // Array vacío en caso de error
                model.UnidadesDescarga = new List<PostTiemposMelaza>(); // Lista vacía en caso de error
                model.UnidadesPorPileta = new Dictionary<int, PostTiemposMelaza>(); // Diccionario vacío en caso de error
            }

            return View(model);
        }

        private async Task<List<PostTiemposMelaza>> CargarUnidadesDescargaAsync(HttpClient client)
        {
            var unidadesDescarga = new List<PostTiemposMelaza>();

            // Status 7 (cola)
            var responseCola = await client.GetAsync($"{_apiSettings.BaseUrl}shipping/status/7?page=1&size=10000");
            if (responseCola.IsSuccessStatusCode)
            {
                var content = await responseCola.Content.ReadAsStringAsync();
                var data = JsonConvert.DeserializeObject<List<PostTiemposMelaza>>(content) ?? new();
                ProcessShipmentDates(data);

                var unidadesCola = data
                    .Where(p => p.currentStatus == 7 && p.vehicle != null && p.vehicle.truckType == "P")
                    .ToList();

                unidadesDescarga.AddRange(unidadesCola);
            }

            // Status 8 (proceso)
            var responseProceso = await client.GetAsync($"{_apiSettings.BaseUrl}shipping/status/8?page=1&size=10000");
            if (responseProceso.IsSuccessStatusCode)
            {
                var content = await responseProceso.Content.ReadAsStringAsync();
                var data = JsonConvert.DeserializeObject<List<PostTiemposMelaza>>(content) ?? new();
                ProcessShipmentDates(data);

                var unidadesProceso = data
                    .Where(p => p.currentStatus == 8 && p.vehicle != null && p.vehicle.truckType == "P")
                    .ToList();

                unidadesDescarga.AddRange(unidadesProceso);
            }

            // Organizar por estado y prioridad usando el servicio actualizado
            return await _piletasService.OrganizarUnidadesPorEstadoAsync(unidadesDescarga);
        }

        // ============================================================
        // POLLING - ACTUALIZAR DATOS
        // ============================================================
        [HttpPost]
        public async Task<IActionResult> ObtenerDatos()
        {
            try
            {
                using var client = CreateApiClient();

                var taskPendientes = client.GetAsync($"{_apiSettings.BaseUrl}shipping/status/3?page=1&size=10000");
                var taskSolicitudes = client.GetAsync($"{_apiSettings.BaseUrl}queue/count");

                await Task.WhenAll(taskPendientes, taskSolicitudes);

                // Cargar unidades - el servicio se encarga de la limpieza
                var unidadesDescarga = await CargarUnidadesDescargaAsync(client);

                // Procesar otros datos...
                int totalPipaPend = 0;
                if (taskPendientes.Result.IsSuccessStatusCode)
                {
                    var txt = await taskPendientes.Result.Content.ReadAsStringAsync();
                    var pendData = JsonConvert.DeserializeObject<List<PostTiemposMelaza>>(txt) ?? new();
                    totalPipaPend = pendData.Count(p => p.currentStatus == 3 && p.vehicle?.truckType == "P");
                }

                int solicitudesPipa = 0;
                if (taskSolicitudes.Result.IsSuccessStatusCode)
                {
                    var txt = await taskSolicitudes.Result.Content.ReadAsStringAsync();
                    var queueData = JsonConvert.DeserializeObject<dynamic>(txt);
                    solicitudesPipa = (int)(queueData?.data?.P ?? 0);
                }

                var payload = new
                {
                    timestamp = DateTime.UtcNow,
                    timeZone = "America/El_Salvador",
                    serverTime = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, SalvadorTimeZone).ToString("yyyy-MM-dd HH:mm:ss"),
                    unidadesDescarga = unidadesDescarga,
                    pendientes = new { pipa = totalPipaPend },
                    solicitudes = new { pipa = solicitudesPipa }
                };

                return JsonSuccess("Datos obtenidos correctamente.", payload);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error en ObtenerDatos");
                return JsonError("Error al obtener los datos.", ex.Message);
            }
        }

        // ============================================================
        // RESTO DE MÉTODOS
        // ============================================================

        [HttpPost]
        public async Task<IActionResult> SolicitarUnidad([FromBody] SolicitarUnidadMelazaRequest request)
        {
            if (request == null)
            {
                _logService.LogActivityAsync("", new { message = "Request is null" }, Usuario, 0);
                return JsonError("Request no puede ser null");
            }

            try
            {
                using var client = CreateApiClient();
                var url = $"{_apiSettings.BaseUrl}queue/call-multiple/P/{request.CurrentValue}";
                var response = await client.PostAsync(url, new StringContent("", Encoding.UTF8, "application/json"));

                if (response.IsSuccessStatusCode)
                {
                    _logService.LogActivityAsync(string.Empty, request, Usuario, 7);
                }
                else
                {
                    _logService.LogActivityAsync("", request, Usuario, (int)response.StatusCode);
                }

                return await HandleApiResponseAsync(response, "Error al solicitar unidad pipa");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inesperado en SolicitarUnidad");
                _logService.LogActivityAsync("", new { message = "Request is null" }, Usuario, 0);
                return JsonError("Error inesperado al solicitar unidad.", ex.Message);
            }
        }

        [HttpPost]
        public async Task<IActionResult> ReducirUnidad([FromBody] ReducirUnidadMelazaRequest request)
        {
            if (request == null)
            {
                _logService.LogActivityAsync("", new { message = "Request is null" }, Usuario, 0);
                return JsonError("Request no puede ser null");
            }

            try
            {
                using var client = CreateApiClient();
                var url = $"{_apiSettings.BaseUrl}queue/release-multiple/P/{request.UnidadesReducidas}";
                var response = await client.DeleteAsync(url);

                if (response.IsSuccessStatusCode)
                {
                    _logService.LogActivityAsync("", request, Usuario, 7);
                }
                else
                {
                    _logService.LogActivityAsync("", request, Usuario, (int)response.StatusCode);
                }

                return await HandleApiResponseAsync(response, "Error al reducir unidades pipa");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inesperado en ReducirUnidad");
                _logService.LogActivityAsync("", request, Usuario, 0);
                return JsonError("Error inesperado al reducir unidad.", ex.Message);
            }
        }

        [HttpGet]
        public async Task<IActionResult> ObtenerDatosEnfriamiento()
        {
            try
            {
                using var client = CreateApiClient();
                
                // Solo consultar status 15 (enfriamiento)
                var response = await client.GetAsync($"{_apiSettings.BaseUrl}shipping/status/15?page=1&size=10000");
                
                if (response.IsSuccessStatusCode)
                {
                    var content = await response.Content.ReadAsStringAsync();
                    var data = JsonConvert.DeserializeObject<List<PostTiemposMelaza>>(content) ?? new();
                    ProcessShipmentDates(data);

                    var unidadesPipaEnfriamiento = data
                        .Where(p => p.currentStatus == 15 && p.vehicle != null && p.vehicle.truckType == "P")
                        .OrderBy(p => p.dateTimePrecheckeo)
                        .ToList();

                    _logger.LogInformation("Datos de enfriamiento obtenidos - Total: {Count}", unidadesPipaEnfriamiento.Count);
                    
                    return JsonSuccess("Datos de enfriamiento obtenidos correctamente.", unidadesPipaEnfriamiento);
                }
                else
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    var errorMessage = ParseApiError(errorContent, "Error al obtener datos de enfriamiento");
                    return JsonError(errorMessage);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inesperado en ObtenerDatosEnfriamiento");
                return JsonError("Error inesperado al obtener datos de enfriamiento.", ex.Message);
            }
        }

        [HttpPost]
        public async Task<IActionResult> RegistrarTemperatura([FromBody] RegistrarTemperaturaRequest request)
        {
            var codeGen = request?.CodeGen?.Trim();

            if (request == null || string.IsNullOrEmpty(request.CodeGen))
            {
                _logService.LogActivityAsync("", new { message = "Request is null" }, Usuario, 0);
                return JsonError("Código de generación es requerido");
            }

            if (request.Temperature < 0 || request.Temperature > 50)
            {
                _logService.LogActivityAsync(codeGen ?? string.Empty, request, Usuario, 7);
                return JsonError("La temperatura debe estar entre 0 y 50 grados Celsius");
            }

            if (string.IsNullOrEmpty(request.Origen))
            {
                _logService.LogActivityAsync(codeGen ?? string.Empty, request, Usuario, 0);
                return JsonError("Origen es requerido (cola o enfriamiento)");
            }

            try
            {
                using var client = CreateApiClient();
                // Obtener username desde JWT en lugar de cookie
                var sessionHelper = HttpContext.GetSessionHelper(_loginService);
                var username = sessionHelper.Username;

                // 1. Registrar temperatura
                var temperaturaUrl = $"{_apiSettings.BaseUrl}shipping/temperatura/{request.CodeGen}";
                var temperaturaPayload = new { temperature = request.Temperature };
                var temperaturaJson = JsonConvert.SerializeObject(temperaturaPayload);
                var temperaturaContent = new StringContent(temperaturaJson, Encoding.UTF8, "application/json");

                var temperaturaResponse = await client.PostAsync(temperaturaUrl, temperaturaContent);
                if (!temperaturaResponse.IsSuccessStatusCode)
                {
                    var errorContent = await temperaturaResponse.Content.ReadAsStringAsync();
                    var errorMessage = ParseApiError(errorContent, "Error al registrar temperatura");
                    _logService.LogActivityAsync(codeGen ?? string.Empty, request, Usuario, (int)temperaturaResponse.StatusCode);
                    return JsonError($"Error al registrar temperatura: {errorMessage}");
                }

                // 2. Determinar status según temperatura
                int targetStatus;
                string statusMessage;

                if (request.Temperature <= 41.0)
                {
                    if (request.Origen.ToLower() == "cola")
                    {
                        targetStatus = 8;
                        statusMessage = $"Temperatura adecuada ({request.Temperature}°C). El envío pasó a proceso.";
                    }
                    else if (request.Origen.ToLower() == "enfriamiento")
                    {
                        targetStatus = 8;
                        statusMessage = $"Temperatura adecuada ({request.Temperature}°C). El envío regresó a cola.";
                    }
                    else
                    {
                        _logService.LogActivityAsync(codeGen ?? string.Empty, request, Usuario, 0);
                        return JsonError("Origen no válido. Debe ser 'cola' o 'enfriamiento'");
                    }
                }
                else
                {
                    targetStatus = 15;
                    statusMessage = $"Temperatura alta ({request.Temperature}°C). El envío {(request.Origen.ToLower() == "enfriamiento" ? "permanece en" : "pasó a")} enfriamiento.";
                }

                // 3. Cambiar status
                var statusUrl = $"{_apiSettings.BaseUrl}status/push";
                var statusPayload = new
                {
                    codeGen = request.CodeGen,
                    predefinedStatusId = targetStatus,
                    leveransUsername = username
                };
                var statusJson = JsonConvert.SerializeObject(statusPayload);
                var statusContent = new StringContent(statusJson, Encoding.UTF8, "application/json");

                var statusResponse = await client.PostAsync(statusUrl, statusContent);
                if (!statusResponse.IsSuccessStatusCode)
                {
                    var errorContent = await statusResponse.Content.ReadAsStringAsync();
                    var errorMessage = ParseApiError(errorContent, "Error al cambiar el estado");
                    _logService.LogActivityAsync(codeGen ?? string.Empty, request, Usuario, (int)statusResponse.StatusCode);
                    return JsonSuccess($"Temperatura registrada ({request.Temperature}°C), pero hubo un problema al cambiar el estado: {errorMessage}");
                }

                _logService.LogActivityAsync(codeGen ?? string.Empty, request, Usuario, targetStatus);

                return JsonSuccess(statusMessage, new
                {
                    temperature = request.Temperature,
                    targetStatus = targetStatus,
                    codeGen = request.CodeGen,
                    origen = request.Origen,
                    timestamp = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, SalvadorTimeZone).ToString("yyyy-MM-dd HH:mm:ss")
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inesperado en RegistrarTemperatura para codeGen: {CodeGen}", request.CodeGen);
                _logService.LogActivityAsync(codeGen ?? string.Empty, request, Usuario, 0);
                return JsonError("Error inesperado al registrar temperatura.", ex.Message);
            }
        }

        [HttpPost]
        public async Task<IActionResult> TiempoMelaza([FromBody] TiempoMelazaRequest request)
        {
            var codeGen = request?.CodigoGeneracion?.Trim();

            if (request == null || string.IsNullOrEmpty(request.CodigoGeneracion) || request.ShipmentId <= 0 || string.IsNullOrEmpty(request.TruckType))
            {
                _logService.LogActivityAsync("", new { message = "Request is null" }, Usuario, 0);
                return JsonError("Datos requeridos faltantes");
            }

            try
            {
                using var client = CreateApiClient();

                var operationTimeRequest = new
                {
                    shipmentId = request.ShipmentId,
                    operationType = "MEL-001",
                    duration = request.Tiempo,
                    comment = !string.IsNullOrEmpty(request.Comentario) ? request.Comentario : "",
                    truckType = request.TruckType
                };

                var json = JsonConvert.SerializeObject(operationTimeRequest, new JsonSerializerSettings
                {
                    ContractResolver = new Newtonsoft.Json.Serialization.CamelCasePropertyNamesContractResolver()
                });

                var httpContent = new StringContent(json, Encoding.UTF8, "application/json");
                var response = await client.PostAsync($"{_apiSettings.BaseUrl}operation-times", httpContent);

                if (response.IsSuccessStatusCode)
                {
                    _logService.LogActivityAsync(codeGen ?? string.Empty, request, Usuario, 8);

                    // NOTA: No liberamos el timer aquí. Se liberará desde el frontend
                    // después de confirmar que TODAS las operaciones fueron exitosas
                    // (registro de tiempo + cambio de estado)
                }
                else
                {
                    _logService.LogActivityAsync(codeGen ?? string.Empty, request, Usuario, (int)response.StatusCode);
                }

                return await HandleApiResponseAsync(response, "Error al registrar tiempo de operación melaza");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inesperado en TiempoMelaza para codeGen: {CodeGen}", request.CodigoGeneracion);
                _logService.LogActivityAsync(codeGen ?? string.Empty, request, Usuario, 0);
                return JsonError("Error inesperado al registrar tiempo de operación melaza.", ex.Message);
            }
        }

        [HttpPost]
        public async Task<IActionResult> ChangeTransactionStatus([FromBody] ChangeStatusMelazaRequest request)
        {
            var codeGen = request?.CodeGen?.Trim();

            if (request == null)
            {
                _logService.LogActivityAsync("", new { message = "Request is null" }, Usuario, 0);
                return JsonError("Request no puede ser null");
            }

            try
            {
                using var client = CreateApiClient();
                // Obtener username desde JWT en lugar de cookie
                var sessionHelper = HttpContext.GetSessionHelper(_loginService);
                var username = sessionHelper.Username;

                var json = JsonConvert.SerializeObject(new
                {
                    codeGen = request.CodeGen,
                    predefinedStatusId = request.PredefinedStatusId,
                    leveransUsername = username
                });

                var httpContent = new StringContent(json, Encoding.UTF8, "application/json");
                var response = await client.PostAsync($"{_apiSettings.BaseUrl}status/push", httpContent);

                if (response.IsSuccessStatusCode)
                {
                    _logService.LogActivityAsync(codeGen ?? string.Empty, request, Usuario, request.PredefinedStatusId);
                }
                else
                {
                    _logService.LogActivityAsync(codeGen ?? string.Empty, request, Usuario, (int)response.StatusCode);
                }

                return await HandleApiResponseAsync(response, "Error al cambiar el estado");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inesperado en ChangeTransactionStatus");
                _logService.LogActivityAsync(codeGen ?? string.Empty, request, Usuario, 0);
                return JsonError("Error inesperado al cambiar el estado.", ex.Message);
            }
        }

        [HttpPost]
        public async Task<IActionResult> LiberarTimer([FromBody] LiberarTimerRequest request)
        {
            if (request == null || request.ShipmentId <= 0)
            {
                return JsonError("ShipmentId es requerido");
            }

            try
            {
                _logger.LogInformation("Liberando timer para ShipmentId: {ShipmentId}", request.ShipmentId);

                // Liberar timer y UnitDisplayOrder del SQLite
                await _piletasService.LiberarTimerPorShipmentIdAsync(request.ShipmentId);

                _logger.LogInformation("Timer liberado exitosamente para ShipmentId: {ShipmentId}", request.ShipmentId);

                return JsonSuccess("Timer liberado exitosamente", new { shipmentId = request.ShipmentId });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error liberando timer para ShipmentId: {ShipmentId}", request.ShipmentId);
                return JsonError("Error al liberar el timer", ex.Message);
            }
        }

        // ============================================================
        // MÉTODOS PARA BRIX
        // ============================================================

        [HttpGet]
        public async Task<IActionResult> ObtenerDatosBrix(string? ingenio = null, int page = 1, int pageSize = 20, string? startDate = null, string? endDate = null)
        {
            try
            {
                using var client = CreateApiClient();
                
                // Construir URL con parámetros
                var url = $"{_apiSettings.BaseUrl}shipping/brix/view";

                var queryParams = new List<string>();

                if (!string.IsNullOrEmpty(ingenio))
                    queryParams.Add($"ingenio={ingenio}");

                if (!string.IsNullOrEmpty(startDate))
                    queryParams.Add($"startDate={startDate}");

                if (!string.IsNullOrEmpty(endDate))
                    queryParams.Add($"endDate={endDate}");

                var response = await client.GetAsync(url + "?" + string.Join("&", queryParams));

                if (response.IsSuccessStatusCode)
                {
                    var content = await response.Content.ReadAsStringAsync();
                    var data = JsonConvert.DeserializeObject<BrixDataResponse>(content);
                    
                    _logger.LogInformation("Datos de Brix obtenidos - Página: {Page}, Total: {Total}", page, data?.total ?? 0);
                    
                    return JsonSuccess("Datos de Brix obtenidos correctamente.", data);
                }
                else
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    var errorMessage = ParseApiError(errorContent, "Error al obtener datos de Brix");
                    _logger.LogWarning("Error obteniendo datos de Brix {Status}: {Message}", response.StatusCode, errorMessage);
                    return JsonError(errorMessage);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inesperado en ObtenerDatosBrix");
                return JsonError("Error inesperado al obtener datos de Brix.", ex.Message);
            }
        }

        [HttpPost]
        public async Task<IActionResult> RegistrarBrix([FromBody] RegistrarBrixRequest request)
        {
            // Enhanced debugging logs
            _logger.LogInformation("RegistrarBrix called - Request: {Request}", 
                JsonConvert.SerializeObject(request ?? new RegistrarBrixRequest()));

            if (request == null)
            {
                _logger.LogWarning("Request is null");
                _logService.LogActivityAsync("", new { message = "Request is null" }, Usuario, 0);
                return JsonError("Request no puede ser null");
            }

            _logger.LogInformation("Request details - Brix: {Brix}, Shipments Count: {Count}, Shipments: {Shipments}",
                request.Brix, request.Shipments?.Count ?? 0, 
                request.Shipments != null ? string.Join(",", request.Shipments) : "null");

            if (request.Brix <= 0)
            {
                _logger.LogWarning("Brix value invalid: {Brix}", request.Brix);
                _logService.LogActivityAsync("", request, Usuario, 0);
                return JsonError("Brix debe ser mayor a 0");
            }

            if (request.Shipments == null || !request.Shipments.Any())
            {
                _logger.LogWarning("Shipments invalid - Null: {IsNull}, Count: {Count}", 
                    request.Shipments == null, request.Shipments?.Count ?? 0);
                _logService.LogActivityAsync("", request, Usuario, 0);
                return JsonError("Debe incluir al menos un shipment");
            }

            if (request.Brix < 0 || request.Brix > 100)
            {
                _logService.LogActivityAsync("", request, Usuario, 0);
                return JsonError("El valor de Brix debe estar entre 0 y 100");
            }

            try
            {
                using var client = CreateApiClient();

                var payload = new
                {
                    brix = request.Brix,
                    shipments = request.Shipments // Direct use since they're already integers
                };

                var json = JsonConvert.SerializeObject(payload);
                _logger.LogInformation("Sending payload to API: {Payload}", json);
                
                var httpContent = new StringContent(json, Encoding.UTF8, "application/json");
                var response = await client.PostAsync($"{_apiSettings.BaseUrl}shipping/brix", httpContent);

                if (response.IsSuccessStatusCode)
                {
                    _logService.LogActivityAsync("", request, Usuario, 200);
                    _logger.LogInformation("Brix registrado exitosamente - Valor: {Brix}, Shipments: {Count}", 
                        request.Brix, request.Shipments.Count);
                }
                else
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    _logger.LogError("API Error - Status: {Status}, Content: {Content}", 
                        response.StatusCode, errorContent);
                    _logService.LogActivityAsync("", request, Usuario, (int)response.StatusCode);
                }

                return await HandleApiResponseAsync(response, "Error al registrar el valor de Brix");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inesperado en RegistrarBrix");
                _logService.LogActivityAsync("", request, Usuario, 0);
                return JsonError("Error inesperado al registrar Brix.", ex.Message);
            }
        }
    }
}