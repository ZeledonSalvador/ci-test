using Microsoft.AspNetCore.Mvc;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text;
using FrontendQuickpass.Models;
using Newtonsoft.Json;
using System.Net;
using System.Linq;
using FrontendQuickpass.Services;
using Microsoft.Extensions.Options;
using FrontendQuickpass.Models.Configurations;
using FrontendQuickpass.Helpers;

namespace FrontendQuickpass.Controllers
{
    public class AutorizacionPortonController : BaseController
    {
        private readonly IHttpClientFactory _httpClientFactory;
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

        public AutorizacionPortonController(IHttpClientFactory httpClientFactory, IOptions<ApiSettings> apiOptions, ITransactionLogService logService, LoginService loginService)
        {
            _httpClientFactory = httpClientFactory;
            _apiSettings = apiOptions.Value;
            _logService = logService;
            _loginService = loginService;
        }

        public async Task<IActionResult> Index()
        {
            try
            {
                var client = _httpClientFactory.CreateClient();
                string token = _apiSettings.Token;
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

                // Configurar JsonSerializerOptions para manejar nulos
                var jsonOptions = new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true,
                    DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull
                };

                // PRIMERA LLAMADA: Obtener unidades con status 4 (operativas)
                var urlStatus4 = $"{_apiSettings.BaseUrl}shipping/status/4?page=1&size=10000&includeAttachments=true";
                var responseStatus4 = await client.GetAsync(urlStatus4);

                List<AutorizacionPortonModel> dataStatus4 = new();
                if (responseStatus4.IsSuccessStatusCode)
                {
                    var content = await responseStatus4.Content.ReadAsStringAsync();
                    dataStatus4 = System.Text.Json.JsonSerializer.Deserialize<List<AutorizacionPortonModel>>(content, jsonOptions) ?? new();
                }
                else
                {
                    _logService.LogActivityAsync("", $"Error Status 4: {responseStatus4.StatusCode}", Usuario, (int)responseStatus4.StatusCode);
                }

                // SEGUNDA LLAMADA: Obtener unidades con status 13 (inconsistencias)
                var urlStatus13 = $"{_apiSettings.BaseUrl}shipping/status/13?page=1&size=10000&reportType=SEALS&includeAttachments=true";
                var responseStatus13 = await client.GetAsync(urlStatus13);

                List<AutorizacionPortonModel> dataStatus13 = new();
                if (responseStatus13.IsSuccessStatusCode)
                {
                    var content = await responseStatus13.Content.ReadAsStringAsync();
                    dataStatus13 = System.Text.Json.JsonSerializer.Deserialize<List<AutorizacionPortonModel>>(content, jsonOptions) ?? new();
                }
                else
                {
                    _logService.LogActivityAsync("", $"Error Status 13: {responseStatus13.StatusCode}", Usuario, (int)responseStatus13.StatusCode);
                }

                // COMBINAR datos
                var allData = dataStatus4.Concat(dataStatus13).ToList();

                // Aplicar filtros según cod_bascula (mantener lógica existente)
                // Obtener código de báscula desde JWT
                var sessionHelper = HttpContext.GetSessionHelper(_loginService);
                var codBasculaCookie = sessionHelper.CodBascula;
                if (int.TryParse(codBasculaCookie, out int codBascula))
                {
                    if (codBascula == 3)
                    {
                        allData = allData
                            .Where(r => r.Vehicle?.TruckType?.Equals("P", StringComparison.OrdinalIgnoreCase) == true)
                            .ToList();
                    }
                    else if (codBascula == 4)
                    {
                        allData = allData
                            .Where(r => r.Vehicle?.TruckType?.Equals("R", StringComparison.OrdinalIgnoreCase) == true
                                    || r.Vehicle?.TruckType?.Equals("V", StringComparison.OrdinalIgnoreCase) == true)
                            .ToList();
                    }
                }

                // Separar por status
                var unidadesOperativas = allData.Where(item => item.CurrentStatus == 4).ToList();
                var inconsistencias = allData.Where(item => item.CurrentStatus == 13).ToList();

                // Ordenar por fecha de autorización ASC (nulls al final)  
                unidadesOperativas = unidadesOperativas
                    .OrderBy(x => x.DateTimeCurrentStatus ?? DateTime.MaxValue)
                    .ToList();

                inconsistencias = inconsistencias
                    .OrderBy(x => x.DateTimeCurrentStatus ?? DateTime.MaxValue)
                    .ToList();

                // Preparar ViewBag para la vista
                ViewBag.UnidadesOperativas = unidadesOperativas;
                ViewBag.Inconsistencias = inconsistencias;

                // Log para debugging
                Console.WriteLine($"Status 4: {dataStatus4.Count}, Status 13: {dataStatus13.Count}");
                Console.WriteLine($"Operativas filtradas: {unidadesOperativas.Count}, Inconsistencias: {inconsistencias.Count}");

                // Retornar solo las operativas como modelo principal (para mantener compatibilidad)
                return View(unidadesOperativas);
            }
            catch (Exception ex)
            {
                _logService.LogActivityAsync("", ex.Message, Usuario, 0);
                ViewBag.Error = "Error al obtener datos.";
                ViewBag.UnidadesOperativas = new List<AutorizacionPortonModel>();
                ViewBag.Inconsistencias = new List<AutorizacionPortonModel>();
                return View(new List<AutorizacionPortonModel>());
            }
        }

