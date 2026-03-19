/*************************************************************
 * TIEMPOS MELAZA
 *************************************************************/

const REFRESH_MLS = 20000; // Refrescar datos cada 20 segundos
const USE_INDICATORS = false; // Indicadores de actualizacion
const TIMER_DUR_MELAZA_MLS = 12 * 60 * 1000; // 12 minutos para melaza
const MAX_SIMULTANEOUS_TIMERS = 5; // Máximo 5 cronómetros simultáneos
const TEMPERATURE_INTERVAL_MLS = 3 * 60 * 60 * 1000; // 3 horas para toma de temperatura
const GOOD_TEMPERATURE_THRESHOLD = 41.0; // Temperatura considerada buena (≤ 41°C)

let autoRefreshInterval = null;
let autoRefreshEnabled = true;
let modalsOpen = 0;

// Gestión de timers por pileta
const intervals = {};
const isRunning = {};
const lastPerf = {};
const timerCodeGenMap = {};

// Gestión de contadores de enfriamiento
const enfriamientoCounters = {};

// Estados de componentes - Solo uno puede estar activo a la vez
let currentActiveComponent = 'tiempos-melaza';

let counterLocks = { pipa: false };

// Control de ejecuciones múltiples
const executionLocks = new Map();
const buttonStates = new Map();
let isBindingEvents = false; // Prevenir binding múltiple

// Locks específicos para STOP (doble click)
const stopInFlight = {};

// Guardas para refrescos simultáneos
let refreshInFlight = false;
let lastRefreshTs = 0;

// **VARIABLES GLOBALES PARA CONTADORES PERSISTENTES**
let pipaCounterState = {
    decrementCount: 0,
    incrementCount: 0,
    baseValue: 0,
    isInitialized: false
};

// Mapeo de componentes con sus textos de visualización
const COMPONENT_MAPPING = {
    'tiempos-melaza': 'Estaciones de melaza',
    'unidades-enfriamiento': 'Unidades en enfriamiento'
};

/* ------------------ GESTIÓN DE ESTADO PERSISTENTE DE CONTADORES ------------------ */

/**
 * Guarda el estado del contador en localStorage
 */
function savePipaCounterState() {
    try {
        localStorage.setItem('pipaCounterState', JSON.stringify(pipaCounterState));
        console.log('💾 Estado del contador guardado:', pipaCounterState);
    } catch (error) {
        console.error('❌ Error guardando estado del contador:', error);
    }
}

/**
 * Carga el estado del contador desde localStorage
 */
function loadPipaCounterState() {
    try {
        const saved = localStorage.getItem('pipaCounterState');
        if (saved) {
            const parsed = JSON.parse(saved);
            pipaCounterState = {
                ...pipaCounterState,
                ...parsed,
                isInitialized: true
            };
            console.log('📂 Estado del contador cargado:', pipaCounterState);
        } else {
            console.log('📂 No hay estado previo del contador');
            pipaCounterState.isInitialized = true;
        }
    } catch (error) {
        console.error('❌ Error cargando estado del contador:', error);
        pipaCounterState.isInitialized = true;
    }
}

/**
 * Limpia el estado del contador
 */
function clearPipaCounterState() {
    pipaCounterState = {
        decrementCount: 0,
        incrementCount: 0,
        baseValue: 0,
        isInitialized: true
    };
    localStorage.removeItem('pipaCounterState');
    console.log('🧹 Estado del contador limpiado');
}

/**
 * Sincroniza el estado del contador con el DOM
 */
function syncPipaCounterWithDOM() {
    const numberInput = document.getElementById('numberInputPipa');
    if (!numberInput) return;

    try {
        // Obtener el valor base del DOM (valor del servidor)
        const domValue = parseInt(numberInput.textContent) || 0;

        // Si no hay estado inicializado o el valor base cambió, reinicializar
        if (!pipaCounterState.isInitialized || pipaCounterState.baseValue !== domValue) {
            console.log(`🔄 Sincronizando contador: valor DOM=${domValue}, estado base=${pipaCounterState.baseValue}`);

            pipaCounterState.baseValue = domValue;
            pipaCounterState.isInitialized = true;

            // Mantener los contadores si están en progreso
            const currentDisplayValue = pipaCounterState.baseValue + pipaCounterState.incrementCount - pipaCounterState.decrementCount;
            updatePipaDisplay(currentDisplayValue);

            savePipaCounterState();
        }
    } catch (error) {
        console.error('❌ Error sincronizando contador con DOM:', error);
    }
}

/**
 * Actualiza la visualización del contador
 */
function updatePipaDisplay(value) {
    const numberInput = document.getElementById('numberInputPipa');
    if (numberInput) {
        const safeValue = Math.max(0, value);
        numberInput.textContent = safeValue;
        console.log(`📊 Display actualizado: ${safeValue}`);
    }
}

/**
 * Calcula el valor actual del contador
 */
function getCurrentPipaValue() {
    return Math.max(0, pipaCounterState.baseValue + pipaCounterState.incrementCount - pipaCounterState.decrementCount);
}

/* ------------------ TIMER SYNC MANAGER PARA SINCRONIZACIÓN BD ------------------ */

class TimerSyncManager {
    constructor() {
        this.tipoTimer = 'melaza';
        this.syncInterval = null;
        this.pendingStartOperations = new Set(); // Para evitar registros duplicados
    }

    /**
     * Registra el cronómetro en BD al iniciar
     */
    async startTimerInDB(timerId, codeGen, shipmentId, tipoUnidad = 'pipa') {
        // Evitar registros duplicados
        if (this.pendingStartOperations.has(timerId)) {
            console.log(`⚠️ Ya hay operación de inicio pendiente para ${timerId}`);
            return null;
        }

        this.pendingStartOperations.add(timerId);

        try {
            console.log(`🚀 Registrando timer en BD: ${timerId} para shipment ${shipmentId} - ${codeGen}`);

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
                console.log(`✅ Timer registrado en BD: ${timerId} a las ${new Date(result.data.startedAtMilliseconds).toISOString()}`);
                return result.data;
            } else {
                console.error(`❌ Error registrando timer en BD: ${result.message}`);
                return null;
            }
        } catch (error) {
            console.error(`❌ Error de red registrando timer ${timerId}:`, error);
            return null;
        } finally {
            this.pendingStartOperations.delete(timerId);
        }
    }

    /**
     * Elimina el cronómetro de BD al detener
     */
    async stopTimerInDB(timerId) {
        try {
            console.log(`⏹️ Eliminando timer de BD: ${timerId}`);

            const response = await fetch('/TimerSync/stop', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ timerId: timerId })
            });

            const result = await response.json();

            if (result.success) {
                console.log(`✅ Timer eliminado de BD: ${timerId}`);
                return true;
            } else {
                console.warn(`⚠️ Timer no encontrado en BD para eliminar: ${timerId}`);
                return false;
            }
        } catch (error) {
            console.error(`❌ Error eliminando timer ${timerId} de BD:`, error);
            return false;
        }
    }

    /**
     * Libera cronómetro por shipmentId cuando cambia de estado
     */
    async liberarTimerPorShipmentId(shipmentId) {
        try {
            console.log(`🔄 Liberando timer por cambio de estado: shipment ${shipmentId}`);

            const response = await fetch(`/TimerSync/liberar/${shipmentId}`, {
                method: 'POST'
            });

            const result = await response.json();

            if (result.success && result.data.liberado) {
                console.log(`✅ Timer liberado por cambio de estado: shipment ${shipmentId}`);
                return true;
            } else {
                console.log(`⚡ No había timer activo para liberar: shipment ${shipmentId}`);
                return false;
            }
        } catch (error) {
            console.error(`❌ Error liberando timer para shipment ${shipmentId}:`, error);
            return false;
        }
    }

    /**
     * Sincroniza cronómetros desde BD
     */
    async syncActiveTimersFromDB() {
        try {
            console.log(`🔍 INICIO sincronización desde BD para tipo: ${this.tipoTimer}`);
            console.log(`🔗 URL llamada: /TimerSync/active/${this.tipoTimer}`);
            console.log(`🔍 Estado actual isRunning antes de sincronizar:`, isRunning);

            const response = await fetch(`/TimerSync/active/${this.tipoTimer}`);
            console.log(`📡 Respuesta del servidor:`, response);
            console.log(`📡 Status: ${response.status} ${response.statusText}`);
            console.log(`📡 Headers:`, [...response.headers.entries()]);

            if (!response.ok) {
                console.error(`❌ Error HTTP: ${response.status} - ${response.statusText}`);
                const errorText = await response.text();
                console.error(`❌ Error texto:`, errorText);
                return [];
            }

            const result = await response.json();
            console.log(`📦 Resultado JSON completo:`, result);
            console.log(`📦 Tipo de resultado:`, typeof result);
            console.log(`📦 result.success:`, result.success);
            console.log(`📦 result.data:`, result.data);
            console.log(`📦 Array.isArray(result.data):`, Array.isArray(result.data));

            if (result.success && Array.isArray(result.data)) {
                console.log(`📊 Timers activos en BD: ${result.data.length}`);
                console.log(`📋 Lista completa de timers:`, result.data);

                if (result.data.length === 0) {
                    console.log(`ℹ️ RESULTADO: No hay timers activos en BD para sincronizar`);
                    return [];
                }

                // Verificar cada timer de BD
                for (const dbTimer of result.data) {
                    console.log(`🔍 Procesando timer de BD:`, dbTimer);

                    const localRunning = isRunning[dbTimer.timerId];
                    console.log(`🔍 Timer ${dbTimer.timerId}: localRunning=${localRunning}`);

                    if (!localRunning) {
                        console.log(`🔄 Timer encontrado en BD pero no localmente: ${dbTimer.timerId}`);

                        // Verificar formato de datos
                        if (!dbTimer.startedAtMilliseconds) {
                            console.error(`❌ startedAtMilliseconds no encontrado en:`, dbTimer);
                            continue;
                        }

                        console.log(`📅 StartedAtMilliseconds: ${dbTimer.startedAtMilliseconds}`);
                        console.log(`📅 Fecha de inicio en BD: ${new Date(dbTimer.startedAtMilliseconds).toISOString()}`);
                        console.log(`📅 Hora actual: ${new Date().toISOString()}`);

                        // Calcular tiempo transcurrido desde la fecha REAL de inicio en BD
                        const now = Date.now();
                        const startTime = dbTimer.startedAtMilliseconds;
                        const elapsedMs = Math.max(0, now - startTime);

                        console.log(`⏱️ now: ${now}`);
                        console.log(`⏱️ startTime: ${startTime}`);
                        console.log(`⏱️ elapsedMs: ${elapsedMs}`);
                        console.log(`⏱️ Tiempo transcurrido calculado: ${(elapsedMs / 1000 / 60).toFixed(1)} minutos`);

                        // Verificar si el elemento UI existe antes de sincronizar
                        const txtEl = document.getElementById(dbTimer.timerId);
                        const progressBarId = dbTimer.timerId.replace('timer', 'progressBar');
                        const progressBarEl = document.getElementById(progressBarId);

                        console.log(`🔍 Elementos UI para ${dbTimer.timerId}:`);
                        console.log(`  - txtEl:`, txtEl);
                        console.log(`  - progressBarEl:`, progressBarEl);

                        if (!txtEl && !progressBarEl) {
                            console.warn(`⚠️ UI no disponible para ${dbTimer.timerId}, limpiando de BD...`);
                            if (dbTimer.shipmentId) {
                                this.liberarTimerPorShipmentId(dbTimer.shipmentId).catch(err =>
                                    console.error(`⚠️ Error limpiando timer huérfano de BD: ${dbTimer.timerId}`, err)
                                );
                            }
                            continue;
                        }

                        // Configurar estado local completo ANTES de iniciar
                        timerCodeGenMap[dbTimer.timerId] = dbTimer.codeGen;
                        console.log(`📝 Configurando timerCodeGenMap[${dbTimer.timerId}] = ${dbTimer.codeGen}`);

                        // Guardar estado completo en localStorage
                        saveTimerState(dbTimer.timerId, {
                            cg: dbTimer.codeGen,
                            shipmentId: dbTimer.shipmentId,
                            ms: elapsedMs,
                            le: now, // Última época = ahora
                            run: true
                        });
                        console.log(`💾 Estado guardado en localStorage para ${dbTimer.timerId}`);

                        // Marcar como corriendo ANTES de iniciar intervalo
                        isRunning[dbTimer.timerId] = true;
                        console.log(`▶️ Marcando isRunning[${dbTimer.timerId}] = true`);

                        // Iniciar cronómetro con tiempo ya transcurrido
                        startInterval(dbTimer.timerId, elapsedMs);
                        console.log(`🎯 startInterval llamado para ${dbTimer.timerId} con ${elapsedMs}ms`);

                        console.log(`✅ Timer sincronizado desde BD: ${dbTimer.timerId}`);
                        console.log(`📊 Estado final guardado - ms: ${elapsedMs}, running: true`);
                    } else {
                        console.log(`ℹ️ Timer ${dbTimer.timerId} ya está corriendo localmente`);
                    }
                }

                // Limpiar localStorage de timers que ya no están en BD
                const activeTimerIds = new Set(result.data.map(t => t.timerId));
                Object.keys(localStorage).forEach(key => {
                    const match = key.match(/^(.+)_isRunning$/);
                    if (match && localStorage.getItem(key) === 'true') {
                        const tid = match[1];
                        if (tid.startsWith('timerPileta_') && !activeTimerIds.has(tid)) {
                            clearTimerState(tid);
                            isRunning[tid] = false;
                        }
                    }
                });

                return result.data;
            } else {
                console.log(`⚠️ Respuesta sin éxito o datos no son array:`, result);
                if (result.success === false) {
                    console.error(`❌ Error del servidor: ${result.message}`);
                }
                return [];
            }
        } catch (error) {
            console.error('❌ Error sincronizando timers desde BD:', error);
            console.error('❌ Stack trace:', error.stack);
            return [];
        }
    }
}

