/*************************************************************
 * UNIDADES EN ENFRIAMIENTO - MÓDULO REORGANIZADO
 *************************************************************/

/* ==================== CONSTANTES Y CONFIGURACIÓN ==================== */

const GOOD_TEMPERATURE_THRESHOLD = 41.0;
const MAX_TEMPERATURES_PER_UNIT = 4;
const ENFRIAMIENTO_CACHE_DURATION = 30000; // 30 segundos

/* ==================== VARIABLES DE ESTADO GLOBAL ==================== */

// Gestión de contadores de enfriamiento
const enfriamientoCounters = {};

// Control de ejecuciones múltiples para enfriamiento
const enfriamientoExecutionLocks = new Map();

// Control de estado del módulo
let enfriamientoInitialized = false;
let initializationInProgress = false;
let lastEnfriamientoDataLoad = 0;
let isLoadingEnfriamientoData = false;
let countersInitialized = false;

/* ==================== GESTIÓN DE CONTADORES DE TIEMPO ==================== */

/**
 * Inicializa todos los contadores de enfriamiento en la página
 */
function initEnfriamientoCounters() {
    // Evitar doble inicialización de contadores
    if (countersInitialized) {
        console.log('Contadores ya inicializados, evitando duplicación');
        return;
    }
    
    console.log('Inicializando contadores de enfriamiento...');
    
    // Buscar todas las tarjetas de enfriamiento con contadores directos
    document.querySelectorAll('[data-target-time]').forEach(element => {
        const targetTimeStr = element.getAttribute('data-target-time');
        const codeGen = element.closest('[data-codigo-generacion]')?.getAttribute('data-codigo-generacion');
        
        if (targetTimeStr && codeGen) {
            console.log(`Procesando contador directo para ${codeGen} con tiempo objetivo: ${targetTimeStr}`);
            startEnfriamientoCounter(element, targetTimeStr, codeGen);
        }
    });
    
    // Búsqueda adicional por atributos NextTemperatureTime del modelo
    document.querySelectorAll('.unidad-enfriamiento-vertical-card').forEach(card => {
        const codeGen = card.getAttribute('data-codigo-generacion');
        const nextTempTimeStr = card.getAttribute('data-next-temperature-time');
        const countdownElement = card.querySelector('[data-target-time], .temperature-countdown');
        
        if (codeGen && nextTempTimeStr && countdownElement && !countdownElement.hasAttribute('data-processed')) {
            console.log(`Procesando NextTemperatureTime para ${codeGen}: ${nextTempTimeStr}`);
            countdownElement.setAttribute('data-processed', 'true');
            startEnfriamientoCounter(countdownElement, nextTempTimeStr, codeGen);
        }
    });
    
    countersInitialized = true; // Marcar como inicializados
}

/**
 * Inicia un contador individual de enfriamiento
 */
