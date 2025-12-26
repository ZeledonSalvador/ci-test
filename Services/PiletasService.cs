using FrontendQuickpass.Models.Db;
using FrontendQuickpass.Models;
using FrontendQuickpass.Data;
using Microsoft.EntityFrameworkCore;

namespace FrontendQuickpass.Services
{
    public interface IPiletasService
    {
        Task<List<PostTiemposMelaza>> OrganizarUnidadesPorEstadoAsync(List<PostTiemposMelaza> unidades);
        Task<bool> LiberarTimerPorShipmentIdAsync(int shipmentId);
        Task UpdateUnitDisplayOrderAsync(int shipmentId, string? codeGen, int currentStatus, string tipoTimer = "melaza", bool? hasActiveTimer = null);
        Task CleanupDisplayOrdersAsync(List<int> activeShipmentIds, string tipoTimer = "melaza");
        Task CleanupAllInactiveDisplayOrdersAsync(string tipoTimer = "melaza");
    }

    public class PiletasService : IPiletasService, IDisposable
    {
        private readonly ILogger<PiletasService> _logger;
        private readonly IServiceProvider _serviceProvider;
        private readonly SemaphoreSlim _semaphore = new(1, 1);

        // Zona horaria de El Salvador
        private readonly TimeZoneInfo _svTz;

        public PiletasService(ILogger<PiletasService> logger, IServiceProvider serviceProvider)
        {
            _logger = logger;
            _serviceProvider = serviceProvider;
            _svTz = GetElSalvadorTimeZone(logger);
            _logger.LogDebug("PiletasService inicializado correctamente");
        }

        private static TimeZoneInfo GetElSalvadorTimeZone(ILogger logger)
        {
            string[] ids = { "America/El_Salvador", "Central America Standard Time" };
            foreach (var id in ids)
            {
                try
                {
                    var tz = TimeZoneInfo.FindSystemTimeZoneById(id);
                    return tz;
                }
                catch { }
            }
            logger.LogWarning("No se encontró la zona horaria de El Salvador. Usando UTC como fallback.");
            return TimeZoneInfo.Utc;
        }

        private DateTimeOffset NowSv()
        {
            var utcNow = DateTimeOffset.UtcNow;
            return TimeZoneInfo.ConvertTime(utcNow, _svTz);
        }

        public async Task<List<PostTiemposMelaza>> OrganizarUnidadesPorEstadoAsync(List<PostTiemposMelaza> unidades)
        {
            var activeShipmentIds = unidades?.Where(u => u != null && u.id > 0)
                .Select(u => u.id)
                .ToList() ?? new List<int>();

            if (unidades == null || !unidades.Any())
            {
                await CleanupAllInactiveDisplayOrdersAsync("melaza");
                _logger.LogDebug("No hay unidades para organizar, limpieza completada");
                return new List<PostTiemposMelaza>();
            }

            try
            {
                // UNA SOLA conexión para toda la operación
                using var scope = _serviceProvider.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<PiletasDbContext>();

                // Procesar todo en una sola transacción
                await ProcessUnitsInSingleConnection(context, unidades, activeShipmentIds);

                // Obtener órdenes existentes - ordenar en memoria para evitar DateTimeOffset issues
                var displayOrders = await context.UnitDisplayOrders
                    .Where(udo => udo.TipoTimer == "melaza")
                    .ToListAsync();

                displayOrders = displayOrders
                    .OrderBy(udo => udo.DisplayOrder)
                    .ThenBy(udo => udo.UpdatedAt)
                    .ToList();

                var orderLookup = displayOrders
                    .GroupBy(x => x.ShipmentId)
                    .ToDictionary(g => g.Key, g => g.OrderBy(x => x.DisplayOrder).ThenBy(x => x.UpdatedAt).First().DisplayOrder);

                var unidadesOrdenadas = unidades
                    .OrderBy(u => orderLookup.TryGetValue(u.id, out var ord) ? ord : int.MaxValue)
                    .ThenBy(u => u.dateTimePrecheckeo ?? DateTime.MaxValue)
                    .ToList();

                // Asignar prioridades
                foreach (var unidad in unidadesOrdenadas)
                {
                    if (orderLookup.TryGetValue(unidad.id, out var order))
                    {
                        unidad.PiletaAsignada = order switch
                        {
                            < 1000 => 1, // Timers activos
                            < 2000 => 2, // Status 8 - Listo para iniciar
                            < 3000 => 3, // Status 7 - Requiere temperatura
                            _ => 4       // Otros
                        };
                    }
                    else
                    {
                        unidad.PiletaAsignada = 4;
                    }
                }

                _logger.LogInformation("Unidades organizadas: {Total} - Activas: {Activas}, Iniciar: {Iniciar}, Temperatura: {Temperatura}",
                    unidadesOrdenadas.Count,
                    unidadesOrdenadas.Count(u => u.PiletaAsignada == 1),
                    unidadesOrdenadas.Count(u => u.PiletaAsignada == 2),
                    unidadesOrdenadas.Count(u => u.PiletaAsignada == 3));

                return unidadesOrdenadas;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error organizando unidades por estado");
                return unidades.ToList();
            }
        }

