/*************************************************************
 * TIEMPOS AZÚCAR
 *************************************************************/

const REFRESH_MLS = 20000; // Refrescar datos cada 20 segundos
const USE_INDICATORS = false; // Indicadores de actualizacion
const TIMER_DUR_PLANA_MLS = 9 * 60 * 1000; // 9 minutos para unidades planas
const TIMER_DUR_VOLTEO_MLS = 5 * 60 * 1000; // 5 minutos para unidades de volteo
const MAX_VOLTEO_TIMERS = 2; // Máximo 2 cronómetros de volteo simultáneos
const MAX_PLANA_TIMERS = 1; // Máximo 1 cronómetro de plana simultáneo

let autoRefreshInterval = null;
let autoRefreshEnabled = true;
let modalsOpen = 0;

// Gestión usando shipmentId como clave principal
const intervals = {};  // intervals[shipmentId]
const isRunning = {};  // isRunning[shipmentId]
const lastPerf = {};  // lastPerf[shipmentId]
const startInFlight = {};  // startInFlight[shipmentId]
const shipmentCodeGenMap = {};  // shipmentCodeGenMap[shipmentId] = codeGen
let shipmentTimerIdMap = {};  // shipmentTimerIdMap[shipmentId] = timerId actual (← cambiado a let)

// MODIFICADO: Ahora maneja arrays de shipmentIds para permitir múltiples timers por tipo
const activeTimerByType = { plana: [], volteo: [] }; // Guarda arrays de shipmentIds

let counterLocks = { volteo: false, plano: false };

// Locks extra
const stopInFlight = {}; // stopInFlight[shipmentId]

// Control de auto-refresh concurrente
let refreshInFlight = false;
let lastRefreshTs = 0;
let currentRefreshXhr = null;

/* ------------------ FEEDBACK VISUAL EN BOTONES ------------------ */

/**
 * Pone un botón en estado de carga con spinner y texto
 */
function setButtonLoadingState(btn, loadingText) {
    if (!btn) return;
    btn._originalHTML = btn.innerHTML;
    btn._originalDisabled = btn.disabled;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + loadingText;
    btn.style.opacity = '0.7';
    btn.style.pointerEvents = 'none';
}

/**
 * Restaura un botón a su estado original
 */
function restoreButtonState(btn) {
    if (!btn) return;
    if (btn._originalHTML !== undefined) {
        btn.innerHTML = btn._originalHTML;
        delete btn._originalHTML;
    }
    if (btn._originalDisabled !== undefined) {
        btn.disabled = btn._originalDisabled;
        delete btn._originalDisabled;
    }
    btn.style.opacity = '';
    btn.style.pointerEvents = '';
}

/* ------------------ FUNCIONES AUXILIARES PARA SHIPMENT ID ------------------ */

/**
 * Encuentra el timerId actual para un shipmentId
 */
function findTimerIdByShipmentId(shipmentId) {
    const element = document.querySelector(`[data-shipment-id="${shipmentId}"]`);
    if (element) {
        return element.getAttribute('data-timer-id');
    }
    return shipmentTimerIdMap[shipmentId] || null;
}

/**
 * Encuentra el elemento timer por shipmentId
 */
function findTimerElementByShipmentId(shipmentId) {
    const timerId = findTimerIdByShipmentId(shipmentId);
    return timerId ? document.getElementById(timerId) : null;
}

/**
 * Normaliza y encuentra el id del círculo de progreso a partir del timerId
 */
function computeCircleIdFromTimerId(timerId) {
    if (!timerId) return null;
    const lower = timerId.toLowerCase();
    if (lower.includes('volteo')) {
        return timerId.replace(/timer.*?volteo_/i, 'progressCircleVolteo_');
    } else if (lower.includes('plana')) {
        return timerId.replace(/timer.*?plana_/i, 'progressCirclePlana_');
    } else {
        return timerId.replace(/^timer/i, 'progressCircle');
    }
}

/**
 * Encuentra el elemento círculo por shipmentId
 */
function findCircleElementByShipmentId(shipmentId) {
    const timerId = findTimerIdByShipmentId(shipmentId);
    if (!timerId) return null;
    const circleId = computeCircleIdFromTimerId(timerId);
    return circleId ? document.getElementById(circleId) : null;
}

/**
 * Obtiene el tipo (plana/volteo) por shipmentId
 */
function getTypeByShipmentId(shipmentId) {
    const element = document.querySelector(`[data-shipment-id="${shipmentId}"]`);
    return element ? element.getAttribute('data-tipo') : null;
}

/**
 * Obtiene el codeGen por shipmentId
 */
function getCodeGenByShipmentId(shipmentId) {
    const element = document.querySelector(`[data-shipment-id="${shipmentId}"]`);
    if (element) {
        return element.getAttribute('data-codigo-generacion');
    }
    return shipmentCodeGenMap[shipmentId] || null;
}

/* ------------------ TIMER SYNC MANAGER PARA SINCRONIZACIÓN BD ------------------ */

class TimerSyncManager {
    constructor() {
        this.tipoTimer = 'azucar'; // Diferente de melaza
        this.syncInterval = null;
        this.pendingStartOperations = new Set();
    }

