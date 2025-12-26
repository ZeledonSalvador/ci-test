using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using System.Net.Http.Headers;
using Newtonsoft.Json;
using FrontendQuickpass.Models;
using FrontendQuickpass.Models.Configurations;
using FrontendQuickpass.Services;
using FrontendQuickpass.Helpers;
using System.Text;
using System.Globalization;


namespace FrontendQuickpass.Controllers
{
    public class AutorizacionCamionesMelazaController : BaseController
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ApiSettings _apiSettings;
        private readonly ILogger<AutorizacionCamionesMelazaController> _logger;
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

        public AutorizacionCamionesMelazaController(
            IHttpClientFactory httpClientFactory,
            IOptions<ApiSettings> apiSettings,
            ILogger<AutorizacionCamionesMelazaController> logger,
            ITransactionLogService logService,
            LoginService loginService)
        {
            _httpClientFactory = httpClientFactory;
            _apiSettings = apiSettings.Value;
            _logger = logger;
            _logService = logService;
            _loginService = loginService;
        }

        private HttpClient CreateApiClient(bool useLogToken = false)
        {
            var client = _httpClientFactory.CreateClient();
            var token = _apiSettings.Token;
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
            return client;
        }

        // MÉTODO HELPER: Parsear errores del API
        private string ParseApiError(string errorContent, string defaultMessage = "Error en el servidor")
        {
            try
            {
                dynamic? errorData = JsonConvert.DeserializeObject(errorContent);
                
                if (errorData?.message != null)
                {
                    return errorData.message.ToString();
                }
                
                if (errorData?.error != null)
                {
                    return errorData.error.ToString();
                }
                
                if (errorData?.details != null)
                {
                    return errorData.details.ToString();
                }
                
                return defaultMessage;
            }
            catch
            {
                if (!string.IsNullOrEmpty(errorContent))
                {
                    if (errorContent.Contains("<html>") || errorContent.Contains("<!DOCTYPE"))
                    {
                        return defaultMessage;
                    }
                    
                    return errorContent;
                }
                
                return defaultMessage;
            }
        }