// Crear instancia global del manager
const timerSyncMelaza = new TimerSyncManager();

/* ------------------ FUNCIONES DE ZONA HORARIA ------------------ */

/**
 * Convierte una fecha del servidor (que está en UTC-6) a fecha local para cálculos
 */
function parseServerDate(dateStr) {
    if (!dateStr) return null;

    try {
        // Detectar si la fecha ya trae zona (Z o ±HH:MM) al final
        const hasTZ = /(?:Z|[+\-]\d{2}:\d{2})$/.test(dateStr);
        if (dateStr.includes('T')) {
            // ISO con o sin zona explícita
            return new Date(hasTZ ? dateStr : dateStr + '-06:00');
        } else {
            // Formato simple, asumir zona de El Salvador
            return new Date(dateStr + ' GMT-0600');
        }
    } catch (error) {
        console.error('❌ Error parseando fecha del servidor:', dateStr, error);
        return null;
    }
}

/**
 * Calcula cuando debe tomarse la próxima temperatura
 * basada en la última temperatura registrada + 3 horas
 */
function calculateNextTemperatureTime(lastTemperatureTimeStr) {
    if (!lastTemperatureTimeStr) return null;

    try {
        const lastTemperatureTime = parseServerDate(lastTemperatureTimeStr);
        if (!lastTemperatureTime) return null;

        // Agregar 3 horas
        const nextTemperatureTime = new Date(lastTemperatureTime.getTime() + TEMPERATURE_INTERVAL_MLS);

        console.log(`📊 Última temperatura: ${lastTemperatureTime.toLocaleString('es-SV')} (El Salvador)`);
        console.log(`📊 Próxima temperatura: ${nextTemperatureTime.toLocaleString('es-SV')} (El Salvador)`);

        return nextTemperatureTime;
    } catch (error) {
        console.error('❌ Error calculando próxima temperatura:', error);
        return null;
    }
}

/* ------------------ FUNCIONES DE CONTADORES DE ENFRIAMIENTO CON UTC-6 ------------------ */

/**
 * Inicializa todos los contadores de temperatura de enfriamiento con corrección UTC-6
 */
function initEnfriamientoCounters() {
    console.log('🕒 Inicializando contadores de enfriamiento con zona horaria UTC-6...');

    // Buscar todas las tarjetas de enfriamiento con contadores
    document.querySelectorAll('[data-target-time]').forEach(element => {
        const targetTimeStr = element.getAttribute('data-target-time');
        const codeGen = element.closest('[data-codigo-generacion]')?.getAttribute('data-codigo-generacion');

        if (targetTimeStr && codeGen) {
            console.log(`🕒 Procesando contador directo para ${codeGen} con tiempo objetivo: ${targetTimeStr}`);
            startEnfriamientoCounter(element, targetTimeStr, codeGen);
        }
    });

    // También buscar elementos con data-last-temperature-time para calcular el próximo tiempo
    document.querySelectorAll('[data-last-temperature-time]').forEach(element => {
        const lastTempTimeStr = element.getAttribute('data-last-temperature-time');
        const codeGen = element.closest('[data-codigo-generacion]')?.getAttribute('data-codigo-generacion');

        // Solo procesar si no tiene data-target-time (evitar duplicados)
        if (lastTempTimeStr && codeGen && !element.hasAttribute('data-target-time')) {
            const nextTempTime = calculateNextTemperatureTime(lastTempTimeStr);
            if (nextTempTime) {
                console.log(`🕒 Calculando contador basado en última temperatura para ${codeGen}`);
                const targetTimeStr = nextTempTime.toISOString();
                startEnfriamientoCounter(element, targetTimeStr, codeGen);
            }
        }
    });

    // Búsqueda adicional por atributos NextTemperatureTime del modelo
    document.querySelectorAll('.unidad-enfriamiento-vertical-card').forEach(card => {
        const codeGen = card.getAttribute('data-codigo-generacion');
        const nextTempTimeStr = card.getAttribute('data-next-temperature-time');
        const countdownElement = card.querySelector('[data-target-time], .temperature-countdown');

        if (codeGen && nextTempTimeStr && countdownElement && !countdownElement.hasAttribute('data-processed')) {
            console.log(`🕒 Procesando NextTemperatureTime para ${codeGen}: ${nextTempTimeStr}`);
            countdownElement.setAttribute('data-processed', 'true');
            startEnfriamientoCounter(countdownElement, nextTempTimeStr, codeGen);
        }
    });
}

/**
 * Inicia un contador individual de enfriamiento con corrección de zona horaria UTC-6
 */