    /**
     * Registra el cronómetro en BD al iniciar
     */
    async startTimerInDB(shipmentId, codeGen, tipoUnidad = 'plana') {
        if (this.pendingStartOperations.has(shipmentId)) {
            console.log(`⚠️ Ya hay operación de inicio pendiente para shipment ${shipmentId}`);
            return null;
        }

        this.pendingStartOperations.add(shipmentId);

        try {
            const timerId = findTimerIdByShipmentId(shipmentId);
            console.log(`🚀 Registrando timer AZÚCAR en BD: shipment ${shipmentId} (${timerId}) - ${codeGen} (${tipoUnidad})`);

            const response = await fetch('/TimerSync/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    timerId: timerId,
                    codeGen: codeGen,
                    shipmentId: shipmentId,
                    tipoTimer: this.tipoTimer,
                    tipoUnidad: tipoUnidad
                })
            });

            const result = await response.json();

            if (result.success) {
                console.log(`✅ Timer AZÚCAR registrado en BD: shipment ${shipmentId} a las ${new Date(result.data.startedAtMilliseconds).toISOString()}`);
                return result.data;
            } else {
                console.error(`❌ Error registrando timer AZÚCAR en BD: ${result.message}`);
                return null;
            }
        } catch (error) {
            console.error(`❌ Error de red registrando timer AZÚCAR shipment ${shipmentId}:`, error);
            return null;
        } finally {
            this.pendingStartOperations.delete(shipmentId);
        }
    }

    /**
     * Elimina el cronómetro de BD al detener
     */
    async stopTimerInDB(shipmentId) {
        try {
            const timerId = findTimerIdByShipmentId(shipmentId);
            console.log(`⏹️ Eliminando timer AZÚCAR de BD: shipment ${shipmentId} (${timerId})`);

            const response = await fetch('/TimerSync/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ timerId: timerId })
            });

            const result = await response.json();

            if (result.success) {
                console.log(`✅ Timer AZÚCAR eliminado de BD: shipment ${shipmentId}`);
                return true;
            } else {
                console.warn(`⚠️ Timer AZÚCAR no encontrado en BD para eliminar: shipment ${shipmentId}`);
                return false;
            }
        } catch (error) {
            console.error(`❌ Error eliminando timer AZÚCAR shipment ${shipmentId} de BD:`, error);
            return false;
        }
    }

    /**
     * Libera cronómetro por shipmentId cuando cambia de estado
     */
    async liberarTimerPorShipmentId(shipmentId) {
        try {
            console.log(`🔄 Liberando timer AZÚCAR por cambio de estado: shipment ${shipmentId}`);

            const response = await fetch(`/TimerSync/liberar/${shipmentId}`, {
                method: 'POST'
            });

            const result = await response.json();

            if (result.success && result.data.liberado) {
                console.log(`✅ Timer AZÚCAR liberado por cambio de estado: shipment ${shipmentId}`);
                return true;
            } else {
                console.log(`⚡ No había timer AZÚCAR activo para liberar: shipment ${shipmentId}`);
                return false;
            }
        } catch (error) {
            console.error(`❌ Error liberando timer AZÚCAR para shipment ${shipmentId}:`, error);
            return false;
        }
    }

    /**
     * Sincroniza cronómetros desde BD
     */
    async syncActiveTimersFromDB() {
        try {
            console.log(`🔍 INICIO sincronización AZÚCAR desde BD para tipo: ${this.tipoTimer}`);
            console.log(`🔗 URL llamada: /TimerSync/active/${this.tipoTimer}`);
            console.log(`🔍 Estado actual isRunning antes de sincronizar:`, isRunning);
            console.log(`🔍 Estado actual activeTimerByType antes de sincronizar:`, activeTimerByType);

            const response = await fetch(`/TimerSync/active/${this.tipoTimer}`);
            console.log(`📡 Respuesta del servidor AZÚCAR:`, response);
            console.log(`📡 Status: ${response.status} ${response.statusText}`);

            if (!response.ok) {
                console.error(`❌ Error HTTP: ${response.status} - ${response.statusText}`);
                const errorText = await response.text();
                console.error(`❌ Error texto:`, errorText);
                return [];
            }

            const result = await response.json();
            console.log(`📦 Resultado JSON AZÚCAR completo:`, result);
            console.log(`📦 result.success:`, result.success);
            console.log(`📦 result.data:`, result.data);
            console.log(`📦 Array.isArray(result.data):`, Array.isArray(result.data));

            if (result.success && Array.isArray(result.data)) {
                console.log(`📊 Timers AZÚCAR activos en BD: ${result.data.length}`);
                console.log(`📋 Lista completa de timers AZÚCAR:`, result.data);

                if (result.data.length === 0) {
                    console.log(`ℹ️ RESULTADO: No hay timers AZÚCAR activos en BD para sincronizar`);

                    // LIMPIEZA: No hay timers en BD, limpiar todo localStorage residual
                    Object.keys(localStorage).forEach(key => {
                        const match = key.match(/^shipment_(\d+)_isRunning$/);
                        if (match && localStorage.getItem(key) === 'true') {
                            clearTimerStateByShipmentId(parseInt(match[1]));
                        }
                    });

                    return [];
                }

                // Verificar cada timer de BD
                for (const dbTimer of result.data) {
                    console.log(`🔍 Procesando timer AZÚCAR de BD:`, dbTimer);

                    const shipmentId = dbTimer.shipmentId;
                    const localRunning = isRunning[shipmentId];
                    console.log(`🔍 Timer AZÚCAR shipment ${shipmentId}: localRunning=${localRunning}`);

                    if (!localRunning) {
                        console.log(`🔄 Timer AZÚCAR encontrado en BD pero no localmente: shipment ${shipmentId}`);

                        // Verificar formato de datos
                        if (!dbTimer.startedAtMilliseconds) {
                            console.error(`❌ startedAtMilliseconds no encontrado en timer AZÚCAR:`, dbTimer);
                            continue;
                        }

                        console.log(`📅 StartedAtMilliseconds: ${dbTimer.startedAtMilliseconds}`);
                        console.log(`📅 Fecha de inicio en BD: ${new Date(dbTimer.startedAtMilliseconds).toISOString()}`);
                        console.log(`📅 Hora actual: ${new Date().toISOString()}`);

                        // Calcular tiempo transcurrido
                        const now = Date.now();
                        const startTime = dbTimer.startedAtMilliseconds;
                        const elapsedMs = Math.max(0, now - startTime);

                        console.log(`⏱️ now: ${now}`);
                        console.log(`⏱️ startTime: ${startTime}`);
                        console.log(`⏱️ elapsedMs: ${elapsedMs}`);
                        console.log(`⏱️ Tiempo transcurrido calculado: ${(elapsedMs / 1000 / 60).toFixed(1)} minutos`);
                        console.log(`⏱️ Formato MM:SS:CS: ${formatTime(elapsedMs)}`);

                        // Detectar tipo de timer basado en el timerId o tipoUnidad
                        let tipo = 'plana'; // default
                        if (dbTimer.tipoUnidad === 'volteo' || (dbTimer.timerId && (dbTimer.timerId.toLowerCase().includes('volteo')))) {
                            tipo = 'volteo';
                        }
                        console.log(`📋 Tipo detectado para timer AZÚCAR: ${tipo}`);

                        // MODIFICADO: Verificar si se puede agregar otro timer del tipo según los límites
                        if (!canAddTimerOfType(tipo)) {
                            console.warn(`⚠️ No se puede agregar otro timer AZÚCAR del tipo ${tipo} (límite alcanzado), saltando shipment ${shipmentId}`);
                            continue;
                        }

                        // Verificar si el elemento UI existe antes de sincronizar
                        const txtEl = findTimerElementByShipmentId(shipmentId);
                        const circleEl = findCircleElementByShipmentId(shipmentId);

                        console.log(`🔍 Elementos UI para timer AZÚCAR shipment ${shipmentId}:`);
                        console.log(`  - txtEl:`, !!txtEl);
                        console.log(`  - circleEl:`, !!circleEl);

                        if (!txtEl && !circleEl) {
                            console.warn(`⚠️ UI no disponible para timer AZÚCAR shipment ${shipmentId}, limpiando de BD...`);
                            this.liberarTimerPorShipmentId(shipmentId).catch(err =>
                                console.error(`⚠️ Error limpiando timer huérfano de BD: shipment ${shipmentId}`, err)
                            );
                            continue;
                        }

                        // Configurar estado local completo ANTES de iniciar
                        shipmentCodeGenMap[shipmentId] = dbTimer.codeGen;
                        if (dbTimer.timerId) {
                            shipmentTimerIdMap[shipmentId] = dbTimer.timerId;
                        }
                        console.log(`📝 Configurando shipmentCodeGenMap[${shipmentId}] = ${dbTimer.codeGen}`);

                        // CRÍTICO: Marcar como corriendo ANTES de guardar estado
                        isRunning[shipmentId] = true;
                        addActiveTimer(shipmentId, tipo);

                        // Guardar estado completo en localStorage
                        saveTimerStateByShipmentId(shipmentId, {
                            cg: dbTimer.codeGen,
                            ms: elapsedMs,
                            le: now,
                            run: true
                        });
                        console.log(`💾 Estado guardado en localStorage para timer AZÚCAR shipment ${shipmentId}`);

                        console.log(`▶️ Marcando isRunning[${shipmentId}] = true, agregando a activeTimerByType[${tipo}]`);

                        // Iniciar cronómetro con tiempo ya transcurrido
                        lastPerf[shipmentId] = performance.now();
                        startInterval(shipmentId, elapsedMs, tipo);
                        console.log(`🎯 startInterval llamado para timer AZÚCAR shipment ${shipmentId} con ${elapsedMs}ms (tipo: ${tipo})`);

                        console.log(`✅ Timer AZÚCAR sincronizado desde BD: shipment ${shipmentId}`);
                        console.log(`📊 Estado final guardado - ms: ${elapsedMs}, running: true, tipo: ${tipo}, formato: ${formatTime(elapsedMs)}`);
                    } else {
                        console.log(`ℹ️ Timer AZÚCAR shipment ${shipmentId} ya está corriendo localmente`);
                    }
                }

                // Limpiar localStorage de shipments que ya no están en BD
                const activeShipmentIds = new Set(result.data.map(t => t.shipmentId));
                Object.keys(localStorage).forEach(key => {
                    const match = key.match(/^shipment_(\d+)_isRunning$/);
                    if (match && localStorage.getItem(key) === 'true') {
                        const sid = parseInt(match[1]);
                        if (!activeShipmentIds.has(sid)) {
                            clearTimerStateByShipmentId(sid);
                            isRunning[sid] = false;
                        }
                    }
                });

                return result.data;
            } else {
                console.log(`⚠️ Respuesta sin éxito o datos no son array:`, result);
                if (result.success === false) {
                    console.error(`❌ Error del servidor AZÚCAR: ${result.message}`);
                }
                return [];
            }
        } catch (error) {
            console.error('❌ Error sincronizando timers AZÚCAR desde BD:', error);
            console.error('❌ Stack trace:', error.stack);
            return [];
        }
    }
}

// Crear instancia global del manager para azúcar
const timerSyncAzucar = new TimerSyncManager();

/* ------------------ FUNCIONES DE GESTIÓN DE BOTONES - USANDO SHIPMENT ID - MODIFICADAS ------------------ */

/**
 * MODIFICADO: Verifica si se puede agregar otro timer del tipo especificado
 */
function canAddTimerOfType(tipo) {
    const currentCount = activeTimerByType[tipo].length;
    const maxAllowed = (tipo === 'volteo') ? MAX_VOLTEO_TIMERS : MAX_PLANA_TIMERS;

    // Verificar límite básico del tipo
    if (currentCount >= maxAllowed) {
        console.log(`⚠️ Límite de timers ${tipo} alcanzado: ${currentCount}/${maxAllowed}`);
        return false;
    }

    // REGLA ESPECIAL: Si hay 2 volteos activos, no se puede iniciar plana
    if (tipo === 'plana' && activeTimerByType.volteo.length >= 2) {
        console.log(`⚠️ No se puede iniciar timer plana: hay ${activeTimerByType.volteo.length} volteos activos`);
        return false;
    }

    // REGLA ESPECIAL: Si hay 1 plana activa y se quiere agregar un segundo volteo, no se permite
    if (tipo === 'volteo' && activeTimerByType.plana.length > 0 && activeTimerByType.volteo.length >= 1) {
        console.log(`⚠️ No se puede iniciar segundo timer volteo: hay ${activeTimerByType.plana.length} plana activa`);
        return false;
    }

    return true;
}

