/* ===== ESTACIONES DE MELAZA DINÁMICAS ===== */

/* ===== Config ===== */
const MELAZA_TIMER_MS = 12 * 60 * 1000;
const POLLING_CONFIG_MELAZA = {
    ENABLED: true,
    INTERVAL: 30000,
    ENDPOINT: '/TiemposMelaza/ObtenerDatos'
};
const RESPECT_SERVER_ORDER = true;

/* ===== Estado local ===== */
const runMap = {};
const ivMap  = {};
const lastTs = {};
const accMs  = {};
let melazaPollingInterval = null;
let isMelazaPollingActive = false;
let initialized = false;
let currentUnitsData = [];
let lastDataHash = '';
let lastUnitsCount = 0;
let lastActiveSetKey = '';
let confirmationModal = null;

/* ===== Helpers ===== */
const $  = (s, r=document) => typeof s === 'string' ? r.querySelector(s) : null;
const $$ = (s, r=document) => typeof s === 'string' ? Array.from(r.querySelectorAll(s)) : [];

const fmtDisplay = ms => {
    ms = Math.max(0, ms|0);
    const m = Math.floor(ms/60000);
    const s = Math.floor((ms%60000)/1000);
    const cs3 = Math.floor(ms%1000);
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}:${String(cs3).padStart(3,'0')}`;
};

const fmtBackend = ms => {
    ms = Math.max(0, ms|0);
    const h=Math.floor(ms/3600000), m=Math.floor((ms%3600000)/60000), s=Math.floor((ms%60000)/1000);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
};

const pbColor = ms => ms < MELAZA_TIMER_MS/2 ? 'pb-green' : (ms < MELAZA_TIMER_MS ? 'pb-orange' : 'pb-red');

function isEstacionesComponentVisible() {
    const component = document.getElementById('component-descarga-unidades');
    return component && component.classList.contains('active');
}

async function postJSON(url, body, isSilent = false) {
    try {
        // Obtener el token anti-falsificación
        const tokenElement = document.querySelector('input[name="__RequestVerificationToken"]');
        const headers = {'Content-Type':'application/json'};

        // Preparar el body
        let requestBody = body || {};

        // Si existe el token, agregarlo tanto en headers como en el body
        if (tokenElement && tokenElement.value) {
            headers['RequestVerificationToken'] = tokenElement.value;
            headers['X-CSRF-TOKEN'] = tokenElement.value;
            // También incluir en el body para ASP.NET Core
            requestBody.__RequestVerificationToken = tokenElement.value;
        }

        const r = await fetch(url, {
            method:'POST',
            headers: headers,
            body:JSON.stringify(requestBody),
            credentials: 'same-origin' // Importante para enviar cookies de sesión
        });
        const txt = await r.text();
        let j = {};
        try {
            j = txt ? JSON.parse(txt) : {};
        } catch(parseError) {
            if (!isSilent) {
                console.error('Error parsing JSON response:', parseError);
            }
            throw new Error('Error en la respuesta del servidor: formato inválido');
        }

        if (!r.ok || (typeof j.success==='boolean' && !j.success)) {
            const errorMessage = j.message || `HTTP ${r.status}`;
            if (!isSilent) {
                console.error('API Error:', errorMessage);
            }
            throw new Error(errorMessage);
        }
        return j;
    } catch (networkError) {
        if (networkError.name === 'TypeError' && networkError.message.includes('fetch')) {
            throw new Error('Error de conexión: No se pudo conectar con el servidor');
        }
        throw networkError;
    }
}

/* ===== MODAL DE CONFIRMACIÓN ===== */
function createConfirmationModal() {
    if (confirmationModal) {
        return confirmationModal;
    }

    const modalHTML = `
        <div id="confirmationModal" class="modal" tabindex="-1" role="dialog">
            <div class="modal-dialog" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">¿Desea detener el cronómetro?</h5>
                        <button type="button" class="close" aria-label="Close">
                            <span aria-hidden="true">&times;</span>
                        </button>
                    </div>
                    <div class="modal-body">
                        <p>El tiempo ha sobrepasado el límite estimado. Por favor selecciona una opción para explicar el motivo del retraso:</p>
                        <select id="motivoDetencion" class="form-control">
                            <option value="sin_observaciones">Sin observaciones</option>
                            <option value="vaciando_pileta">Activación de bombeo/vaciar pileta</option>
                            <option value="cambio_turno">Cambio de turno</option>
                            <option value="corte_energia">Corte de energía eléctrica</option>
                            <option value="melaza_espesa">Melaza muy espesa</option>
                            <option value="lluvia">Lluvia</option>
                            <option value="problema_escotilla_camion">Problema en escotilla de descarga del camión</option>
                            <option value="rebalse_pileta">Rebalse de pileta</option>
                        </select>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-primary" id="confirmStopButton">Confirmar</button>
                        <button type="button" class="btn btn-secondary" id="cancelStopButton">Cancelar</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    confirmationModal = document.getElementById('confirmationModal');
    
    return confirmationModal;
}

function showStopConfirmationModal(btn, callback) {
    const modal = createConfirmationModal();
    const motivoSelect = document.getElementById('motivoDetencion');
    const confirmBtn = document.getElementById('confirmStopButton');
    const cancelBtn = document.getElementById('cancelStopButton');
    const closeBtn = modal.querySelector('.close');
    
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('show'), 10);
    document.body.style.overflow = 'hidden';
    motivoSelect.selectedIndex = 0;
    
    const newConfirmBtn = confirmBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    const newCloseBtn = closeBtn.cloneNode(true);
    confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
    closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
    
    const closeModal = () => {
        modal.classList.remove('show');
        setTimeout(() => {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }, 150);
        motivoSelect.selectedIndex = 0;
    };
    
    newConfirmBtn.addEventListener('click', () => {
        const motivo = motivoSelect.value;
        closeModal();
        callback(motivo);
    });
    newCancelBtn.addEventListener('click', closeModal);
    newCloseBtn.addEventListener('click', closeModal);
    
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    const handleEsc = (e) => { if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', handleEsc);} };
    document.addEventListener('keydown', handleEsc);
}