function startEnfriamientoCounter(element, targetTimeStr, codeGen) {
    try {
        // Parsear la fecha objetivo usando la función que maneja UTC-6
        const targetTime = parseServerDate(targetTimeStr);
        if (!targetTime) {
            console.error('❌ No se pudo parsear la fecha objetivo:', targetTimeStr);
            return;
        }

        const countdownId = `countdown_${codeGen}`;

        // Limpiar contador anterior si existe
        if (enfriamientoCounters[countdownId]) {
            clearInterval(enfriamientoCounters[countdownId]);
        }

        const updateCounter = () => {
            // Obtener la hora actual en la zona horaria del cliente
            const now = new Date();

            // Calcular el tiempo restante
            const timeRemaining = targetTime.getTime() - now.getTime();

            const displayElement = element.querySelector('.countdown-display') ||
                element.querySelector('.countdown-timer') ||
                element;

            if (!displayElement) {
                console.warn('⚠️ No se encontró elemento de display para el countdown');
                return;
            }

            if (timeRemaining <= 0) {
                element.classList.add('countdown-expired');

                // Marcar la tarjeta completa como que necesita temperatura
                const card = element.closest('.unidad-enfriamiento-vertical-card');
                if (card) {
                    card.classList.add('time-for-temperature');
                }

                // Limpiar intervalo
                clearInterval(enfriamientoCounters[countdownId]);
                delete enfriamientoCounters[countdownId];

                console.log(`⏰ Tiempo cumplido para ${codeGen}`);
            } else {
                // Calcular tiempo restante
                const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
                const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);

                displayElement.innerHTML = `<span>${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}</span>`;

                // Cambiar estilo si queda menos de 30 minutos
                if (timeRemaining <= 30 * 60 * 1000) {
                    element.classList.add('countdown-warning');
                } else {
                    element.classList.remove('countdown-warning');
                }
            }
        };

        // Actualizar inmediatamente
        updateCounter();

        // Iniciar intervalo de actualización cada segundo
        enfriamientoCounters[countdownId] = setInterval(updateCounter, 1000);

        console.log(`🕒 Contador iniciado para ${codeGen}`);
        console.log(`📅 Fecha objetivo: ${targetTime.toLocaleString('es-SV')} (El Salvador)`);
        console.log(`📅 Fecha actual: ${new Date().toLocaleString('es-SV')} (Hora del cliente)`);

    } catch (error) {
        console.error('❌ Error iniciando contador de enfriamiento:', error);
        console.error('❌ targetTimeStr recibido:', targetTimeStr);
    }
}

/**
 * Limpia todos los contadores de enfriamiento
 */
function clearAllEnfriamientoCounters() {
    Object.keys(enfriamientoCounters).forEach(countdownId => {
        clearInterval(enfriamientoCounters[countdownId]);
        delete enfriamientoCounters[countdownId];
    });
    console.log('🧹 Todos los contadores de enfriamiento limpiados');
}

/* ------------------ FUNCIONES DE TEMPERATURA CON SWEETALERT ------------------ */

/**
 * Obtiene la última temperatura del historial de temperaturas del DOM
 */
function getLastTemperatureFromDOM(element) {
    try {
        const tempHistoryList = element.querySelector('.temp-history-list');
        if (!tempHistoryList) {
            console.log('📊 No se encontró historial de temperaturas');
            return null;
        }

        const tempItems = tempHistoryList.querySelectorAll('.temp-history-item');
        if (!tempItems || tempItems.length === 0) {
            console.log('📊 No hay items en el historial de temperaturas');
            return null;
        }

        // El primer item es la temperatura más reciente (están ordenados por fecha descendente)
        const firstTempItem = tempItems[0];
        const tempValueElement = firstTempItem.querySelector('.temp-value');

        if (!tempValueElement) {
            console.log('📊 No se encontró elemento de temperatura');
            return null;
        }

        // Extraer el valor numérico de la temperatura (formato: "39.5°C")
        const tempText = tempValueElement.textContent;
        const tempMatch = tempText.match(/(\d+\.?\d*)°C/);

        if (!tempMatch) {
            console.log('📊 No se pudo extraer valor numérico de:', tempText);
            return null;
        }

        const temperature = parseFloat(tempMatch[1]);
        console.log(`📊 Última temperatura encontrada: ${temperature}°C`);

        return temperature;
    } catch (error) {
        console.error('❌ Error obteniendo última temperatura del DOM:', error);
        return null;
    }
}

/**
 * Nueva función para temperatura desde pileta
 */
function mostrarModalTemperaturaPileta(element) {
    const hasValidTemperature = element.getAttribute('data-has-valid-temperature') === 'true';
    const lastTemperature = parseFloat(element.getAttribute('data-last-temperature') || '0');

    const data = {
        codeGen: element.getAttribute('data-codigo-generacion'),
        shipmentId: element.getAttribute('data-shipment-id'),
        transporter: element.getAttribute('data-transporter'),
        trailerPlate: element.getAttribute('data-trailerplate'),
        plate: element.getAttribute('data-plate'),
        ingenio: element.getAttribute('data-ingenio'),
        transaccion: element.getAttribute('data-transaccion'),
        pileta: element.getAttribute('data-pileta')
    };

    if (hasValidTemperature && lastTemperature > 0) {
        console.log(`⏰ Temperatura válida encontrada (${lastTemperature}°C), mostrando confirmación para tomar tiempo`);
        mostrarSweetAlertTomarTiempo(data, lastTemperature);
    } else {
        console.log(`🌡️ Sin temperatura válida, mostrando modal para tomar temperatura`);
        mostrarSweetAlertTemperatura(data, 'cola');
    }
}

function mostrarSweetAlertTomarTiempo(data, temperatura) {
    if (!data.codeGen) {
        showErrorAlert('Código de generación no encontrado');
        return;
    }

    const message = `
        <p>¿Este es el camión para iniciar la toma de tiempo?</p>
        <br>
        <ul style="text-align: left; padding-left: 20px;">
            <li><strong>Motorista:</strong> ${escapeHtml(data.transporter)}</li>
            <li><strong>Placa Remolque:</strong> ${escapeHtml(data.trailerPlate)}</li>
            <li><strong>Placa Camión:</strong> ${escapeHtml(data.plate)}</li>
        </ul>
        <hr style="margin: 10px 0;">
        <p style="color: #28a745; margin-top: 5px;">
            Última temperatura: <strong>${temperatura.toFixed(1)}°C</strong>
        </p>
        <p style="color: #666; font-size: 14px;">
            La unidad pasará directamente a toma de tiempo.
        </p>
    `;

    Swal.fire({
        title: 'Confirmación',
        html: message,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#28a745',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Sí, continuar',
        cancelButtonText: 'Cancelar',
        customClass: {
            popup: 'temperatura-popup'
        }
    }).then((result) => {
        if (result.isConfirmed) {
            // Cambiar directamente a status 8 (proceso) sin registrar temperatura
            changeStatus(data.codeGen);
        }
    });
}

/**
 * Muestra el SweetAlert de temperatura para unidades en cola
 */
function mostrarModalTemperaturaCola(element) {
    const data = {
        codeGen: element.getAttribute('data-codigo-generacion'),
        shipmentId: element.getAttribute('data-shipment-id'),
        transporter: element.getAttribute('data-transporter'),
        trailerPlate: element.getAttribute('data-trailerplate'),
        plate: element.getAttribute('data-plate'),
        ingenio: element.getAttribute('data-ingenio'),
        transaccion: element.getAttribute('data-transaccion')
    };

    // Verificar si hay historial de temperaturas y obtener la última
    const lastTemperature = getLastTemperatureFromDOM(element);

    if (lastTemperature !== null && lastTemperature <= GOOD_TEMPERATURE_THRESHOLD) {
        // La última temperatura es buena, mostrar modal sin input de temperatura
        console.log(`🌡️ Última temperatura (${lastTemperature}°C) está en rango bueno, mostrando confirmación sin input`);
        mostrarSweetAlertTemperatura(data, 'cola', lastTemperature);
    } else {
        // No hay historial o la última temperatura es alta, proceder con flujo normal
        console.log(`🌡️ No hay historial o última temperatura alta (${lastTemperature}°C), solicitando nueva medición`);
        mostrarSweetAlertTemperatura(data, 'cola');
    }
}

/**
 * Muestra el SweetAlert de temperatura para unidades en enfriamiento
 */
function mostrarModalTemperaturaEnfriamiento(element) {
    const temperatureCount = parseInt(element.getAttribute('data-temperature-count') || '0');

    // Verificar si ya se han tomado 4 temperaturas
    if (temperatureCount >= 4) {
        showWarningAlert('Esta unidad ya ha alcanzado el límite máximo de 4 temperaturas registradas.');
        return;
    }

    const data = {
        codeGen: element.getAttribute('data-codigo-generacion'),
        shipmentId: element.getAttribute('data-shipment-id'),
        transporter: element.getAttribute('data-transporter'),
        trailerPlate: element.getAttribute('data-trailerplate'),
        plate: element.getAttribute('data-plate'),
        ingenio: element.getAttribute('data-ingenio'),
        transaccion: element.getAttribute('data-transaccion'),
        temperaturaActual: element.getAttribute('data-temperatura'),
        temperatureCount: temperatureCount
    };

    mostrarSweetAlertTemperatura(data, 'enfriamiento');
}

/**
 * Función principal para mostrar el SweetAlert de temperatura
 */
function mostrarSweetAlertTemperatura(data, origen = 'cola', existingTemperature = null) {
    if (!data.codeGen) {
        showErrorAlert('Código de generación no encontrado');
        return;
    }

    const valorInicial = (origen === 'enfriamiento' && data.temperaturaActual && data.temperaturaActual !== 'N/A')
        ? parseFloat(data.temperaturaActual)
        : '';

    // Texto principal según el origen
    const textoPrincipal = origen === 'enfriamiento'
        ? '¿Este es el camión que debe regresar a cola?'
        : '¿Este es el camión para la toma de temperatura?';

    let message = `
        <p>${textoPrincipal}</p>
        <br>
        <ul style="text-align: left; padding-left: 20px;">
            <li><strong>Motorista:</strong> ${escapeHtml(data.transporter)}</li>
            <li><strong>Placa Remolque:</strong> ${escapeHtml(data.trailerPlate)}</li>
            <li><strong>Placa Camión:</strong> ${escapeHtml(data.plate)}</li>
        </ul>
        <hr style="margin: 10px 0;">
    `;

    // Si hay temperatura existente (buena), mostrarla
    if (existingTemperature !== null) {
        message += `
            <p style="color: #666; margin-top: 5px;">
                La unidad pasará a toma de tiempo.
            </p>
        `;
    } else {
        // Mostrar campo de input para nueva temperatura
        message += `
            <p><strong>Ingrese la temperatura (°C):</strong></p>
        `;
    }

    const sweetAlertConfig = {
        title: 'Confirmación',
        html: message,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Sí, continuar',
        cancelButtonText: 'Cancelar',
        customClass: {
            popup: 'temperatura-popup'
        }
    };

    // Solo agregar input si no hay temperatura existente
    if (existingTemperature === null) {
        sweetAlertConfig.input = 'number';
        sweetAlertConfig.inputAttributes = {
            inputmode: 'decimal',
            min: 0,
            max: 100,
            step: 0.1,
            maxlength: 5,
            placeholder: 'Ej: 39.5'
        };
        sweetAlertConfig.inputValidator = (value) => {
            if (!value) {
                return 'Debe ingresar una temperatura';
            }
            const temp = parseFloat(value);
            if (isNaN(temp) || temp < 0 || temp > 100) {
                return 'La temperatura debe estar entre 0 y 100 °C';
            }
            return null;
        };
    }

    Swal.fire(sweetAlertConfig).then((result) => {
        if (result.isConfirmed) {
            const temperatura = existingTemperature !== null ? existingTemperature : parseFloat(result.value);
            registrarTemperatura(data.codeGen, temperatura, origen, existingTemperature !== null);
        }
    });
}