/**
 * MODIFICADO: Agrega un timer como activo del tipo
 */
function addActiveTimer(shipmentId, tipo) {
    if (!activeTimerByType[tipo].includes(shipmentId)) {
        activeTimerByType[tipo].push(shipmentId);
        console.log(`➕ Timer shipment ${shipmentId} agregado como activo de tipo ${tipo}. Total ${tipo}: ${activeTimerByType[tipo].length}`);
    }
}

/**
 * MODIFICADO: Remueve el timer activo del tipo
 */
function removeActiveTimer(shipmentId, tipo) {
    const index = activeTimerByType[tipo].indexOf(shipmentId);
    if (index > -1) {
        activeTimerByType[tipo].splice(index, 1);
        console.log(`➖ Timer shipment ${shipmentId} removido como activo de tipo ${tipo}. Total ${tipo}: ${activeTimerByType[tipo].length}`);
    }
}

/**
 * MODIFICADO: Verifica si hay algún timer corriendo del tipo especificado
 */
function anyTimerRunningOfType(tipo) {
    return activeTimerByType[tipo].length > 0;
}

/**
 * MODIFICADO: Obtiene el número de timers activos del tipo especificado
 */
function getActiveTimerCountOfType(tipo) {
    return activeTimerByType[tipo].length;
}

/**
 * MODIFICADO: Asigna un timer como el activo del tipo (funcionalidad legacy mantenida para compatibilidad)
 */
function setActiveTimer(shipmentId, tipo) {
    addActiveTimer(shipmentId, tipo);
}