        private async Task ProcessUnitsInSingleConnection(PiletasDbContext context,
            List<PostTiemposMelaza> unidades, List<int> activeShipmentIds)
        {
            // Todo en una transacción para optimizar rendimiento
            using var transaction = await context.Database.BeginTransactionAsync();
            try
            {
                // 1. Cleanup en la misma conexión
                await CleanupInSameConnection(context, activeShipmentIds);

                // 2. Obtener timers activos
                var activeTimers = await context.TimerStates
                    .Where(t => t.TipoTimer == "melaza" && t.ShipmentId.HasValue)
                    .Select(t => t.ShipmentId!.Value)
                    .ToHashSetAsync();

                _logger.LogDebug("Timers activos encontrados: {Count} - IDs: {ActiveIds}",
                    activeTimers.Count, string.Join(", ", activeTimers));

                // 3. Batch update en la misma conexión
                await UpdateDisplayOrdersInSameConnection(context, unidades, activeTimers);

                // CRÍTICO: Guardar cambios ANTES del commit
                await context.SaveChangesAsync();

                await transaction.CommitAsync();
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                _logger.LogError(ex, "Error en transacción, realizando rollback");
                throw;
            }
        }

        private async Task CleanupInSameConnection(PiletasDbContext context, List<int> activeShipmentIds)
        {
            if (!activeShipmentIds.Any())
            {
                _logger.LogDebug("No hay unidades activas, saltando limpieza");
                return;
            }

            // Obtener IDs que necesitan limpieza de forma eficiente
            var currentStoredIds = await context.UnitDisplayOrders
                .Where(udo => udo.TipoTimer == "melaza")
                .Select(udo => udo.ShipmentId)
                .ToHashSetAsync();

            var idsToRemove = currentStoredIds.Except(activeShipmentIds).ToList();

            if (!idsToRemove.Any())
            {
                _logger.LogDebug("No hay registros obsoletos para limpiar");
                return;
            }

            // Limpieza batch eficiente
            var ordersToRemove = await context.UnitDisplayOrders
                .Where(udo => udo.TipoTimer == "melaza" && idsToRemove.Contains(udo.ShipmentId))
                .ToListAsync();

            var timersToRemove = await context.TimerStates
                .Where(t => t.TipoTimer == "melaza" &&
                        t.ShipmentId.HasValue &&
                        idsToRemove.Contains(t.ShipmentId.Value))
                .ToListAsync();

            if (ordersToRemove.Any())
            {
                context.UnitDisplayOrders.RemoveRange(ordersToRemove);
                _logger.LogInformation("Eliminando {Count} UnitDisplayOrders obsoletos: {Ids}",
                    ordersToRemove.Count, string.Join(", ", ordersToRemove.Select(o => o.ShipmentId)));
            }

            if (timersToRemove.Any())
            {
                context.TimerStates.RemoveRange(timersToRemove);
                _logger.LogInformation("Eliminando {Count} TimerStates huérfanos: {Ids}",
                    timersToRemove.Count, string.Join(", ", timersToRemove.Select(t => t.ShipmentId)));
            }

            // Deduplicar en la misma conexión
            await DeduplicateInSameConnection(context);

            // NO hacer SaveChangesAsync aquí - se hará en la transacción padre
        }