/**
 * Registra la temperatura en el servidor
 */
async function registrarTemperatura(codeGen, temperatura, origen = 'cola', isExistingTemperature = false) {
    const lockKey = `registrar_temperatura_${codeGen}`;

    try {
        await preventMultipleExecutions(lockKey, async () => {
            window.AlmapacUtils?.showSpinner();

            console.log(`🌡️ Registrando temperatura ${temperatura}°C para ${codeGen} (origen: ${origen}, existente: ${isExistingTemperature})`);

            const response = await postJson('/TiemposMelaza/RegistrarTemperatura', {
                codeGen: codeGen,
                temperature: temperatura,
                origen: origen,
                isExistingTemperature: isExistingTemperature
            });

            console.log('✅ Temperatura registrada exitosamente:', response);

            // Determinar mensaje según temperatura, origen y si fue anulado
            let statusMessage;
            if (response.data && response.data.isAnulado) {
                statusMessage = `Cuarta temperatura alta (${temperatura}°C). La unidad debe regresar al ingenio.`;
                await Swal.fire({
                    icon: 'error',
                    title: '¡Envío Anulado!',
                    text: statusMessage,
                    confirmButtonText: 'Entendido',
                    confirmButtonColor: '#dc2626'
                });
            } else if (temperatura <= 41.0) {
                if (origen === 'cola') {
                    statusMessage = `Temperatura adecuada (${temperatura.toFixed(1)}°C). La unidad pasó a toma de tiempo.`;
                } else {
                    statusMessage = `Temperatura adecuada (${temperatura.toFixed(1)}°C). La unidad regresó a cola.`;
                }
                await showSuccessAlert(statusMessage);
            } else {
                if (origen === 'enfriamiento') {
                    statusMessage = `Temperatura alta (${temperatura}°C). La unidad se mantiene en enfriamiento.`;
                } else {
                    statusMessage = `Temperatura alta (${temperatura}°C). La unidad pasó a enfriamiento.`;
                }
                await showWarningAlert(statusMessage);
            }

            // Refresh para mostrar cambios
            setTimeout(() => {
                refreshView();
            }, 1000);

            return true;
        }, 5000);

    } catch (error) {
        console.error('❌ Error registrando temperatura:', error);
        showErrorAlert(error.message || 'Error al registrar la temperatura');
    } finally {
        window.AlmapacUtils?.hideSpinner();
    }
}

/* ------------------ Control de Ejecuciones Múltiples ------------------ */

/**
 * Previene múltiples ejecuciones de una función
 */
function preventMultipleExecutions(key, fn, delay = 3000) {
    if (executionLocks.has(key)) {
        console.warn(`⚠️ Ejecución múltiple bloqueada para: ${key}`);
        return Promise.resolve(false);
    }

    executionLocks.set(key, true);
    console.log(`🔒 Bloqueando ejecución para: ${key}`);

    // Auto-liberar después del delay
    setTimeout(() => {
        executionLocks.delete(key);
        console.log(`🔓 Liberando ejecución para: ${key}`);
    }, delay);

    return fn();
}

/**
 * Deshabilita un botón temporalmente
 */
function disableButtonTemporarily(button, duration = 3000, loadingText = '') {
    if (!button) return;

    const buttonId = button.id || button.getAttribute('data-timer-id') || 'unknown';

    if (buttonStates.has(buttonId)) {
        console.warn(`⚠️ Botón ${buttonId} ya está deshabilitado`);
        return;
    }

    const originalDisabled = button.disabled;
    const originalHTML = button.innerHTML;

    button.disabled = true;
    button.style.cursor = 'not-allowed';
    button.style.opacity = '0.7';
    button.style.pointerEvents = 'none';
    button.setAttribute('aria-busy', 'true');

    if (loadingText) {
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + loadingText;
    }

    let timeoutId = null;
    if (duration > 0) {
        timeoutId = setTimeout(() => {
            restoreButtonFromState(buttonId);
        }, duration);
    }

    buttonStates.set(buttonId, {
        originalDisabled,
        originalHTML,
        button: button,
        timeoutId: timeoutId
    });

    console.log(`🚫 Botón ${buttonId} deshabilitado temporalmente`);
}

function restoreButtonFromState(buttonId) {
    const state = buttonStates.get(buttonId);
    if (state && state.button) {
        if (state.timeoutId) {
            clearTimeout(state.timeoutId);
        }
        state.button.disabled = state.originalDisabled;
        state.button.innerHTML = state.originalHTML;
        state.button.style.opacity = '';
        state.button.style.cursor = '';
        state.button.style.pointerEvents = '';
        state.button.removeAttribute('aria-busy');
        buttonStates.delete(buttonId);
        console.log(`✅ Botón ${buttonId} restaurado`);
    }
}

/* ------------------ Persistencia de Selección ------------------ */
function saveSelectedComponent(componentName) {
    try {
        localStorage.setItem('selectedComponent', componentName);
        console.log('💾 Componente guardado:', componentName);
    } catch (error) {
        console.error('❌ Error guardando componente:', error);
    }
}

function loadSelectedComponent() {
    try {
        const savedComponent = localStorage.getItem('selectedComponent') || 'tiempos-melaza';
        console.log('📂 Componente cargado:', savedComponent);
        return savedComponent;
    } catch (error) {
        console.error('❌ Error cargando componente:', error);
        return 'tiempos-melaza';
    }
}

function updateActiveDropdownItem(activeComponent) {
    document.querySelectorAll('.dropdown-item').forEach(item => {
        item.classList.remove('active');
        const icon = item.querySelector('.check-icon');
        if (icon) icon.style.display = 'none';
    });

    const activeItem = document.querySelector(`[data-component="${activeComponent}"]`);
    if (activeItem) {
        activeItem.classList.add('active');
        const icon = activeItem.querySelector('.check-icon');
        if (icon) icon.style.display = 'inline-block';
        console.log('✅ Item activo marcado:', activeComponent);
    }
}

/* ------------------ Gestión de Dropdown ------------------ */
function initDropdown() {
    console.log('🔄 Inicializando dropdown...');

    const dropdownContainer = document.querySelector('.activity-dropdown');
    const dropdownToggle = document.getElementById('activityDropdown');
    const dropdownMenu = document.getElementById('activityDropdownMenu');

    if (!dropdownContainer || !dropdownToggle || !dropdownMenu) {
        console.error('❌ Elementos del dropdown no encontrados');
        setTimeout(initDropdown, 500);
        return;
    }

    console.log('✅ Elementos del dropdown encontrados');

    const newContainer = dropdownContainer.cloneNode(true);
    dropdownContainer.parentNode.replaceChild(newContainer, dropdownContainer);

    const container = document.querySelector('.activity-dropdown');
    const button = container.querySelector('#activityDropdown');
    const menu = container.querySelector('#activityDropdownMenu');

    let timeout;
    let isOpen = false;

    // Función para abrir dropdown
    function openDropdown() {
        clearTimeout(timeout);
        container.classList.add('active');
        menu.classList.add('show');

        button.setAttribute('aria-expanded', 'true');
        isOpen = true;
        console.log('🖱️ Dropdown abierto');
    }

    // Función para cerrar dropdown
    function closeDropdown(delay = 0) {
        clearTimeout(timeout);

        if (delay > 0) {
            timeout = setTimeout(() => {
                container.classList.remove('active');
                menu.classList.remove('show');

                button.setAttribute('aria-expanded', 'false');
                isOpen = false;
                console.log('🖱️ Dropdown cerrado');
            }, delay);
        } else {
            container.classList.remove('active');
            menu.classList.remove('show');

            button.setAttribute('aria-expanded', 'false');
            isOpen = false;
            console.log('🖱️ Dropdown cerrado');
        }
    }

    // Detectar si es dispositivo táctil
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    if (isTouchDevice) {
        console.log('📱 Dispositivo táctil detectado - usando eventos touch');

        // Para dispositivos táctiles, solo usar click
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            console.log('👆 Touch click en dropdown');

            if (isOpen) {
                closeDropdown();
            } else {
                // Cerrar otros dropdowns primero
                document.querySelectorAll('.activity-dropdown').forEach(otherContainer => {
                    if (otherContainer !== container) {
                        otherContainer.classList.remove('active');
                        const otherMenu = otherContainer.querySelector('.dropdown-menu');
                        const otherButton = otherContainer.querySelector('button');

                        if (otherMenu) otherMenu.classList.remove('show');
                        if (otherButton) otherButton.setAttribute('aria-expanded', 'false');
                    }
                });

                openDropdown();
            }
        });

        // Cerrar al tocar fuera
        document.addEventListener('touchstart', (e) => {
            if (!container.contains(e.target) && isOpen) {
                closeDropdown();
            }
        });

    } else {
        console.log('🖥️ Dispositivo desktop - usando eventos mouse');

        // Para desktop, usar mouse events
        container.addEventListener('mouseenter', () => {
            openDropdown();
        });

        container.addEventListener('mouseleave', () => {
            closeDropdown(300);
        });

        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            console.log('🖱️ Click en dropdown toggle');

            if (isOpen) {
                closeDropdown();
            } else {
                openDropdown();
            }
        });
    }

    // Manejo de selección de items (común para ambos)
    menu.addEventListener('click', (e) => {
        const item = e.target.closest('.dropdown-item[data-component]');

        if (!item) return;

        e.preventDefault();
        e.stopPropagation();

        const componentName = item.getAttribute('data-component');

        console.log('📋 Item seleccionado:', componentName);

        saveSelectedComponent(componentName);
        updateActiveDropdownItem(componentName);
        showOnlyComponent(componentName);

        closeDropdown();
    });

    // Cerrar con Escape (común para ambos)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isOpen) {
            console.log('⌨️ Escape presionado');
            closeDropdown();
        }
    });

    console.log('✅ Dropdown inicializado correctamente');
}