        public async Task<IActionResult> Index()
        {
            var model = new AutorizacionCamionesMelazaViewModel();

            try
            {
                using var client = CreateApiClient();

                // Configurar JsonSerializerSettings para manejar nulos
                var jsonSettings = new JsonSerializerSettings
                {
                    NullValueHandling = NullValueHandling.Ignore,
                    MissingMemberHandling = MissingMemberHandling.Ignore,
                    DateTimeZoneHandling = DateTimeZoneHandling.Utc
                };

                // PRIMERA LLAMADA: Obtener unidades con status 2 (operativas)
                var urlStatus2 = $"{_apiSettings.BaseUrl}shipping/status/2?page=1&size=10000&includeAttachments=true";
                var responseStatus2 = await client.GetAsync(urlStatus2);

                List<PostAutorizacionMelaza> dataStatus2 = new();
                if (responseStatus2.IsSuccessStatusCode)
                {
                    var content = await responseStatus2.Content.ReadAsStringAsync();
                    dataStatus2 = JsonConvert.DeserializeObject<List<PostAutorizacionMelaza>>(content, jsonSettings) ?? new();
                }
                else
                {
                    var errorContent = await responseStatus2.Content.ReadAsStringAsync();
                    var errorMessage = ParseApiError(errorContent, "Error al cargar datos de status 2");
                    _logger.LogWarning($"API Error Status 2: {responseStatus2.StatusCode} - {errorMessage}");
                }

                // SEGUNDA LLAMADA: Obtener unidades con status 13 (inconsistencias)
                var urlStatus13 = $"{_apiSettings.BaseUrl}shipping/status/13?page=1&size=10000&reportType=PRECHECK&includeAttachments=true";
                var responseStatus13 = await client.GetAsync(urlStatus13);

                List<PostAutorizacionMelaza> dataStatus13 = new();
                if (responseStatus13.IsSuccessStatusCode)
                {
                    var content = await responseStatus13.Content.ReadAsStringAsync();
                    dataStatus13 = JsonConvert.DeserializeObject<List<PostAutorizacionMelaza>>(content, jsonSettings) ?? new();
                }
                else
                {
                    var errorContent = await responseStatus13.Content.ReadAsStringAsync();
                    var errorMessage = ParseApiError(errorContent, "Error al cargar datos de status 13");
                    _logger.LogWarning($"API Error Status 13: {responseStatus13.StatusCode} - {errorMessage}");
                }

                // COMBINAR datos para procesamiento (mostrar siempre)
                var allData = dataStatus2.Concat(dataStatus13).ToList();

                // Procesamiento de fechas (manejar nullables)
                TimeZoneInfo gmtMinus6 = TimeZoneInfo.CreateCustomTimeZone("GMT-6", TimeSpan.FromHours(-6), "GMT-6", "GMT-6");

                foreach (var item in allData)
                {
                    if (item?.dateTimePrecheckeo.HasValue == true && item.dateTimePrecheckeo.Value != DateTime.MinValue)
                    {
                        var utcDate = DateTime.SpecifyKind(item.dateTimePrecheckeo.Value, DateTimeKind.Utc);
                        item.dateTimePrecheckeo = TimeZoneInfo.ConvertTimeFromUtc(utcDate, gmtMinus6);
                    }
                }

                // Orden general de presentación: usar fecha si existe, sino colocarlo al final
                var allDataOrdered = allData
                    .OrderBy(item => item.dateTimePrecheckeo ?? DateTime.MaxValue)
                    .ToList();

                // Para las inconsistencias, incluir también las que no tienen fecha válida (pero filtrar por tipo P)
                var inconsistenciasCompletas = allDataOrdered
                    .Where(item => item.currentStatus == 13 && item.vehicle?.truckType == "P")
                    .OrderBy(item => item.dateTimePrecheckeo ?? DateTime.MaxValue)
                    .ToList();

                // ASIGNAR A MODELO: Solo status 2 y tipo Pipa para unidades operativas (mostrar siempre aunque no tengan fecha)
                var unidadesOperativas = allDataOrdered.Where(item => item.currentStatus == 2).ToList();

                model.UnidadesPipa = unidadesOperativas
                    .Where(item => item.vehicle?.truckType == "P")
                    .OrderBy(item => item.dateTimePrecheckeo ?? DateTime.MaxValue)
                    .ToList();

                model.CountPipa = model.UnidadesPipa.Count;

                // ASIGNAR inconsistencias (status 13) - pipas
                model.UnidadesInconsistencias = inconsistenciasCompletas;

                // Logs para debugging
                _logger.LogInformation($"=== RESUMEN DE DATOS MELAZA (Tipo P) ===");
                _logger.LogInformation($"Status 2 recibidos: {dataStatus2.Count}");
                _logger.LogInformation($"Status 13 recibidos: {dataStatus13.Count}");
                _logger.LogInformation($"Total combinado: {allData.Count}");
                var totalWithValidDate = allData.Count(i => i.dateTimePrecheckeo.HasValue && i.dateTimePrecheckeo.Value != DateTime.MinValue);
                _logger.LogInformation($"Datos con fecha válida: {totalWithValidDate}");
                _logger.LogInformation($"Unidades Pipa (status 2): {model.CountPipa}");
                _logger.LogInformation($"Inconsistencias Pipa (status 13): {model.UnidadesInconsistencias.Count}");

                // Conteo por ingenios (incluir status 2 y 13) pero SOLO contar vehículos tipo P (pipas)
                var validIngenios = new string[] { "001001-003", "007001-001", "007001-003", "001001-001", "001001-004", "001001-002" };
                var ingenioCounts = new Dictionary<string, int>();

                // Items para conteo: tomar todos los items con status 2 o 13, pero FILTRAR por truckType == "P"
                var itemsParaConteoIngenio = allData
                    .Where(item => item.currentStatus == 2
                                && (item.vehicle?.truckType == "P"))
                    .ToList();

                // Opcional: si no quieres duplicados (mismo CodigoGeneracion) descomenta y ajusta la línea siguiente:
                // itemsParaConteoIngenio = itemsParaConteoIngenio
                //     .Where(x => !string.IsNullOrEmpty(x?.CodigoGeneracion))
                //     .GroupBy(x => x.CodigoGeneracion.Trim())
                //     .Select(g => g.First())
                //     .ToList();

                foreach (var item in itemsParaConteoIngenio)
                {
                    var ingenioNavCode = item?.ingenio?.ingenioNavCode?.Trim();
                    if (!string.IsNullOrEmpty(ingenioNavCode) && validIngenios.Contains(ingenioNavCode))
                    {
                        if (ingenioCounts.ContainsKey(ingenioNavCode))
                            ingenioCounts[ingenioNavCode]++;
                        else
                            ingenioCounts[ingenioNavCode] = 1;
                    }
                }

                // Asignar conteos al diccionario del modelo
                model.IngenioCounts = ingenioCounts;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al cargar datos de autorización de camiones melaza (Tipo P)");
                _logService.LogActivityAsync("", ex.Message, Usuario, 0);
                model.CountPipa = 0;
            }

            return View(model);
        }

