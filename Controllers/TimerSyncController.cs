// Controllers/TimerSyncController.cs
using System;
using System.Linq;
using System.ComponentModel.DataAnnotations;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using FrontendQuickpass.Services;
using FrontendQuickpass.Models;

namespace FrontendQuickpass.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [Produces("application/json")]
    public class TimerSyncController : ControllerBase
    {
        private readonly ITimerSyncService _timerSyncService;
        private readonly ILogger<TimerSyncController> _logger;

        public TimerSyncController(ITimerSyncService timerSyncService, ILogger<TimerSyncController> logger)
        {
            _timerSyncService = timerSyncService;
            _logger = logger;
        }

        // Inicia un nuevo cronómetro - llamado desde JavaScript
        // POST /TimerSync/start
        [HttpPost("start")]
        public async Task<ActionResult<TimerOperationResponse>> StartTimer([FromBody] StartTimerRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    _logger.LogWarning("Datos de entrada inválidos para iniciar timer: {Errors}",
                        string.Join(", ", ModelState.Values.SelectMany(v => v.Errors).Select(e => e.ErrorMessage)));

                    return BadRequest(new TimerOperationResponse
                    {
                        Success = false,
                        Message = "Datos de entrada inválidos",
                        Data = ModelState
                    });
                }

                _logger.LogInformation("📝 Solicitud de inicio de timer: {TimerId} para shipment {ShipmentId} - {CodeGen}",
                    request.TimerId, request.ShipmentId, request.CodeGen);

                var timer = await _timerSyncService.StartTimerAsync(
                    request.TimerId,
                    request.CodeGen,
                    request.ShipmentId,
                    request.TipoTimer,
                    request.TipoUnidad
                );

                var response = new TimerStateResponse
                {
                    TimerId = timer.TimerId,
                    CodeGen = timer.CodeGen,
                    ShipmentId = timer.ShipmentId,
                    TipoTimer = timer.TipoTimer,
                    TipoUnidad = timer.TipoUnidad,

                    // timer.StartedAt ya viene almacenado en hora local de El Salvador (DateTimeOffset con -06:00)
                    StartedAtLocal = timer.StartedAt.ToString("o"),
                    StartedAtUtc = timer.StartedAt.ToUniversalTime().ToString("o"),
                    StartedAtMilliseconds = timer.StartedAt.ToUnixTimeMilliseconds(),
                    IsRunning = true
                };

                _logger.LogInformation("✅ Timer iniciado exitosamente: {TimerId}", request.TimerId);

                return Ok(new TimerOperationResponse
                {
                    Success = true,
                    Message = "Cronómetro iniciado exitosamente",
                    Data = response
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ Error iniciando timer {TimerId}", request.TimerId);
                return BadRequest(new TimerOperationResponse
                {
                    Success = false,
                    Message = ex.Message
                });
            }
        }

        // Detiene un cronómetro específico - llamado desde JavaScript
        // POST /TimerSync/stop
        [HttpPost("stop")]
        public async Task<ActionResult<TimerOperationResponse>> StopTimer([FromBody] StopTimerRequest request)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    return BadRequest(new TimerOperationResponse
                    {
                        Success = false,
                        Message = "Datos de entrada inválidos",
                        Data = ModelState
                    });
                }

                _logger.LogInformation("📝 Solicitud de detención de timer: {TimerId}", request.TimerId);

                var result = await _timerSyncService.StopTimerAsync(request.TimerId);

                return Ok(new TimerOperationResponse
                {
                    Success = result,
                    Message = result ? "Cronómetro detenido exitosamente" : "Cronómetro no encontrado",
                    Data = new { TimerId = request.TimerId, Stopped = result }
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ Error deteniendo timer {TimerId}", request.TimerId);
                return BadRequest(new TimerOperationResponse
                {
                    Success = false,
                    Message = ex.Message
                });
            }
        }

        // Obtiene todos los cronómetros activos de un tipo específico
        // GET /TimerSync/active/{tipoTimer}
        [HttpGet("active/{tipoTimer}")]
        public async Task<ActionResult<TimerOperationResponse>> GetActiveTimers([Required] string tipoTimer)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(tipoTimer))
                {
                    return BadRequest(new TimerOperationResponse
                    {
                        Success = false,
                        Message = "Tipo de timer requerido"
                    });
                }

                _logger.LogDebug("📊 Obteniendo timers activos para: {TipoTimer}", tipoTimer);

                var timers = await _timerSyncService.GetActiveTimersAsync(tipoTimer);

                var response = timers.Select(t => new TimerStateResponse
                {
                    TimerId = t.TimerId,
                    CodeGen = t.CodeGen,
                    ShipmentId = t.ShipmentId,
                    TipoTimer = t.TipoTimer,
                    TipoUnidad = t.TipoUnidad,
                    StartedAtLocal = t.StartedAt.ToString("o"),
                    StartedAtUtc = t.StartedAt.ToUniversalTime().ToString("o"),
                    StartedAtMilliseconds = t.StartedAt.ToUnixTimeMilliseconds(),
                    IsRunning = true
                }).ToList();

                _logger.LogInformation("📊 Enviando {Count} timers activos para {TipoTimer}", response.Count, tipoTimer);

                return Ok(new TimerOperationResponse
                {
                    Success = true,
                    Message = $"Se encontraron {response.Count} cronómetros activos",
                    Data = response
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ Error obteniendo timers activos para {TipoTimer}", tipoTimer);
                return BadRequest(new TimerOperationResponse
                {
                    Success = false,
                    Message = ex.Message
                });
            }
        }

        // Obtiene información de un cronómetro específico
        // GET /TimerSync/{timerId}
        [HttpGet("{timerId}")]
        public async Task<ActionResult<TimerOperationResponse>> GetTimer([Required] string timerId)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(timerId))
                {
                    return BadRequest(new TimerOperationResponse
                    {
                        Success = false,
                        Message = "ID de timer requerido"
                    });
                }

                _logger.LogDebug("📊 Obteniendo timer: {TimerId}", timerId);

                var timer = await _timerSyncService.GetTimerAsync(timerId);

                if (timer == null)
                {
                    return NotFound(new TimerOperationResponse
                    {
                        Success = false,
                        Message = "Cronómetro no encontrado",
                        Data = null
                    });
                }

                var response = new TimerStateResponse
                {
                    TimerId = timer.TimerId,
                    CodeGen = timer.CodeGen,
                    ShipmentId = timer.ShipmentId,
                    TipoTimer = timer.TipoTimer,
                    TipoUnidad = timer.TipoUnidad,
                    StartedAtLocal = timer.StartedAt.ToString("o"),
                    StartedAtUtc = timer.StartedAt.ToUniversalTime().ToString("o"),
                    StartedAtMilliseconds = timer.StartedAt.ToUnixTimeMilliseconds(),
                    IsRunning = true
                };

                return Ok(new TimerOperationResponse
                {
                    Success = true,
                    Message = "Cronómetro encontrado",
                    Data = response
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ Error obteniendo timer {TimerId}", timerId);
                return BadRequest(new TimerOperationResponse
                {
                    Success = false,
                    Message = ex.Message
                });
            }
        }

        // Libera cronómetro por shipmentId (cuando el envío cambia de estado)
        // POST /TimerSync/liberar/{shipmentId}
        [HttpPost("liberar/{shipmentId:int}")]
        public async Task<ActionResult<TimerOperationResponse>> LiberarTimerPorShipmentId([Required] int shipmentId)
        {
            try
            {
                if (shipmentId <= 0)
                {
                    return BadRequest(new TimerOperationResponse
                    {
                        Success = false,
                        Message = "ShipmentId debe ser mayor a 0"
                    });
                }

                _logger.LogInformation("🔄 Solicitud de liberación por cambio de estado: shipment {ShipmentId}", shipmentId);

                var result = await _timerSyncService.LiberarTimerPorShipmentIdAsync(shipmentId);

                return Ok(new TimerOperationResponse
                {
                    Success = true, // Siempre success=true, aunque no haya timer que liberar
                    Message = result
                        ? "Cronómetro liberado por cambio de estado"
                        : "No se encontró cronómetro activo para liberar",
                    Data = new { ShipmentId = shipmentId, Liberado = result }
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ Error liberando timer para shipment {ShipmentId}", shipmentId);
                return BadRequest(new TimerOperationResponse
                {
                    Success = false,
                    Message = ex.Message
                });
            }
        }

        // Verifica si un cronómetro está activo
        // GET /TimerSync/{timerId}/active
        [HttpGet("{timerId}/active")]
        public async Task<ActionResult<TimerOperationResponse>> IsTimerActive([Required] string timerId)
        {
            try
            {
                var isActive = await _timerSyncService.IsTimerActiveAsync(timerId);

                return Ok(new TimerOperationResponse
                {
                    Success = true,
                    Message = isActive ? "Cronómetro activo" : "Cronómetro inactivo",
                    Data = new { TimerId = timerId, IsActive = isActive }
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ Error verificando estado de timer {TimerId}", timerId);
                return BadRequest(new TimerOperationResponse
                {
                    Success = false,
                    Message = ex.Message
                });
            }
        }

        // Obtiene estadísticas generales de cronómetros
        // GET /TimerSync/stats
        [HttpGet("stats")]
        public async Task<ActionResult<TimerOperationResponse>> GetStats()
        {
            try
            {
                var stats = await _timerSyncService.GetTimerStatsAsync();

                return Ok(new TimerOperationResponse
                {
                    Success = true,
                    Message = "Estadísticas obtenidas exitosamente",
                    Data = stats
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ Error obteniendo estadísticas de timers");
                return BadRequest(new TimerOperationResponse
                {
                    Success = false,
                    Message = ex.Message
                });
            }
        }
    }
}