/* ------------------ Gestión de Componentes ------------------ */
function showOnlyComponent(componentName) {
    const allComponents = ['tiempos-melaza', 'unidades-enfriamiento'];

    console.log('🔄 Mostrando componente:', componentName);

    try {
        allComponents.forEach(name => {
            const component = document.getElementById(`component-${name}`);
            if (component) {
                component.style.display = 'none';
                component.classList.add('hidden');
            }
        });

        const selectedComponent = document.getElementById(`component-${componentName}`);
        if (selectedComponent) {
            selectedComponent.style.display = 'block';
            selectedComponent.classList.remove('hidden');
            selectedComponent.offsetHeight;
        }

        currentActiveComponent = componentName;
        console.log('✅ Componente mostrado:', componentName);

        // Inicializar contadores si es el componente de enfriamiento
        if (componentName === 'unidades-enfriamiento') {
            setTimeout(() => {
                initEnfriamientoCounters();
            }, 100);
        }

    } catch (error) {
        console.error('❌ Error al cambiar componente:', error);
    }
}

function initComponentSystem() {
    console.log('🔄 Inicializando sistema de componentes...');

    try {
        const savedComponent = loadSelectedComponent();
        showOnlyComponent(savedComponent);
        currentActiveComponent = savedComponent;
        initDropdownWithRetry();

        setTimeout(() => {
            updateActiveDropdownItem(savedComponent);
        }, 200);

        console.log('✅ Sistema de componentes inicializado con:', savedComponent);

    } catch (error) {
        console.error('❌ Error inicializando componentes:', error);
        setTimeout(initComponentSystem, 1000);
    }
}

function initDropdownWithRetry(attempts = 0) {
    const maxAttempts = 5;

    if (attempts >= maxAttempts) {
        console.error('❌ No se pudo inicializar el dropdown después de', maxAttempts, 'intentos');
        return;
    }

    const container = document.querySelector('.activity-dropdown');
    const toggle = document.getElementById('activityDropdown');
    const menu = document.getElementById('activityDropdownMenu');

    if (!container || !toggle || !menu) {
        console.log('⏳ Elementos no encontrados, reintentando...', attempts + 1);
        setTimeout(() => initDropdownWithRetry(attempts + 1), 200);
        return;
    }

    initDropdown();
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

/* ------------------ Auto refresh ------------------ */
function getRunningTimersCount() {
    return Object.values(isRunning).filter(running => running).length;
}

function anyTimerRunning() {
    return getRunningTimersCount() > 0;
}

function startAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);
    autoRefreshInterval = setInterval(() => {
        if (!autoRefreshEnabled) return;
        if (modalsOpen > 0) {
            console.log('Auto-refresh pausado: modales abiertos');
            return;
        }
        refreshView();
    }, REFRESH_MLS);
}

// Pausa todos los intervalos activos (para evitar duplicados al refrescar DOM)
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
        console.log('🔁 Refresh omitido: ya hay uno en curso');
        return;
    }
    refreshInFlight = true;
    const startedAt = Date.now();

    // showRefreshIndicator();

    const currentComponent = currentActiveComponent;
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    console.log('🔄 Refresh iniciado, componente activo:', currentComponent);

    const dropdownContainer = document.querySelector('.activity-dropdown');
    if (dropdownContainer) {
        dropdownContainer.classList.remove('active');
        const menu = dropdownContainer.querySelector('.dropdown-menu');
        const button = dropdownContainer.querySelector('button');

        if (menu) menu.classList.remove('show');
        if (button) button.setAttribute('aria-expanded', 'false');
    }

    // Limpiar contadores de enfriamiento antes del refresh
    clearAllEnfriamientoCounters();

    $.ajax({
        type: "GET",
        url: window.location.pathname,
        cache: false,
        timeout: 15000,
        success: function (response) {
            if (startedAt < lastRefreshTs) {
                console.log('⏩ Respuesta vieja ignorada');
                return;
            }
            lastRefreshTs = startedAt;

            try {
                // Pausar intervalos ANTES de tocar el DOM
                pauseAllIntervals();

                const newMain = $(response).find('main').html();

                if (newMain) {
                    console.log('📦 Preparando contenido sin parpadeo...');

                    const tempContainer = $('<div>').html(newMain).hide();
                    $('body').append(tempContainer);

                    const allComponents = ['tiempos-melaza', 'unidades-enfriamiento'];
                    allComponents.forEach(name => {
                        const component = tempContainer.find(`#component-${name}`);
                        if (component.length) {
                            component.hide().addClass('hidden');
                        }
                    });

                    const activeComponent = tempContainer.find(`#component-${currentComponent}`);
                    if (activeComponent.length) {
                        activeComponent.show().removeClass('hidden');
                        console.log('✅ Componente activo preparado:', currentComponent);
                    } else {
                        console.warn('⚠️ Componente activo no encontrado, mostrando tiempos-melaza por defecto');
                        const defaultComponent = tempContainer.find('#component-tiempos-melaza');
                        if (defaultComponent.length) {
                            defaultComponent.show().removeClass('hidden');
                        }
                    }

                    const preparedContent = tempContainer.html();
                    $('main').html(preparedContent);
                    tempContainer.remove();

                    // Restaurar posición de scroll
                    window.scrollTo(0, scrollY);

                    // showUpdateNotification();
                    console.log('✅ Vista actualizada sin parpadeo - componente:', currentComponent);

                    bindTimerButtonsSafe();
                    bindTemperatureButtons();
                    bindSolicitudesBtns();

                    setTimeout(() => {
                        currentActiveComponent = currentComponent;
                        initDropdownWithRetry();

                        setTimeout(() => {
                            updateActiveDropdownItem(currentComponent);
                        }, 100);

                        // Reinicializar contadores de enfriamiento si es necesario
                        if (currentComponent === 'unidades-enfriamiento') {
                            setTimeout(() => {
                                initEnfriamientoCounters();
                            }, 200);
                        }
                    }, 50);
                } else {
                    console.warn('No se encontró contenido <main> para actualizar');
                }
            } catch (err) {
                console.error('❌ Error procesando respuesta:', err);
            }
            // hideRefreshIndicator();

            // NOTA: La detección de timers huérfanos en MELAZA se hace en estaciones-melaza.js
            // (en updateEstacionesFromPolling e initEstacionesMelaza), NO aquí,
            // porque los elementos DOM son renderizados dinámicamente por estaciones-melaza.js
            // y no existen inmediatamente después de reemplazar <main>.

            // Re-inicializar timers con el nuevo DOM
            initTimersFromStorage();
            // Sincronizar cronómetros
            timerSyncMelaza.syncActiveTimersFromDB().catch(err => console.error('❌ Error en syncActiveTimersFromDB()', err));
        },
        error: function (xhr, status, error) {
            console.error('❌ Error al actualizar datos:', error);
            // hideRefreshIndicator();
            if (status !== 'timeout' && status !== 'abort') {
                showRefreshError();
            }
        },
        complete: function () {
            refreshInFlight = false;
        }
    });
}

/* ------------------ Funciones de Timer ------------------ */

function loadTimerState(k) {
    const ms = parseInt(localStorage.getItem(`${k}_milliseconds`)) || 0;
    const run = localStorage.getItem(`${k}_isRunning`) === 'true';
    const le = parseInt(localStorage.getItem(`${k}_lastEpoch`)) || 0;
    const cg = localStorage.getItem(`${k}_codeGen`) || null;
    const shipmentId = parseInt(localStorage.getItem(`${k}_shipmentId`)) || null;
    return { ms, run, le, cg, shipmentId };
}

function saveTimerState(k, obj) {
    if (obj.ms !== undefined) localStorage.setItem(`${k}_milliseconds`, obj.ms.toString());
    if (obj.run !== undefined) localStorage.setItem(`${k}_isRunning`, obj.run ? 'true' : 'false');
    if (obj.le !== undefined) localStorage.setItem(`${k}_lastEpoch`, obj.le.toString());
    if (obj.cg !== undefined && obj.cg !== null) localStorage.setItem(`${k}_codeGen`, obj.cg);
    if (obj.shipmentId !== undefined && obj.shipmentId !== null) localStorage.setItem(`${k}_shipmentId`, obj.shipmentId.toString());
}

function clearTimerState(k) {
    localStorage.removeItem(`${k}_milliseconds`);
    localStorage.removeItem(`${k}_isRunning`);
    localStorage.removeItem(`${k}_lastEpoch`);
    localStorage.removeItem(`${k}_codeGen`);
    localStorage.removeItem(`${k}_shipmentId`);
}