        private async Task UpdateDisplayOrdersInSameConnection(PiletasDbContext context,
            List<PostTiemposMelaza> unidades, HashSet<int> activeTimers)
        {
            var now = NowSv();
            var shipmentIds = unidades.Select(u => u.id).ToList();

            // Obtener órdenes existentes para estas unidades
            var existingOrders = await context.UnitDisplayOrders
                .Where(udo => udo.TipoTimer == "melaza" && shipmentIds.Contains(udo.ShipmentId))
                .ToListAsync();

            var existingLookup = existingOrders.ToDictionary(o => o.ShipmentId);
            var toAdd = new List<UnitDisplayOrder>();
            var hasChanges = false;

            foreach (var unidad in unidades)
            {
                var hasActiveTimer = activeTimers.Contains(unidad.id);

                if (existingLookup.TryGetValue(unidad.id, out var existingOrder))
                {
                    // Verificar si necesita actualización
                    var currentCategory = GetDisplayCategory(existingOrder.DisplayOrder);
                    var newCategory = GetExpectedCategory(hasActiveTimer, unidad.currentStatus);

                    if (currentCategory != newCategory || existingOrder.CurrentStatus != unidad.currentStatus)
                    {
                        existingOrder.DisplayOrder = await CalculateDisplayOrderAsync(context, hasActiveTimer, unidad.currentStatus, now, unidad.id);
                        existingOrder.CurrentStatus = unidad.currentStatus;
                        existingOrder.CodeGen = unidad.codeGen;
                        existingOrder.UpdatedAt = now;
                        hasChanges = true;
                    }
                }
                else
                {
                    // Crear nueva orden
                    var newOrder = new UnitDisplayOrder
                    {
                        ShipmentId = unidad.id,
                        CodeGen = unidad.codeGen,
                        TipoTimer = "melaza",
                        DisplayOrder = await CalculateDisplayOrderAsync(context, hasActiveTimer, unidad.currentStatus, now, unidad.id),
                        CurrentStatus = unidad.currentStatus,
                        CreatedAt = now,
                        UpdatedAt = now
                    };
                    toAdd.Add(newOrder);
                    hasChanges = true;
                }
            }

            if (hasChanges)
            {
                if (toAdd.Any())
                {
                    context.UnitDisplayOrders.AddRange(toAdd);
                }

                _logger.LogDebug("Batch update completado: {Updated} actualizados, {Added} agregados",
                    existingOrders.Count, toAdd.Count);
            }
        }

        private async Task DeduplicateInSameConnection(PiletasDbContext context)
        {
            // Obtener todos los registros y hacer la deduplicación en memoria para evitar DateTimeOffset issues
            var allOrders = await context.UnitDisplayOrders
                .Where(udo => udo.TipoTimer == "melaza")
                .ToListAsync();

            var duplicates = allOrders
                .GroupBy(udo => udo.ShipmentId)
                .Where(g => g.Count() > 1)
                .ToList();

            if (!duplicates.Any()) return;

            var idsToRemove = new List<int>();

            foreach (var group in duplicates)
            {
                var ordered = group.OrderByDescending(x => x.UpdatedAt).ThenByDescending(x => x.Id).ToList();
                idsToRemove.AddRange(ordered.Skip(1).Select(x => x.Id));
            }

            if (idsToRemove.Any())
            {
                var toRemove = await context.UnitDisplayOrders
                    .Where(udo => idsToRemove.Contains(udo.Id))
                    .ToListAsync();

                context.UnitDisplayOrders.RemoveRange(toRemove);
                _logger.LogDebug("Deduplicados {Count} registros de UnitDisplayOrders", toRemove.Count);
            }
        }

        private async Task<int> CalculateDisplayOrderForActiveTimer(PiletasDbContext context, int shipmentId)
        {
            // Verificar si ya tiene un orden activo
            var existingActiveOrder = await context.UnitDisplayOrders
                .Where(udo => udo.TipoTimer == "melaza" && udo.ShipmentId == shipmentId && udo.DisplayOrder < 1000)
                .FirstOrDefaultAsync();

            if (existingActiveOrder != null)
            {
                // Si ya tiene un orden activo, mantenerlo
                return existingActiveOrder.DisplayOrder;
            }

            // Obtener el siguiente número en secuencia para timers activos.
            // IMPORTANTE: proyectamos a int? y usamos el null-coalescing para evitar DefaultIfEmpty().
            var maxActiveOrderNullable = await context.UnitDisplayOrders
                .Where(udo => udo.TipoTimer == "melaza" && udo.DisplayOrder < 1000)
                .MaxAsync(udo => (int?)udo.DisplayOrder);

            var maxActiveOrder = maxActiveOrderNullable ?? 0;

            return maxActiveOrder + 1;
        }