        [HttpGet("AutorizacionPorton/Seals")]
        public async Task<IActionResult> GetSeals([FromQuery] string codeGen)
        {
            if (string.IsNullOrWhiteSpace(codeGen))
                return BadRequest(new { message = "Falta codeGen" });

            try
            {
                string url = _apiSettings.BaseUrl + "shipping/" + codeGen;
                string token = _apiSettings.Token;

                var client = _httpClientFactory.CreateClient();
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var response = await client.GetAsync(url);
                var json = await response.Content.ReadAsStringAsync();

                if (!response.IsSuccessStatusCode)
                {
                    if (response.StatusCode == HttpStatusCode.NotFound)
                        return NotFound(new { message = "El código de generación no se encontró (404)." });

                    return StatusCode((int)response.StatusCode, new { message = "Error en la solicitud", detail = json });
                }

                var data = JsonConvert.DeserializeObject<Post>(json);

                // Extrae los sealCode no vacíos
                var sealCodes = (data?.shipmentSeals ?? new List<ShipmentSeal>())
                    .Select(s => s?.sealCode?.Trim())
                    .Where(s => !string.IsNullOrWhiteSpace(s))
                    .ToList();

                return Ok(new
                {
                    count = sealCodes.Count, // ← N marchamos del envío
                    codes = sealCodes        // opcional: por si quieres precargar
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Error inesperado", error = ex.Message });
            }
        }

        [HttpPost("AutorizacionPorton/ValidarMarchamos")]
        public async Task<IActionResult> ValidarMarchamos([FromBody] ValidarMarchamosRequestDTO request)
        {
            var codeGen = request.CodigoGeneracion?.Trim();

            if (string.IsNullOrWhiteSpace(request.CodigoGeneracion))
            {
                _logService.LogActivityAsync("", request, Usuario, 0);
                return BadRequest("El código de generación no puede estar vacío.");
            }

            try
            {
                string url = _apiSettings.BaseUrl + "shipping/" + request.CodigoGeneracion;
                string token = _apiSettings.Token;
                var client = _httpClientFactory.CreateClient();

                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);
                var response = await client.GetAsync(url);

                if (!response.IsSuccessStatusCode)
                {
                    _logService.LogActivityAsync(codeGen ?? "", request, Usuario, (int)response.StatusCode);

                    if (response.StatusCode == HttpStatusCode.NotFound)
                        return NotFound("El código de generación no se encontró (404).");

                    string errorResponse = await response.Content.ReadAsStringAsync();
                    return StatusCode((int)response.StatusCode, $"Error en la solicitud: {errorResponse}");
                }

                var json = await response.Content.ReadAsStringAsync();
                var data = JsonConvert.DeserializeObject<Post>(json);

                if (data == null || data.shipmentSeals == null || !data.shipmentSeals.Any())
                {
                    _logService.LogActivityAsync(codeGen ?? "", request, Usuario, 0);
                    return BadRequest("No hay marchamos disponibles en el sistema para validar.");
                }

                // Obtener marchamos del sistema (pueden ser 1-4)
                var sealCodes = data.shipmentSeals.Select(seal => seal.sealCode).ToList();
                var cantidadMarchamosEnvio = sealCodes.Count;

                // Obtener marchamos ingresados (no vacíos)
                var marchamosIngresados = new List<string?> {
                request.Marchamo1, request.Marchamo2, request.Marchamo3, request.Marchamo4
            }
                .Where(m => !string.IsNullOrWhiteSpace(m))
                .Select(m => m!.Trim())
                .ToList();

                if (!marchamosIngresados.Any())
                    return BadRequest("Debes ingresar al menos un marchamo para validar.");

                // Verificar duplicados en los marchamos ingresados
                var duplicados = marchamosIngresados.GroupBy(x => x).Where(g => g.Count() > 1).Select(g => g.Key).ToList();
                if (duplicados.Any())
                {
                    _logService.LogActivityAsync(codeGen ?? "", request, Usuario, 4);
                    return BadRequest($"Hay marchamos duplicados: {string.Join(", ", duplicados)}");
                }

                // VALIDACIÓN SIMPLIFICADA - Solo cantidad
                if (marchamosIngresados.Count < cantidadMarchamosEnvio)
                {
                    _logService.LogActivityAsync(codeGen ?? "", request, Usuario, 4);
                    return BadRequest($"Este envío requiere {cantidadMarchamosEnvio} marchamo(s), pero solo ingresaste {marchamosIngresados.Count}.");
                }

                if (marchamosIngresados.Count > cantidadMarchamosEnvio)
                {
                    _logService.LogActivityAsync(codeGen ?? "", request, Usuario, 4);
                    return BadRequest($"Este envío solo requiere {cantidadMarchamosEnvio} marchamo(s), pero ingresaste {marchamosIngresados.Count}.");
                }

                // Verificar que todos los marchamos ingresados existan en el sistema
                var marchamosNoValidos = marchamosIngresados.Except(sealCodes).ToList();
                if (marchamosNoValidos.Any())
                {
                    _logService.LogActivityAsync(codeGen ?? "", request, Usuario, 4);
                    return BadRequest($"Los siguientes marchamos no son válidos: {string.Join(", ", marchamosNoValidos)}");
                }

                // Si llegamos aquí, la validación es exitosa
                _logService.LogActivityAsync(codeGen ?? "", request, Usuario, data.currentStatus);
                return Ok($"Los {cantidadMarchamosEnvio} marchamo(s) del envío son correctos.");

            }
            catch (Exception ex)
            {
                _logService.LogActivityAsync(codeGen ?? "", request, Usuario, 0);
                return StatusCode(500, $"Error inesperado: {ex.Message}");
            }
        }

        [HttpPost("AutorizacionPorton/Autorizar")]
        public async Task<IActionResult> Autorizar([FromBody] AutorizarRequestDTO request)
        {
            var codeGen = request.CodeGen?.Trim();

            if (string.IsNullOrWhiteSpace(request.CodeGen))
            {
                _logService.LogActivityAsync("", request, Usuario, 0);
                return BadRequest(new { errorMessage = "El parámetro 'codeGen' no puede ser nulo o vacío." });
            }

            try
            {
                string url = _apiSettings.BaseUrl + "status/push";
                string token = _apiSettings.Token;
                var client = _httpClientFactory.CreateClient();

                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var payload = new
                {
                    codeGen = request.CodeGen,
                    predefinedStatusId = request.PredefinedStatusId,
                    //leveransUsername = "Admin"
                };

                var json = JsonConvert.SerializeObject(payload);
                var contentBody = new StringContent(json);
                contentBody.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/json");

                var response = await client.PostAsync(url, contentBody);
                var content = await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode)
                {
                    _logService.LogActivityAsync(codeGen ?? "", request, Usuario, 5);
                    return Ok(new { successMessage = "Cambio de estatus exitoso", response = content });
                }

                _logService.LogActivityAsync(codeGen ?? "", request, Usuario, (int)response.StatusCode);
                return StatusCode((int)response.StatusCode, new { errorMessage = content });
            }
            catch (Exception ex)
            {
                _logService.LogActivityAsync(codeGen ?? "", request, Usuario, 0);
                return StatusCode(500, new { errorMessage = "Error inesperado: " + ex.Message });
            }
        }

