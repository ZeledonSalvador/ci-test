using Microsoft.EntityFrameworkCore;
using FrontendQuickpass.Data;
using FrontendQuickpass.Models;
using FrontendQuickpass.Models.Db;

namespace FrontendQuickpass.Services
{
    public interface ITimerSyncService
    {
        Task<TimerState> StartTimerAsync(string timerId, string? codeGen, int? shipmentId, string tipoTimer, string? tipoUnidad);

        Task<bool> StopTimerAsync(string timerId);

        Task<List<TimerState>> GetActiveTimersAsync(string tipoTimer);

        Task<TimerState?> GetTimerAsync(string timerId);

        Task<bool> IsTimerActiveAsync(string timerId);

        Task<bool> LiberarTimerPorShipmentIdAsync(int shipmentId);

        Task<TimerStatsResponse> GetTimerStatsAsync();
    }

    public class TimerSyncService : ITimerSyncService, IDisposable
    {
        private readonly PiletasDbContext _context;
        private readonly ILogger<TimerSyncService> _logger;
        private readonly SemaphoreSlim _semaphore = new(1, 1);

        // Zona horaria de El Salvador (cross-platform)
        private readonly TimeZoneInfo _svTz;

        public TimerSyncService(PiletasDbContext context, ILogger<TimerSyncService> logger)
        {
            _context = context;
            _logger = logger;
            _svTz = GetElSalvadorTimeZone(logger);
        }

        /// <summary>
        /// Devuelve la zona horaria de El Salvador.
        /// Linux/containers usan "America/El_Salvador", Windows usa "Central America Standard Time".
        /// Si no se encuentra, cae a UTC y registra advertencia (evita fallar la app).
        /// </summary>
        private static TimeZoneInfo GetElSalvadorTimeZone(ILogger logger)
        {
            string[] ids = { "America/El_Salvador", "Central America Standard Time" };
            foreach (var id in ids)
            {
                try
                {
                    var tz = TimeZoneInfo.FindSystemTimeZoneById(id);
                    logger.LogInformation("🕒 Zona horaria cargada: {TimeZoneId}", tz.Id);
                    return tz;
                }
                catch
                {
                    // intentar siguiente id
                }
            }

            logger.LogWarning("⚠️ No se encontró la zona horaria de El Salvador. Usando UTC como fallback.");
            return TimeZoneInfo.Utc;
        }

        /// <summary>
        /// Hora actual en El Salvador (DateTimeOffset con offset correspondiente).
        /// </summary>
        private DateTimeOffset NowSv()
        {
            var utcNow = DateTimeOffset.UtcNow;
            return TimeZoneInfo.ConvertTime(utcNow, _svTz);
        }