        private async Task<int> CalculateDisplayOrderAsync(PiletasDbContext context, bool hasActiveTimer, int currentStatus, DateTimeOffset now, int shipmentId)
        {
            if (hasActiveTimer)
            {
                return await CalculateDisplayOrderForActiveTimer(context, shipmentId);
            }

            var timeComponent = (int)(now.ToUnixTimeSeconds() % 1000);
            return currentStatus switch
            {
                8 => 1000 + timeComponent,
                7 => 2000 + timeComponent,
                _ => 3000 + timeComponent
            };
        }

        private static int GetDisplayCategory(int displayOrder)
        {
            return displayOrder switch
            {
                < 1000 => 1,
                < 2000 => 2,
                < 3000 => 3,
                _ => 4
            };
        }

        private static int GetExpectedCategory(bool hasActiveTimer, int currentStatus)
        {
            if (hasActiveTimer) return 1;
            return currentStatus switch
            {
                8 => 2,
                7 => 3,
                _ => 4
            };
        }

        public async Task UpdateUnitDisplayOrderAsync(int shipmentId, string? codeGen, int currentStatus, string tipoTimer = "melaza", bool? hasActiveTimer = null)
        {
            await _semaphore.WaitAsync();
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<PiletasDbContext>();

                var now = NowSv();

                var existingOrder = await context.UnitDisplayOrders
                    .FirstOrDefaultAsync(udo => udo.ShipmentId == shipmentId && udo.TipoTimer == tipoTimer);

                // Si ya existe y fue actualizado recientemente (menos de 5 segundos), no hacer nada
                if (existingOrder != null && (now - existingOrder.UpdatedAt).TotalSeconds < 5)
                {
                    _logger.LogDebug("Orden recién actualizada, saltando: ShipmentId {ShipmentId}", shipmentId);
                    return;
                }

                // Usar parámetro si se proporciona, sino consultar BD
                bool activeTimer;
                if (hasActiveTimer.HasValue)
                {
                    activeTimer = hasActiveTimer.Value;
                }
                else
                {
                    activeTimer = await context.TimerStates
                        .AnyAsync(t => t.ShipmentId == shipmentId && t.TipoTimer == tipoTimer);
                }

                int baseOrder = await CalculateDisplayOrderAsync(context, activeTimer, currentStatus, now, shipmentId);

                if (existingOrder != null)
                {
                    // Solo actualizar si realmente cambió algo significativo
                    var currentCategory = GetDisplayCategory(existingOrder.DisplayOrder);
                    var newCategory = GetExpectedCategory(activeTimer, currentStatus);

                    if (currentCategory != newCategory || existingOrder.CurrentStatus != currentStatus)
                    {
                        existingOrder.DisplayOrder = baseOrder;
                        existingOrder.CurrentStatus = currentStatus;
                        existingOrder.UpdatedAt = now;
                        existingOrder.CodeGen = codeGen;
                    }
                }
                else
                {
                    var newOrder = new UnitDisplayOrder
                    {
                        ShipmentId = shipmentId,
                        CodeGen = codeGen,
                        TipoTimer = tipoTimer,
                        DisplayOrder = baseOrder,
                        CurrentStatus = currentStatus,
                        CreatedAt = now,
                        UpdatedAt = now
                    };

                    context.UnitDisplayOrders.Add(newOrder);
                }

                try
                {
                    await context.SaveChangesAsync();
                }
                catch (DbUpdateException dbEx)
                {
                    _logger.LogWarning(dbEx, "Conflicto de unicidad al guardar UnitDisplayOrder. Reintentando con actualización.");
                    context.ChangeTracker.Clear();

                    var existing = await context.UnitDisplayOrders
                        .FirstOrDefaultAsync(udo => udo.ShipmentId == shipmentId && udo.TipoTimer == tipoTimer);

                    if (existing != null)
                    {
                        existing.DisplayOrder = baseOrder;
                        existing.CurrentStatus = currentStatus;
                        existing.UpdatedAt = now;
                        existing.CodeGen = codeGen;
                        await context.SaveChangesAsync();
                    }
                    else
                    {
                        throw;
                    }
                }

                _logger.LogDebug("Orden de visualización actualizado: ShipmentId {ShipmentId} -> Orden {Order} (Timer activo: {ActiveTimer})",
                    shipmentId, baseOrder, activeTimer);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error actualizando orden de visualización para shipment {ShipmentId}", shipmentId);
            }
            finally
            {
                _semaphore.Release();
            }
        }