        // Los mismos métodos que el controlador de Azúcar, pero usando las clases de Models
        [HttpPost]
        public async Task<IActionResult> ValidarDatos([FromBody] ValidarDatosRequest request)
        {
            var errores = new List<string>();
            var codeGen = request.CodigoGeneracion?.Trim();

            if (string.IsNullOrEmpty(request.CodigoGeneracion)) errores.Add("codigoGeneracion");
            if (string.IsNullOrEmpty(request.Licencia)) errores.Add("licencia");
            if (string.IsNullOrEmpty(request.PlacaRemolque)) errores.Add("placaRemolque");
            if (string.IsNullOrEmpty(request.PlacaCamion)) errores.Add("placaCamion");

            if (errores.Count == 0)
            {
                try
                {
                    using var client = CreateApiClient();

                    var url = $"{_apiSettings.BaseUrl}shipping/{request.CodigoGeneracion}?includeAttachments=true";
                    var response = await client.GetAsync(url);

                    if (response.IsSuccessStatusCode)
                    {
                        var content = await response.Content.ReadAsStringAsync();
                        var data = JsonConvert.DeserializeObject<PostAutorizacionMelaza>(content);

                        if (data?.driver.license != request.Licencia) errores.Add("licencia");
                        if (data?.vehicle.trailerPlate != request.PlacaRemolque) errores.Add("placaRemolque");
                        if (data?.vehicle.plate != request.PlacaCamion) errores.Add("placaCamion");

                        if (errores.Count == 0)
                        {
                            _logService.LogActivityAsync(codeGen ?? "", request, Usuario, data?.currentStatus ?? 2);
                        }
                    }
                    else
                    {
                        errores.Add("codigoGeneracion");
                        var errorContent = await response.Content.ReadAsStringAsync();
                        var errorMessage = ParseApiError(errorContent, "Código de generación no encontrado");
                        _logger.LogWarning($"ValidarDatos Error: {response.StatusCode} - {errorMessage}");
                        _logService.LogActivityAsync(codeGen ?? "", request, Usuario, (int)response.StatusCode);
                    }
                }
                catch (Exception ex)
                {
                    errores.Add("codigoGeneracion");
                    _logger.LogError(ex, "Error al validar datos");
                    _logService.LogActivityAsync(codeGen ?? "", request, Usuario, 0);
                }
            }
            else
            {
                _logService.LogActivityAsync(codeGen ?? "", request, Usuario, 0);
            }

            if (errores.Count > 0)
            {
                return Json(new { error = true, camposConError = errores });
            }
            else
            {
                return Json(new { error = false, mensaje = "Validación exitosa" });
            }
        }