        public async Task<TimerState> StartTimerAsync(string timerId, string? codeGen, int? shipmentId, string tipoTimer, string? tipoUnidad)
        {
            await _semaphore.WaitAsync();
            try
            {
                _logger.LogInformation("🚀 Iniciando timer: {TimerId} para shipment {ShipmentId} - {CodeGen}", timerId, shipmentId, codeGen);

                // Verificar si ya existe un timer con este ID
                var existingTimer = await _context.TimerStates
                    .FirstOrDefaultAsync(t => t.TimerId == timerId);

                if (existingTimer != null)
                {
                    // Timer ya existe, actualizar información pero MANTENER fecha de inicio
                    existingTimer.CodeGen = codeGen;
                    existingTimer.ShipmentId = shipmentId;

                    await _context.SaveChangesAsync();
                    _logger.LogInformation("✅ Timer ya existía: {TimerId}. Inicio (local SV): {StartedAt}", timerId, existingTimer.StartedAt);

                    return existingTimer;
                }
                else
                {
                    // Crear nuevo timer con hora local de El Salvador (con offset)
                    var localNow = NowSv();

                    var newTimer = new TimerState
                    {
                        TimerId = timerId,
                        CodeGen = codeGen,
                        ShipmentId = shipmentId,
                        TipoTimer = tipoTimer,
                        TipoUnidad = tipoUnidad,
                        StartedAt = localNow,  // DateTimeOffset (SV)
                        CreatedAt = localNow   // DateTimeOffset (SV)
                    };

                    _context.TimerStates.Add(newTimer);
                    await _context.SaveChangesAsync();

                    _logger.LogInformation("🆕 Nuevo timer creado: {TimerId} para shipment {ShipmentId} - {CodeGen} iniciado (local SV): {StartedAt}", timerId, shipmentId, codeGen, newTimer.StartedAt);
                    return newTimer;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ Error iniciando timer {TimerId}", timerId);
                throw new InvalidOperationException($"Error al iniciar cronómetro {timerId}: {ex.Message}", ex);
            }
            finally
            {
                _semaphore.Release();
            }
        }

        public async Task<bool> StopTimerAsync(string timerId)
        {
            await _semaphore.WaitAsync();
            try
            {
                _logger.LogInformation("⏹️ Deteniendo timer: {TimerId}", timerId);

                var timer = await _context.TimerStates
                    .FirstOrDefaultAsync(t => t.TimerId == timerId);

                if (timer != null)
                {
                    // Calcular duración en UTC para precisión
                    var duration = DateTimeOffset.UtcNow - timer.StartedAt.ToUniversalTime();

                    _logger.LogInformation("✅ Timer detenido: {TimerId} para shipment {ShipmentId} - {CodeGen}, duración aprox: {Minutes} min",
                        timerId, timer.ShipmentId, timer.CodeGen, duration.TotalMinutes.ToString("F1"));

                    // Eliminar timer de la base de datos
                    _context.TimerStates.Remove(timer);
                    await _context.SaveChangesAsync();

                    return true;
                }
                else
                {
                    _logger.LogWarning("⚠️ Intento de detener timer inexistente: {TimerId}", timerId);
                    return false;
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ Error deteniendo timer {TimerId}", timerId);
                throw new InvalidOperationException($"Error al detener cronómetro {timerId}: {ex.Message}", ex);
            }
            finally
            {
                _semaphore.Release();
            }
        }

        public async Task<List<TimerState>> GetActiveTimersAsync(string tipoTimer)
        {
            try
            {
                var list = await _context.TimerStates
                    .AsNoTracking()
                    .Where(t => t.TipoTimer == tipoTimer)
                    .ToListAsync();

                // Ordenar en memoria por CreatedAt (DateTimeOffset)
                var timers = list.OrderBy(t => t.CreatedAt).ToList();

                _logger.LogDebug("📊 Obtenidos {Count} timers activos para {TipoTimer}", timers.Count, tipoTimer);
                return timers;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ Error obteniendo timers activos para {TipoTimer}", tipoTimer);
                return new List<TimerState>();
            }
        }

        public async Task<TimerState?> GetTimerAsync(string timerId)
        {
            try
            {
                var timer = await _context.TimerStates
                    .FirstOrDefaultAsync(t => t.TimerId == timerId);

                if (timer != null)
                {
                    _logger.LogDebug("📊 Timer encontrado: {TimerId} iniciado (local SV): {StartedAt}", timerId, timer.StartedAt);
                }
                else
                {
                    _logger.LogDebug("❓ Timer no encontrado: {TimerId}", timerId);
                }

                return timer;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ Error obteniendo timer {TimerId}", timerId);
                return null;
            }
        }

        public async Task<bool> IsTimerActiveAsync(string timerId)
        {
            try
            {
                var isActive = await _context.TimerStates
                    .AnyAsync(t => t.TimerId == timerId);

                _logger.LogDebug("❓ Timer {TimerId} activo: {IsActive}", timerId, isActive);
                return isActive;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ Error verificando si timer {TimerId} está activo", timerId);
                return false;
            }
        }

        public async Task<bool> LiberarTimerPorShipmentIdAsync(int shipmentId)
        {
            await _semaphore.WaitAsync();
            try
            {
                var timer = await _context.TimerStates
                    .FirstOrDefaultAsync(t => t.ShipmentId == shipmentId);

                if (timer != null)
                {
                    var timerId = timer.TimerId;
                    var codeGen = timer.CodeGen;
                    var duration = DateTimeOffset.UtcNow - timer.StartedAt.ToUniversalTime();

                    // Eliminar timer por cambio de estado
                    _context.TimerStates.Remove(timer);
                    await _context.SaveChangesAsync();

                    _logger.LogInformation("🔄 Timer liberado por cambio de estado: {TimerId} para shipment {ShipmentId} - {CodeGen}, duración aprox: {Minutes} min",
                        timerId, shipmentId, codeGen, duration.TotalMinutes.ToString("F1"));
                    return true;
                }

                _logger.LogDebug("⚡ No se encontró timer activo para liberar: shipment {ShipmentId}", shipmentId);
                return false;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ Error liberando timer para shipment {ShipmentId}", shipmentId);
                return false;
            }
            finally
            {
                _semaphore.Release();
            }
        }

        public async Task<TimerStatsResponse> GetTimerStatsAsync()
        {
            try
            {
                var allTimers = await _context.TimerStates.ToListAsync();

                var stats = new TimerStatsResponse
                {
                    TotalActiveTimers = allTimers.Count,
                    AzucarTimers = allTimers.Count(t => t.TipoTimer == "azucar"),
                    MelazaTimers = allTimers.Count(t => t.TipoTimer == "melaza"),
                    TimersByType = allTimers
                        .GroupBy(t => t.TipoUnidad ?? "unknown")
                        .ToDictionary(g => g.Key, g => g.Count()),
                    // OldestTimerStarted como DateTimeOffset? (coincide con el modelo actualizado)
                    OldestTimerStarted = allTimers
                        .OrderBy(t => t.StartedAt)
                        .FirstOrDefault()?.StartedAt
                };

                _logger.LogDebug("📊 Estadísticas: {Total} timers activos ({Azucar} azúcar, {Melaza} melaza)",
                    stats.TotalActiveTimers, stats.AzucarTimers, stats.MelazaTimers);

                return stats;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ Error obteniendo estadísticas de timers");
                return new TimerStatsResponse
                {
                    TotalActiveTimers = 0,
                    AzucarTimers = 0,
                    MelazaTimers = 0,
                    TimersByType = new Dictionary<string, int>(),
                    OldestTimerStarted = null
                };
            }
        }

        public void Dispose()
        {
            _semaphore?.Dispose();
        }
    }
}