        public async Task CleanupDisplayOrdersAsync(List<int> activeShipmentIds, string tipoTimer = "melaza")
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<PiletasDbContext>();

                await CleanupInSameConnection(context, activeShipmentIds);
                await context.SaveChangesAsync(); // SaveChanges aquí porque no está en transacción
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error en limpieza batch de órdenes y timers");
            }
        }

        public async Task CleanupAllInactiveDisplayOrdersAsync(string tipoTimer = "melaza")
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<PiletasDbContext>();

                // 1. Limpiar UnitDisplayOrders
                var allOrders = await context.UnitDisplayOrders
                    .Where(udo => udo.TipoTimer == tipoTimer)
                    .ToListAsync();

                if (allOrders.Any())
                {
                    context.UnitDisplayOrders.RemoveRange(allOrders);
                    _logger.LogInformation("Limpieza UnitDisplayOrders: Eliminados {Count} registros de {TipoTimer}",
                        allOrders.Count, tipoTimer);
                }

                // 2. Limpiar TimerStates huérfanos (sin unidades activas)
                var allTimers = await context.TimerStates
                    .Where(t => t.TipoTimer == tipoTimer)
                    .ToListAsync();

                if (allTimers.Any())
                {
                    context.TimerStates.RemoveRange(allTimers);
                    _logger.LogInformation("Limpieza TimerStates: Eliminados {Count} timers de {TipoTimer}",
                        allTimers.Count, tipoTimer);
                }

                await context.SaveChangesAsync();

                _logger.LogInformation("Limpieza completa finalizada para {TipoTimer}: {OrdersCount} órdenes y {TimersCount} timers eliminados",
                    tipoTimer, allOrders.Count, allTimers.Count);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error en limpieza completa de DisplayOrders y TimerStates");
            }
        }

        public async Task<bool> LiberarTimerPorShipmentIdAsync(int shipmentId)
        {
            await _semaphore.WaitAsync();
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<PiletasDbContext>();

                var timer = await context.TimerStates
                    .FirstOrDefaultAsync(t => t.ShipmentId == shipmentId);

                if (timer != null)
                {
                    var timerId = timer.TimerId;
                    var codeGen = timer.CodeGen;

                    // 1. Eliminar el timer
                    context.TimerStates.Remove(timer);

                    // 2. Eliminar también el registro de UnitDisplayOrder
                    var displayOrder = await context.UnitDisplayOrders
                        .FirstOrDefaultAsync(udo => udo.ShipmentId == shipmentId && udo.TipoTimer == "melaza");

                    if (displayOrder != null)
                    {
                        context.UnitDisplayOrders.Remove(displayOrder);
                        _logger.LogInformation("Timer y UnitDisplayOrder eliminados para shipment finalizado {ShipmentId}", shipmentId);
                    }
                    else
                    {
                        _logger.LogInformation("Timer eliminado para shipment {ShipmentId} (sin UnitDisplayOrder)", shipmentId);
                    }

                    await context.SaveChangesAsync();

                    _logger.LogInformation("Limpieza completa: Timer {TimerId} y registros asociados eliminados para {ShipmentId} - {CodeGen}",
                        timerId, shipmentId, codeGen);
                    return true;
                }

                _logger.LogDebug("No se encontró timer para shipment {ShipmentId}", shipmentId);
                return false;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error liberando timer y display order para shipment {ShipmentId}", shipmentId);
                return false;
            }
            finally
            {
                _semaphore.Release();
            }
        }

        public void Dispose()
        {
            _semaphore?.Dispose();
        }
    }
}