/* ===== GENERACIÓN DINÁMICA DE TARJETAS ===== */
function generateEstacionCard(unit, index) {
    const timerId = `timerPileta_${unit.id}`;
    const progressBarId = `progressBarPileta_${unit.id}`;
    const startButtonId = `startButtonPileta_${unit.id}`;
    const stopButtonId = `stopButtonPileta_${unit.id}`;
    const tempButtonId = `temperatureButtonPileta_${unit.id}`;
    
    const headerClass = unit.currentStatus === 7 ? "header-disponible" : "header-ocupada";
    const headerText = unit.vehicle?.trailerPlate || `UNIDAD #${index + 1}`;
    const ingenio = (unit.ingenio?.name || '').replace(/_/g, ' ');
    const trailerPlate = unit.vehicle?.trailerPlate || '';
    const plate = unit.vehicle?.plate || '';
    const truckType = unit.vehicle?.truckType || '';
    
    const uiState = unit.currentStatus === 7 ? 'temp' : (unit.currentStatus === 8 ? 'start' : 'empty');

    return `
        <div class="estacion-card"
             id="estacion_${unit.id}"
             data-pileta="${unit.id}"
             data-state="${uiState}"
             data-running="0"
             data-codigo-generacion="${unit.codeGen}"
             data-shipment-id="${unit.id}"
             data-truck-type="${truckType}">
            <div class="estacion-header ${headerClass}">
               ${headerText}
            </div>

            <div class="estacion-body">
                <div class="progress-section">
                    <div class="progress-bar-container">
                        <div id="${progressBarId}" class="progress-bar" style="width:0%;"></div>
                        <div id="${timerId}" class="timer-label">00:00:00</div>
                    </div>
                </div>

                <div class="estacion-info">
                    <div class="info-row">
                        <span class="info-label">Ingenio:</span>
                        <span class="info-value">${ingenio}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Placa Remolque:</span>
                        <span class="info-value">${trailerPlate}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Placa Camión:</span>
                        <span class="info-value">${plate}</span>
                    </div>
                </div>

                <div class="estacion-controls">
                    ${unit.currentStatus === 7 ? `
                        <button id="${tempButtonId}"
                                type="button"
                                class="btn btn-temp"
                                data-role="btn-temperature"
                                data-codigo-generacion="${unit.codeGen}"
                                data-shipment-id="${unit.id}"
                                data-trailerplate="${trailerPlate}"
                                data-plate="${plate}"
                                data-ingenio="${ingenio}"
                                data-pileta="${unit.id}">
                            <i class='fa fa-thermometer-full'></i>
                            Temperatura
                        </button>
                    ` : unit.currentStatus === 8 ? `
                        <button id="${startButtonId}"
                                type="button"
                                class="btn btn-start"
                                data-role="btn-start"
                                data-timer-id="${timerId}"
                                data-progress-bar-id="${progressBarId}"
                                data-trailerplate="${trailerPlate}"
                                data-codigo-generacion="${unit.codeGen}"
                                data-shipment-id="${unit.id}"
                                data-truck-type="${truckType}"
                                data-pileta="${unit.id}">
                            <i class="fas fa-play"></i>
                            Iniciar
                        </button>
                        <button id="${stopButtonId}"
                                type="button"
                                class="btn btn-stop u-hidden"
                                data-role="btn-stop"
                                data-timer-id="${timerId}"
                                data-progress-bar-id="${progressBarId}"
                                data-trailerplate="${trailerPlate}"
                                data-codigo-generacion="${unit.codeGen}"
                                data-shipment-id="${unit.id}"
                                data-truck-type="${truckType}"
                                data-pileta="${unit.id}">
                            <i class="fas fa-stop"></i>
                            Detener
                        </button>
                    ` : ''}
                </div>
            </div>
        </div>
    `;
}

function renderEstaciones(units) {
    const loading = $('#estacionesLoading');
    const container = $('#estacionesContainer');
    const emptyState = $('#estacionesEmpty');
    const errorState = $('#estacionesError');

    if (!container) {
        console.error('Container estacionesContainer no encontrado');
        return;
    }

    // Ocultar loading
    if (loading) loading.style.display = 'none';

    const validUnits = units.filter(unit => unit && unit.id && unit.currentStatus);

    if (!validUnits || validUnits.length === 0) {
        // Mostrar estado vacío
        container.style.display = 'none';
        if (errorState) errorState.style.display = 'none';
        if (emptyState) emptyState.style.display = 'flex';
        return;
    }

    // Mostrar contenido
    const cardsHTML = validUnits.map((unit, index) => generateEstacionCard(unit, index)).join('');
    container.innerHTML = cardsHTML;
    container.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';
    if (errorState) errorState.style.display = 'none';

    bindAll();

    console.log(`Renderizadas ${validUnits.length} estaciones (orden servidor optimizado)`);
}

/* ===== PRESERVAR Y RESTAURAR TIMERS (MEJORADO) ===== */
function extractShipmentIdFromTimerId(timerId) {
    // timerId formato: "timerPileta_123" -> retorna 123
    const match = timerId.match(/timerPileta_(\d+)/);
    return match ? parseInt(match[1], 10) : null;
}