        [HttpPost("AutorizacionPorton/GuardarReporteMarchamos")]
        public async Task<IActionResult> GuardarReporteMarchamos([FromBody] ReporteMarchamosRequest data)
        {
            var codeGen = data.CodigoGeneracion?.Trim();

            try
            {
                // Obtener userId desde el contexto (ya validado por el middleware)
                var userId = GetUserId();
                if (userId == 0)
                {
                    _logService.LogActivityAsync(codeGen ?? "", data, "", 0);
                    return JsonErrorUnauthorized("Usuario no autenticado.");
                }

                var seals = new List<SealItem>();

                // Priorizar el array 'Seals' si viene del frontend
                if (data.Seals != null && data.Seals.Any())
                {
                    seals = data.Seals.ToList();
                }
                else
                {
                    // Respaldo: usar campos individuales 
                    var sueltos = new[] { data.Marchamo1, data.Marchamo2, data.Marchamo3, data.Marchamo4 };
                    for (int i = 0; i < sueltos.Length; i++)
                    {
                        var codeVal = (sueltos[i] ?? "").Trim();
                        if (!string.IsNullOrEmpty(codeVal))
                            seals.Add(new SealItem { position = $"marchamo{i + 1}", sealCode = codeVal });
                    }
                }

                if (seals.Count == 0)
                {
                    _logService.LogActivityAsync(codeGen ?? "", data, Usuario, 0);
                    return BadRequest(new { success = false, message = "Debes enviar al menos un marchamo." });
                }

                // Validar seals
                for (int i = 0; i < seals.Count; i++)
                {
                    seals[i].sealCode = (seals[i].sealCode ?? "").Trim();

                    // MANTENER posición tal como viene del frontend
                    if (string.IsNullOrWhiteSpace(seals[i].position))
                    {
                        seals[i].position = $"marchamo{i + 1}";
                    }

                    if (string.IsNullOrEmpty(seals[i].position) || string.IsNullOrEmpty(seals[i].sealCode))
                    {
                        _logService.LogActivityAsync(codeGen ?? "", data, Usuario, 0);
                        return BadRequest(new
                        {
                            success = false,
                            message = $"Marchamo #{i + 1} inválido: 'position' y 'sealCode' son requeridos.",
                            example = new { position = "marchamo1", sealCode = "ABC123" }
                        });
                    }
                }

                // PREPARAR PAYLOAD
                var reportBody = new
                {
                    codeGen = data.CodigoGeneracion,
                    reportType = string.IsNullOrWhiteSpace(data.TipoReporte) ? "SEALS" : data.TipoReporte,
                    userId = userId,
                    comments = data.Comentario ?? string.Empty,
                    seals = seals.Select(s => new
                    {
                        position = s.position,      // MANTENER posición exacta del frontend
                        sealCode = s.sealCode
                    }).ToList(),
                    // NUEVO: Arrays completos para comparación por conjuntos en el backend
                    allScannedSeals = data.AllScannedSeals ?? new List<string>(),
                    expectedSeals = data.ExpectedSeals ?? new List<string>()
                };

                string url = _apiSettings.BaseUrl + "data-inconsistency/report";
                string token = _apiSettings.Token;

                var client = _httpClientFactory.CreateClient();
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", token);

                var json = Newtonsoft.Json.JsonConvert.SerializeObject(reportBody);
                var contentBody = new StringContent(json, Encoding.UTF8, "application/json");

                var response = await client.PostAsync(url, contentBody);
                var responseContent = await response.Content.ReadAsStringAsync();

                if (response.IsSuccessStatusCode)
                {
                    _logService.LogActivityAsync(codeGen ?? "", data, Usuario, 13);

                    return Ok(new
                    {
                        success = true,
                        message = "Reporte de marchamos enviado correctamente.",
                        data = Newtonsoft.Json.JsonConvert.DeserializeObject(responseContent)
                    });
                }

                _logService.LogActivityAsync(codeGen ?? "", data, Usuario, (int)response.StatusCode);

                return StatusCode((int)response.StatusCode, new
                {
                    success = false,
                    message = "Error al enviar reporte de marchamos",
                    statusCode = (int)response.StatusCode,
                    details = responseContent,
                    sentPayload = reportBody
                });
            }
            catch (Exception ex)
            {
                _logService.LogActivityAsync(codeGen ?? "", data, Usuario, 0);
                return StatusCode(500, new { success = false, message = "Excepción inesperada: " + ex.Message });
            }
        }