function startEnfriamientoCounter(element, targetTimeStr, codeGen) {
    try {
        const targetTime = new Date(targetTimeStr);
        if (isNaN(targetTime.getTime())) {
            console.error('No se pudo parsear la fecha objetivo:', targetTimeStr);
            return;
        }
        
        const countdownId = `countdown_${codeGen}`;
        
        // Limpiar contador anterior si existe
        if (enfriamientoCounters[countdownId]) {
            clearInterval(enfriamientoCounters[countdownId]);
        }
        
        const updateCounter = () => {
            const now = new Date();
            const timeRemaining = targetTime.getTime() - now.getTime();
            
            const displayElement = element.querySelector('.countdown-display') || 
                                   element.querySelector('.countdown-timer') || 
                                   element;
                                   
            if (!displayElement) {
                console.warn('No se encontró elemento de display para el countdown');
                return;
            }
            
            // Obtener la tarjeta contenedora
            const card = element.closest('.unidad-enfriamiento-vertical-card');
            const temperatureCount = card ? parseInt(card.getAttribute('data-temperature-count') || '0') : 0;

            // Verificar si se ha alcanzado el límite máximo de temperaturas
            if (temperatureCount >= MAX_TEMPERATURES_PER_UNIT) {
                element.classList.add('countdown-expired');
                displayElement.innerHTML = '<span class="expired-text">Regresar a ingenio</span>';
                
                // Marcar la tarjeta como que necesita acción (regresar a ingenio)
                if (card) {
                    card.classList.add('time-for-temperature');
                }
                
                // Limpiar intervalo
                clearInterval(enfriamientoCounters[countdownId]);
                delete enfriamientoCounters[countdownId];
                return;
            }
            
            // Verificar si el tiempo ha expirado
            if (timeRemaining <= 0) {
                element.classList.add('countdown-expired');
                displayElement.innerHTML = '<span class="expired-text">¡Tiempo cumplido!</span>';
                
                // Marcar la tarjeta como que necesita temperatura
                if (card) {
                    card.classList.add('time-for-temperature');
                }
                
                // Limpiar intervalo
                clearInterval(enfriamientoCounters[countdownId]);
                delete enfriamientoCounters[countdownId];
                
                console.log(`Tiempo cumplido para ${codeGen}`);
            } else {
                // Calcular y mostrar tiempo restante
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
                
                // Remover clase time-for-temperature si el tiempo aún no ha expirado
                if (card) {
                    card.classList.remove('time-for-temperature');
                }
            }
        };
        
        // Actualizar inmediatamente y luego cada segundo
        updateCounter();
        enfriamientoCounters[countdownId] = setInterval(updateCounter, 1000);
        
        console.log(`Contador iniciado para ${codeGen}`);
        
    } catch (error) {
        console.error('Error iniciando contador de enfriamiento:', error);
        console.error('targetTimeStr recibido:', targetTimeStr);
    }
}

/**
 * Limpia todos los contadores activos
 */
function clearAllEnfriamientoCounters() {
    Object.keys(enfriamientoCounters).forEach(countdownId => {
        clearInterval(enfriamientoCounters[countdownId]);
        delete enfriamientoCounters[countdownId];
    });
    countersInitialized = false; // Resetear flag de inicialización
    console.log('Todos los contadores de enfriamiento limpiados');
}

/* ==================== GESTIÓN DE TEMPERATURA CON SWEETALERT ==================== */

/**
 * Muestra el modal de temperatura para una unidad específica
 */