function preserveTimerStates() {
    const activeTimerStates = {};
    
    // Solo preservar timers de unidades que realmente existen en currentUnitsData
    const currentUnitIds = new Set((currentUnitsData || []).map(u => u.id));
    
    Object.keys(runMap).forEach(timerId => {
        if (runMap[timerId]) {
            // Extraer shipmentId del timerId (formato: timerPileta_X)
            const shipmentId = extractShipmentIdFromTimerId(timerId);
            
            // Solo preservar si la unidad aún existe
            if (shipmentId && currentUnitIds.has(shipmentId)) {
                activeTimerStates[timerId] = {
                    accMs: accMs[timerId] || 0,
                    lastTs: lastTs[timerId] || performance.now(),
                    running: true,
                    shipmentId: shipmentId
                };
                console.log(`Preservando timer válido: ${timerId} para shipment ${shipmentId}`);
            } else {
                console.log(`Timer obsoleto ignorado: ${timerId} (shipment ${shipmentId} no existe)`);
                // Limpiar el timer obsoleto inmediatamente
                if (ivMap[timerId]) {
                    clearInterval(ivMap[timerId]);
                    ivMap[timerId] = null;
                }
                runMap[timerId] = false;
                delete accMs[timerId];
                delete lastTs[timerId];
            }
        }
    });
    
    console.log(`Preservados ${Object.keys(activeTimerStates).length} timers válidos`);
    return activeTimerStates;
}

function restoreTimerStates(savedStates) {
    console.log(`Intentando restaurar ${Object.keys(savedStates).length} timers...`);
    
    // Crear set de IDs de unidades actuales para validación
    const currentUnitIds = new Set((currentUnitsData || []).map(u => u.id));
    
    Object.keys(savedStates).forEach(timerId => {
        const element = document.getElementById(timerId);
        const state = savedStates[timerId];
        
        // Validar que el elemento existe y la unidad sigue siendo válida
        if (element && state.running && currentUnitIds.has(state.shipmentId)) {
            const elapsed = performance.now() - state.lastTs;
            startInterval(timerId, state.accMs + elapsed);
            console.log(`Timer restaurado: ${timerId} con ${state.accMs + elapsed}ms`);
        } else {
            console.log(`Timer no restaurado: ${timerId} (elemento: ${!!element}, shipment válido: ${currentUnitIds.has(state.shipmentId)})`);
        }
    });
}

function cleanupObsoleteTimers() {
    if (!currentUnitsData || currentUnitsData.length === 0) {
        // Si no hay unidades, limpiar todos los timers
        console.log('No hay unidades activas, limpiando todos los timers...');
        Object.keys(runMap).forEach(timerId => {
            if (runMap[timerId]) {
                if (ivMap[timerId]) {
                    clearInterval(ivMap[timerId]);
                    ivMap[timerId] = null;
                }
                runMap[timerId] = false;
            }
        });
        Object.keys(accMs).forEach(key => delete accMs[key]);
        Object.keys(lastTs).forEach(key => delete lastTs[key]);
        return true; // Indica que se limpiaron timers
    }

    const currentUnitIds = new Set(currentUnitsData.map(u => u.id));
    const obsoleteTimers = [];

    Object.keys(runMap).forEach(timerId => {
        const shipmentId = extractShipmentIdFromTimerId(timerId);
        if (shipmentId && !currentUnitIds.has(shipmentId)) {
            obsoleteTimers.push(timerId);
        }
    });

    if (obsoleteTimers.length > 0) {
        console.log(`Limpiando ${obsoleteTimers.length} timers obsoletos:`, obsoleteTimers);
        obsoleteTimers.forEach(timerId => {
            if (ivMap[timerId]) {
                clearInterval(ivMap[timerId]);
                ivMap[timerId] = null;
            }
            runMap[timerId] = false;
            delete accMs[timerId];
            delete lastTs[timerId];
        });
        return true; // Indica que se limpiaron timers
    }
    
    return false; // No se limpiaron timers
}

function getActiveSetKey() {
    return Object.keys(runMap).filter(k => runMap[k]).sort().join('|');
}

function rerenderPreservingTimers() {
    if (!initialized || !isEstacionesComponentVisible()) return;
    const saved = preserveTimerStates();
    
    renderEstaciones(currentUnitsData);
    
    setTimeout(() => restoreTimerStates(saved), 100);
}

/* ===== SISTEMA DE POLLING SILENCIOSO ===== */
function startMelazaPolling() {
    if (!POLLING_CONFIG_MELAZA.ENABLED) {
        console.log('Polling de melaza deshabilitado por configuración');
        return;
    }
    if (isMelazaPollingActive) {
        console.log('Polling de melaza ya está activo');
        return;
    }
    console.log(`Iniciando polling silencioso de melaza cada ${POLLING_CONFIG_MELAZA.INTERVAL / 1000} segundos`);
    isMelazaPollingActive = true;

    melazaPollingInterval = setInterval(() => {
        if (isEstacionesComponentVisible() && initialized) {
            performSilentMelazaPolling();
        } else {
            console.log('Componente estaciones ya no visible, deteniendo polling');
            stopMelazaPolling();
        }
    }, POLLING_CONFIG_MELAZA.INTERVAL);
}

function stopMelazaPolling() {
    if (!isMelazaPollingActive) return;
    console.log('Deteniendo polling de melaza');
    isMelazaPollingActive = false;
    if (melazaPollingInterval) {
        clearInterval(melazaPollingInterval);
        melazaPollingInterval = null;
    }
}

