// Variables globales
var datosConErroresGlobal = [];
var informacionEnvioGlobal = {
    codigoGeneracion: '',
    nombreIngenio: ''
};

// Variables para control del botón Confirmar
var btnConfirmarGlobal = null;
var textoOriginalBtnConfirmar = 'Confirmar';

// Variables para auto-refresh automático
let autoRefreshEnabled = true;
let autoRefreshInterval = null;
let refreshIntervalMs = 30000; // 30 segundos fijo
let modalsOpen = 0; // Contador de modales abiertos
let refreshInProgress = false; // Flag para evitar requests concurrentes
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 3;

$(document).ready(function() {
    window.AlmapacUtils.hideSpinner();

    // Iniciar auto-refresh automático
    startAutoRefresh();

    // Evitar recarga al hacer clic en botones del navbar
    document.querySelectorAll("button").forEach(button => {
        button.addEventListener("click", function(event) {
            event.preventDefault();
        });
    });

    // Configurar eventos de modales
    setupModalEvents();

    // Bind de tarjetas de filtro de ingenio clickeables
    bindIngenioFilterCards();

    // Restaurar búsqueda y filtro si existen
    restoreSearchValue();
    restoreFilter();
    
    // Monitorear visibilidad de la página
    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            console.log('Página oculta, pausando polling');
            pauseAutoRefresh();
        } else {
            console.log('Página visible, reanudando polling');
            resumeAutoRefresh();
        }
    });
    
    // Logging de estado cada minuto
    setInterval(logPollingStatus, 60000);
});

// FUNCIONES DE POLLING MEJORADAS
function startAutoRefresh() {
    console.log('Iniciando auto-refresh automático cada 30 segundos');
    
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
    
    autoRefreshInterval = setInterval(function() {
        if (autoRefreshEnabled && modalsOpen === 0 && !document.hidden) {
            console.log('Actualizando datos automáticamente...');
            refreshData();
        } else {
            console.log('Auto-refresh pausado - Modales:', modalsOpen, 'Hidden:', document.hidden);
        }
    }, refreshIntervalMs);
    
    // Watchdog para detectar si el intervalo se pierde (reciclaje de IIS)
    setInterval(function() {
        if (!autoRefreshInterval && autoRefreshEnabled) {
            console.warn('⚠️ Intervalo perdido, reiniciando...');
            startAutoRefresh();
        }
    }, 60000);
}

function pauseAutoRefresh() {
    autoRefreshEnabled = false;
}

function resumeAutoRefresh() {
    autoRefreshEnabled = true;
    if (!autoRefreshInterval) {
        startAutoRefresh();
    }
}