/* ------------------ Indicadores opcionales ------------------ */
function showRefreshIndicator() {
    if (!USE_INDICATORS) return;
    let indicator = document.getElementById('refreshIndicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'refreshIndicator';
        indicator.innerHTML = `
            <div style="position: fixed; top: 20px; right: 20px; z-index: 9999; 
                        background: rgba(0,123,255,0.9); color: white; 
                        padding: 8px 12px; border-radius: 5px; font-size: 13px;
                        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                        animation: fadeIn 0.3s ease;">
                <i class="fas fa-sync fa-spin"></i> Actualizando...
            </div>
        `;
        document.body.appendChild(indicator);
    } else {
        indicator.style.display = 'block';
    }
}
function hideRefreshIndicator() {
    if (!USE_INDICATORS) return;
    const indicator = document.getElementById('refreshIndicator');
    if (indicator) indicator.style.display = 'none';
}
function showUpdateNotification() {
    if (!USE_INDICATORS) return;
    const notification = document.createElement('div');
    notification.innerHTML = `
        <div style="position: fixed; top: 20px; right: 20px; z-index: 10000; 
                    background: rgba(40,167,69,0.95); color: white; 
                    padding: 12px 18px; border-radius: 6px; font-size: 14px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    animation: slideInRight 0.3s ease;">
            <i class="fas fa-check-circle"></i> Datos actualizados
        </div>
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}
function showRefreshError() {
    if (!USE_INDICATORS) return;
    const errorIndicator = document.createElement('div');
    errorIndicator.innerHTML = `
        <div style="position: fixed; top: 20px; right: 20px; z-index: 9999; 
                    background: rgba(220,53,69,0.9); color: white; 
                    padding: 10px 15px; border-radius: 5px; font-size: 14px;">
            <i class="fas fa-exclamation-triangle"></i> Error al actualizar
        </div>
    `;
    document.body.appendChild(errorIndicator);
    setTimeout(() => { if (errorIndicator.parentNode) document.body.removeChild(errorIndicator); }, 4000);
}

/* ------------------ Alertas SweetAlert ------------------ */
function showSuccessAlert(message) {
    return Swal.fire({
        icon: 'success',
        title: '¡Éxito!',
        text: message,
        confirmButtonText: 'Aceptar',
        confirmButtonColor: '#28a745'
    });
}
function showErrorAlert(message) {
    return Swal.fire({
        icon: 'error',
        title: 'Error',
        text: message,
        confirmButtonText: 'Aceptar',
        confirmButtonColor: '#dc3545'
    });
}
function showWarningAlert(message) {
    return Swal.fire({
        icon: 'warning',
        title: 'Advertencia',
        text: message,
        confirmButtonText: 'Aceptar',
        confirmButtonColor: '#3085d6'
    });
}

/**
 * MODIFICADO: Mensaje de espera más específico basado en los límites actuales
 */
function showWaitMessage(tipo) {
    const currentCount = getActiveTimerCountOfType(tipo);
    const otherType = (tipo === 'volteo') ? 'plana' : 'volteo';
    const otherCount = getActiveTimerCountOfType(otherType);

    let message;

    if (tipo === 'plana' && otherCount >= 2) {
        message = `No se puede iniciar PLANA mientras hay ${otherCount} VOLTEOS activos.`;
    } else if (tipo === 'volteo' && otherCount > 0 && currentCount >= 1) {
        message = `No se puede iniciar segundo VOLTEO mientras hay ${otherCount} PLANA activa.`;
    } else {
        message = 'Espera a que termine alguna unidad.';
    }

    showWarningAlert(message);
}

/* ------------------ Helpers AJAX ------------------ */
async function postJson(url, body) {
    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
    });
    const txt = await resp.text();
    let json = {};
    try { json = txt ? JSON.parse(txt) : {}; } catch { json = {}; }

    if (!resp.ok) {
        const msg = json.message || `HTTP ${resp.status}`;
        throw new Error(msg);
    }
    if (typeof json.success === 'boolean' && !json.success) {
        throw new Error(json.message || 'Error en la operación');
    }
    return json;
}

/* ------------------ Auto refresh - CORREGIDO ------------------ */
function anyTimerRunning() {
    return Object.values(isRunning).some(running => running);
}

function startAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(() => {
        if (!autoRefreshEnabled) return;
        if (modalsOpen > 0) {
            console.log('Auto-refresh pausado: modales abiertos');
            return;
        }
        // SIEMPRE refrescar, sin importar si hay cronómetros activos
        console.log('🔄 Ejecutando refresh automático cada 30 segundos...');
        refreshView();
    }, REFRESH_MLS);
}

function pauseAllIntervals() {
    Object.keys(intervals).forEach(id => {
        if (intervals[id]) {
            clearInterval(intervals[id]);
            intervals[id] = null;
        }
    });
}

function refreshView() {
    if (refreshInFlight) {
        console.log('Refresh omitido: hay una actualización en curso');
        return;
    }

    if (currentRefreshXhr) {
        try { currentRefreshXhr.abort(); } catch (_) { }
        currentRefreshXhr = null;
    }

    // showRefreshIndicator();
    const startedAt = Date.now();
    refreshInFlight = true;

    // Guardar posición de scroll para UX
    const prevScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;

    currentRefreshXhr = $.ajax({
        type: "GET",
        url: window.location.pathname,
        cache: false,
        timeout: 15000,
        success: function (response) {
            try {
                // Ignorar si existe un refresh más nuevo ya aplicado
                if (startedAt < lastRefreshTs) return;
                lastRefreshTs = startedAt;

                const searchValue = $('#searchInput').length ? $('#searchInput').val() : null;

                // Pausar intervalos antes de re-render
                pauseAllIntervals();

                const newMain = $(response).find('main').html();

                if (newMain) {
                    $('main').html(newMain);

                    // Restaurar búsqueda
                    if (searchValue) {
                        $('#searchInput').val(searchValue);
                        filterCards();
                    }
                    console.log('Vista AZÚCAR actualizada correctamente');
                    // showUpdateNotification();
                } else {
                    console.warn('No se encontró contenido <main> para actualizar');
                }

                bindTimerButtons();
                bindSolicitudesBtns();
            } catch (err) {
                console.error('Error procesando respuesta:', err);
            } finally {
                // hideRefreshIndicator();

                // Detectar y limpiar timers huérfanos ANTES de restaurar desde localStorage
                detectAndCleanOrphanedTimers();

                initTimersFromStorage();

                // Sincronizar cronómetros AZÚCAR desde BD después del refresh
                timerSyncAzucar.syncActiveTimersFromDB().catch(err =>
                    console.error('❌ Error en syncActiveTimersFromDB() AZÚCAR', err)
                );

                // Restaurar scroll
                window.scrollTo(0, prevScrollY);
            }
        },
        error: function (xhr, status, error) {
            if (status === 'abort') {
                console.log('Refresh abortado por una nueva actualización');
            } else {
                console.error('Error al actualizar datos:', error);
                // hideRefreshIndicator();
                if (status !== 'timeout' && status !== 'abort') {
                    showRefreshError();
                }
            }
        },
        complete: function () {
            refreshInFlight = false;
            currentRefreshXhr = null;
        }
    });
}

/* ------------------ Buscador ------------------ */
function filterCards() {
    const input = document.getElementById("searchInput");
    if (!input) return;

    const searchValue = input.value.toLowerCase().trim();
    if (searchValue) sessionStorage.setItem('searchValue', searchValue);
    else sessionStorage.removeItem('searchValue');

    const cards = document.querySelectorAll(".unit-card-wrapper");
    let visible = 0;
    cards.forEach(c => {
        const isVisible = !searchValue || c.innerText.toLowerCase().includes(searchValue);
        c.style.display = isVisible ? "" : "none";
        if (isVisible) visible++;
    });

    updateSearchResults(visible, cards.length);
}
function restoreSearchValue() {
    const saved = sessionStorage.getItem('searchValue');
    const input = document.getElementById('searchInput');
    if (saved && input) {
        input.value = saved;
        filterCards();
    }
}
function updateSearchResults(visibleCount, totalCount) {
    const prev = document.getElementById('searchResultsMessage');
    if (prev) prev.remove();

    const input = document.getElementById('searchInput');
    if (input && input.value.trim()) {
        const msg = document.createElement('div');
        msg.id = 'searchResultsMessage';
        msg.className = 'alert alert-info text-center mt-3';
        msg.innerHTML = `
            <i class="fas fa-search"></i> 
            Mostrando ${visibleCount} de ${totalCount} transacciones
            ${visibleCount === 0 ? '<br><small>No se encontraron resultados</small>' : ''}
        `;
        const container = document.querySelector('.search-container');
        if (container) container.insertAdjacentElement('afterend', msg);
    }
}

/* ------------------ Modales ------------------ */
function setupModalEvents() {
    $(document).on('show.bs.modal', '.modal', function () {
        modalsOpen++;
        console.log('Modal abierto. Total:', modalsOpen);
    });
    $(document).on('hidden.bs.modal', '.modal', function () {
        modalsOpen = Math.max(0, modalsOpen - 1);
        console.log('Modal cerrado. Total:', modalsOpen);
    });
}

/* ------------------ Timers persistentes - USANDO SHIPMENT ID - CORREGIDO ------------------ */
function loadTimerStateByShipmentId(shipmentId) {
    const ms = parseInt(localStorage.getItem(`shipment_${shipmentId}_milliseconds`)) || 0;
    const run = localStorage.getItem(`shipment_${shipmentId}_isRunning`) === 'true';
    const le = parseInt(localStorage.getItem(`shipment_${shipmentId}_lastEpoch`)) || 0;
    const cg = localStorage.getItem(`shipment_${shipmentId}_codeGen`) || null;
    return { ms, run, le, cg };
}

function saveTimerStateByShipmentId(shipmentId, obj) {
    if (obj.ms !== undefined) localStorage.setItem(`shipment_${shipmentId}_milliseconds`, obj.ms.toString());
    if (obj.run !== undefined) localStorage.setItem(`shipment_${shipmentId}_isRunning`, obj.run ? 'true' : 'false');
    if (obj.le !== undefined) localStorage.setItem(`shipment_${shipmentId}_lastEpoch`, obj.le.toString());
    if (obj.cg !== undefined) {
        if (obj.cg === null) {
            localStorage.removeItem(`shipment_${shipmentId}_codeGen`);
        } else {
            localStorage.setItem(`shipment_${shipmentId}_codeGen`, obj.cg);
        }
    }
}

function clearTimerStateByShipmentId(shipmentId) {
    console.log(`🗑️ clearTimerStateByShipmentId(${shipmentId}) - Eliminando keys del localStorage...`);
    localStorage.removeItem(`shipment_${shipmentId}_milliseconds`);
    localStorage.removeItem(`shipment_${shipmentId}_isRunning`);
    localStorage.removeItem(`shipment_${shipmentId}_lastEpoch`);
    localStorage.removeItem(`shipment_${shipmentId}_codeGen`);
    localStorage.removeItem(`shipment_${shipmentId}_truckType`);
    console.log(`🗑️ Keys eliminadas: shipment_${shipmentId}_milliseconds, _isRunning, _lastEpoch, _codeGen, _truckType`);
}

/**
 * FUNCIÓN CORREGIDA: Evita procesar elementos duplicados usando Set y maneja arrays de timers activos
 */
function initTimersFromStorage() {
    console.log('🔄 Inicializando timers AZÚCAR desde localStorage usando shipmentId...');

    // MODIFICADO: Limpiar arrays de activos antes de reconstruir
    activeTimerByType.plana = [];
    activeTimerByType.volteo = [];

    // Resetear mapa para evitar basura antigua tras un refresh
    shipmentTimerIdMap = {};

    // CRÍTICO: Usar Set para evitar procesar shipmentIds duplicados
    const processedShipmentIds = new Set();

    // Buscar todos los elementos con data-shipment-id
    document.querySelectorAll('[data-shipment-id]').forEach(element => {
        const shipmentId = parseInt(element.getAttribute('data-shipment-id'));
        const tipo = element.getAttribute('data-tipo');
        const timerId = element.getAttribute('data-timer-id');

        if (!shipmentId || !tipo || !timerId) return;

        // EVITAR PROCESAR DUPLICADOS
        if (processedShipmentIds.has(shipmentId)) {
            console.log(`⚠️ Shipment ${shipmentId} ya procesado, saltando elemento duplicado`);
            return;
        }
        processedShipmentIds.add(shipmentId);

        // Mapear shipmentId -> timerId para referencias futuras
        shipmentTimerIdMap[shipmentId] = timerId;

        const state = loadTimerStateByShipmentId(shipmentId);
        shipmentCodeGenMap[shipmentId] = state.cg;

        const txtEl = findTimerElementByShipmentId(shipmentId);
        const circleEl = findCircleElementByShipmentId(shipmentId);

        console.log(`🔍 Inicializando shipment ${shipmentId} (${tipo}) - txtEl: ${!!txtEl}, circleEl: ${!!circleEl}`);

        if (state.run && txtEl && circleEl) {
            let ms = state.ms;
            if (state.le) ms += (Date.now() - state.le);
            ms = Math.max(0, ms);
            saveTimerStateByShipmentId(shipmentId, { ms, le: Date.now(), run: true });
            lastPerf[shipmentId] = performance.now();

            // Restaurar siempre: el estado ya era válido antes del refresh.
            // La validación de límites solo aplica al INICIAR un timer nuevo (botón start).
            isRunning[shipmentId] = true;
            addActiveTimer(shipmentId, tipo);
            startInterval(shipmentId, ms, tipo);
            console.log(`▶️ Timer AZÚCAR restaurado desde localStorage: shipment ${shipmentId} (${tipo}) con ${(ms / 1000 / 60).toFixed(1)} min`);
        } else if (txtEl) {
            updateTimerDisplay(shipmentId, state.ms);
        }
    });

    console.log('✅ Inicialización desde localStorage completada');
    console.log('🔍 Estado activeTimerByType:', activeTimerByType);
    console.log('🔍 Estado isRunning final:', isRunning);
}

/* ------------------ Auto-limpieza de timers huérfanos ------------------ */

/**
 * Detecta timers marcados como corriendo en localStorage cuyo envío ya no
 * está presente en el DOM (porque cambió de status externamente, ej: 8 → 11).
 * Limpia localStorage y estado en memoria de forma SÍNCRONA para que
 * initTimersFromStorage() no los restaure, y lanza el guardado de tiempo
 * + limpieza de SQLite de forma ASÍNCRONA (fire-and-forget).
 */
function detectAndCleanOrphanedTimers() {
    const orphaned = [];

    Object.keys(localStorage).forEach(key => {
        const match = key.match(/^shipment_(\d+)_isRunning$/);
        if (match && localStorage.getItem(key) === 'true') {
            const shipmentId = parseInt(match[1]);

            // Si NO existe elemento DOM para este shipment → huérfano
            const element = document.querySelector(`[data-shipment-id="${shipmentId}"]`);
            if (!element) {
                const state = loadTimerStateByShipmentId(shipmentId);
                let ms = state.ms;
                if (state.le) ms += (Date.now() - state.le);
                ms = Math.max(0, ms);

                const truckType = localStorage.getItem(`shipment_${shipmentId}_truckType`) || null;

                orphaned.push({
                    shipmentId,
                    codeGen: state.cg,
                    ms,
                    truckType
                });

                // Limpieza SÍNCRONA de localStorage
                clearTimerStateByShipmentId(shipmentId);

                // Limpieza de estado en memoria
                isRunning[shipmentId] = false;
                removeActiveTimer(shipmentId, 'plana');
                removeActiveTimer(shipmentId, 'volteo');
                if (intervals[shipmentId]) {
                    clearInterval(intervals[shipmentId]);
                    delete intervals[shipmentId];
                }
                delete shipmentCodeGenMap[shipmentId];
                delete shipmentTimerIdMap[shipmentId];

                console.log(`🧹 Timer huérfano AZÚCAR detectado: shipment ${shipmentId} (${(ms / 1000 / 60).toFixed(1)} min acumulados)`);
            }
        }
    });

    if (orphaned.length > 0) {
        console.log(`🧹 ${orphaned.length} timer(s) huérfano(s) AZÚCAR detectados, guardando tiempos...`);
        saveOrphanedTimersAsync(orphaned);
    }
}

/**
 * Guarda el tiempo acumulado de timers huérfanos en el backend (sin cambiar status)
 * y limpia los registros de SQLite. Es fire-and-forget: si falla, solo logea warning.
 */
async function saveOrphanedTimersAsync(orphaned) {
    for (const timer of orphaned) {
        // Guardar tiempo en backend (sin llamar changeStatusAzucar)
        if (timer.codeGen && timer.shipmentId && timer.truckType && timer.ms > 0) {
            try {
                const tiempo = formatTimeForBackend(timer.ms);
                await postJson('/TiemposAzucar/TiempoAzucar', {
                    codigoGeneracion: timer.codeGen,
                    tiempo: tiempo,
                    comentario: 'Finalizar descarga/carga automaticamente',
                    shipmentId: timer.shipmentId,
                    truckType: timer.truckType
                });
                console.log(`✅ Tiempo AZÚCAR guardado automáticamente para shipment ${timer.shipmentId}: ${tiempo}`);
            } catch (err) {
                console.error(`⚠️ Error guardando tiempo AZÚCAR para shipment ${timer.shipmentId}:`, err);
            }
        } else {
            console.warn(`⚠️ Datos incompletos para guardar tiempo de shipment ${timer.shipmentId}, limpiando sin guardar`);
        }

        // Limpiar SQLite (siempre, aunque falle el guardado de tiempo)
        try {
            await timerSyncAzucar.liberarTimerPorShipmentId(timer.shipmentId);
        } catch (err) {
            console.error(`⚠️ Error limpiando SQLite AZÚCAR para shipment ${timer.shipmentId}:`, err);
        }
    }
}

function startInterval(shipmentId, msStart, tipo) {
    const txtEl = findTimerElementByShipmentId(shipmentId);
    const circleEl = findCircleElementByShipmentId(shipmentId);
    const duration = (tipo === 'plana') ? TIMER_DUR_PLANA_MLS : TIMER_DUR_VOLTEO_MLS;

    console.log(`🎯 startInterval para shipment ${shipmentId}:`);
    console.log(`  - txtEl: ${!!txtEl}`);
    console.log(`  - circleEl: ${!!circleEl}`);

    if (!txtEl || !circleEl) {
        console.error(`❌ No se encontraron elementos UI para shipment ${shipmentId}`);
        return;
    }

    // CRÍTICO: Asegurar que isRunning esté marcado como true
    isRunning[shipmentId] = true;
    if (intervals[shipmentId]) clearInterval(intervals[shipmentId]);

    let ms = msStart;
    lastPerf[shipmentId] = performance.now();

    // Actualizar display inmediatamente
    updateTimerDisplay(shipmentId, ms);
    const angle0 = (ms / duration) * 360;
    circleEl.style.background = `conic-gradient(${getColor(ms, duration, tipo)} ${angle0}deg, #f0f0f0 ${angle0}deg)`;

    intervals[shipmentId] = setInterval(() => {
        const nowp = performance.now();
        const diff = nowp - lastPerf[shipmentId];
        lastPerf[shipmentId] = nowp;
        ms += diff;
        ms = Math.max(0, ms);

        saveTimerStateByShipmentId(shipmentId, { ms, le: Date.now(), run: true });

        const angle = (ms / duration) * 360;
        if (circleEl) {
            circleEl.style.background = `conic-gradient(${getColor(ms, duration, tipo)} ${angle}deg, #f0f0f0 ${angle}deg)`;
        }
        updateTimerDisplay(shipmentId, ms);
    }, 50);

    console.log(`🎯 Intervalo AZÚCAR iniciado para shipment ${shipmentId} (${tipo}) con ${(ms / 1000 / 60).toFixed(1)} min transcurridos`);
    console.log(`✅ isRunning[${shipmentId}] = ${isRunning[shipmentId]}`);
}

function updateTimerDisplay(shipmentId, ms) {
    const el = findTimerElementByShipmentId(shipmentId);
    if (!el) return;
    el.textContent = formatTime(ms);
}

/**
 * Formatea el tiempo para mostrar en la UI en formato MM:SS:CS (minutos:segundos:centésimas)
 * ESTA FUNCIÓN SOLO PARA MOSTRAR EN LA INTERFAZ
 */
function formatTime(ms) {
    ms = Math.max(0, ms);
    const m = Math.floor(ms / 60000); // minutos
    const s = Math.floor((ms % 60000) / 1000); // segundos
    const cs = Math.floor((ms % 1000) / 10); // centésimas de segundo
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(cs).padStart(2, '0')}`;
}

/**
 * Formatea el tiempo para enviar al backend en formato HH:MM:SS (horas:minutos:segundos)
 * ESTA FUNCIÓN SOLO PARA ENVIAR AL BACKEND
 */
function formatTimeForBackend(ms) {
    ms = Math.max(0, ms);
    const h = Math.floor(ms / 3600000); // horas
    const m = Math.floor((ms % 3600000) / 60000); // minutos
    const s = Math.floor((ms % 60000) / 1000); // segundos
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getColor(ms, dur, tipo) {
    const warn = (tipo === 'plana') ? TIMER_DUR_PLANA_MLS : TIMER_DUR_VOLTEO_MLS;
    if (ms < warn / 2) return "#00da5c";
    if (ms < warn) return "#ff7300";
    return "#ff0000";
}

/* --------- Flujos de inicio - USANDO SHIPMENT ID - MODIFICADO --------- */
function abrirModalBarrido(buttonStart) {
    const requires = buttonStart.getAttribute('data-requires-sweeping');
    const codeGen = buttonStart.getAttribute('data-codigo-generacion');
    const tipo = buttonStart.getAttribute('data-tipo');
    const shipmentId = parseInt(buttonStart.getAttribute('data-shipment-id'));

    if (!shipmentId || !tipo) {
        console.error('❌ shipmentId o tipo no encontrado en el botón');
        showErrorAlert('Datos del shipment no encontrados');
        return;
    }

    console.log(`🚀 Intentando iniciar timer: shipment ${shipmentId} (${tipo}) para ${codeGen}`);

    // VALIDACIÓN 1: MODIFICADA - Verificar si se puede agregar otro timer del tipo según los nuevos límites
    if (!canAddTimerOfType(tipo)) {
        console.warn(`⚠️ No se puede iniciar timer ${tipo}: límites alcanzados`);
        showWaitMessage(tipo);
        return;
    }

    // VALIDACIÓN 2: Verificar si ESTE cronómetro específico ya está corriendo
    if (isRunning[shipmentId]) {
        console.warn(`⚠️ El cronómetro shipment ${shipmentId} ya está corriendo`);
        showWarningAlert(`Este cronómetro ya está en funcionamiento`);
        return;
    }

    // Si pasa las validaciones, proceder con el modal
    abrirModalBarridoCustom(shipmentId, codeGen, requires, tipo);
}

function abrirModalBarridoCustom(shipmentId, codeGen, requires, tipo) {
    shipmentCodeGenMap[shipmentId] = codeGen;
    saveTimerStateByShipmentId(shipmentId, { cg: codeGen });

    $('#barridoModal').modal('show');

    document.getElementById('confirmBarrido').onclick = function () {
        const seleccion = document.getElementById('tipoBarrido').value; // "SENCILLO" o "DOBLE"
        // requires viene como 'S' (doble) o 'N' (sencillo) del backend
        const mismatch = (requires === 'S' && seleccion === 'SENCILLO') || (requires === 'N' && seleccion === 'DOBLE');

        if (mismatch) {
            Swal.fire({
                title: '¿Estás seguro?',
                text: 'El tipo de barrido seleccionado no coincide con el requerido. ¿Deseas continuar?',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Sí, continuar',
                cancelButtonText: 'Cancelar'
            }).then(result => {
                if (result.isConfirmed) {
                    $('#barridoModal').modal('hide');
                    pedirComentarioYIniciar(shipmentId, codeGen, seleccion, tipo);
                }
            });
        } else {
            $('#barridoModal').modal('hide');
            startTimerFlow(shipmentId, codeGen, seleccion, '', tipo);
        }
    };
}

function pedirComentarioYIniciar(shipmentId, codeGen, sweepingType, tipo) {
    Swal.fire({
        title: 'Ingrese su comentario',
        input: 'textarea',
        inputPlaceholder: 'Escribe tu comentario...',
        showCancelButton: true,
        confirmButtonText: 'Enviar',
        cancelButtonText: 'Cancelar'
    }).then(res => {
        if (res.isConfirmed) {
            startTimerFlow(shipmentId, codeGen, sweepingType, res.value || '', tipo);
        } else {
            $('#barridoModal').modal('show');
        }
    });
}

function startTimerFlow(shipmentId, codeGen, sweepingType, changeReason, tipo) {
    if (!shipmentId) return;
    if (startInFlight[shipmentId]) {
        console.warn(`⚠️ Start ya en proceso para shipment ${shipmentId}`);
        return;
    }
    startInFlight[shipmentId] = true;

    console.log(`🚀 Iniciando flujo de timer: shipment ${shipmentId} (${tipo}) para ${codeGen}`);

    // MODIFICADO: Doble verificación antes de iniciar usando las nuevas reglas
    if (!canAddTimerOfType(tipo)) {
        console.error(`❌ No se puede agregar timer ${tipo}, cancelando inicio`);
        showWaitMessage(tipo);
        startInFlight[shipmentId] = false;
        return;
    }

    if (isRunning[shipmentId]) {
        console.error(`❌ Timer shipment ${shipmentId} ya está corriendo, cancelando inicio`);
        showWarningAlert(`Este cronómetro ya está en funcionamiento`);
        startInFlight[shipmentId] = false;
        return;
    }

    // Feedback visual: mostrar estado de carga en el botón start
    const startBtn = document.querySelector(`.timer-start-btn[data-shipment-id="${shipmentId}"]`);
    setButtonLoadingState(startBtn, 'Iniciando...');

    sweepinglog(codeGen, sweepingType, changeReason || '')
        .then(async () => {
            const txtEl = findTimerElementByShipmentId(shipmentId);
            const circleEl = findCircleElementByShipmentId(shipmentId);

            if (!txtEl || !circleEl) {
                showErrorAlert("No se encontró contenedor de cronómetro. Recarga la página.");
                startInFlight[shipmentId] = false;
                return;
            }

            // PASO 1: Registrar en BD primero
            const dbResult = await timerSyncAzucar.startTimerInDB(shipmentId, codeGen, tipo);
            if (!dbResult) {
                console.warn(`⚠️ No se pudo registrar timer AZÚCAR en BD, continuando solo localmente`);
            }

            // PASO 2: Configurar estado local
            shipmentCodeGenMap[shipmentId] = codeGen;
            const truckType = (tipo === 'volteo') ? 'V' : 'R';
            saveTimerStateByShipmentId(shipmentId, {
                cg: codeGen,
                ms: loadTimerStateByShipmentId(shipmentId).ms || 0,
                le: Date.now(),
                run: true
            });
            localStorage.setItem(`shipment_${shipmentId}_truckType`, truckType);

            // PASO 3: MODIFICADO - Marcar como corriendo y agregar al array de activos del tipo
            isRunning[shipmentId] = true;
            addActiveTimer(shipmentId, tipo);

            // PASO 4: Iniciar intervalo
            startInterval(shipmentId, loadTimerStateByShipmentId(shipmentId).ms || 0, tipo);

            console.log(`✅ Cronómetro AZÚCAR iniciado exitosamente: shipment ${shipmentId} (${tipo})`);
            console.log(`📊 Estado activeTimerByType:`, activeTimerByType);
        })
        .catch(err => {
            console.error("Error en sweepinglog:", err);
            if (err.name === 'AbortError') {
                showWarningAlert('Operación cancelada, inténtalo de nuevo.');
            } else {
                showErrorAlert(err.message || 'Error al registrar barrido');
            }
            restoreButtonState(startBtn);
        })
        .finally(() => {
            startInFlight[shipmentId] = false;
        });
}

/* --------- Stop - USANDO SHIPMENT ID --------- */
function stopTimerFlow(btnElement) {
    const btn = typeof btnElement === 'string' ? document.getElementById(btnElement) : btnElement;
    if (!btn) {
        showErrorAlert('Botón de detener no encontrado');
        return;
    }

    const codeGen = btn.getAttribute('data-codigo-generacion');
    const shipmentId = parseInt(btn.getAttribute('data-shipment-id'));
    const tipo = btn.getAttribute('data-tipo');
    const truckType = btn.getAttribute('data-truck-type');

    console.log(`🛑 Intentando detener timer: shipment ${shipmentId} (${tipo}) para ${codeGen}`);
    console.log(`🔍 Datos del botón:`, { codeGen, shipmentId, tipo, truckType });

    // LOCK para evitar doble click en STOP
    if (stopInFlight[shipmentId]) {
        console.warn(`⚠️ Stop ya en proceso para shipment ${shipmentId}`);
        return;
    }

    // VALIDACIÓN 1: Verificar que el shipment ID esté presente
    if (!shipmentId) {
        console.error('❌ Shipment ID no encontrado');
        showErrorAlert('ID de shipment no encontrado');
        return;
    }

    // VALIDACIÓN 2: Verificar que el código de generación esté presente
    if (!codeGen) {
        console.error('❌ Código de generación no encontrado');
        showErrorAlert('Código de generación no encontrado');
        return;
    }

    // VALIDACIÓN 3: Verificar que el tipo de camión esté presente
    if (!truckType) {
        console.error('❌ Truck type no encontrado');
        showErrorAlert('Tipo de camión no encontrado');
        return;
    }

    // VALIDACIÓN 4: Verificar que ESTE timer específico esté corriendo
    if (!isRunning[shipmentId]) {
        console.error(`❌ Timer shipment ${shipmentId} NO está corriendo, no se puede detener`);
        console.log(`🔍 Estado isRunning:`, isRunning);
        showWarningAlert('Este cronómetro no está en funcionamiento');
        return;
    }

    // VALIDACIÓN 5: Verificar que haya tiempo registrado para enviar
    let state = loadTimerStateByShipmentId(shipmentId);
    let ms = state.ms;
    if (state.run && state.le) ms += Date.now() - state.le;

    if (ms <= 0) {
        console.error(`❌ No hay tiempo registrado para enviar: ${ms}ms`);
        showErrorAlert('No hay tiempo registrado para este cronómetro');
        return;
    }

    console.log(`✅ Timer shipment ${shipmentId} está corriendo y tiene tiempo válido (${ms}ms), puede detenerse`);

    // Feedback visual: mostrar estado de carga en el botón
    setButtonLoadingState(btn, 'Deteniendo...');

    // CRÍTICO: SIEMPRE usar formatTimeForBackend para enviar al servidor
    const tiempoParaBackend = formatTimeForBackend(ms);
    const tiempoParaMostrar = formatTime(ms);
    const threshold = (tipo === 'plana') ? TIMER_DUR_PLANA_MLS : TIMER_DUR_VOLTEO_MLS;

    console.log(`⏱️ Timer shipment ${shipmentId} - Tiempo calculado: ${ms}ms`);
    console.log(`📤 Tiempo para backend (HH:MM:SS): ${tiempoParaBackend}`);
    console.log(`👀 Tiempo para mostrar (MM:SS:CS): ${tiempoParaMostrar}`);

    const finalizeStop = async (motivo = '') => {
        stopInFlight[shipmentId] = true;
        try {
            console.log(`🛑 Finalizando stop para timer shipment ${shipmentId}...`);

            // PASO 1: Detener cronómetro local
            clearInterval(intervals[shipmentId]);
            intervals[shipmentId] = null;
            isRunning[shipmentId] = false;
            saveTimerStateByShipmentId(shipmentId, { run: false });

            // PASO 2: MODIFICADO - Remover del array de activos del tipo ANTES de enviar al servidor
            removeActiveTimer(shipmentId, tipo);

            // PASO 3: Limpiar UI
            const circleEl = findCircleElementByShipmentId(shipmentId);
            const txtEl = findTimerElementByShipmentId(shipmentId);

            console.log(`🧹 Limpiando UI para shipment ${shipmentId}:`);
            console.log(`  - txtEl: ${!!txtEl}`);
            console.log(`  - circleEl: ${!!circleEl}`);

            if (circleEl) {
                circleEl.style.background = `conic-gradient(#f0f0f0 0deg, #f0f0f0 0deg)`;
                console.log(`✅ Círculo reseteado`);
            }
            if (txtEl) {
                txtEl.textContent = "00:00:00";
                console.log(`✅ Texto reseteado`);
            }

            // PASO 4: Enviar al servidor (CRÍTICO: usar formato HH:MM:SS)
            await TiempoAzucar(codeGen, tiempoParaBackend, motivo, shipmentId, truckType);

            // PASO 5: Limpiar estado local después del éxito
            console.log(`🧹 Limpiando localStorage para shipment ${shipmentId}...`);
            clearTimerStateByShipmentId(shipmentId);
            delete shipmentCodeGenMap[shipmentId];
            delete shipmentTimerIdMap[shipmentId];
            console.log(`✅ localStorage limpiado para shipment ${shipmentId}`);

            console.log(`✅ Timer AZÚCAR detenido exitosamente: shipment ${shipmentId} (${tipo})`);
            console.log(`📤 Tiempo enviado al backend: ${tiempoParaBackend}`);
            console.log(`📊 Estado final activeTimerByType:`, activeTimerByType);

            setTimeout(refreshView, 700);
        } catch (err) {
            console.error(`❌ Error al detener timer AZÚCAR shipment ${shipmentId}:`, err);
            showErrorAlert(err.message || 'Error al enviar el tiempo');

            // Restaurar estado y reanudar visual desde donde iba
            isRunning[shipmentId] = true;
            addActiveTimer(shipmentId, tipo);
            saveTimerStateByShipmentId(shipmentId, { ms, le: Date.now(), run: true });
            startInterval(shipmentId, ms, tipo);
            restoreButtonState(btn);
        } finally {
            stopInFlight[shipmentId] = false;
        }
    };

    if (ms >= threshold) {
        const modal = document.getElementById("confirmationModal");
        if (modal) {
            modal.style.display = "block";

            // Manejar cambio en el select para mostrar/ocultar input de "Otro"
            const motivoSelect = document.getElementById("motivoDetencion");
            const motivoOtroInput = document.getElementById("motivoOtro");

            motivoSelect.onchange = function () {
                if (this.value === "otro") {
                    motivoOtroInput.style.display = "block";
                    motivoOtroInput.focus();
                } else {
                    motivoOtroInput.style.display = "none";
                    motivoOtroInput.value = "";
                }
            };

            document.getElementById("confirmStopButton").onclick = function () {
                const motivoSelect = document.getElementById("motivoDetencion").value || '';
                const motivoOtro = document.getElementById("motivoOtro").value || '';

                // Determinar el motivo final
                let motivoFinal = '';
                if (motivoSelect === "otro") {
                    motivoFinal = motivoOtro.trim();
                } else {
                    motivoFinal = motivoSelect;
                }

                // VALIDACIÓN: El motivo es requerido cuando se excede el tiempo promedio
                // No permitir vacío ni el valor por defecto "Seleccionar"
                if (!motivoFinal.trim()) {
                    showWarningAlert('Debe ingresar un motivo válido para justificar el tiempo excedido');
                    return;
                }

                finalizeStop(motivoFinal);
                modal.style.display = "none";

                // Limpiar campos al cerrar
                document.getElementById("motivoDetencion").value = "";
                document.getElementById("motivoOtro").value = "";
                document.getElementById("motivoOtro").style.display = "none";
            };
            document.getElementById("cancelStopButton").onclick = function () {
                modal.style.display = "none";

                // Limpiar campos al cancelar
                document.getElementById("motivoDetencion").value = "";
                document.getElementById("motivoOtro").value = "";
                document.getElementById("motivoOtro").style.display = "none";
                restoreButtonState(btn);
            };
        } else {
            finalizeStop('');
        }
    } else {
        finalizeStop('');
    }
}
function stopTimer(id) { stopTimerFlow(id); }