function initTimersFromStorage() {
    document.querySelectorAll('[data-timer-id]').forEach(element => {
        const timerId = element.getAttribute('data-timer-id');
        if (!timerId) return;

        const state = loadTimerState(timerId);
        timerCodeGenMap[timerId] = state.cg;

        const txtEl = document.getElementById(timerId);
        const progressBarId = timerId.replace('timer', 'progressBar');
        const progressBarEl = document.getElementById(progressBarId);

        if (state.run && txtEl && progressBarEl) {
            let ms = state.ms;
            if (state.le) ms += (Date.now() - state.le);
            ms = Math.max(0, ms);
            saveTimerState(timerId, { ms, le: Date.now(), run: true });
            lastPerf[timerId] = performance.now();
            startInterval(timerId, ms);
        } else if (txtEl) {
            updateTimerDisplay(timerId, state.ms);
            if (progressBarEl) {
                updateProgressBar(timerId, state.ms);
            }
        }
    });
}



function startInterval(timerId, msStart) {
    const txtEl = document.getElementById(timerId);
    const progressBarId = timerId.replace('timer', 'progressBar');
    const progressBarEl = document.getElementById(progressBarId);

    if (!txtEl || !progressBarEl) {
        console.warn(`⚠️ Elementos UI no encontrados para ${timerId}, timer sincronizado pero no visible`);
        return;
    }

    // Limpiar intervalo anterior si existe
    if (intervals[timerId]) {
        clearInterval(intervals[timerId]);
    }

    isRunning[timerId] = true;
    let ms = msStart;
    lastPerf[timerId] = performance.now();

    progressBarEl.classList.add('timer-active');

    // Actualizar display inmediatamente con tiempo sincronizado
    updateTimerDisplay(timerId, ms);
    updateProgressBar(timerId, ms);

    intervals[timerId] = setInterval(() => {
        const nowp = performance.now();
        const diff = nowp - lastPerf[timerId];
        lastPerf[timerId] = nowp;
        ms += diff;
        ms = Math.max(0, ms);

        // Guardar estado actualizado
        saveTimerState(timerId, { ms, le: Date.now(), run: true });

        updateProgressBar(timerId, ms);
        updateTimerDisplay(timerId, ms);
    }, 50);

    console.log(`🎯 Intervalo iniciado para ${timerId} con ${(ms / 1000 / 60).toFixed(1)} min transcurridos`);
}

function updateProgressBar(timerId, ms) {
    const progressBarId = timerId.replace('timer', 'progressBar');
    const progressBarEl = document.getElementById(progressBarId);

    if (!progressBarEl) return;

    const percentage = Math.min(100, (ms / TIMER_DUR_MELAZA_MLS) * 100);
    progressBarEl.style.width = `${percentage}%`;

    const color = getProgressColor(ms);
    progressBarEl.style.setProperty('background-color', color, 'important');

    progressBarEl.classList.remove('timer-normal', 'timer-warning', 'timer-danger');

    if (ms < TIMER_DUR_MELAZA_MLS / 2) {
        progressBarEl.classList.add('timer-normal');
    } else if (ms < TIMER_DUR_MELAZA_MLS) {
        progressBarEl.classList.add('timer-warning');
    } else {
        progressBarEl.classList.add('timer-danger');
    }
}

function updateTimerDisplay(timerId, ms) {
    const el = document.getElementById(timerId);
    if (!el) return;
    el.textContent = formatTime(ms);
}

/**
 * Formatea el tiempo para mostrar en la UI en formato MM:SS:CS (minutos:segundos:centésimas)
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
 */