function refreshData() {
    if (refreshInProgress) {
        console.log('Actualización ya en progreso, saltando...');
        return;
    }
    
    refreshInProgress = true;
    // showRefreshIndicator();
    
    $.ajax({
        type: "GET",
        url: window.location.pathname + '?_=' + new Date().getTime(),
        cache: false,
        headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        },
        timeout: 15000,
        success: function(response) {
            try {
                // Guardar estado del buscador
                const searchValue = $('#searchInput').val();

                // Parsear respuesta correctamente usando DOM nativo
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = response;
                const newMainElement = tempDiv.querySelector('main');
                const newContent = newMainElement ? newMainElement.innerHTML : null;

                // Solo actualizar si hay contenido válido con cards o vehicle-cards
                const vehicleCards = newMainElement ? newMainElement.querySelectorAll('.vehicle-card').length : 0;
                const regularCards = newMainElement ? newMainElement.querySelectorAll('.card').length : 0;
                const hasCards = vehicleCards > 0 || regularCards > 0;

                // Contar cards por sección para detectar cambios de status
                const unitsContainer = newMainElement ? newMainElement.querySelector('.units-container') : null;
                const inconsistenciasSection = newMainElement ? newMainElement.querySelector('.inconsistencies-section') : null;

                const cardsOperativas = unitsContainer ? unitsContainer.querySelectorAll('.vehicle-card').length : 0;
                const cardsInconsistencias = inconsistenciasSection ? inconsistenciasSection.querySelectorAll('.vehicle-card').length : 0;

                console.log('Cards - Operativas:', cardsOperativas, 'Inconsistencias:', cardsInconsistencias);

                if (newContent && hasCards) {
                    $('main').html(newContent);
                    
                    // Reconfigurar eventos después de actualizar HTML
                    setupModalEvents();
                    bindIngenioFilterCards(); // Re-bind filtros de ingenio

                    // Restaurar búsqueda si había
                    if (searchValue) {
                        $('#searchInput').val(searchValue);
                    }

                    // Restaurar filtro de ingenio (ya aplica filtros internamente)
                    const hadFilter = restoreFilter();

                    // Si no había filtro guardado, aplicar filtros de todas formas (para búsqueda)
                    if (!hadFilter) {
                        filterCards();
                    }

                    consecutiveErrors = 0; // Reset contador de errores
                    console.log('✓ Vista actualizada correctamente. VehicleCards:', vehicleCards, 'Operativas:', cardsOperativas, 'Inconsistencias:', cardsInconsistencias);
                    // showUpdateNotification();
                } else if (!hasCards) {
                    console.log('Respuesta sin cards, no se actualiza para evitar borrar contenido');
                } else {
                    console.warn('No se encontró contenido para actualizar');
                }
                
            } catch (e) {
                console.error('Error procesando respuesta:', e);
                consecutiveErrors++;
            }

            hideRefreshIndicator();
        },
        error: function(xhr, status, error) {
            // Manejo centralizado de errores de la petición
            consecutiveErrors++;
            console.error(`Error al actualizar datos (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, error);
            hideRefreshIndicator();

            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                console.error('⚠️ Demasiados errores consecutivos, deteniendo polling');
                clearInterval(autoRefreshInterval);
                autoRefreshInterval = null;
                showCriticalError();
            } else if (status !== 'timeout' && status !== 'abort') {
                showRefreshError();
            }
        },
        complete: function() {
            refreshInProgress = false;
        }
    });
}

function logPollingStatus() {
    console.log('=== POLLING STATUS ===');
    console.log('Interval exists:', !!autoRefreshInterval);
    console.log('Enabled:', autoRefreshEnabled);
    console.log('Modals open:', modalsOpen);
    console.log('In progress:', refreshInProgress);
    console.log('Consecutive errors:', consecutiveErrors);
    console.log('Page hidden:', document.hidden);
    console.log('=====================');
}

// MANEJO SIMPLIFICADO DE MODALES
function setupModalEvents() {
    // Remover listeners previos para evitar duplicados
    $('.modal').off('show.bs.modal hidden.bs.modal');

    // Evento para cualquier modal que se abre
    $('.modal').on('show.bs.modal', function() {
        modalsOpen++;
        console.log('Modal abierto. Total modales:', modalsOpen);
    });

    // Evento para cualquier modal que se cierra
    $('.modal').on('hidden.bs.modal', function() {
        modalsOpen = Math.max(0, modalsOpen - 1);
        console.log('Modal cerrado. Total modales:', modalsOpen);
    });

    // Event listener para botón Confirmar
    const btnConfirmar = document.getElementById('btnConfirmar');
    if (btnConfirmar) {
        // Remover listener previo si existe
        const newBtn = btnConfirmar.cloneNode(true);
        btnConfirmar.parentNode.replaceChild(newBtn, btnConfirmar);

        // Agregar nuevo listener
        newBtn.addEventListener('click', validarInformacion);
    }
}

// FILTRADO POR INGENIO CON TARJETAS CLICKEABLES
// Namespace específico para AutorizacionCamiones para evitar conflictos con otras páginas
const AutorizacionCamionesFilters = {
    currentIngenioFilter: 'todos'
};

function applyFilters() {
    const input = document.getElementById("searchInput");
    const searchValue = input ? input.value.toLowerCase().trim() : '';

    // Guardar/restaurar búsqueda
    if (searchValue) sessionStorage.setItem('searchValue', searchValue);
    else sessionStorage.removeItem('searchValue');

    // Obtener todas las tarjetas (principales e inconsistencias)
    const allCards = document.querySelectorAll(".unit-card-wrapper");

    console.log(`Filtrando ${allCards.length} tarjetas - Búsqueda: "${searchValue}", Ingenio: "${AutorizacionCamionesFilters.currentIngenioFilter}"`);

    let visibleCount = 0;
    let totalCount = 0;

    allCards.forEach(function(card) {
        const ingenio = card.getAttribute('data-ingenio');
        const cardText = card.innerText.toLowerCase();

        // Solo contar tarjetas principales para el resultado
        const isMainCard = card.classList.contains('main-card');
        if (isMainCard) totalCount++;

        // Aplicar filtro de ingenio
        let matchesIngenioFilter = AutorizacionCamionesFilters.currentIngenioFilter === 'todos' || ingenio === AutorizacionCamionesFilters.currentIngenioFilter;

        // Aplicar búsqueda
        let matchesSearch = !searchValue || cardText.includes(searchValue);

        const isVisible = matchesIngenioFilter && matchesSearch;
        card.style.display = isVisible ? "" : "none";

        if (isVisible && isMainCard) visibleCount++;
    });

    // Mostrar/ocultar sección de inconsistencias
    const inconsistenciesSection = document.querySelector('.inconsistencies-section');
    if (inconsistenciesSection) {
        // Ocultar inconsistencias si hay búsqueda activa o filtro específico
        inconsistenciesSection.style.display = (searchValue || AutorizacionCamionesFilters.currentIngenioFilter !== 'todos') ? 'none' : 'block';
    }

    updateSearchResults(visibleCount, totalCount);

    // Guardar filtro actual con prefijo único
    sessionStorage.setItem('autorizacionCamiones_currentIngenioFilter', AutorizacionCamionesFilters.currentIngenioFilter);
}

function restoreFilter() {
    const savedIngenioFilter = sessionStorage.getItem('autorizacionCamiones_currentIngenioFilter');

    if (savedIngenioFilter && savedIngenioFilter !== 'todos') {
        // Restaurar el estado del filtro directamente sin toggle
        AutorizacionCamionesFilters.currentIngenioFilter = savedIngenioFilter;

        // Actualizar visualización de tarjetas de ingenio clickeables
        document.querySelectorAll('.filter-ingenio-clickable').forEach(card => {
            const cardIngenio = card.getAttribute('data-filter-ingenio');

            if (cardIngenio === AutorizacionCamionesFilters.currentIngenioFilter) {
                // Tarjeta activa
                card.style.border = '3px solid #FD7304';
                card.style.boxShadow = '0 0 15px rgba(253, 115, 4, 0.5)';
                card.style.opacity = '1';
                card.style.transform = 'scale(1.03)';
            } else {
                // Tarjeta inactiva
                card.style.border = '';
                card.style.boxShadow = '';
                card.style.opacity = '0.6';
                card.style.transform = 'scale(0.97)';
            }
        });

        // Aplicar el filtro
        applyFilters();

        console.log(`🔄 Filtro restaurado: ${AutorizacionCamionesFilters.currentIngenioFilter}`);
        return true; // Indica que se restauró un filtro
    }

    return false; // No había filtro guardado
}

// FILTRADO POR INGENIO
function setIngenioFilter(ingenioCode) {
    // Si se hace clic en el mismo ingenio, volver a "todos"
    if (AutorizacionCamionesFilters.currentIngenioFilter === ingenioCode && ingenioCode !== 'todos') {
        AutorizacionCamionesFilters.currentIngenioFilter = 'todos';
    } else {
        AutorizacionCamionesFilters.currentIngenioFilter = ingenioCode;
    }

    // Actualizar visualización de tarjetas de ingenio clickeables
    document.querySelectorAll('.filter-ingenio-clickable').forEach(card => {
        const cardIngenio = card.getAttribute('data-filter-ingenio');

        if (AutorizacionCamionesFilters.currentIngenioFilter === 'todos') {
            // Todos activos - remover borde
            card.style.border = '';
            card.style.boxShadow = '';
            card.style.opacity = '1';
            card.style.transform = 'scale(1)';
        } else if (cardIngenio === AutorizacionCamionesFilters.currentIngenioFilter) {
            // Tarjeta activa
            card.style.border = '3px solid #FD7304';
            card.style.boxShadow = '0 0 15px rgba(253, 115, 4, 0.5)';
            card.style.opacity = '1';
            card.style.transform = 'scale(1.03)';
        } else {
            // Tarjeta inactiva
            card.style.border = '';
            card.style.boxShadow = '';
            card.style.opacity = '0.6';
            card.style.transform = 'scale(0.97)';
        }
    });

    applyFilters();

    console.log(`🏭 Filtro de ingenio aplicado: ${AutorizacionCamionesFilters.currentIngenioFilter}`);
}

function bindIngenioFilterCards() {
    document.querySelectorAll('.filter-ingenio-clickable').forEach(card => {
        card.addEventListener('click', function() {
            const ingenioCode = this.getAttribute('data-filter-ingenio');
            setIngenioFilter(ingenioCode);
        });
    });
}

// BUSCADOR (mantener compatibilidad)
function filterCards() {
    applyFilters();
}

function restoreSearchValue() {
    const savedSearch = sessionStorage.getItem('searchValue');
    const searchInput = document.getElementById('searchInput');
    
    if (savedSearch && searchInput) {
        searchInput.value = savedSearch;
        filterCards();
    } else {
        // Si no hay búsqueda guardada, asegurar que la sección de inconsistencias sea visible
        const inconsistenciesSection = document.querySelector('.inconsistencies-section');
        if (inconsistenciesSection) {
            inconsistenciesSection.style.display = 'block';
        }
    }
}

function updateSearchResults(visibleCount, totalCount) {
    // Remover mensaje anterior si existe
    const existingMessage = document.getElementById('searchResultsMessage');
    if (existingMessage) {
        existingMessage.remove();
    }
    
    // Agregar mensaje de resultados si hay búsqueda activa
    const searchInput = document.getElementById('searchInput');
    if (searchInput && searchInput.value.trim()) {
        const message = document.createElement('div');
        message.id = 'searchResultsMessage';
        message.className = 'alert alert-info text-center mt-3';
        message.innerHTML = `
            <i class="fas fa-search"></i> 
            Mostrando ${visibleCount} de ${totalCount} transacciones
            ${visibleCount === 0 ? '<br><small>No se encontraron resultados para esta búsqueda</small>' : ''}
        `;
        
        // Insertar después del contenedor de búsqueda
        const searchContainer = document.querySelector('.search-container');
        if (searchContainer) {
            searchContainer.insertAdjacentElement('afterend', message);
        }
    }
}

// INDICADORES VISUALES
function showRefreshIndicator() {
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
    const indicator = document.getElementById('refreshIndicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

function showUpdateNotification() {
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
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 3000);
}

function showRefreshError() {
    const errorIndicator = document.createElement('div');
    errorIndicator.innerHTML = `
        <div style="position: fixed; top: 20px; right: 20px; z-index: 9999; 
                    background: rgba(220,53,69,0.9); color: white; 
                    padding: 10px 15px; border-radius: 5px; font-size: 14px;">
            <i class="fas fa-exclamation-triangle"></i> Error al actualizar
        </div>
    `;
    document.body.appendChild(errorIndicator);
    
    setTimeout(() => {
        if (errorIndicator.parentNode) {
            document.body.removeChild(errorIndicator);
        }
    }, 4000);
}

function showCriticalError() {
    const errorIndicator = document.createElement('div');
    errorIndicator.id = 'criticalErrorIndicator';
    errorIndicator.innerHTML = `
        <div style="position: fixed; top: 20px; right: 20px; z-index: 9999; 
                    background: rgba(220,53,69,0.95); color: white; 
                    padding: 15px 20px; border-radius: 5px; font-size: 14px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
            <i class="fas fa-exclamation-triangle"></i> 
            Error crítico de actualización<br>
            <small>Por favor, recargue la página</small>
            <button onclick="location.reload()" 
                    style="margin-top: 10px; padding: 5px 10px; 
                           background: white; color: #dc3545; border: none; 
                           border-radius: 3px; cursor: pointer; font-weight: bold;">
                Recargar
            </button>
        </div>
    `;
    document.body.appendChild(errorIndicator);
}

// FUNCIÓN PARA PARSEAR ERRORES
function parseErrorMessage(xhr, defaultMessage) {
    var errorMessage = defaultMessage || 'Ocurrió un error inesperado.';
    
    try {
        // Intentar parsear como JSON
        var errorData = JSON.parse(xhr.responseText);
        
        if (errorData.message) {
            errorMessage = errorData.message;
        }
        
        // Si hay un campo error que contiene JSON stringificado
        if (errorData.error) {
            try {
                var nestedError = JSON.parse(errorData.error);
                if (nestedError.message) {
                    errorMessage = nestedError.message;
                }
            } catch (nestedParseError) {
                // Si no se puede parsear como JSON anidado, usar el error tal como viene
                errorMessage = errorData.error;
            }
        }
        
        // Verificar otros campos comunes de error
        if (errorData.details) {
            errorMessage += '\n\nDetalles: ' + errorData.details;
        }
        
        if (errorData.errors && Array.isArray(errorData.errors)) {
            errorMessage += '\n\nErrores adicionales: ' + errorData.errors.join(', ');
        }
        
    } catch (parseError) {
        // Si no se puede parsear como JSON, verificar si es un string con mensaje de error
        if (xhr.responseText) {
            // Verificar si contiene HTML (error de servidor)
            if (xhr.responseText.includes('<html>') || xhr.responseText.includes('<!DOCTYPE')) {
                errorMessage = defaultMessage + '\n\nError del servidor (código: ' + xhr.status + ')';
            } else {
                // Usar el texto tal como viene si no es HTML
                errorMessage = xhr.responseText;
            }
        }
    }
    
    return errorMessage;
}

// FUNCIÓN PARA PARSEAR RESPUESTAS DE ÉXITO
function parseSuccessResponse(response, defaultSuccessMessage) {
    // Verificar si la respuesta tiene la estructura estándar con success explícito
    if (response && typeof response === 'object' && response.hasOwnProperty('success')) {
        if (response.success === false) {
            var errorMessage = response.message || 'Error desconocido.';
            
            // Parsear errores anidados en el campo error
            if (response.error) {
                try {
                    var errorObject = JSON.parse(response.error);
                    if (errorObject.message) {
                        errorMessage = errorObject.message;
                    }
                } catch (e) {
                    if (response.error !== response.message) {
                        errorMessage = response.error;
                    }
                }
            }
            
            return {
                isError: true,
                message: errorMessage
            };
        }
        
        if (response.success === true) {
            return {
                isError: false,
                message: response.message || defaultSuccessMessage
            };
        }
    }
    
    // Solo verificar strings que sean directamente la respuesta completa
    // No verificar campos internos como 'data'
    if (typeof response === 'string' && response.includes('Error')) {
        return {
            isError: true,
            message: response
        };
    }
    
    // Si llegamos aquí, asumir éxito
    return {
        isError: false,
        message: defaultSuccessMessage
    };
}

// FUNCIÓN PARA ABRIR MODAL
function abrirModal(codigoGeneracion, nombreIngenio) {
    // Limpiar campos antes de abrir el modal para que no se carguen datos de otra tarjeta
    limpiarCamposModal();

    informacionEnvioGlobal.codigoGeneracion = codigoGeneracion;
    informacionEnvioGlobal.nombreIngenio = nombreIngenio || '';

    document.getElementById('codigoGeneracionInput').value = codigoGeneracion;
    document.getElementById('nombreIngenioInput').value = nombreIngenio || '';

    document.querySelector('.modal-title').textContent = 'Validación de Información de ' + codigoGeneracion;

    $('#rutaModal').modal('show');

    console.log("Información del envío capturada:", informacionEnvioGlobal);
}

// Validación en tiempo real de la placa remolque
function validarPlacaRemolque() {
    var placaRemolque = document.getElementById('txt_placaremolque').value;
    var hint = document.getElementById('placaRemolqueHint');
    var regex = /^RE\d+$/;

    if (regex.test(placaRemolque)) {
        hint.style.color = 'green';
        document.getElementById('txt_placaremolque').classList.remove('error-field');
    } else {
        hint.style.color = 'red';
        document.getElementById('txt_placaremolque').classList.add('error-field');
    }
}

// Validación en tiempo real de la placa camión
function validarPlacaCamion() {
    var placaCamion = document.getElementById('txt_placamion').value;
    var hint = document.getElementById('placaCamionHint');
    var regex = /^C\d+$/;

    if (regex.test(placaCamion)) {
        hint.style.color = 'green';
        document.getElementById('txt_placamion').classList.remove('error-field');
    } else {
        hint.style.color = 'red';
        document.getElementById('txt_placamion').classList.add('error-field');
    }
}

// Helper para reactivar el botón Confirmar
function reactivarBotonConfirmar() {
    if (btnConfirmarGlobal) {
        btnConfirmarGlobal.disabled = false;
        btnConfirmarGlobal.textContent = textoOriginalBtnConfirmar;
        console.log('Botón Confirmar reactivado');
    }
}

function validarInformacion() {
    // Obtener y deshabilitar botón para prevenir múltiples clicks
    const btnConfirmar = document.getElementById('btnConfirmar');
    if (!btnConfirmar) return;

    // Si ya está deshabilitado, hay una petición en proceso
    if (btnConfirmar.disabled) {
        console.log('Ya hay una validación en proceso');
        return;
    }

    // Guardar referencia global del botón
    btnConfirmarGlobal = btnConfirmar;
    textoOriginalBtnConfirmar = btnConfirmar.textContent;

    // Deshabilitar botón y cambiar texto
    btnConfirmar.disabled = true;
    btnConfirmar.textContent = 'Procesando...';

    var codigoGeneracion = document.getElementById('codigoGeneracionInput').value;
    var licencia = document.getElementById('txt_licencia').value.trim();
    var placaRemolque = document.getElementById('txt_placaremolque').value.trim();
    var placaCamion = document.getElementById('txt_placamion').value.trim();
    var tarjeta = document.getElementById('txt_tarjeta').value.trim();
    var buzzer = document.getElementById('txt_buzzer').value.trim();

    var regexRemolque = /^RE\d+$/;
    var regexCamion = /^C\d+$/;

    // Limpiar errores previos
    resetErrorFields([]);

    // Array para recopilar todos los errores
    var errores = [];

    // Validaciones - recopilar todos los errores
    if (!licencia) {
        document.getElementById('txt_licencia').classList.add('error-field');
        errores.push('• Licencia es obligatoria');
    }

    if (!placaRemolque) {
        document.getElementById('txt_placaremolque').classList.add('error-field');
        errores.push('• Placa Remolque es obligatoria');
    } else if (!regexRemolque.test(placaRemolque)) {
        document.getElementById('txt_placaremolque').classList.add('error-field');
        errores.push('• Placa Remolque debe comenzar con "RE" seguido de números');
    }

    if (!placaCamion) {
        document.getElementById('txt_placamion').classList.add('error-field');
        errores.push('• Placa Camión es obligatoria');
    } else if (!regexCamion.test(placaCamion)) {
        document.getElementById('txt_placamion').classList.add('error-field');
        errores.push('• Placa Camión debe comenzar con "C" seguido de números');
    }

    if (!tarjeta) {
        document.getElementById('txt_tarjeta').classList.add('error-field');
        errores.push('• No. Tarjeta es obligatorio');
    }

    if (!buzzer) {
        document.getElementById('txt_buzzer').classList.add('error-field');
        errores.push('• No. Buzzer es obligatorio');
    }

    // Mostrar todos los errores a la vez
    if (errores.length > 0) {
        // Reactivar botón
        reactivarBotonConfirmar();

        Swal.fire({
            icon: 'error',
            title: 'Errores de Validación',
            html: '<div style="text-align: left;">' + errores.join('<br>') + '</div>',
            confirmButtonText: 'Aceptar'
        });
        return;
    }

    // Llamar al servidor para validar los datos (incluyendo tarjeta y buzzer)
    $.ajax({
        type: "POST",
        url: "/AutorizacionCamiones/ValidarDatos",
        data: JSON.stringify({
            CodigoGeneracion: codigoGeneracion,
            Licencia: licencia,
            PlacaRemolque: placaRemolque,
            PlacaCamion: placaCamion,
            Tarjeta: parseInt(tarjeta) || 0,
            Buzzer: parseInt(buzzer) || 0
        }),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        success: function(response) {
            if (response.error) {
                // Consolidar todos los errores en un array
                var errores = [];

                // Agregar mensaje principal si existe
                if (response.mensaje) {
                    errores.push('<strong>' + response.mensaje + '</strong>');
                    errores.push(''); // Línea en blanco
                }

                resetErrorFields(response.camposConError);

                response.camposConError.forEach(function(campo) {
                    switch (campo) {
                        case "licencia":
                            document.getElementById('txt_licencia').classList.add('error-field');
                            errores.push('• Licencia inválida');
                            break;
                        case "placaRemolque":
                            document.getElementById('txt_placaremolque').classList.add('error-field');
                            errores.push('• Placa Remolque inválida');
                            break;
                        case "placaCamion":
                            document.getElementById('txt_placamion').classList.add('error-field');
                            errores.push('• Placa Camión inválida');
                            break;
                        case "tarjeta":
                            document.getElementById('txt_tarjeta').classList.add('error-field');
                            errores.push('• Tarjeta inválida o ya asignada');
                            break;
                        case "buzzer":
                            document.getElementById('txt_buzzer').classList.add('error-field');
                            errores.push('• Buzzer inválido o ya asignado');
                            break;
                    }
                });

                // Reactivar botón
                reactivarBotonConfirmar();

                // Mostrar todos los errores consolidados
                Swal.fire({
                    title: 'Validación de Datos',
                    html: '<div>Se encontraron errores en los datos ingresados. Revise los campos resaltados.<br><br>' + errores.join('<br>') + '</div>',
                    confirmButtonText: 'Aceptar'
                });
            } else {
                // Éxito - el botón se mantendrá deshabilitado ya que la página se recargará
                return asignarbuzzer(codigoGeneracion, buzzer, tarjeta);
            }
        },
        error: function(xhr, status, error) {
            console.error("Error en ValidarDatos:", xhr.responseText);

            // Reactivar botón
            reactivarBotonConfirmar();

            var errorMessage = parseErrorMessage(xhr, 'Ocurrió un error al validar los datos.');

            Swal.fire({
                icon: 'error',
                title: 'Error de Validación',
                text: errorMessage,
                confirmButtonText: 'Aceptar'
            });
        }
    });
}

function resetErrorFields(camposConError) {
    var campos = [
        'txt_licencia',
        'txt_placaremolque',
        'txt_placamion',
        'txt_tarjeta',
        'txt_buzzer'
    ];

    campos.forEach(function(campo) {
        var elemento = document.getElementById(campo);
        if (elemento && !camposConError.includes(campo)) {
            elemento.classList.remove('error-field');
        }
    });
}

function limpiarCamposModal() {
    const campos = [
        'txt_licencia',
        'txt_placaremolque',
        'txt_placamion',
        'txt_tarjeta',
        'txt_buzzer'
    ];

    // Limpiar todos los campos del formulario
    campos.forEach(campoId => {
        const campo = document.getElementById(campoId);
        if (campo) {
            campo.value = '';
            campo.classList.remove('error-field');
            // Restaurar el borde original
            campo.style.borderColor = '';
        }
    });

    // Limpiar campos ocultos
    const hiddenField = document.getElementById('codigoGeneracionInput');
    if (hiddenField) hiddenField.value = '';

    const hiddenIngenioField = document.getElementById('nombreIngenioInput');
    if (hiddenIngenioField) hiddenIngenioField.value = '';

    // Limpiar el título del modal
    const modalTitulo = document.getElementById('modalTitulo');
    if (modalTitulo) modalTitulo.textContent = '';

    // Limpiar los mensajes de ayuda de las placas
    const placaRemolqueHint = document.getElementById('placaRemolqueHint');
    if (placaRemolqueHint) {
        placaRemolqueHint.textContent = 'Debe comenzar con "RE" seguido de números, sin espacios.';
        placaRemolqueHint.style.color = '';
    }

    const placaCamionHint = document.getElementById('placaCamionHint');
    if (placaCamionHint) {
        placaCamionHint.textContent = 'Debe comenzar con "C" seguido de números, sin espacios.';
        placaCamionHint.style.color = '';
    }

    console.log("Todos los campos del modal han sido limpiados");
}

// Evento de cierre de la modal principal
$('#rutaModal').on('hidden.bs.modal', function() {
    limpiarCamposModal();
    console.log("Modal principal cerrado y limpiado");
});

function asignarbuzzer(codigoGeneracion, buzzer, tarjeta) {
    $.ajax({
        type: "POST",
        url: "/AutorizacionCamiones/AsignarBuzzer",
        data: JSON.stringify({
            CodigoGeneracion: codigoGeneracion,
            Buzzer: buzzer
        }),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        success: function(response) {
            console.log("Respuesta de AsignarBuzzer:", response);

            if (response.success === true) {
                console.log(response.message || 'Buzzer asignado correctamente.');
                window.AlmapacUtils.showSpinner();
                asignartarjeta(codigoGeneracion, tarjeta);
            }
            else if (response.success === false) {
                console.error("Error reportado por la API:", response);

                var errorMessage = response.message || 'Error desconocido al asignar buzzer.';

                // Parsear el JSON del campo error para extraer el mensaje específico
                if (response.error) {
                    try {
                        // El error viene como JSON stringificado, parsearlo
                        var errorObject = JSON.parse(response.error);
                        if (errorObject.message) {
                            errorMessage = errorObject.message;
                        }
                    } catch (e) {
                        // Si no se puede parsear como JSON, usar el error tal como viene
                        errorMessage = response.error;
                    }
                }

                // Reactivar botón
                reactivarBotonConfirmar();

                Swal.fire({
                    icon: 'error',
                    title: 'Error al Asignar Buzzer',
                    text: errorMessage,
                    confirmButtonText: 'Aceptar'
                });
                window.AlmapacUtils.hideSpinner();
            }
            else {
                console.warn("Estructura de respuesta inesperada:", response);

                // Reactivar botón
                reactivarBotonConfirmar();

                Swal.fire({
                    icon: 'warning',
                    title: 'Respuesta Inesperada',
                    text: 'La respuesta del servidor no tiene el formato esperado.',
                    confirmButtonText: 'Aceptar'
                });
                window.AlmapacUtils.hideSpinner();
            }
        },
        error: function(xhr, status, error) {
            console.log("Error en AsignarBuzzer:", xhr.responseText);

            // Reactivar botón
            reactivarBotonConfirmar();

            var errorMessage = parseErrorMessage(xhr, 'Ocurrió un error al asignar el buzzer.');

            Swal.fire({
                icon: 'error',
                title: 'Error de Conexión',
                text: errorMessage,
                confirmButtonText: 'Aceptar'
            });
            window.AlmapacUtils.hideSpinner();
        }
    });
}

function asignartarjeta(codigoGeneracion, tarjeta) {
    $.ajax({
        type: "POST",
        url: "/AutorizacionCamiones/AsignarTarjeta",
        data: JSON.stringify({
            CodigoGeneracion: codigoGeneracion,
            Tarjeta: tarjeta
        }),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        success: function(response) {
            console.log("Respuesta de AsignarTarjeta:", response);

            // Usar helper para parsear respuesta de éxito
            var parseResult = parseSuccessResponse(response, 'Tarjeta asignada correctamente');

            if (parseResult.isError) {
                console.error("Error en AsignarTarjeta:", parseResult.message);

                // Reactivar botón
                reactivarBotonConfirmar();

                Swal.fire({
                    icon: 'error',
                    title: 'Error al Asignar Tarjeta',
                    text: parseResult.message,
                    confirmButtonText: 'Aceptar'
                });
                window.AlmapacUtils.hideSpinner();
                return;
            }

            // Mostrar alerta de éxito para la tarjeta magnética
            window.AlmapacUtils.showSpinner();
            changeStatus(codigoGeneracion);
        },
        error: function(xhr, status, error) {
            console.log("Error en AsignarTarjeta:", xhr.responseText);

            // Reactivar botón
            reactivarBotonConfirmar();

            var errorMessage = parseErrorMessage(xhr, 'Ocurrió un error al asignar la tarjeta.');

            Swal.fire({
                icon: 'error',
                title: 'Error al Asignar Tarjeta',
                text: errorMessage,
                confirmButtonText: 'Aceptar'
            });
            window.AlmapacUtils.hideSpinner();
        }
    });
}

function changeStatus(codigoGeneracion) {
    var predefinedStatusId = 3;

    if (!codigoGeneracion || codigoGeneracion.trim() === '') {
        Swal.fire({
            title: 'Error',
            text: 'Por favor, ingrese un Código de Generación',
            icon: 'error',
            confirmButtonColor: '#3085d6',
            confirmButtonText: 'Aceptar'
        });
        return;
    }

    window.AlmapacUtils.showSpinner();

    $.ajax({
        type: "POST",
        url: "/AutorizacionCamiones/ChangeTransactionStatus",
        data: JSON.stringify({ 
            CodeGen: codigoGeneracion, 
            PredefinedStatusId: predefinedStatusId 
        }),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        beforeSend: function() {
            window.AlmapacUtils.showSpinner();
        },
        success: function(response) {
            console.log("Respuesta de ChangeTransactionStatus:", response);

            // Usar helper para parsear respuesta de éxito
            var parseResult = parseSuccessResponse(response, 'El estado se actualizó correctamente.');
            
            if (parseResult.isError) {
                console.error("Error en ChangeTransactionStatus:", parseResult.message);

                // Reactivar botón
                reactivarBotonConfirmar();

                Swal.fire({
                    icon: 'error',
                    title: 'Error al Cambiar Estado',
                    text: parseResult.message,
                    confirmButtonText: 'Aceptar'
                });
                window.AlmapacUtils.hideSpinner();
                return;
            }

            Swal.fire({
                icon: 'success',
                title: '¡Actualización exitosa!',
                text: parseResult.message,
                showConfirmButton: false,
                timer: 1000,
            }).then((result) => {
                location.reload();
                window.AlmapacUtils.showSpinner();
            });
        },
        complete: function() {
            window.AlmapacUtils.hideSpinner();
        },
        error: function(xhr, status, error) {
            console.error("Error en ChangeTransactionStatus:", error);

            // Reactivar botón
            reactivarBotonConfirmar();

            var errorMessage = parseErrorMessage(xhr, 'Hubo un problema al cambiar el estado.');

            Swal.fire({
                icon: 'error',
                title: 'Error al Cambiar Estado',
                text: errorMessage,
                confirmButtonText: 'Aceptar'
            });
        }
    });
}

// FUNCIONES PARA EL MODAL DE REPORTE DE INCONSISTENCIAS

document.addEventListener('DOMContentLoaded', function() {
    const btnReportar = document.getElementById('btnReportar');
    if (btnReportar) {
        btnReportar.addEventListener('click', function() {
            datosConErroresGlobal = capturarDatosConErrores();
            
            if (datosConErroresGlobal.length === 0) {
                Swal.fire({
                    icon: 'warning',
                    title: 'No hay inconsistencias detectadas',
                    text: 'Para reportar inconsistencias, primero debe validar la información.',
                    confirmButtonText: 'Entendido'
                });
                return;
            }
            
            document.getElementById('codigoGeneracionModal').value = informacionEnvioGlobal.codigoGeneracion;
            mostrarDatosConErrores(datosConErroresGlobal, informacionEnvioGlobal);
            
            $('#rutaModal').modal('hide');
            $('#modalReportar').modal('show');
            
            console.log("Información completa del envío:", informacionEnvioGlobal);
            console.log("Datos con errores almacenados globalmente:", datosConErroresGlobal);
        });
    }
});

function capturarDatosConErrores() {
    var datosConErrores = [];
    
    console.log("=== INICIANDO CAPTURA DE DATOS CON ERRORES ===");
    
    var licenciaInput = document.getElementById('txt_licencia');
    if (licenciaInput && licenciaInput.classList.contains('error-field')) {
        var valorLicencia = licenciaInput.value.trim();
        if (valorLicencia) {
            datosConErrores.push({
                campo: 'licencia',
                label: 'Licencia',
                valor: valorLicencia
            });
            console.log("Licencia agregada:", valorLicencia);
        }
    }
    
    var placaRemolqueInput = document.getElementById('txt_placaremolque');
    if (placaRemolqueInput && placaRemolqueInput.classList.contains('error-field')) {
        var valorRemolque = placaRemolqueInput.value.trim();
        if (valorRemolque) {
            datosConErrores.push({
                campo: 'placaRemolque',
                label: 'Placa del remolque',
                valor: valorRemolque
            });
            console.log("Placa remolque agregada:", valorRemolque);
        }
    }
    
    var placaCamionInput = document.getElementById('txt_placamion');
    if (placaCamionInput && placaCamionInput.classList.contains('error-field')) {
        var valorCamion = placaCamionInput.value.trim();
        if (valorCamion) {
            datosConErrores.push({
                campo: 'placaCamion',
                label: 'Placa del camión',
                valor: valorCamion
            });
            console.log("Placa camión agregada:", valorCamion);
        }
    }
    
    console.log("Total datos capturados:", datosConErrores.length);
    console.log("Datos capturados:", datosConErrores);
    console.log("=== FIN CAPTURA DE DATOS CON ERRORES ===");
    
    return datosConErrores;
}

function mostrarDatosConErrores(datosConErrores, informacionEnvio) {
    var errorCard = document.getElementById('errorDetailsCard');
    var reportedDataList = document.getElementById('reportedDataList');
    
    var modalTitle = `Reportar Inconsistencias - ${informacionEnvio.codigoGeneracion}`;
    if (informacionEnvio.nombreIngenio) {
        modalTitle += ` - ${informacionEnvio.nombreIngenio}`;
    }
    document.querySelector('#modalReportar .modal-title').textContent = modalTitle;
    
    errorCard.style.display = 'block';
    reportedDataList.innerHTML = '';
    
    if (datosConErrores.length > 0) {
        datosConErrores.forEach(function(dato) {
            var div = document.createElement('div');
            div.className = 'inconsistency-item';
            div.innerHTML = `
                <i class="fas fa-exclamation-circle"></i> 
                <strong>${dato.label}:</strong> ${dato.valor}
            `;
            reportedDataList.appendChild(div);
        });
    }
}

function guardarComentario() {
    var comentario = document.getElementById('comentario').value.trim();
    var codigoGeneracion = document.getElementById('codigoGeneracionModal').value;
    
    console.log("=== INICIANDO GUARDAR COMENTARIO ===");
    console.log("Comentario:", comentario);
    console.log("Código de generación:", codigoGeneracion);
    console.log("Información del envío:", informacionEnvioGlobal);
    console.log("Datos almacenados globalmente:", datosConErroresGlobal);
    
    if (!comentario) {
        Swal.fire({
            icon: 'warning',
            title: 'Comentario requerido',
            text: 'Debe ingresar un comentario explicando la inconsistencia detectada.',
            confirmButtonText: 'Aceptar'
        });
        return;
    }
    
    if (datosConErroresGlobal.length === 0) {
        Swal.fire({
            icon: 'warning',
            title: 'Sin datos inconsistentes',
            text: 'Debe tener al menos un campo marcado como inconsistente (licencia o placas) para enviar el reporte.',
            confirmButtonText: 'Aceptar'
        });
        return;
    }
    
    console.log("Datos del reporte a enviar:", {
        CodigoGeneracion: codigoGeneracion,
        Comentario: comentario,
        DatosInconsistentes: datosConErroresGlobal,
        TipoReporte: 'PRECHECK',
        NombreIngenio: informacionEnvioGlobal.nombreIngenio
    });
    
    $.ajax({
        type: "POST",
        url: "/AutorizacionCamiones/GuardarReporteInconsistencia",
        data: JSON.stringify({
            CodigoGeneracion: codigoGeneracion,
            Comentario: comentario,
            DatosInconsistentes: datosConErroresGlobal,
            TipoReporte: 'PRECHECK',
            NombreIngenio: informacionEnvioGlobal.nombreIngenio
        }),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        beforeSend: function() {
            window.AlmapacUtils.showSpinner();
            console.log("Enviando solicitud al servidor...");
        },
        success: function(response) {
            console.log("Respuesta cruda del servidor:", response);
            
            var responseData;
            try {
                responseData = response.d ? JSON.parse(response.d) : response;
            } catch (e) {
                console.error("Error parsing response:", e);
                responseData = { success: false, message: "Error al procesar la respuesta del servidor" };
            }
            
            console.log("Respuesta procesada:", responseData);
            
            if (responseData.success) {
                Swal.fire({
                    icon: 'success',
                    title: 'Reporte Enviado',
                    text: `La inconsistencia para ${informacionEnvioGlobal.nombreIngenio} ha sido reportada exitosamente.`,
                    showConfirmButton: false,
                    timer: 2000
                }).then(() => {
                    $('#modalReportar').modal('hide');
                    window.AlmapacUtils.showSpinner();
                    location.reload();
                });
            } else {
                var errorMessage = responseData.message || 'Error al procesar el reporte.';
                
                // Aplicar parseo adicional si hay errores anidados
                if (responseData.error) {
                    try {
                        var errorObject = JSON.parse(responseData.error);
                        if (errorObject.message) {
                            errorMessage = errorObject.message;
                        }
                    } catch (e) {
                        if (responseData.error !== responseData.message) {
                            errorMessage += '\n\nDetalles: ' + responseData.error;
                        }
                    }
                }
                
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: errorMessage,
                    confirmButtonText: 'Aceptar'
                });
            }
        },
        error: function(xhr, status, error) {
            console.error("Error en la solicitud:", xhr);
            console.error("Response text:", xhr.responseText);
            
            var errorMessage = parseErrorMessage(xhr, 'Error al conectar con el servidor.');
            
            Swal.fire({
                icon: 'error',
                title: 'Error de Conexión',
                text: errorMessage,
                confirmButtonText: 'Aceptar'
            });
        },
        complete: function() {
            window.AlmapacUtils.hideSpinner();
            console.log("Solicitud completada");
        }
    });
}

// Evento para limpiar el modal de reporte cuando se cierre
$('#modalReportar').on('hidden.bs.modal', function() {
    document.getElementById('comentario').value = '';
    document.getElementById('errorDetailsCard').style.display = 'none';
    document.getElementById('codigoGeneracionModal').value = '';
    datosConErroresGlobal = [];

    // Volver a abrir el modal principal
    $('#rutaModal').modal('show');

    console.log("Modal de reporte cerrado y vuelve al modal principal");
});

// Agregar CSS para animaciones si no existe
$(document).ready(function() {
    if (!document.getElementById('polling-styles')) {
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
            .search-container {
                position: relative;
            }
            #searchResultsMessage {
                margin-bottom: 1rem;
            }
        `;
        document.head.appendChild(style);
    }
});

// window.AlmapacUtils.hideSpinner();