/* ------------------ Backend business - ACTUALIZADO ------------------ */
async function sweepinglog(codeGen, sweepingType, changeReason) {
    const body = {
        codeGen: codeGen,
        sweepingType: sweepingType // "SENCILLO" o "DOBLE"
    };

    // Solo incluir changeReason si hay un comentario
    if (changeReason && changeReason.trim()) {
        body.changeReason = changeReason;
    }

    return await postJson('/TiemposAzucar/sweepinglog', body);
}

// FUNCIÓN CRÍTICA: Asegurar que el tiempo llegue en formato HH:MM:SS
async function TiempoAzucar(codeGen, tiempo, comentario, shipmentId, truckType) {
    if (!codeGen) throw new Error('Código de generación requerido');
    if (!shipmentId) throw new Error('ID de shipment requerido');
    if (!truckType) throw new Error('Tipo de camión requerido');

    // VALIDACIÓN CRÍTICA: Verificar que el tiempo esté en formato HH:MM:SS
    const formatoHHMMSS = /^\d{2}:\d{2}:\d{2}$/;
    if (!formatoHHMMSS.test(tiempo)) {
        console.error(`❌ FORMATO DE TIEMPO INCORRECTO: ${tiempo} (debe ser HH:MM:SS)`);
        throw new Error(`Formato de tiempo incorrecto: ${tiempo}. Debe ser HH:MM:SS`);
    }

    window.AlmapacUtils?.showSpinner();
    try {
        console.log(`🚀 Enviando TiempoAzucar para: ${codeGen}`);
        console.log(`⏱️ Tiempo (HH:MM:SS): ${tiempo}`);
        console.log(`🚛 ShipmentId: ${shipmentId}, TruckType: ${truckType}`);

        const res = await postJson('/TiemposAzucar/TiempoAzucar', {
            codigoGeneracion: codeGen,
            tiempo: tiempo, // Ya debe estar en formato HH:MM:SS
            comentario: comentario || '',
            shipmentId: shipmentId,
            truckType: truckType
        });

        console.log("✅ TiempoAzucar OK:", res);
        await changeStatusAzucar(codeGen);
        return res;
    } finally {
        window.AlmapacUtils?.hideSpinner();
    }
}