async function performSilentMelazaPolling() {
    try {
        console.log('Ejecutando polling silencioso de melaza...');
        const response = await postJSON(POLLING_CONFIG_MELAZA.ENDPOINT, {}, true);
        if (response && response.success && response.data) {
            const newUnits = response.data.unidadesDescarga || [];
            
            // Validar que las unidades tienen datos mínimos requeridos
            const validUnits = newUnits.filter(unit => 
                unit && 
                unit.id && 
                unit.id > 0 && 
                (unit.currentStatus === 7 || unit.currentStatus === 8) &&
                unit.vehicle &&
                unit.vehicle.truckType === 'P'
            );
            
            console.log(`Polling completado - Total: ${newUnits.length}, Válidas: ${validUnits.length}`);
            
            updateEstacionesFromPolling({ unidadesDescarga: validUnits });
            console.log('Polling silencioso de melaza completado exitosamente');
        } else {
            console.warn('Respuesta de polling de melaza sin datos válidos:', response);
        }
    } catch (error) {
        console.error('Error en polling silencioso de melaza:', error);
        if (error.message.includes('conexión') || error.message.includes('network')) {
            console.log('Error de conexión en polling de melaza, continuando...');
        }
    }
}

function updateEstacionesFromPolling(data) {
    if (!initialized || !isEstacionesComponentVisible()) return;
    
    try {
        const newUnits = data.unidadesDescarga || [];
        console.log('Datos recibidos del polling:', newUnits.length, 'unidades');

        // PASO 1: Generar hash de los nuevos datos
        const newDataHash = generateDataHash(newUnits);
        
        // PASO 2: Comparar cambios (incluyendo cambio de datos a vacío)
        const hashChanged = lastDataHash !== newDataHash;
        const countChanged = newUnits.length !== lastUnitsCount;
        
        // PASO 3: Detectar cambios específicos de unidades
        const currentUnitIds = new Set(newUnits.map(u => u.id));
        const existingUnitIds = new Set(currentUnitsData.map(u => u.id));
        
        const hasRemovedUnits = Array.from(existingUnitIds).some(id => !currentUnitIds.has(id));
        const hasNewUnits = Array.from(currentUnitIds).some(id => !existingUnitIds.has(id));
        
        // PASO 4: Limpiar timers obsoletos si hay unidades removidas
        let cleanedTimers = false;
        if (hasRemovedUnits || newUnits.length === 0) {
            const obsoleteTimers = [];
            Object.keys(runMap).forEach(timerId => {
                const shipmentId = extractShipmentIdFromTimerId(timerId);
                if (shipmentId && !currentUnitIds.has(shipmentId)) {
                    obsoleteTimers.push(timerId);
                }
            });

            if (obsoleteTimers.length > 0) {
                console.log(`Limpiando ${obsoleteTimers.length} timers obsoletos:`, obsoleteTimers);
                obsoleteTimers.forEach(timerId => {
                    if (ivMap[timerId]) {
                        clearInterval(ivMap[timerId]);
                        ivMap[timerId] = null;
                    }
                    runMap[timerId] = false;
                    delete accMs[timerId];
                    delete lastTs[timerId];
                });
                cleanedTimers = true;
            }
        }

        // PASO 5: Solo actualizar si hay cambios REALES
        if (!hashChanged && !countChanged && !cleanedTimers) {
            console.log('No hay cambios significativos, manteniendo estado actual');
            return;
        }

        console.log('Actualizando estaciones por:', {
            hashChanged: hashChanged,
            countChanged: countChanged,
            hasRemovedUnits: hasRemovedUnits,
            hasNewUnits: hasNewUnits,
            cleanedTimers: cleanedTimers,
            oldCount: lastUnitsCount,
            newCount: newUnits.length
        });

        // PASO 6: Preservar timers válidos
        const savedTimerStates = preserveTimerStates();

        // PASO 7: Actualizar datos y renderizar
        currentUnitsData = newUnits;
        lastDataHash = newDataHash;
        lastUnitsCount = newUnits.length;
        lastActiveSetKey = getActiveSetKey();

        renderEstaciones(newUnits);

        // PASO 8: Restaurar timers válidos con delay
        setTimeout(() => {
            restoreTimerStates(savedTimerStates);
        }, 100);
        
        console.log('Actualización completada exitosamente');
    } catch (error) {
        console.error('Error actualizando estaciones desde polling:', error);
    }
}

function generateDataHash(units) {
    if (!Array.isArray(units) || units.length === 0) return 'empty:0';
    const normalized = units.map((u, i) => {
        const pre = u?.dateTimePrecheckeo ? new Date(u.dateTimePrecheckeo).toISOString() : '';
        const plate = u?.vehicle?.plate || '';
        const trailer = u?.vehicle?.trailerPlate || '';
        const ing = u?.ingenio?.name || '';
        return `${i}:${u?.id}|${u?.currentStatus}|${u?.codeGen || ''}|${pre}|${plate}|${trailer}|${ing}`;
    }).join('||');
    let h = 0;
    for (let i = 0; i < normalized.length; i++) {
        h = (h * 31 + normalized.charCodeAt(i)) | 0;
    }
    return `${units.length}:${h}`;
}

/* ===== BOTÓN ÚNICO (Start/Stop) ===== */
function setButtonState(card, running){
    const start = $('[data-role="btn-start"]', card);
    const stop  = $('[data-role="btn-stop"]', card);
    
    if (start) start.classList.toggle('u-hidden', !!running);
    if (stop)  stop.classList.toggle('u-hidden', !running);
    
    card.dataset.running = running ? '1' : '0';
    
    if (running) {
        const timerId = start?.dataset.timerId || stop?.dataset.timerId;
        if (timerId && runMap[timerId] && !ivMap[timerId]) {
            startVisualInterval(timerId);
        }
    }
}

function startVisualInterval(timerId) {
    const label = document.getElementById(timerId);
    const barId = timerId.replace('timer','progressBar');
    const bar = document.getElementById(barId);
    if (!label || !bar) return;

    if (ivMap[timerId]) clearInterval(ivMap[timerId]);

    const tick = () => {
        const now = performance.now();
        accMs[timerId] += now - lastTs[timerId];
        lastTs[timerId] = now;

        label.textContent = fmtDisplay(accMs[timerId]);
        const pct = Math.min(100, accMs[timerId] / MELAZA_TIMER_MS * 100);
        bar.style.width = `${pct}%`;
        bar.classList.remove('pb-green','pb-orange','pb-red');
        bar.classList.add(pbColor(accMs[timerId]));
    };
    
    tick();
    ivMap[timerId] = setInterval(tick, 50);
}