function formatTimeForBackend(ms) {
    ms = Math.max(0, ms);
    const h = Math.floor(ms / 3600000); // horas
    const m = Math.floor((ms % 3600000) / 60000); // minutos
    const s = Math.floor((ms % 60000) / 1000); // segundos
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getProgressColor(ms) {
    if (ms < TIMER_DUR_MELAZA_MLS / 2) {
        return "#22C55E";
    } else if (ms < TIMER_DUR_MELAZA_MLS) {
        return "#FF7300";
    } else {
        return "#EF4444";
    }
}

/* ------------------ VALIDACIONES + FLUJOS START/STOP ------------------ */

function startTimerFlow(buttonStart) {
    const codeGen = buttonStart.getAttribute('data-codigo-generacion');
    const timerId = buttonStart.getAttribute('data-timer-id');
    const pileta = buttonStart.getAttribute('data-pileta');
    const shipmentId = parseInt(buttonStart.getAttribute('data-shipment-id'));

    // VALIDACIONES tipo "azúcar"
    if (!shipmentId) {
        console.error('❌ Shipment ID no encontrado');
        showErrorAlert('ID de shipment no encontrado');
        return;
    }
    if (!codeGen) {
        console.error('❌ Código de generación no encontrado');
        showErrorAlert('Código de generación no encontrado');
        return;
    }
    if (!timerId) {
        console.error('❌ Timer no identificado');
        showErrorAlert('Timer no identificado');
        return;
    }

    // Si este cronómetro ya está corriendo
    if (isRunning[timerId]) {
        console.warn(`⚠️ El cronómetro ${timerId} ya está corriendo`);
        showWarningAlert(`Este cronómetro ya está en funcionamiento`);
        return;
    }

    // Validar elementos UI antes de iniciar
    const txtEl = document.getElementById(timerId);
    const progressBarId = timerId.replace('timer', 'progressBar');
    const progressBarEl = document.getElementById(progressBarId);

    if (!txtEl || !progressBarEl) {
        console.error('❌ No se encontró contenedor de cronómetro');
        showErrorAlert("No se encontró contenedor de cronómetro. Recarga la página.");
        return;
    }

    // Validar máximo simultáneos
    const runningCount = getRunningTimersCount();
    if (runningCount >= MAX_SIMULTANEOUS_TIMERS) {
        console.warn(`⚠️ Límite de cronómetros simultáneos alcanzado`);
        showWarningAlert(`Máximo ${MAX_SIMULTANEOUS_TIMERS} cronómetros simultáneos permitidos. Actualmente hay ${runningCount} activos.`);
        return;
    }

    const lockKey = `start_${timerId}`;
    if (executionLocks.has(lockKey)) {
        console.warn(`⚠️ Timer start bloqueado para ${timerId}`);
        return;
    }

    preventMultipleExecutions(lockKey, async () => {
        try {
            disableButtonTemporarily(buttonStart, 0, 'Iniciando...');

            // PASO 1: Registrar en BD primero
            const dbResult = await timerSyncMelaza.startTimerInDB(timerId, codeGen, shipmentId, 'pipa');
            if (!dbResult) {
                console.warn(`⚠️ No se pudo registrar timer en BD, continuando solo localmente`);
            }

            // PASO 2: Iniciar cronómetro local
            timerCodeGenMap[timerId] = codeGen;
            const prevMs = parseInt(localStorage.getItem(`${timerId}_milliseconds`)) || 0;
            saveTimerState(timerId, {
                cg: codeGen,
                shipmentId: shipmentId,
                ms: prevMs,
                le: Date.now(),
                run: true
            });

            isRunning[timerId] = true;
            startInterval(timerId, prevMs);

            const newRunningCount = getRunningTimersCount();
            console.log(`⏱️ Cronómetro iniciado: ${timerId}, Pileta: ${pileta}, ShipmentId: ${shipmentId}. Total activos: ${newRunningCount}/${MAX_SIMULTANEOUS_TIMERS}`);

            const buttonId = buttonStart.id || buttonStart.getAttribute('data-timer-id');
            if (buttonId) restoreButtonFromState(buttonId);
            return true;
        } catch (error) {
            console.error(`❌ Error iniciando timer ${timerId}:`, error);
            showErrorAlert('Error al iniciar cronómetro. Inténtalo de nuevo.');
            const buttonId = buttonStart.id || buttonStart.getAttribute('data-timer-id');
            if (buttonId) restoreButtonFromState(buttonId);
        }
    }, 2000);
}

function stopTimerFlow(btnElement) {
    const btn = typeof btnElement === 'string' ? document.getElementById(btnElement) : btnElement;
    if (!btn) {
        showErrorAlert('Botón de detener no encontrado');
        return;
    }

    const codeGen = btn.getAttribute('data-codigo-generacion');
    const timerId = btn.getAttribute('data-timer-id');
    const pileta = btn.getAttribute('data-pileta');
    const shipmentId = parseInt(btn.getAttribute('data-shipment-id'));
    const truckType = btn.getAttribute('data-truck-type');

    console.log(`🛑 Intentando detener timer: ${timerId} (pileta ${pileta}) para ${codeGen}`);
    console.log(`🔍 Datos del botón:`, { codeGen, timerId, pileta, shipmentId, truckType });

    // VALIDACIONES tipo "azúcar"
    if (!timerId) {
        console.error('❌ Timer no identificado');
        showErrorAlert('Timer no identificado');
        return;
    }
    if (!shipmentId) {
        console.error('❌ Shipment ID no encontrado');
        showErrorAlert('ID de shipment no encontrado');
        return;
    }
    if (!truckType) {
        console.error('❌ Truck type no encontrado');
        showErrorAlert('Tipo de camión no encontrado');
        return;
    }
    if (!codeGen) {
        console.error('❌ Código de generación no encontrado');
        showErrorAlert('Código de generación no encontrado');
        return;
    }

    // Validar que esté corriendo
    if (!isRunning[timerId]) {
        console.error(`❌ Timer ${timerId} NO está corriendo, no se puede detener`);
        console.log(`🔍 Estado isRunning:`, isRunning);
        showWarningAlert('Este cronómetro no está en funcionamiento');
        return;
    }

    // Lock de stop in-flight (doble click)
    if (stopInFlight[timerId]) {
        console.warn(`⚠️ Stop ya en proceso para ${timerId}`);
        return;
    }
    stopInFlight[timerId] = true;

    const lockKey = `stop_${timerId}`;
    if (executionLocks.has(lockKey)) {
        console.warn(`⚠️ Timer stop bloqueado para ${timerId}`);
        stopInFlight[timerId] = false;
        return;
    }

    // Calcular ms efectivos
    let state = loadTimerState(timerId);
    let ms = state.ms;
    if (state.run && state.le) ms += Date.now() - state.le;

    // Validar que haya tiempo
    if (ms <= 0) {
        console.error(`❌ No hay tiempo registrado para enviar: ${ms}ms`);
        showErrorAlert('No hay tiempo registrado para este cronómetro');
        stopInFlight[timerId] = false;
        return;
    }

    // Formatear tiempo para backend y display
    const tiempoBackend = formatTimeForBackend(ms);
    const tiempoDisplay = formatTime(ms);

    const finalizeStop = async (motivo = '') => {
        return preventMultipleExecutions(lockKey, async () => {
            try {
                disableButtonTemporarily(btn, 0, 'Deteniendo...');

                // PASO 1: Detener cronómetro local primero
                clearInterval(intervals[timerId]);
                intervals[timerId] = null;
                isRunning[timerId] = false;
                saveTimerState(timerId, { run: false });

                const progressBarId = timerId.replace('timer', 'progressBar');
                const progressBarEl = document.getElementById(progressBarId);
                if (progressBarEl) {
                    progressBarEl.classList.remove('timer-active', 'timer-normal', 'timer-warning', 'timer-danger');
                    progressBarEl.style.width = '0%';
                    progressBarEl.style.setProperty('background-color', '#22C55E', 'important');
                }

                // PASO 2: Enviar tiempo al backend
                await TiempoMelaza(codeGen, tiempoBackend, motivo, shipmentId, truckType);

                // PASO 3: Limpiar estado local
                clearTimerState(timerId);
                timerCodeGenMap[timerId] = null;

                const txtEl = document.getElementById(timerId);
                if (txtEl) txtEl.textContent = "00:00:00";

                const remainingCount = getRunningTimersCount();
                console.log(`⏹️ Timer detenido: ${timerId}, Pileta: ${pileta}. Restantes: ${remainingCount}/${MAX_SIMULTANEOUS_TIMERS}`);
                console.log(`📤 Tiempo enviado al backend: ${tiempoBackend} (mostrado: ${tiempoDisplay})`);

                // PASO 4: Eliminar de BD solo después de cambio de estado exitoso (en changeStatusMelaza)

                setTimeout(refreshView, 700);
                return true;
            } catch (err) {
                console.error(`Error al detener timer ${timerId}:`, err);
                showErrorAlert(err.message || 'Error al enviar el tiempo');

                // Restaurar estado y reanudar visual desde donde iba
                isRunning[timerId] = true;
                saveTimerState(timerId, { ms, le: Date.now(), run: true });
                startInterval(timerId, ms);
                const buttonId = btn.id || btn.getAttribute('data-timer-id');
                if (buttonId) restoreButtonFromState(buttonId);
                return false;
            } finally {
                stopInFlight[timerId] = false;
            }
        }, 4000);
    };

    if (ms >= TIMER_DUR_MELAZA_MLS) {
        const modal = document.getElementById("confirmationModal");
        if (modal) {
            modal.style.display = "block";
            document.getElementById("confirmStopButton").onclick = function () {
                const motivo = document.getElementById("motivoDetencion").value || '';
                finalizeStop(motivo);
                modal.style.display = "none";
            };
            document.getElementById("cancelStopButton").onclick = function () {
                modal.style.display = "none";
                stopInFlight[timerId] = false;
                const buttonId = btn.id || btn.getAttribute('data-timer-id');
                if (buttonId) restoreButtonFromState(buttonId);
            };
        } else {
            finalizeStop('');
        }
    } else {
        finalizeStop('');
    }
}

async function TiempoMelaza(codeGen, tiempo, comentario, shipmentId, truckType) {
    if (!codeGen) throw new Error('Código de generación requerido');
    if (!shipmentId) throw new Error('ID de shipment requerido');
    if (!truckType) throw new Error('Tipo de camión requerido');

    // Validar formato HH:MM:SS antes de enviar
    const formatoHHMMSS = /^\d{2}:\d{2}:\d{2}$/;
    if (!formatoHHMMSS.test(tiempo)) {
        console.error(`Formato de tiempo incorrecto: ${tiempo} (debe ser HH:MM:SS)`);
        throw new Error(`Formato de tiempo incorrecto: ${tiempo}. Debe ser HH:MM:SS`);
    }

    const lockKey = `tiempomelaza_${codeGen}_${shipmentId}`;

    return preventMultipleExecutions(lockKey, async () => {
        window.AlmapacUtils?.showSpinner();
        try {
            console.log(`🚀 Enviando TiempoMelaza ÚNICO para: ${codeGen} con tiempo: ${tiempo} (formato HH:MM:SS)`);

            const res = await postJson('/TiemposMelaza/TiempoMelaza', {
                codigoGeneracion: codeGen,
                tiempo: tiempo, // Ya viene formateado en HH:MM:SS
                comentario: comentario || '',
                shipmentId: shipmentId,
                truckType: truckType
            });

            console.log("✅ TiempoMelaza OK (ÚNICO):", res);

            await changeStatusMelaza(codeGen);

            return res;
        } finally {
            window.AlmapacUtils?.hideSpinner();
        }
    }, 5000);
}

async function changeStatusMelaza(codeGen) {
    const predefinedStatusId = 9;

    const lockKey = `changestatus_${codeGen}_${predefinedStatusId}`;

    return preventMultipleExecutions(lockKey, async () => {
        try {
            console.log(`🔄 Cambiando estado ÚNICO para: ${codeGen}`);

            const response = await postJson('/TiemposMelaza/ChangeTransactionStatus', {
                codeGen: codeGen,
                predefinedStatusId
            });

            console.log(`✅ Estado cambiado exitosamente para: ${codeGen}`);

            // Liberar timer de BD cuando cambie de estado exitosamente
            const shipmentId = await getShipmentIdFromCodeGen(codeGen);
            if (shipmentId) {
                await timerSyncMelaza.liberarTimerPorShipmentId(shipmentId);
            }

            showSuccessAlert('El estado se actualizó correctamente.');

            return true;
        } catch (e) {
            console.error("Error cambiando estado:", e);

            if (e.message && e.message.includes('ya fue registrado')) {
                console.log('⚠️ Estado ya registrado, continuando...');
                return true;
            }

            showErrorAlert(e.message || 'Error al cambiar estado');
            throw e;
        }
    }, 3000);
}

// Función auxiliar para obtener shipmentId del DOM
function getShipmentIdFromCodeGen(codeGen) {
    try {
        // Buscar en el DOM el elemento que tenga este codeGen y extraer el shipmentId
        const element = document.querySelector(`[data-codigo-generacion="${codeGen}"]`);
        if (element) {
            const shipmentId = parseInt(element.getAttribute('data-shipment-id'));
            return shipmentId || null;
        }

        // Si no lo encontramos en DOM, buscar en el timerCodeGenMap y localStorage
        for (const [timerId, storedCodeGen] of Object.entries(timerCodeGenMap)) {
            if (storedCodeGen === codeGen) {
                const state = loadTimerState(timerId);
                return state.shipmentId || null;
            }
        }

        return null;
    } catch (error) {
        console.error(`❌ Error obteniendo shipmentId para ${codeGen}:`, error);
        return null;
    }
}

async function changeStatus(codigoGeneracion) {
    const predefinedStatusId = 8;
    try {
        window.AlmapacUtils?.showSpinner();
        await postJson('/TiemposMelaza/ChangeTransactionStatus', {
            codeGen: codigoGeneracion,
            predefinedStatusId
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

/* ------------------ FUNCIONES DE SOLICITUD DE UNIDADES MEJORADAS ------------------ */

async function SolicitarUnidad(unidadesSolicitadas) {
    if (counterLocks.pipa) {
        showWarningAlert('Operación en proceso, espere...');
        return;
    }

    if (unidadesSolicitadas <= 0) {
        showWarningAlert('Debe solicitar al menos 1 unidad');
        return;
    }

    counterLocks.pipa = true;

    try {
        window.AlmapacUtils?.showSpinner();
        console.log(`📋 Solicitando ${unidadesSolicitadas} unidades Pipa`);

        await postJson('/TiemposMelaza/SolicitarUnidad', {
            CurrentValue: unidadesSolicitadas
        });

        await showSuccessAlert(`Has solicitado ${unidadesSolicitadas} unidades Pipa.`);

        // Limpiar contadores después de solicitud exitosa
        clearPipaCounterState();

        refreshView();
    } catch (err) {
        console.error("Error solicitando unidad:", err);
        await showErrorAlert(err.message || "Error al solicitar unidades");
        refreshView();
    } finally {
        counterLocks.pipa = false;
        window.AlmapacUtils?.hideSpinner();
    }
}

async function ReducirUnidad(unidadesReducidas) {
    if (counterLocks.pipa) {
        showWarningAlert('Operación en proceso, espere...');
        return;
    }

    if (unidadesReducidas <= 0) {
        showWarningAlert('Debe especificar al menos 1 unidad para reducir');
        return;
    }

    counterLocks.pipa = true;

    try {
        window.AlmapacUtils?.showSpinner();
        console.log(`📋 Reduciendo ${unidadesReducidas} unidades Pipa`);

        await postJson('/TiemposMelaza/ReducirUnidad', {
            UnidadesReducidas: unidadesReducidas
        });

        await showSuccessAlert(`Se eliminaron ${unidadesReducidas} unidades Pipa.`);

        // Limpiar contadores después de reducción exitosa
        clearPipaCounterState();

        refreshView();
    } catch (err) {
        console.error("Error en reducción:", err);
        await showErrorAlert(err.message || "Error al reducir unidades");
        refreshView();
    } finally {
        counterLocks.pipa = false;
        window.AlmapacUtils?.hideSpinner();
    }
}

/**
 * Función mejorada para manejar los botones de solicitud con estado persistente
 */
function bindSolicitudesBtns() {
    console.log('🔗 Vinculando botones de solicitudes...');

    // Cargar estado del contador al inicializar
    loadPipaCounterState();

    const elements = {
        decreaseBtn: document.getElementById('decreaseButtonPipa'),
        increaseBtn: document.getElementById('increaseButtonPipa'),
        numberInput: document.getElementById('numberInputPipa'),
        solicitarBtn: document.getElementById('solicitarPipa')
    };

    // Verificar que todos los elementos existen
    if (!elements.decreaseBtn || !elements.increaseBtn || !elements.numberInput || !elements.solicitarBtn) {
        console.warn('⚠️ Algunos elementos de solicitud no encontrados');
        setTimeout(() => bindSolicitudesBtns(), 500);
        return;
    }

    // Sincronizar con DOM después de cargar estado
    syncPipaCounterWithDOM();

    // Mostrar valor actual
    const currentValue = getCurrentPipaValue();
    updatePipaDisplay(currentValue);

    // Función para decrementar
    const handleDecrease = () => {
        if (counterLocks.pipa) {
            console.warn('⚠️ Contador bloqueado durante operación');
            return;
        }

        const currentValue = getCurrentPipaValue();
        if (currentValue > 0) {
            pipaCounterState.decrementCount++;
            const newValue = getCurrentPipaValue();
            updatePipaDisplay(newValue);
            savePipaCounterState();

            console.log(`⬇️ Decrementado: total=${newValue}, decrements=${pipaCounterState.decrementCount}`);
        }
    };

    // Función para incrementar
    const handleIncrease = () => {
        if (counterLocks.pipa) {
            console.warn('⚠️ Contador bloqueado durante operación');
            return;
        }

        pipaCounterState.incrementCount++;
        const newValue = getCurrentPipaValue();
        updatePipaDisplay(newValue);
        savePipaCounterState();

        console.log(`⬆️ Incrementado: total=${newValue}, increments=${pipaCounterState.incrementCount}`);
    };

    // Función para procesar solicitudes
    const handleSolicitar = async () => {
        if (counterLocks.pipa) {
            showWarningAlert('Operación en proceso, espere...');
            return;
        }

        const { incrementCount, decrementCount } = pipaCounterState;

        console.log(`📊 Estado del contador: increments=${incrementCount}, decrements=${decrementCount}`);

        let operationsPerformed = false;

        try {
            // Procesar incrementos (solicitar unidades)
            if (incrementCount > 0) {
                console.log(`📋 Solicitando ${incrementCount} unidades`);
                await SolicitarUnidad(incrementCount);
                operationsPerformed = true;
            }

            // Procesar decrementos (reducir unidades)
            if (decrementCount > 0) {
                console.log(`📋 Reduciendo ${decrementCount} unidades`);
                await ReducirUnidad(decrementCount);
                operationsPerformed = true;
            }

            if (!operationsPerformed) {
                showWarningAlert('No hay cambios para procesar');
            }

        } catch (error) {
            console.error('❌ Error procesando solicitudes:', error);
            showErrorAlert('Error procesando las solicitudes');
        } finally {
            // Los contadores se limpian en las funciones SolicitarUnidad/ReducirUnidad
            // pero asegurar limpieza aquí también en caso de error
            if (operationsPerformed) {
                clearPipaCounterState();
            }
        }
    };

    // Limpiar event listeners previos
    ['click', 'touchend'].forEach(eventType => {
        elements.decreaseBtn.removeEventListener(eventType, handleDecrease);
        elements.increaseBtn.removeEventListener(eventType, handleIncrease);
        elements.solicitarBtn.removeEventListener(eventType, handleSolicitar);
    });

    // Agregar event listeners
    elements.decreaseBtn.addEventListener('click', handleDecrease);
    elements.increaseBtn.addEventListener('click', handleIncrease);
    elements.solicitarBtn.addEventListener('click', handleSolicitar);

    // Agregar soporte para dispositivos táctiles
    elements.decreaseBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        handleDecrease();
    });

    elements.increaseBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        handleIncrease();
    });

    elements.solicitarBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        handleSolicitar();
    });

    console.log('✅ Botones de solicitudes vinculados correctamente');
    console.log(`📊 Estado inicial del contador:`, pipaCounterState);
}

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

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/[&<>"'`=\/]/g, s => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '/': '&#x2F;', '`': '&#x60;', '=': '&#x3D;'
    })[s]);
}

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