function mostrarModalTemperaturaEnfriamiento(element) {
    const temperatureCount = parseInt(element.getAttribute('data-temperature-count') || '0');
    
    // Verificar si ya se han tomado 4 temperaturas
    if (temperatureCount >= MAX_TEMPERATURES_PER_UNIT) {
        Swal.fire({
            title: 'Límite alcanzado', 
            text: 'Esta unidad ya ha alcanzado el límite máximo de 4 temperaturas registradas. La unidad debe regresar al ingenio',
            showConfirmButton: true,
            confirmButtonText: 'Aceptar',
            confirmButtonColor: '#0F2A62'
        });
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
 * Maneja la lógica completa del SweetAlert de temperatura
 */
async function mostrarSweetAlertTemperatura(data, origen = 'enfriamiento') {
    if (!data.codeGen) {
        Swal.fire('Error', 'Código de generación no encontrado', 'error');
        return;
    }

    // Primer modal: solicitar temperatura
    const first = await Swal.fire({
        title: 'Temperatura',
        html: '<p style="font-size:18px;font-weight:600; text-align:center;">Ingrese la temperatura (°C):</p>',
        input: 'number',
        inputAttributes: { min: '0', max: '100', step: '0.1', inputmode: 'decimal', placeholder: 'Ej: 39.5' },
        confirmButtonText: 'Confirmar',
        confirmButtonColor: '#0F2A62',
        showCancelButton: true,
        cancelButtonText: 'Cancelar',
        cancelButtonColor: '#d33'
    });

    if (!first.isConfirmed) return;

    // Validar temperatura ingresada
    const temperatura = parseFloat(String(first.value));
    if (isNaN(temperatura) || temperatura < 0 || temperatura > 50) {
        Swal.fire({
            title: 'Valor inválido', 
            text: 'La temperatura debe estar entre 0° y 50°',
            confirmButtonText: 'Aceptar',
            confirmButtonColor: '#0F2A62'
        });
        return;
    }

    // Segundo modal: confirmar temperatura
    const confirmacion = await Swal.fire({
        html: `
        <h2 style="font-size:26px;font-weight:700; text-align:center; margin-bottom:12px">¿Esta seguro del valor de temperatura a registrar?</h2>
        <div style="font-size:26px;font-weight:700">${temperatura}°</div>`,
        showCancelButton: true,
        confirmButtonText: 'Confirmar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#0F2A62',
        cancelButtonColor: '#d33'
    });

    if (!confirmacion.isConfirmed) return;

    // Procesar según el valor de temperatura
    if (temperatura > GOOD_TEMPERATURE_THRESHOLD) {
        await procesarTemperaturaAlta(data.codeGen, temperatura, origen);
    } else {
        await procesarTemperaturaBuena(data.codeGen, temperatura, origen);
    }
}

/**
 * Procesa temperaturas mayores a 41°C (se mantiene en enfriamiento)
 */
async function procesarTemperaturaAlta(codeGen, temperatura, origen) {
    try {
        await registrarTemperatura(codeGen, temperatura, origen);
        await Swal.fire({
            title: 'Temperatura registrada',
            html: `<div style="font-size:22px;font-weight:600; margin-bottom:6px">Se mantiene en enfriamiento</div>`,
            confirmButtonText: 'Aceptar',
            confirmButtonColor: '#0F2A62'
        });

        // Refresh después de registrar temperatura con delay
        setTimeout(() => refreshEnfriamientoData(), 1000);
    } catch (error) {
        console.error('Error registrando temperatura alta:', error);
        Swal.fire('Error', 'No se pudo registrar la temperatura: ' + error.message, 'error');
    }
}

/**
 * Procesa temperaturas menores o iguales a 41°C (pasa a descarga)
 */
async function procesarTemperaturaBuena(codeGen, temperatura, origen) {
    try {
        await registrarTemperatura(codeGen, temperatura, origen);
        await Swal.fire({
            html: `
            <h2 style="font-size:24px;font-weight:700; text-align:center; margin-bottom:12px">Temperatura registrada</h2>
            <hr style="margin:12px 0"/>
            <p style="font-size:24px;font-weight:700">La unidad pasará a descarga</p>
            <br/>
            <div style="font-size:24px;font-weight:700">${temperatura}°C</div>`,
            confirmButtonText: 'Aceptar',
            confirmButtonColor: '#0F2A62'
        });
        
        console.log('Temperatura registrada, la unidad regresará a descarga...');
        // Refresh después de registrar temperatura con delay
        setTimeout(() => refreshEnfriamientoData(), 1500);
    } catch (error) {
        console.error('Error registrando temperatura buena:', error);
        Swal.fire('Error', 'No se pudo registrar la temperatura: ' + error.message, 'error');
    }
}

/**
 * Registra la temperatura en el servidor
 */
async function registrarTemperatura(codeGen, temperatura, origen = 'enfriamiento') {
    const lockKey = `registrar_temperatura_${codeGen}`;
    
    try {
        await preventMultipleExecutions(lockKey, async () => {
            if (window.AlmapacUtils && window.AlmapacUtils.showSpinner) {
                window.AlmapacUtils.showSpinner();
            }
            
            console.log(`Registrando temperatura ${temperatura}°C para ${codeGen} (origen: ${origen})`);
            
            await postJson('/TiemposMelaza/RegistrarTemperatura', {
                codeGen: codeGen,
                temperature: temperatura,
                origen: origen
            });
            
            return true;
        }, 3000);
        
    } catch (error) {
        console.error('Error registrando temperatura:', error);
        throw error;
    } finally {
        if (window.AlmapacUtils && window.AlmapacUtils.hideSpinner) {
            window.AlmapacUtils.hideSpinner();
        }
    }
}

/* ==================== ACTUALIZACIÓN DE DATOS Y UI ==================== */

/**
 * Actualiza los datos de enfriamiento desde el servidor
 */
async function refreshEnfriamientoData() {
    // Prevenir múltiples cargas simultáneas
    if (isLoadingEnfriamientoData) {
        console.log('Ya se están cargando datos de enfriamiento, evitando consulta duplicada');
        return;
    }

    try {
        isLoadingEnfriamientoData = true;
        console.log('Cargando datos de enfriamiento...');
        
        // Mostrar spinner solo si no hay datos previos
        const hasExistingData = document.querySelectorAll('.unidad-enfriamiento-vertical-card').length > 0;
        if (!hasExistingData && window.AlmapacUtils && window.AlmapacUtils.showSpinner) {
            window.AlmapacUtils.showSpinner();
        }
        
        // Limpiar contadores antes de actualizar
        clearAllEnfriamientoCounters();
        
        // Obtener datos del servidor
        const timestamp = new Date().getTime();
        const response = await fetch(`/TiemposMelaza/ObtenerDatosEnfriamiento?t=${timestamp}`, {
            method: 'GET',
            cache: 'no-cache',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });
        
        if (!response.ok) {
            console.error('Error obteniendo datos de enfriamiento:', response.statusText);
            throw new Error(`Error HTTP: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('📦 Respuesta del servidor:', result);

        if (result.success) {
            // Normalizar datos (puede ser null, undefined, o un array)
            const datos = Array.isArray(result.data) ? result.data : [];
            console.log('Datos de enfriamiento obtenidos:', datos.length, 'unidades');

            // Actualizar la interfaz de usuario
            updateEnfriamientoUI(datos);
            lastEnfriamientoDataLoad = Date.now();

            // Reinicializar contadores solo si hay datos
            if (datos.length > 0) {
                initEnfriamientoCounters();
            }
        } else {
            // Respuesta no exitosa
            console.warn('⚠️ Respuesta sin éxito:', result);
            updateEnfriamientoUI([]);
        }
        
    } catch (error) {
        console.error('Error actualizando datos de enfriamiento:', error);

        // Mostrar estado de error en la UI
        const loading = document.getElementById('enfriamientoLoading');
        const container = document.getElementById('enfriamientoContainer');
        const emptyState = document.getElementById('enfriamientoEmpty');
        const errorState = document.getElementById('enfriamientoError');
        const errorMessage = document.getElementById('enfriamientoErrorMessage');

        if (loading) loading.style.display = 'none';
        if (container) container.style.display = 'none';
        if (emptyState) emptyState.style.display = 'none';
        if (errorState) {
            errorState.style.display = 'flex';
            if (errorMessage) {
                errorMessage.textContent = 'No se pudieron cargar los datos de enfriamiento';
            }
        }

        Swal.fire({
            title: 'Error',
            text: 'No se pudieron actualizar los datos.',
            confirmButtonColor: '#0F2A62',
            timer: 3000
        });
    } finally {
        isLoadingEnfriamientoData = false;
        if (window.AlmapacUtils && window.AlmapacUtils.hideSpinner) {
            window.AlmapacUtils.hideSpinner();
        }
    }
}

/**
 * Actualiza la interfaz de usuario con las unidades de enfriamiento
 */
function updateEnfriamientoUI(unidades) {
    console.log('🔄 Actualizando UI de enfriamiento con', unidades?.length || 0, 'unidades');

    const loading = document.getElementById('enfriamientoLoading');
    const container = document.getElementById('enfriamientoContainer');
    const emptyState = document.getElementById('enfriamientoEmpty');
    const errorState = document.getElementById('enfriamientoError');

    console.log('📍 Elementos encontrados:', {
        loading: !!loading,
        container: !!container,
        emptyState: !!emptyState,
        errorState: !!errorState
    });

    // Ocultar loading
    if (loading) {
        loading.style.display = 'none';
        console.log('✅ Loading oculto');
    }

    // Manejar caso sin unidades
    if (!unidades || unidades.length === 0) {
        console.log('📭 Sin unidades, mostrando estado vacío');
        if (container) container.style.display = 'none';
        if (errorState) errorState.style.display = 'none';
        if (emptyState) {
            emptyState.style.display = 'flex';
            console.log('✅ Estado vacío mostrado');
        }
        return;
    }

    // Manejar caso con unidades
    console.log('📦 Con unidades, mostrando contenido');
    if (container) {
        // Crear estructura de unidades
        const grid = document.createElement('div');
        grid.className = 'unidades-cola-vertical-grid';
        grid.innerHTML = unidades.map(unidad => createUnidadCard(unidad)).join('');

        container.innerHTML = '';
        container.appendChild(grid);
        container.style.display = 'block';

        if (emptyState) emptyState.style.display = 'none';
        if (errorState) errorState.style.display = 'none';
        console.log('✅ Contenedor mostrado con', unidades.length, 'tarjetas');
    }
}

/**
 * Maneja el estado cuando no hay unidades
 */
function handleEmptyUnidadesState(section, emptyContainer) {
    // Ocultar sección principal si existe
    if (section) {
        section.style.display = 'none';
    }
    
    // Mostrar o crear mensaje vacío
    if (!emptyContainer) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'unidades-cola-empty-simple';
        emptyDiv.innerHTML = `
            <div class="empty-simple-card">
                <h4>Sin unidades en enfriamiento</h4>
                <p>Actualmente no hay unidades que requieran enfriamiento.</p>
            </div>
        `;
        
        // Insertar después del título
        const title = document.querySelector('.enfriamiento-title');
        if (title && title.parentNode) {
            title.parentNode.insertBefore(emptyDiv, title.nextSibling);
        }
    } else {
        emptyContainer.style.display = 'block';
    }
}

/**
 * Maneja el estado cuando hay unidades para mostrar
 */
function handleUnidadesWithData(section, emptyContainer, unidades) {
    // Ocultar mensaje vacío si existe
    if (emptyContainer) {
        emptyContainer.style.display = 'none';
    }
    
    // Buscar o crear la sección de unidades
    let targetSection = section;
    if (!targetSection) {
        targetSection = document.createElement('div');
        targetSection.className = 'unidades-enfriamiento-section';
        
        const title = document.querySelector('.enfriamiento-title');
        if (title && title.parentNode) {
            title.parentNode.insertBefore(targetSection, title.nextSibling);
        }
    }
    
    // Buscar o crear el grid
    let grid = targetSection.querySelector('.unidades-cola-vertical-grid');
    if (!grid) {
        grid = document.createElement('div');
        grid.className = 'unidades-cola-vertical-grid';
        targetSection.appendChild(grid);
    }
    
    // Construir el HTML de las tarjetas
    grid.innerHTML = unidades.map(unidad => createUnidadCard(unidad)).join('');
    
    // Mostrar la sección
    targetSection.style.display = 'block';
    
    console.log('UI de enfriamiento actualizada exitosamente');
}

/* ==================== GENERACIÓN DE HTML DE TARJETAS ==================== */

/**
 * Crea el HTML para una tarjeta de unidad individual
 */
function createUnidadCard(unidad) {
    // Calcular fechas y tiempos
    const latestTempDate = unidad.latestTemperatureDate ? new Date(unidad.latestTemperatureDate) : null;
    const nextTempDate = latestTempDate ? new Date(latestTempDate.getTime() + (3 * 60 * 60 * 1000)) : null; // +3 horas
    const isTimeForTemperature = unidad.isTimeForTemperature || false;
    const temperatureCount = unidad.temperatureCount || 0;
    
    // Determinar si necesita acción (tiempo cumplido o regresar a ingenio)
    const needsAction = isTimeForTemperature || temperatureCount >= MAX_TEMPERATURES_PER_UNIT;
    
    // Calcular tiempo transcurrido desde ingreso
    const ingressDate = unidad.dateTimePrecheckeo ? new Date(unidad.dateTimePrecheckeo) : null;
    const timeElapsedText = calculateTimeElapsed(ingressDate);
    
    // Generar HTML components
    const countdownHtml = generateCountdownHtml(nextTempDate, isTimeForTemperature, temperatureCount);
    const temperatureHistoryHtml = generateTemperatureHistoryHtml(unidad);
    const cardInfoHtml = generateCardInfoHtml(unidad, ingressDate, timeElapsedText);
    
    return `
        <div class="unidad-enfriamiento-vertical-card ${needsAction ? 'time-for-temperature' : ''}"
             data-transporter="${escapeHtml(unidad.driver?.name || '')}"
             data-trailerplate="${escapeHtml(unidad.vehicle?.trailerPlate || '')}"
             data-plate="${escapeHtml(unidad.vehicle?.plate || '')}"
             data-codigo-generacion="${unidad.codeGen}"
             data-shipment-id="${unidad.id}"
             data-ingenio="${escapeHtml((unidad.ingenio?.name || '').replace(/_/g, ' '))}"
             data-transaccion="${unidad.id || 'Sin Datos'}"
             data-producto="${escapeHtml(unidad.product || '')}"
             data-temperatura="${unidad.latestTemperature?.toFixed(1) || 'N/A'}"
             data-temperature-count="${temperatureCount}"
             data-last-temperature-date="${latestTempDate ? latestTempDate.toISOString() : ''}"
             onclick="mostrarModalTemperaturaEnfriamiento(this)">

            ${countdownHtml}
            
            <div class="card-content-vertical-enfriamiento">
                ${cardInfoHtml}
                ${temperatureHistoryHtml}
            </div>
        </div>
    `;
}

/**
 * Calcula el tiempo transcurrido desde el ingreso
 */
function calculateTimeElapsed(ingressDate) {
    if (!ingressDate) return 'No disponible';
    
    const elapsed = Date.now() - ingressDate.getTime();
    const hours = Math.floor(elapsed / (1000 * 60 * 60));
    const minutes = Math.floor((elapsed % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours} horas y ${minutes} minutos`;
}

/**
 * Genera el HTML del countdown con valores calculados inmediatamente
 */
function generateCountdownHtml(nextTempDate, isTimeForTemperature, temperatureCount) {
    if (!nextTempDate) return '';
    
    const nextTempIso = nextTempDate.toISOString();
    const now = new Date();
    const timeRemaining = nextTempDate.getTime() - now.getTime();
    
    let displayText = '';
    let isExpired = false;
    let timerClasses = 'countdown-timer';
    
    // Verificar si se ha alcanzado el límite máximo de temperaturas
    if (temperatureCount >= MAX_TEMPERATURES_PER_UNIT) {
        displayText = '<span class="expired-text">Regresar a ingenio</span>';
        isExpired = true;
        timerClasses += ' countdown-expired';
    } else if (isTimeForTemperature || timeRemaining <= 0) {
        displayText = '<span class="expired-text">¡Tiempo cumplido!</span>';
        isExpired = true;
        timerClasses += ' countdown-expired';
    } else {
        // Calcular tiempo restante
        const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
        const minutes = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((timeRemaining % (1000 * 60)) / 1000);
        displayText = `<span>${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}</span>`;
        
        // Agregar clase de advertencia si quedan menos de 30 minutos
        if (timeRemaining <= 30 * 60 * 1000) {
            timerClasses += ' countdown-warning';
        }
    }
    
    return `
        <div class="temperature-countdown" data-target-time="${nextTempIso}">
            <div class="countdown-label">Próxima temperatura en:</div>
            <div class="${timerClasses}">
                <span class="countdown-display">${displayText}</span>
            </div>
        </div>
    `;
}

/**
 * Genera el HTML del historial de temperaturas
 */
function generateTemperatureHistoryHtml(unidad) {
    if (!unidad.temperature || unidad.temperature.length === 0) return '';
    
    const tempCount = unidad.temperatureCount || unidad.temperature.length;
    const temperatureItems = unidad.temperature
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(temp => `
            <div class="temp-history-item">
                <span class="temp-value ${temp.temperature > GOOD_TEMPERATURE_THRESHOLD ? 'temp-high' : 'temp-normal'}">
                    ${temp.temperature.toFixed(1)}°C
                </span>
                <span class="temp-date">${formatShortDate(new Date(temp.createdAt))}</span>
            </div>
        `).join('');
    
    return `
        <div class="divider-line"></div>
        <div class="temperature-history-vertical">
            <div class="temp-history-header-enfriamiento">
                <span>Temperaturas (${tempCount}/4)</span>
            </div>
            <div class="temp-history-list">
                ${temperatureItems}
            </div>
        </div>
    `;
}

/**
 * Genera el HTML de la información de la tarjeta
 */
function generateCardInfoHtml(unidad, ingressDate, timeElapsedText) {
    return `
        <div class="info-row">
            <span class="label">Ingenio:</span>
            <span class="value">${escapeHtml((unidad.ingenio?.name || 'Sin Datos').replace(/_/g, ' '))}</span>
        </div>

        <div class="info-row">
            <span class="label">Motorista:</span>
            <span class="value">${escapeHtml(unidad.driver?.name || 'N/A')}</span>
        </div>

        <div class="info-row">
            <span class="label">Placa Remolque:</span>
            <span class="value">${escapeHtml(unidad.vehicle?.trailerPlate || 'N/A')}</span>
        </div>

        <div class="info-row">
            <span class="label">Placa Camión:</span>
            <span class="value">${escapeHtml(unidad.vehicle?.plate || 'N/A')}</span>
        </div>

        <div class="info-row">
            <span class="label">Hora de Ingreso:</span>
            <span class="value">${formatDate(ingressDate)}</span>
        </div>

        <div class="info-row">
            <span class="label">Tiempo Transcurrido:</span>
            <span class="value">${timeElapsedText}</span>
        </div>
    `;
}

/* ==================== UTILIDADES Y HELPERS ==================== */

/**
 * Escapa texto HTML para prevenir XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Formatea una fecha completa
 */
function formatDate(date) {
    if (!date) return 'No hay datos';
    return new Intl.DateTimeFormat('es-SV', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }).format(date);
}

/**
 * Formatea una fecha corta
 */
function formatShortDate(date) {
    if (!date) return '';
    return new Intl.DateTimeFormat('es-SV', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(date);
}

/**
 * Previene ejecuciones múltiples de funciones
 */
function preventMultipleExecutions(key, fn, delay = 3000) {
    if (enfriamientoExecutionLocks.has(key)) {
        console.warn(`Ejecución múltiple bloqueada para: ${key}`);
        return Promise.resolve(false);
    }
    
    enfriamientoExecutionLocks.set(key, true);
    console.log(`Bloqueando ejecución para: ${key}`);
    
    // Auto-liberar después del delay
    setTimeout(() => {
        enfriamientoExecutionLocks.delete(key);
        console.log(`Liberando ejecución para: ${key}`);
    }, delay);
    
    return fn();
}

/**
 * Realiza peticiones POST con JSON
 */
async function postJson(url, body) {
    const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
    });
    const txt = await resp.text();
    let json = {};
    try { 
        json = txt ? JSON.parse(txt) : {}; 
    } catch { 
        json = {}; 
    }

    if (!resp.ok) {
        const msg = json.message || `HTTP ${resp.status}`;
        throw new Error(msg);
    }
    if (typeof json.success === 'boolean' && !json.success) {
        throw new Error(json.message || 'Error en la operación');
    }
    return json;
}

/* ==================== GESTIÓN DE EVENTOS ==================== */

/**
 * Vincula los eventos de temperatura para las tarjetas
 */
function bindTemperatureEventsEnfriamiento() {
    console.log('Vinculando eventos de temperatura para enfriamiento...');
    
    try {
        // Limpiar eventos previos
        document.removeEventListener('click', handleTemperatureClickEnfriamiento);
        
        // Agregar evento de click delegado
        document.addEventListener('click', handleTemperatureClickEnfriamiento);
        
        console.log('Eventos de temperatura para enfriamiento vinculados correctamente');
        
    } catch (error) {
        console.error('Error vinculando eventos de temperatura:', error);
    }
}

/**
 * Desvincula los eventos de temperatura
 */
function unbindTemperatureEventsEnfriamiento() {
    document.removeEventListener('click', handleTemperatureClickEnfriamiento);
}

/**
 * Maneja los clicks en las tarjetas de enfriamiento
 */
function handleTemperatureClickEnfriamiento(e) {
    const card = e.target.closest('.unidad-enfriamiento-vertical-card');
    if (card) {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('Click en unidad de enfriamiento:', card.getAttribute('data-codigo-generacion'));
        mostrarModalTemperaturaEnfriamiento(card);
    }
}

/* ==================== INICIALIZACIÓN Y DESTRUCCIÓN DEL MÓDULO ==================== */

/**
 * Inicializa el módulo completo de unidades en enfriamiento
 */
function initUnidadesEnfriamiento() {
    // Prevenir múltiples inicializaciones simultáneas
    if (initializationInProgress || enfriamientoInitialized) {
        console.log('Inicialización de enfriamiento ya en progreso o módulo ya inicializado');
        return;
    }
    
    initializationInProgress = true;
    console.log('Inicializando módulo de Unidades en Enfriamiento...');
    
    try {
        // Vincular eventos de click para modales de temperatura
        bindTemperatureEventsEnfriamiento();
        
        // Cargar datos inmediatamente
        refreshEnfriamientoData();
        
        enfriamientoInitialized = true;
        initializationInProgress = false;
        console.log('Módulo de Unidades en Enfriamiento inicializado correctamente');
        
    } catch (error) {
        console.error('Error inicializando módulo de enfriamiento:', error);
        enfriamientoInitialized = false;
        initializationInProgress = false;
    }
}

/**
 * Destruye el módulo y limpia todos los recursos
 */
function destroyUnidadesEnfriamiento() {
    console.log('Destruyendo módulo de Unidades en Enfriamiento...');
    
    try {
        // Limpiar todos los contadores
        clearAllEnfriamientoCounters();
        
        // Limpiar locks de ejecución
        enfriamientoExecutionLocks.clear();
        
        // Desvincular eventos
        unbindTemperatureEventsEnfriamiento();
        
        // Resetear banderas de estado
        enfriamientoInitialized = false;
        initializationInProgress = false;
        lastEnfriamientoDataLoad = 0;
        isLoadingEnfriamientoData = false;
        
        console.log('Módulo de Unidades en Enfriamiento destruido correctamente');
        
    } catch (error) {
        console.error('Error destruyendo módulo de enfriamiento:', error);
    }
}

/* ==================== CONFIGURACIÓN DE EVENT LISTENERS GLOBALES ==================== */

// Hacer disponible la función globalmente para el onclick del HTML
window.mostrarModalTemperaturaEnfriamiento = mostrarModalTemperaturaEnfriamiento;

// Auto-inicialización cuando el DOM está listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        if (document.getElementById('component-enfriamiento-unidades')) {
            console.log('Componente de enfriamiento detectado al cargar DOM, inicializando...');
            setTimeout(() => initUnidadesEnfriamiento(), 50);
        }
    });
} else {
    // DOM ya está listo
    if (document.getElementById('component-enfriamiento-unidades')) {
        console.log('Componente de enfriamiento detectado (DOM listo), inicializando...');
        setTimeout(() => initUnidadesEnfriamiento(), 50);
    }
}

// Event listener para navegación de menú
document.addEventListener('menuNavigation', (event) => {
    const { from, to } = event.detail;

    if (to === 'enfriamiento-unidades') {
        console.log('🌡️ Navegando a enfriamiento-unidades');
        setTimeout(() => {
            // Si ya está inicializado, solo refrescar datos
            if (enfriamientoInitialized) {
                console.log('Módulo ya inicializado, refrescando datos...');
                refreshEnfriamientoData();
            } else {
                // Primera vez, inicializar completamente
                initUnidadesEnfriamiento();
            }
        }, 100);
    } else if (from === 'enfriamiento-unidades') {
        console.log('👋 Navegando fuera de enfriamiento-unidades');
        destroyUnidadesEnfriamiento();
    }
});

/* ==================== INICIALIZACIÓN FINAL ==================== */

console.log('Módulo de Unidades en Enfriamiento cargado y reorganizado');