async function changeStatusAzucar(codeGen) {
    const predefinedStatusId = 9;
    try {
        console.log(`🔄 Cambiando estado AZÚCAR para: ${codeGen}`);

        await postJson('/TiemposAzucar/ChangeTransactionStatus', {
            codeGen: codeGen, predefinedStatusId
        });

        console.log(`✅ Estado AZÚCAR cambiado exitosamente para: ${codeGen}`);

        // Liberar timer de BD cuando cambie de estado exitosamente
        const shipmentId = getShipmentIdFromCodeGen(codeGen);
        if (shipmentId) {
            await timerSyncAzucar.liberarTimerPorShipmentId(shipmentId);
        }

        showSuccessAlert('El estado se actualizó correctamente.');
    } catch (e) {
        console.error("Error cambiando estado:", e);

        if (e.message && e.message.includes('ya fue registrado')) {
            console.log('⚠️ Estado ya registrado, continuando...');
            return;
        }

        showErrorAlert(e.message || 'Error al cambiar estado');
        throw e; // Propagar para que finalizeStop restaure el timer
    }
}

function getShipmentIdFromCodeGen(codeGen) {
    const element = document.querySelector(`[data-codigo-generacion="${codeGen}"]`);
    if (element) {
        return parseInt(element.getAttribute('data-shipment-id'));
    }

    // Buscar en el mapa local
    for (const [shipmentId, storedCodeGen] of Object.entries(shipmentCodeGenMap)) {
        if (storedCodeGen === codeGen) {
            return parseInt(shipmentId);
        }
    }

    return null;
}