function maybeRerenderOnActiveChange() {
    const activeKeyNow = getActiveSetKey();
    if (activeKeyNow !== lastActiveSetKey) {
        lastActiveSetKey = activeKeyNow;
        console.log('Cambio en timers activos detectado, esperando próximo polling para reordenar...');
        
        setTimeout(() => {
            if (POLLING_CONFIG_MELAZA.ENABLED && isMelazaPollingActive) {
                performSilentMelazaPolling();
            }
        }, 500);
    }
}

/* ===== TIMER ===== */
function startInterval(timerId, msStart){
    const label = document.getElementById(timerId);
    const barId = timerId.replace('timer','progressBar');
    const bar = document.getElementById(barId);
    if (!label || !bar) return;

    if (ivMap[timerId]) clearInterval(ivMap[timerId]);

    runMap[timerId] = true;
    accMs[timerId]  = msStart|0;
    lastTs[timerId] = performance.now();

    const card = label.closest('.estacion-card');
    setButtonState(card, true);

    const tick = () => {
        const now = performance.now();
        accMs[timerId] += now - lastTs[timerId];
        lastTs[timerId] = now;

        label.textContent = fmtDisplay(accMs[timerId]);
        const pct = Math.min(100, accMs[timerId] / MELAZA_TIMER_MS * 100);
        bar.style.width = `${pct}%`;
        bar.classList.remove('pb-green','pb-orange','pb-red');
        bar.classList.add(pbColor(accMs[timerId]));
    };
    tick();
    ivMap[timerId] = setInterval(tick, 50);

    maybeRerenderOnActiveChange();
}

function stopInterval(timerId){
    if (ivMap[timerId]) clearInterval(ivMap[timerId]);
    ivMap[timerId] = null;
    runMap[timerId] = false;

    const label = document.getElementById(timerId);
    const barId = timerId.replace('timer','progressBar');
    const bar = document.getElementById(barId);
    if (label) label.textContent = '00:00:00';
    if (bar){ bar.style.width = '0%'; bar.classList.remove('pb-green','pb-orange','pb-red'); }

    const card = label?.closest('.estacion-card');
    if (card) setButtonState(card, false);

    maybeRerenderOnActiveChange();
}

/* ===== SYNC TIMERS ACTIVOS ===== */
async function syncActiveTimers(){
    try{
        const r = await fetch('/TimerSync/active/melaza');
        if (!r.ok) {
            console.warn('No se pudieron obtener timers activos:', r.status);
            return;
        }
        
        const j = await r.json();
        if (!j.success || !Array.isArray(j.data)) {
            console.warn('Respuesta de timers activos inválida:', j);
            return;
        }

        Object.keys(runMap).forEach(key => runMap[key] = false);
        Object.keys(accMs).forEach(key => accMs[key] = 0);
        Object.keys(lastTs).forEach(key => lastTs[key] = 0);

        j.data.forEach(t=>{
            const timerId = t.timerId;
            const started = Number(t.startedAtMilliseconds||0);
            if (!timerId || !started) return;
            
            const elapsed = Math.max(0, Date.now() - started);
            
            runMap[timerId] = true;
            accMs[timerId] = elapsed;
            lastTs[timerId] = performance.now();
            
            console.log(`Timer sincronizado: ${timerId} - ${elapsed}ms elapsed`);
        });
        
        console.log(`Sincronizados ${j.data.length} timers activos`);
    }catch(e){ 
        console.warn('syncActiveTimers error:', e.message); 
    }
}