function bindTimerButtonsSafe() {
    if (isBindingEvents) {
        console.log('⚠️ Ya se están vinculando eventos, saltando...');
        return;
    }

    isBindingEvents = true;
    console.log('🔗 Vinculando eventos de botones de forma segura...');

    try {
        $(document).off('click.timerEvents', '.timer-start-btn, .timer-stop-btn');

        $(document).on('click.timerEvents', '.timer-start-btn', function (e) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            console.log('🚀 Click en botón START:', this.id || this.getAttribute('data-timer-id'));
            startTimerFlow(this);
        });

        $(document).on('click.timerEvents', '.timer-stop-btn', function (e) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            console.log('⏹️ Click en botón STOP:', this.id || this.getAttribute('data-timer-id'));
            stopTimerFlow(this);
        });

        console.log('✅ Eventos de botones vinculados correctamente');

    } catch (error) {
        console.error('❌ Error vinculando eventos:', error);
    } finally {
        isBindingEvents = false;
    }
}

function bindTemperatureButtons() {
    console.log('🌡️ Vinculando eventos de botones de temperatura...');

    try {
        $(document).off('click.temperatureEvents', '.temperature-btn');

        $(document).on('click.temperatureEvents', '.temperature-btn', function (e) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            console.log('🌡️ Click en botón temperatura:', this.id);
            mostrarModalTemperaturaPileta(this);
        });

        console.log('✅ Eventos de temperatura vinculados correctamente');

    } catch (error) {
        console.error('❌ Error vinculando eventos de temperatura:', error);
    }
}

function bindTimerButtons() {
    bindTimerButtonsSafe();
}

$(document).ready(function () {
    console.log('🚀 Documento listo - Inicializando aplicación...');
    console.log(`⏱️ Máximo ${MAX_SIMULTANEOUS_TIMERS} cronómetros simultáneos permitidos`);
    console.log('🌍 Zona horaria configurada: UTC-6 (El Salvador)');

    window.AlmapacUtils?.hideSpinner();

    document.querySelectorAll("button").forEach(b => {
        b.addEventListener("click", function (ev) {
            if (this.type !== 'submit') ev.preventDefault();
        });
    });

    setupModalEvents();
    bindTimerButtonsSafe();
    bindTemperatureButtons();
    bindSolicitudesBtns();

    setTimeout(() => {
        initComponentSystem();
    }, 100);

    // NOTA: La detección de timers huérfanos en MELAZA se hace en estaciones-melaza.js
    // (en updateEstacionesFromPolling e initEstacionesMelaza), NO aquí.

    // Inicializar timers visibles desde localStorage
    initTimersFromStorage();

    // TERCERO: Sincronizar cronómetros desde BD al cargar
    setTimeout(() => {
        console.log('🔄 Iniciando sincronización automática desde BD...');
        timerSyncMelaza.syncActiveTimersFromDB();
    }, 1500); // Aumentado a 1.5 segundos para asegurar que todo esté listo

    startAutoRefresh();

    // Pausar/redibujar intervalos al cambiar visibilidad (ahorro CPU y evitar drift)
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            pauseAllIntervals();
        } else {
            initTimersFromStorage();
        }
    });

    console.log('✅ Aplicación inicializada correctamente');
});

// ESTILOS CSS BÁSICOS PARA SWEETALERT Y CONTADORES
(function injectStyles() {
    if (document.getElementById('melaza-styles')) return;
    const style = document.createElement('style');
    style.id = 'melaza-styles';
    style.textContent = `
        .component-section {
            transition: all 0.3s ease;
        }
        .component-section.hidden {
            opacity: 0;
            display: none !important;
        }
        .timer-start-btn:disabled,
        .timer-stop-btn:disabled {
            opacity: 0.6 !important;
            cursor: not-allowed !important;
            pointer-events: none !important;
        }
        .temperatura-popup {
            border-radius: 10px !important;
        }
        .temperatura-popup .swal2-input {
            font-size: 1.1rem !important;
            text-align: center !important;
            font-weight: 600 !important;
            border: 2px solid #FF7300 !important;
        }
        .temperatura-popup .swal2-input:focus {
            border-color: #E85D00 !important;
            box-shadow: 0 0 0 0.2rem rgba(255, 115, 0, 0.25) !important;
        }
        .countdown-warning {
            color: #FF7300 !important;
            font-weight: bold !important;
        }
        .counter-input-pipa {
            background-color: #f8f9fa !important;
            border: 2px solid #28a745 !important;
            border-radius: 5px !important;
            padding: 4px 8px !important;
            min-width: 60px !important;
            display: inline-block !important;
        }
        .counter-input-pipa.changed {
            background-color: #fff3cd !important;
            border-color: #ffc107 !important;
            animation: pulseYellow 1s ease-in-out;
        }
        #decreaseButtonPipa:disabled,
        #increaseButtonPipa:disabled,
        #solicitarPipa:disabled {
            opacity: 0.5 !important;
            cursor: not-allowed !important;
            pointer-events: none !important;
        }
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        @keyframes pulseRed {
            0% { 
                color: #ef4444;
                transform: scale(1);
            }
            50% { 
                color: #dc2626;
                transform: scale(1.1);
            }
            100% { 
                color: #ef4444;
                transform: scale(1);
            }
        }
        @keyframes pulseYellow {
            0% { 
                background-color: #fff3cd;
                transform: scale(1);
            }
            50% { 
                background-color: #ffeaa7;
                transform: scale(1.02);
            }
            100% { 
                background-color: #fff3cd;
                transform: scale(1);
            }
        }
        @keyframes slideInRight {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(style);
})();