async function changeStatus(codigoGeneracion) {
    const predefinedStatusId = 8;
    try {
        window.AlmapacUtils?.showSpinner();
        await postJson('/TiemposAzucar/ChangeTransactionStatus', {
            codeGen: codigoGeneracion, predefinedStatusId
        });
        showSuccessAlert('El estado se actualizó correctamente.');
        setTimeout(refreshView, 700);
    } catch (err) {
        console.error("Error en changeStatus:", err);
        showErrorAlert(err.message || 'Error al actualizar estado');
        setTimeout(refreshView, 700);
    } finally {
        window.AlmapacUtils?.hideSpinner();
    }
}

/* ------------------ Contadores ------------------ */
async function SolicitarUnidad(Tipo_Unidad, unidadesSolicitadas) {
    const tipoTexto = (Tipo_Unidad === "V") ? "Volteo" : "Plana";
    const lockKey = (Tipo_Unidad === "V") ? "volteo" : "plano";

    if (counterLocks[lockKey]) {
        showWarningAlert('Operación en proceso, espere...');
        return;
    }
    counterLocks[lockKey] = true;

    try {
        window.AlmapacUtils?.showSpinner();
        await postJson('/TiemposAzucar/SolicitarUnidad', {
            Tipo_Unidad,
            CurrentValue: unidadesSolicitadas
        });
        await showSuccessAlert(`Has solicitado ${unidadesSolicitadas} unidades ${tipoTexto}.`);
        refreshView();
    } catch (err) {
        console.error("Error solicitando unidad:", err);
        await showErrorAlert(err.message || "Error al solicitar unidades");
        refreshView();
    } finally {
        counterLocks[lockKey] = false;
        window.AlmapacUtils?.hideSpinner();
    }
}
async function ReducirUnidad(Tipo_Unidad, unidadesReducidas) {
    const tipoTexto = (Tipo_Unidad === "V") ? "Volteo" : "Plana";
    const lockKey = (Tipo_Unidad === "V") ? "volteo" : "plano";

    if (counterLocks[lockKey]) {
        showWarningAlert('Operación en proceso, espere...');
        return;
    }
    counterLocks[lockKey] = true;

    try {
        window.AlmapacUtils?.showSpinner();
        await postJson('/TiemposAzucar/ReducirUnidad', {
            Tipo_Unidad,
            UnidadesReducidas: unidadesReducidas
        });
        await showSuccessAlert(`Se eliminaron ${unidadesReducidas} unidades ${tipoTexto}.`);
        refreshView();
    } catch (err) {
        console.error("Error en reducción:", err);
        await showErrorAlert(err.message || "Error al reducir unidades");
        refreshView();
    } finally {
        counterLocks[lockKey] = false;
        window.AlmapacUtils?.hideSpinner();
    }
}