/* ===== FLUJOS DE NEGOCIO ===== */
async function flowTemperatura(btn){
    const codeGen = btn.dataset.codigoGeneracion;
    const shipmentId = parseInt(btn.dataset.shipmentId||'0',10);
    if (!codeGen || !shipmentId){ Swal.fire('Error','Faltan datos de la unidad','error'); return; }

    const first = await Swal.fire({
        title:'Temperatura',
        html:'<p style="font-size:18px;font-weight:600; text-align:center;">Ingrese la temperatura (°C):</p>',
        input:'number',
        inputAttributes:{ min:'0', max:'100', step:'0.1', inputmode:'decimal', placeholder:'Ej: 39.5' },
        confirmButtonText:'Confirmar',
        confirmButtonColor:'#0F2A62',
        showCancelButton: true,
        cancelButtonText:'Cancelar', 
        cancelButtonColor:'#d33'
    });
    if (!first.isConfirmed) return;

    const t = parseFloat(String(first.value));
    if (isNaN(t) || t < 0 || t > 50){ 
        await Swal.fire({
            title: 'Valor inválido',
            text: 'La temperatura debe estar entre 0° y 50°',
            confirmButtonText: 'Aceptar',
            confirmButtonColor: '#0F2A62'
        });
        return; 
    }

    const ok2 = await Swal.fire({
        html:`
        <h2 style="font-size:26px;font-weight:700; text-align:center; margin-bottom:12px">¿Esta seguro del valor de temperatura a registrar?</h2>
        <div style="font-size:26px;font-weight:700">${t}°</div>`,
        confirmButtonText:'Confirmar', 
        confirmButtonColor:'#0F2A62', 
        showCancelButton:true, 
        cancelButtonText:'Cancelar',
        cancelButtonColor:'#d33'
    }).then(r=>r.isConfirmed);
    if (!ok2) return;

    if (t > 41){
        const goCool = await Swal.fire({
            html:`
            <h2 style="font-size:26px;font-weight:700; text-align:center; margin-bottom:12px">La temperatura es mayor a 41°</h2>
            <hr style="margin:12px 0"/>
            <div style="font-size:26px;font-weight:700">${t}°</div><div style="margin-top:8px; font-size:20px; font-weight:600">¿Enviar a enfriamiento?</div>`,
            showCancelButton:true,
            confirmButtonText:'Sí',
            cancelButtonText:'No',
            confirmButtonColor:'#0F2A62',
            cancelButtonColor:'#d33',
            buttonsStyling: true,
            customClass: {
            actions: 'swal-buttons-spacing',
            }
        }).then(r=>r.isConfirmed);
        if (!goCool) return;

        try {
            console.log('Enviando unidad a enfriamiento:', { codeGen, temperature: t, origen: 'cola' });
            const response = await postJSON('/TiemposMelaza/RegistrarTemperatura', { codeGen, temperature:t, origen:'cola' });
            console.log('Respuesta del servidor:', response);

            // Verificar si hubo algún problema en el cambio de estado
            if (response && response.message && response.message.includes('problema')) {
                console.warn('Advertencia en la respuesta:', response.message);
                await Swal.fire({
                    title: 'Advertencia',
                    html: `<div style="font-size:18px;">${response.message}</div>`,
                    icon: 'warning',
                    confirmButtonText: 'Aceptar',
                    confirmButtonColor: '#0F2A62'
                });
            } else {
                await Swal.fire({
                    title: `Camión ${btn.dataset.trailerplate||''}`,
                    html: `<div style="font-size:24px;font-weight:600; margin-bottom:8px">Enviado a enfriamiento</div>`,
                    confirmButtonText: 'Aceptar',
                    confirmButtonColor: '#0F2A62'
                });
            }

            // Actualizar estado de la unidad (status 15 = enfriamiento)
            console.log('Actualizando estado de unidad a enfriamiento...');
            updateUnitStatusAfterTemperature(shipmentId, 15);

            // Actualizar la vista después de un delay
            if (POLLING_CONFIG_MELAZA.ENABLED && isMelazaPollingActive) {
                setTimeout(() => performSilentMelazaPolling(), 1000);
            }
        } catch (error) {
            console.error('Error enviando a enfriamiento:', error);
            await Swal.fire({
                title: 'Error',
                text: 'No se pudo enviar la unidad a enfriamiento: ' + error.message,
                icon: 'error',
                confirmButtonText: 'Aceptar',
                confirmButtonColor: '#0F2A62'
            });
        }
        return;
    }

    try {
        await postJSON('/TiemposMelaza/RegistrarTemperatura', { codeGen, temperature:t, origen:'cola' });
        await Swal.fire({ 
            title: 'Temperatura registrada correctamente', 
            html: `<div style="font-size:24px;font-weight:700">${t}°C</div>`, 
            confirmButtonText: 'Aceptar',
            confirmButtonColor: '#0F2A62'
        });
        console.log('Temperatura registrada, actualizando estado de unidad...');
        setTimeout(() => { if (POLLING_CONFIG_MELAZA.ENABLED && isMelazaPollingActive) performSilentMelazaPolling(); }, 500);
        updateUnitStatusAfterTemperature(shipmentId, 8);
    } catch (error) {
        console.error('Error registrando temperatura:', error);
        Swal.fire('Error', 'No se pudo registrar la temperatura: ' + error.message, 'error');
    }
}

function updateUnitStatusAfterTemperature(shipmentId, newStatus) {
    const unitIndex = currentUnitsData.findIndex(u => u.id === shipmentId);
    if (unitIndex !== -1) {
        console.log(`Actualizando estado local de unidad ${shipmentId} a status ${newStatus}`);
        const savedTimerStates = preserveTimerStates();

        // Si el nuevo estado es enfriamiento (15), remover la unidad de la lista
        // porque ya no debe aparecer en la vista de estaciones
        if (newStatus === 15) {
            console.log(`Removiendo unidad ${shipmentId} de estaciones (enviada a enfriamiento)`);
            currentUnitsData.splice(unitIndex, 1);
        } else {
            // Para otros estados, solo actualizar el status
            currentUnitsData[unitIndex].currentStatus = newStatus;
        }

        lastDataHash = generateDataHash(currentUnitsData);
        lastUnitsCount = currentUnitsData.length;
        renderEstaciones(currentUnitsData);
        setTimeout(() => restoreTimerStates(savedTimerStates), 100);
        console.log('Estado local actualizado correctamente');
    }
}

async function flowStart(btn){
    const codeGen = btn.dataset.codigoGeneracion;
    const shipmentId = parseInt(btn.dataset.shipmentId||'0',10);
    const truckType = btn.dataset.truckType||'';
    const timerId = btn.dataset.timerId;

    if (!codeGen || !shipmentId || !truckType || !timerId){
        Swal.fire('Error','Faltan datos de la unidad','error');
        return;
    }

    const ok = await Swal.fire({
        title:'¿Desea iniciar el tiempo de descarga de la unidad?',
        showCancelButton:true, confirmButtonText:'Confirmar', cancelButtonText:'Cancelar',
        confirmButtonColor:'#0F2A62', cancelButtonColor:'#d33'
    }).then(r=>r.isConfirmed);
    if (!ok) return;

    try {
        console.log('Iniciando timer:', { timerId, codeGen, shipmentId, tipoTimer:'melaza', tipoUnidad:truckType });
        const sync = await postJSON('/TimerSync/start', { timerId, codeGen, shipmentId, tipoTimer:'melaza', tipoUnidad:truckType });
        console.log('Timer iniciado exitosamente:', sync);

        const startedAt = sync?.data?.startedAtMilliseconds ? Number(sync.data.startedAtMilliseconds) : Date.now();
        const elapsed = Math.max(0, Date.now() - startedAt);
        startInterval(timerId, elapsed);

        setTimeout(() => { if (POLLING_CONFIG_MELAZA.ENABLED && isMelazaPollingActive) performSilentMelazaPolling(); }, 1000);
    } catch (error) {
        console.error('Error al iniciar el timer:', error);
        await Swal.fire({
            title: 'Error',
            text: 'No se pudo iniciar el cronómetro: ' + error.message,
            icon: 'error',
            confirmButtonText: 'Aceptar',
            confirmButtonColor: '#0F2A62'
        });
    }
}