        [HttpPost]
        public async Task<IActionResult> AsignarTarjeta([FromBody] AsignarTarjetaRequest request)
        {
            var codeGen = request.CodigoGeneracion?.Trim();
            
            try
            {
                using var client = CreateApiClient();
                var url = $"{_apiSettings.BaseUrl}shipping/setMagneticCard/";
                var requestBody = new { codeGen = request.CodigoGeneracion, cardNumber = request.Tarjeta };
                var json = JsonConvert.SerializeObject(requestBody);
                var httpContent = new StringContent(json, Encoding.UTF8, "application/json");

                var response = await client.PostAsync(url, httpContent);
                var responseContent = await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode)
                {
                    return Json(new 
                    { 
                        success = true, 
                        message = "Tarjeta asignada correctamente.",
                        data = responseContent 
                    });
                }
                else
                {
                    var errorMessage = ParseApiError(responseContent, "Error al asignar tarjeta");
                    _logger.LogWarning($"AsignarTarjeta Error: {response.StatusCode} - {errorMessage}");
                    _logService.LogActivityAsync(codeGen ?? "", request, Usuario, (int)response.StatusCode);
                    
                    return Json(new 
                    { 
                        success = false, 
                        message = errorMessage 
                    });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inesperado en AsignarTarjeta");
                _logService.LogActivityAsync(codeGen ?? "", request, Usuario, 0);
                
                return Json(new 
                { 
                    success = false, 
                    message = ex.Message 
                });
            }
        }