        public class ApiResponse<T>
        {
            public T? Data { get; set; }
        }

        public class AutorizarRequestDTO
        {
            public string CodeGen { get; set; } = string.Empty;
            public int PredefinedStatusId { get; set; }
        }

        public class ValidarMarchamosRequestDTO
        {
            public string CodigoGeneracion { get; set; } = string.Empty;
            public string? Marchamo1 { get; set; }
            public string? Marchamo2 { get; set; }
            public string? Marchamo3 { get; set; }
            public string? Marchamo4 { get; set; }
            public int? Tarjeta { get; set; }
        }

        public class ReporteMarchamosRequest
        {
            public string? CodigoGeneracion { get; set; }
            public string? Comentario { get; set; }
            public string? TipoReporte { get; set; }
            public string? Marchamo1 { get; set; }
            public string? Marchamo2 { get; set; }
            public string? Marchamo3 { get; set; }
            public string? Marchamo4 { get; set; }
            public List<SealItem>? Seals { get; set; }
            // NUEVO: Arrays completos para comparación por conjuntos en el backend
            public List<string>? AllScannedSeals { get; set; }
            public List<string>? ExpectedSeals { get; set; }
        }

        public class SealItem
        {
            public string position { get; set; } = string.Empty;
            public string sealCode { get; set; } = string.Empty;
            public string? code { get; set; } // Alias para sealCode
            public int? pos { get; set; } // Alias para position
        }

        public class Post
        {
            public int currentStatus { get; set; }
            public List<ShipmentSeal>? shipmentSeals { get; set; }
            public int? magneticCard { get; set; }
        }

        public class ShipmentSeal
        {
            public string sealCode { get; set; } = string.Empty;
        }
    }
}