async function flowStop(btn){
    const codeGen = btn.dataset.codigoGeneracion;
    const shipmentId = parseInt(btn.dataset.shipmentId||'0',10);
    const truckType = btn.dataset.truckType||'';
    const timerId = btn.dataset.timerId;
    const trailerPlate = btn.dataset.trailerplate || '';
    
    if (!codeGen || !shipmentId || !truckType || !timerId){ 
        Swal.fire('Error','Faltan datos de la unidad','error'); 
        return; 
    }

    let ms = accMs[timerId]||0;
    if (runMap[timerId] && lastTs[timerId]) ms += performance.now() - lastTs[timerId];
    if (ms <= 0){ 
        Swal.fire('Advertencia','No hay tiempo para registrar','warning'); 
        return; 
    }

    const hasExceededLimit = ms > MELAZA_TIMER_MS;

    if (hasExceededLimit) {
        showStopConfirmationModal(btn, async (motivo) => { 
            await stopWithObservation(btn, ms, motivo); 
        });
        return;
    }

    const confirmStop = await Swal.fire({
        html: `
            <h2 style="font-size:24px; font-weight:600; margin-bottom:12px;">¿Desea detener el cronómetro?</h2>
            <div style="font-size:16px; text-align:center">
                 <div style="font-size:20px; font-weight:600; margin-bottom:8px;">Vehículo: ${trailerPlate || 'Sin placa'}</div>
                <div style="font-size:20px; font-weight:600;">
                   <span>Tiempo transcurrido:<span/>
                   <br>
                   <span>${fmtDisplay(ms)}<span/>
                </div>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: 'Confirmar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#0F2A62',
        cancelButtonColor: '#6c757d',
    });

    if (!confirmStop.isConfirmed) return;

    await stopWithObservation(btn, ms, '');
}

async function stopWithObservation(btn, ms, motivo) {
    const codeGen = btn.dataset.codigoGeneracion;
    const shipmentId = parseInt(btn.dataset.shipmentId||'0',10);
    const truckType = btn.dataset.truckType||'';
    const timerId = btn.dataset.timerId;
    const tiempo = fmtBackend(ms);

    try {
        console.log('Deteniendo timer:', { timerId, codeGen, shipmentId, tiempo, motivo });

        // PASO 1: Registrar el tiempo de melaza
        await postJSON('/TiemposMelaza/TiempoMelaza', {
            codigoGeneracion: codeGen,
            tiempo,
            comentario: motivo || '',
            shipmentId,
            truckType
        });
        console.log('✅ Tiempo de melaza registrado exitosamente');

        // PASO 2: Cambiar estado a finalizado
        await postJSON('/TiemposMelaza/ChangeTransactionStatus', { codeGen, predefinedStatusId:9 });
        console.log('✅ Estado cambiado a finalizado');

        // PASO 3: Liberar el timer del SQLite (solo si todo fue exitoso)
        try {
            await postJSON('/TiemposMelaza/LiberarTimer', { shipmentId });
            console.log('✅ Timer liberado de SQLite');
        } catch (liberarError) {
            // Si falla al liberar el timer, solo registrarlo como advertencia
            // El proceso principal fue exitoso
            console.warn('⚠️ Advertencia al liberar timer de SQLite:', liberarError.message);
        }

        // PASO 4: Detener el timer visual y del sistema de sincronización
        try {
            await postJSON('/TimerSync/stop', { timerId });
            console.log('✅ Timer de sincronización detenido');
        } catch (stopError) {
            // Si el timer no existe en TimerSync, solo registrar advertencia
            console.warn('⚠️ Advertencia al detener timer de sincronización:', stopError.message);
        }

        // Detener el intervalo visual
        stopInterval(timerId);
        console.log('✅ Intervalo visual detenido');

        const message = motivo && motivo !== 'sin_observaciones'
            ? `Duración: ${fmtDisplay(ms)}`
            : `Duración: ${fmtDisplay(ms)}`;

        await Swal.fire({
            title: 'Tiempo registrado',
            text: message,
            confirmButtonColor: '#0F2A62',
            confirmButtonText: 'Aceptar'
        });

        if (POLLING_CONFIG_MELAZA.ENABLED && isMelazaPollingActive) {
            setTimeout(() => performSilentMelazaPolling(), 1000);
        }

    } catch (error) {
        console.error('❌ Error al registrar tiempo:', error);
        await Swal.fire({
            title: 'Error',
            text: 'No se pudo registrar el tiempo: ' + error.message,
            icon: 'error',
            confirmButtonText: 'Aceptar',
            confirmButtonColor: '#0F2A62'
        });
    }
}

/* ===== BIND EVENTOS ===== */
function bindAll(){
    $$('[data-role="btn-temperature"]').forEach(b=> b.addEventListener('click', ()=>flowTemperatura(b)));
    $$('[data-role="btn-start"]').forEach(b=> b.addEventListener('click', ()=>flowStart(b)));
    $$('[data-role="btn-stop"]').forEach(b=> b.addEventListener('click', ()=>flowStop(b)));
    
    $$('.estacion-card').forEach(card => {
        const timerId = $('[data-timer-id]', card)?.dataset.timerId;
        if (timerId && runMap[timerId]) {
            setButtonState(card, true);
        } else {
            setButtonState(card, false);
        }
    });
    
    console.log('Eventos vinculados para', $$('.estacion-card').length, 'estaciones');
}

/* ===== INICIALIZACIÓN OPTIMIZADA ===== */
async function initEstacionesMelaza() {
    if (!isEstacionesComponentVisible()) {
        console.log('Componente estaciones no visible');
        return false;
    }
    
    try {
        console.log('Inicializando Estaciones de Melaza dinámicas...');
        
        // PASO 1: Limpiar estado anterior
        Object.keys(runMap).forEach(key => runMap[key] = false);
        Object.keys(accMs).forEach(key => delete accMs[key]);
        Object.keys(lastTs).forEach(key => delete lastTs[key]);
        
        // PASO 2: Sincronizar timers activos
        console.log('Sincronizando timers activos...');
        await syncActiveTimers();
        console.log('Timers sincronizados correctamente');
        
        // PASO 3: SIEMPRE obtener datos frescos del servidor, ignorar datos iniciales
        console.log('Obteniendo datos actualizados del servidor...');
        let finalData = [];
        
        try {
            const response = await postJSON(POLLING_CONFIG_MELAZA.ENDPOINT, {}, true);
            if (response && response.success && response.data) {
                const newUnits = response.data.unidadesDescarga || [];
                const validUnits = newUnits.filter(unit => 
                    unit && 
                    unit.id && 
                    unit.id > 0 && 
                    (unit.currentStatus === 7 || unit.currentStatus === 8) &&
                    unit.vehicle &&
                    unit.vehicle.truckType === 'P'
                );
                
                finalData = validUnits;
                console.log('Datos frescos del servidor:', finalData.length, 'unidades válidas');
            }
        } catch (error) {
            console.warn('Error obteniendo datos del servidor, usando datos iniciales como fallback:', error);
            
            // Solo usar datos iniciales como último recurso si falla la API
            const initialData = window.initialUnidadesDescarga || [];
            finalData = initialData.filter(unit => 
                unit && 
                unit.id && 
                unit.id > 0 && 
                (unit.currentStatus === 7 || unit.currentStatus === 8)
            );
            console.log('Usando datos iniciales como fallback:', finalData.length, 'unidades válidas');
        }
        
        // PASO 4: Establecer estado inicial con datos frescos
        currentUnitsData = finalData;
        lastDataHash = generateDataHash(finalData);
        lastUnitsCount = finalData.length;
        lastActiveSetKey = getActiveSetKey();
        
        // PASO 5: Renderizar UNA SOLA VEZ con datos frescos
        renderEstaciones(finalData);
        
        // PASO 6: Aplicar timers activos
        setTimeout(() => {
            document.querySelectorAll('.estacion-card').forEach(card => {
                const timerId = card.querySelector('[data-timer-id]')?.dataset.timerId;
                if (timerId && runMap[timerId]) {
                    setButtonState(card, true);
                    startVisualInterval(timerId);
                }
            });
        }, 150);
        
        // PASO 7: Iniciar polling con delay para evitar duplicación
        setTimeout(() => {
            startMelazaPolling();
        }, 3000); // Delay más largo para evitar polling inmediato
        
        initialized = true;
        
        console.log('Estaciones de Melaza dinámicas inicializadas exitosamente');
        return true;
    } catch (error) {
        console.error('Error inicializando Estaciones de Melaza:', error);
        initialized = false;
        return false;
    }
}

function destroyEstacionesMelaza() {
    console.log('Destruyendo Estaciones de Melaza');
    
    stopMelazaPolling();
    
    // Limpiar todos los intervalos
    Object.keys(ivMap).forEach(timerId => {
        if (ivMap[timerId]) {
            clearInterval(ivMap[timerId]);
            ivMap[timerId] = null;
        }
    });
    
    // Limpiar todos los estados
    Object.keys(runMap).forEach(key => delete runMap[key]);
    Object.keys(accMs).forEach(key => delete accMs[key]);
    Object.keys(lastTs).forEach(key => delete lastTs[key]);
    
    // Resetear variables globales
    currentUnitsData = [];
    lastDataHash = '';
    lastUnitsCount = 0;
    lastActiveSetKey = '';
    initialized = false;
    
    // Limpiar modal si existe
    if (confirmationModal) {
        confirmationModal.remove();
        confirmationModal = null;
    }
    
    console.log('Destrucción completa finalizada');
}

function refreshEstacionesMelaza() {
    if (isEstacionesComponentVisible()) {
        console.log('Refrescando Estaciones de Melaza...');
        destroyEstacionesMelaza();
        setTimeout(() => initEstacionesMelaza(), 100);
    }
}

function enableMelazaPolling() {
    POLLING_CONFIG_MELAZA.ENABLED = true;
    if (initialized && isEstacionesComponentVisible()) startMelazaPolling();
    console.log('Polling de melaza habilitado');
}

function disableMelazaPolling() {
    POLLING_CONFIG_MELAZA.ENABLED = false;
    stopMelazaPolling();
    console.log('Polling de melaza deshabilitado');
}

/* ===== EVENT LISTENERS ===== */
document.addEventListener('menuNavigation', (event) => {
    const { from, to } = event.detail;
    if (to === 'descarga-unidades') {
        console.log('Navegando a descarga-unidades');
        setTimeout(() => { initEstacionesMelaza(); }, 150);
    } else if (from === 'descarga-unidades') {
        console.log('Navegando fuera de descarga-unidades');
        destroyEstacionesMelaza();
    }
});

document.addEventListener('visibilitychange', () => {
    if (!document.hidden && initialized && isEstacionesComponentVisible()) {
        console.log('Página visible - continuando con polling silencioso...');
    } else if (document.hidden && initialized) {
        console.log('Página oculta - polling continuará verificando visibilidad');
    }
});

console.log('Módulo Estaciones de Melaza Dinámicas cargado');