        [HttpPost]
        public async Task<IActionResult> AsignarBuzzer([FromBody] AsignarBuzzerRequest request)
        {
            var codeGen = request.CodigoGeneracion?.Trim();
            
            try
            {
                using var client = CreateApiClient();

                var url = $"{_apiSettings.BaseUrl}shipping/buzzers/asignar/{request.CodigoGeneracion}";
                
                var requestBody = new { buzzer = request.Buzzer };
                var json = JsonConvert.SerializeObject(requestBody);
                var httpContent = new StringContent(json, Encoding.UTF8, "application/json");

                var response = await client.PutAsync(url, httpContent);

                if (response.IsSuccessStatusCode)
                {
                    var responseContent = await response.Content.ReadAsStringAsync();
                    dynamic? apiResult = JsonConvert.DeserializeObject(responseContent) ?? new { affected = 0 };

                    return Json(new
                    {
                        success = true,
                        message = "Buzzer asignado correctamente.",
                        codeGen = request.CodigoGeneracion,
                        affected = apiResult?.affected ?? 0
                    });
                }
                else
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    var errorMessage = ParseApiError(errorContent, "Error al asignar buzzer");
                    _logger.LogWarning($"AsignarBuzzer Error: {response.StatusCode} - {errorMessage}");
                    _logService.LogActivityAsync(codeGen ?? "", request, Usuario, (int)response.StatusCode);
                    
                    return Json(new
                    {
                        success = false,
                        message = "Error al asignar buzzer.",
                        error = errorMessage
                    });
                }
            }
            catch (HttpRequestException ex)
            {
                _logger.LogError(ex, "Error de conexión al asignar buzzer");
                _logService.LogActivityAsync(codeGen ?? "", request, Usuario, 0);
                
                return Json(new
                {
                    success = false,
                    message = "Error al asignar buzzer.",
                    error = "No se pudo conectar con la API de buzzers."
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inesperado al asignar buzzer");
                _logService.LogActivityAsync(codeGen ?? "", request, Usuario, 0);
                
                return Json(new
                {
                    success = false,
                    message = "Error al asignar buzzer.",
                    error = ex.Message
                });
            }
        }

        [HttpPost]
        public async Task<IActionResult> ChangeTransactionStatus([FromBody] ChangeStatusRequest request)
        {
            var codeGen = request.CodeGen?.Trim();
            
            try
            {
                using var client = CreateApiClient();

                // Obtener username desde JWT en lugar de cookie
                var sessionHelper = HttpContext.GetSessionHelper(_loginService);
                var username = sessionHelper.Username;

                var url = $"{_apiSettings.BaseUrl}status/push/";
                var requestBody = new
                {
                    codeGen = request.CodeGen,
                    predefinedStatusId = request.PredefinedStatusId,
                    leveransUsername = username
                };
                var json = JsonConvert.SerializeObject(requestBody);
                var httpContent = new StringContent(json, Encoding.UTF8, "application/json");

                var response = await client.PostAsync(url, httpContent);
                var responseContent = await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode)
                {
                    _logService.LogActivityAsync(codeGen ?? "", request, Usuario, request.PredefinedStatusId);
                    
                    return Json(new 
                    { 
                        success = true, 
                        message = "Estado actualizado correctamente.",
                        data = responseContent,
                        username = username
                    });
                }
                else
                {
                    var errorMessage = ParseApiError(responseContent, "Error al cambiar el estado");
                    _logger.LogWarning($"ChangeTransactionStatus Error: {response.StatusCode} - {errorMessage}");
                    _logService.LogActivityAsync(codeGen ?? "", request, Usuario, (int)response.StatusCode);
                    
                    return Json(new 
                    { 
                        success = false, 
                        message = errorMessage 
                    });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inesperado en ChangeTransactionStatus");
                _logService.LogActivityAsync(codeGen ?? "", request, Usuario, 0);
                
                return Json(new 
                { 
                    success = false, 
                    message = ex.Message 
                });
            }
        }
        
        [HttpPost]
        public async Task<IActionResult> GuardarReporteInconsistencia([FromBody] ReporteInconsistenciaRequest request)
        {
            var codeGen = request.CodigoGeneracion?.Trim();
            
            try
            {
                // Obtener userId desde el contexto (ya validado por el middleware)
                var userId = GetUserId();
                if (userId == 0)
                {
                    _logService.LogActivityAsync(codeGen ?? "", request, "", 0);
                    return JsonErrorUnauthorized("Error: usuario no autenticado.");
                }

                var requestBody = new Dictionary<string, object>
                {
                    ["codeGen"] = request.CodigoGeneracion ?? string.Empty,
                    ["reportType"] = request.TipoReporte,
                    ["userId"] = userId,
                    ["comments"] = request.Comentario ?? string.Empty
                };

                foreach (var dato in request.DatosInconsistentes)
                {
                    switch (dato.Campo)
                    {
                        case "licencia":
                            requestBody["license"] = dato.Valor;
                            break;
                        case "placaRemolque":
                            requestBody["trailerPlate"] = dato.Valor;
                            break;
                        case "placaCamion":
                            requestBody["truckPlate"] = dato.Valor;
                            break;
                    }
                }

                using var client = CreateApiClient(useLogToken: true);

                var url = $"{_apiSettings.BaseUrl}data-inconsistency/report";
                var json = JsonConvert.SerializeObject(requestBody);
                var httpContent = new StringContent(json, Encoding.UTF8, "application/json");

                var response = await client.PostAsync(url, httpContent);
                var responseContent = await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode)
                {
                    _logService.LogActivityAsync(codeGen ?? "", request, Usuario, 12);
                    
                    return Json(new
                    {
                        success = true,
                        message = "Reporte enviado correctamente.",
                        data = JsonConvert.DeserializeObject(responseContent)
                    });
                }
                else
                {
                    var errorMessage = ParseApiError(responseContent, "Error al enviar reporte");
                    _logger.LogWarning($"GuardarReporteInconsistencia Error: {response.StatusCode} - {errorMessage}");
                    _logService.LogActivityAsync(codeGen ?? "", request, Usuario, (int)response.StatusCode);
                    
                    return Json(new
                    {
                        success = false,
                        message = errorMessage,
                        details = responseContent
                    });
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Excepción inesperada en GuardarReporteInconsistencia");
                _logService.LogActivityAsync(codeGen ?? "", request, Usuario, 0);

                return Json(new
                {
                    success = false,
                    message = ex.Message
                });
            }
        }
    }
}