function bindSolicitudesBtns() {
    let decrementCountVolteo = 0;
    let decrementCountPlano = 0;
    let incrementCountVolteo = 0;
    let incrementCountPlano = 0;

    const els = {
        decV: document.getElementById('decreaseButtonVolteo'),
        incV: document.getElementById('increaseButtonVolteo'),
        numV: document.getElementById('numberInputVolteo'),
        solV: document.getElementById('solicitarv'),
        decP: document.getElementById('decreaseButtonPlano'),
        incP: document.getElementById('increaseButtonPlano'),
        numP: document.getElementById('numberInputPlano'),
        solP: document.getElementById('solicitarp')
    };

    const getVal = el => el ? Math.max(0, parseInt(el.innerText) || 0) : 0;
    const setVal = (el, v) => el && (el.innerText = Math.max(0, v));

    if (els.decV) els.decV.onclick = () => { const v = getVal(els.numV); if (v > 0) setVal(els.numV, v - 1), decrementCountVolteo++; };
    if (els.incV) els.incV.onclick = () => { const v = getVal(els.numV); setVal(els.numV, v + 1); incrementCountVolteo++; };
    if (els.decP) els.decP.onclick = () => { const v = getVal(els.numP); if (v > 0) setVal(els.numP, v - 1), decrementCountPlano++; };
    if (els.incP) els.incP.onclick = () => { const v = getVal(els.numP); setVal(els.numP, v + 1); incrementCountPlano++; };

    if (els.solV) els.solV.onclick = async () => {
        if (counterLocks.volteo) return;
        const Tipo_Unidad = 'V';
        let ops = false;
        if (incrementCountVolteo > 0) { await SolicitarUnidad(Tipo_Unidad, incrementCountVolteo); ops = true; }
        if (decrementCountVolteo > 0) { await ReducirUnidad(Tipo_Unidad, decrementCountVolteo); ops = true; }
        if (!ops) showWarningAlert('No hay cambios para procesar');
        incrementCountVolteo = decrementCountVolteo = 0;
    };

    if (els.solP) els.solP.onclick = async () => {
        if (counterLocks.plano) return;
        const Tipo_Unidad = 'R';
        let ops = false;
        if (incrementCountPlano > 0) { await SolicitarUnidad(Tipo_Unidad, incrementCountPlano); ops = true; }
        if (decrementCountPlano > 0) { await ReducirUnidad(Tipo_Unidad, decrementCountPlano); ops = true; }
        if (!ops) showWarningAlert('No hay cambios para procesar');
        incrementCountPlano = decrementCountPlano = 0;
    };
}

/* ------------------ Autorización Cola ------------------ */
function confirmAuthorization(linkButton) {
    const transporter = linkButton.getAttribute('data-transporter');
    const trailerPlate = linkButton.getAttribute('data-trailerplate');
    const plate = linkButton.getAttribute('data-plate');
    const codigoGeneracion = linkButton.getAttribute('data-codigo-generacion');

    const message = `
        <p>¿Estás seguro de que este es el camión con el que deseas iniciar el proceso de toma de tiempo?</p>
        <br>
        <ul style="text-align: left; padding-left: 20px;">
            <li><strong>Código Generación:</strong> ${escapeHtml(codigoGeneracion)}</li>
            <li><strong>Motorista:</strong> ${escapeHtml(transporter)}</li>
            <li><strong>Placa Remolque:</strong> ${escapeHtml(trailerPlate)}</li>
            <li><strong>Placa Camión:</strong> ${escapeHtml(plate)}</li>
        </ul>
    `;

    Swal.fire({
        title: 'Confirmación',
        html: message,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Sí, continuar',
        cancelButtonText: 'Cancelar'
    }).then(result => {
        if (result.isConfirmed) {
            changeStatus(codigoGeneracion);
        }
    });

    return false;
}

/* ------------------ Utils ------------------ */
function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/[&<>"'`=\/]/g, s => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '/': '&#x2F;', '`': '&#x60;', '=': '&#x3D;'
    })[s]);
}

/* ------------------ Init ------------------ */
$(document).ready(function () {
    console.log('🚀 Documento listo - Inicializando aplicación AZÚCAR (USANDO SHIPMENT ID)...');
    console.log(`⏱️ Duración PLANA: ${(TIMER_DUR_PLANA_MLS / 1000 / 60)} min, VOLTEO: ${(TIMER_DUR_VOLTEO_MLS / 1000 / 60)} min`);
    console.log(`📊 LÍMITES: MAX_VOLTEO_TIMERS=${MAX_VOLTEO_TIMERS}, MAX_PLANA_TIMERS=${MAX_PLANA_TIMERS}`);
    console.log('🚦 REGLAS: Si hay 2 volteos → no plana. Si hay 1 plana → máx 1 volteo.');
    console.log('🌍 Zona horaria configurada: UTC-6 (El Salvador)');
    console.log('🔄 Auto-refresh: Cada 30 segundos SIEMPRE (sin pausa por cronómetros)');
    console.log('🔘 Botones: Habilitados siempre, validaciones en las funciones');
    console.log('🆔 Identificador: shipmentId como clave principal (persistente al refresh)');

    window.AlmapacUtils?.hideSpinner();

    document.querySelectorAll("button").forEach(b => {
        b.addEventListener("click", function (ev) {
            if (this.type !== 'submit') ev.preventDefault();
        });
    });

    setupModalEvents();
    bindTimerButtons();
    bindSolicitudesBtns();
    restoreSearchValue();

    // PRIMERO: Detectar y limpiar timers huérfanos (envíos que cambiaron de estado externamente)
    detectAndCleanOrphanedTimers();

    // SEGUNDO: Inicializar timers visibles desde localStorage
    initTimersFromStorage();

    // TERCERO: Sincronizar cronómetros AZÚCAR desde BD al cargar
    setTimeout(() => {
        console.log('🔄 Iniciando sincronización automática AZÚCAR desde BD...');
        timerSyncAzucar.syncActiveTimersFromDB();
    }, 1500);

    startAutoRefresh();

    console.log('✅ Aplicación AZÚCAR (USANDO SHIPMENT ID) inicializada correctamente');
});

/* Delegación de eventos para timers - USANDO SHIPMENT ID */
function bindTimerButtons() {
    $(document).off('click', '.timer-start-btn, .timer-stop-btn');

    $(document).on('click', '.timer-start-btn', function (e) {
        e.preventDefault();
        const shipmentId = parseInt(this.getAttribute('data-shipment-id'));
        console.log('🚀 Click en botón START AZÚCAR: shipment', shipmentId);

        abrirModalBarrido(this);
    });

    $(document).on('click', '.timer-stop-btn', function (e) {
        e.preventDefault();
        const shipmentId = parseInt(this.getAttribute('data-shipment-id'));
        console.log('⏹️ Click en botón STOP AZÚCAR: shipment', shipmentId);

        stopTimerFlow(this);
    });
}

/* Estilos animaciones */
(function injectStyles() {
    if (document.getElementById('polling-styles')) return;
    const style = document.createElement('style');
    style.id = 'polling-styles';
    style.textContent = `
        @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        .search-container { position: relative; }
        #searchResultsMessage { margin-bottom: 1rem; }
    `;
    document.head.appendChild(style);
})();