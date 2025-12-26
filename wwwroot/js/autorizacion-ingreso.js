// Variables globales
var datosConErroresGlobal = [];
var informacionEnvioGlobal = {
    codigoGeneracion: '',
    nombreIngenio: ''
};

// Variables para auto-refresh automático - MEJORADO
let autoRefreshEnabled = true;
let autoRefreshInterval = null;
let refreshIntervalMs = 30000;
let lastDataHash = null;
let lastCountersHash = null;
let currentViewType = null;
let modalsOpen = 0;
let refreshInProgress = false;
let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 3;

$(window).on('load', function () {
    detectViewType();
    $("#spinner-overlay").fadeOut("slow");
    startAutoRefresh();
    calculateDataHash();
    calculateCountersHash();

    // Bind filtros de ingenio
    bindIngenioFilterCards();

    // Restaurar filtro guardado
    restoreFilter();

    document.querySelectorAll("button").forEach(button => {
        button.addEventListener("click", function(event) {
            event.preventDefault();
        });
    });

    document.addEventListener('visibilitychange', function() {
        if (document.hidden) {
            console.log('Página oculta, pausando polling');
            pauseAutoRefresh();
        } else {
            console.log('Página visible, reanudando polling');
            resumeAutoRefresh();
        }
    });

    setInterval(logPollingStatus, 60000);
    console.log(`Sistema iniciado - Vista: ${currentViewType}`);
});

function detectViewType() {
    if (document.getElementById('pipas')) {
        currentViewType = 'melaza';
        console.log('Vista detectada: Melaza (encontrado ID: pipas)');
    } else if (document.getElementById('planas') && document.getElementById('volteo')) {
        currentViewType = 'azucar';
        console.log('Vista detectada: Azúcar (encontrados IDs: planas y volteo)');
    } else if (document.getElementById('planas') || document.getElementById('volteo')) {
        currentViewType = 'azucar';
        console.log('Vista detectada: Azúcar (encontrado al menos un ID)');
    } else {
        currentViewType = 'unknown';
        console.log('Vista no detectada, usando configuración por defecto');
    }
}

function startAutoRefresh() {
    console.log('Iniciando auto-refresh automático cada 30 segundos');
    
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
    
    autoRefreshInterval = setInterval(function() {
        if (autoRefreshEnabled && modalsOpen === 0 && !document.hidden) {
            console.log('Verificando actualizaciones automáticamente...');
            checkForUpdates();
        } else {
            console.log('Auto-refresh pausado - Modales:', modalsOpen, 'Hidden:', document.hidden);
        }
    }, refreshIntervalMs);
    
    setInterval(function() {
        if (!autoRefreshInterval && autoRefreshEnabled) {
            console.warn('⚠️ Intervalo perdido, reiniciando...');
            startAutoRefresh();
        }
    }, 60000);
    
    console.log(`Auto-refresh automático iniciado cada ${refreshIntervalMs/1000} segundos`);
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

function logPollingStatus() {
    console.log('=== POLLING STATUS (AUTORIZACION INGRESO) ===');
    console.log('Interval exists:', !!autoRefreshInterval);
    console.log('Enabled:', autoRefreshEnabled);
    console.log('Modals open:', modalsOpen);
    console.log('In progress:', refreshInProgress);
    console.log('Consecutive errors:', consecutiveErrors);
    console.log('Page hidden:', document.hidden);
    console.log('View type:', currentViewType);
    console.log('============================================');
}

function calculateDataHash() {
    try {
        let cards;
        
        if (currentViewType === 'melaza') {
            cards = document.querySelectorAll('#pipas .card[data-codigo-generacion]');
        } else if (currentViewType === 'azucar') {
            const planasCards = document.querySelectorAll('#planas .card[data-codigo-generacion]');
            const volteoCards = document.querySelectorAll('#volteo .card[data-codigo-generacion]');
            cards = [...planasCards, ...volteoCards];
        } else {
            cards = document.querySelectorAll('.card[data-codigo-generacion]');
        }
        
        const codigosGeneracion = Array.from(cards)
            .map(card => card.getAttribute('data-codigo-generacion'))
            .filter(code => code)
            .sort()
            .join('|');
        
        lastDataHash = simpleHash(codigosGeneracion);
        console.log(`Hash de tarjetas: ${lastDataHash}, Total: ${cards.length}`);
    } catch (error) {
        console.error('Error calculando hash de tarjetas:', error);
    }
}

function calculateCountersHash() {
    try {
        let countersText = '';
        
        // Capturar contadores según la vista
        if (currentViewType === 'melaza') {
            // En melaza, buscar dentro de melaza-card
            const melazaCards = document.querySelectorAll('.melaza-card .font-bold');
            melazaCards.forEach(count => {
                countersText += count.textContent.trim() + '|';
            });
        } else {
            // En azúcar, usar unit-count
            const unitCounts = document.querySelectorAll('.unit-count');
            unitCounts.forEach(count => {
                countersText += count.textContent.trim() + '|';
            });
        }
        
        // Contadores de ingenios (común para ambas vistas)
        const ingenioCounts = document.querySelectorAll('.ingenio-count');
        ingenioCounts.forEach(count => {
            countersText += count.textContent.trim() + '|';
        });
        
        lastCountersHash = simpleHash(countersText);
        console.log(`Hash de contadores: ${lastCountersHash}, Texto: [${countersText.substring(0, 50)}...]`);
    } catch (error) {
        console.error('Error calculando hash de contadores:', error);
    }
}

function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash;
}

function checkForUpdates() {
    if (refreshInProgress) {
        console.log('Actualización ya en progreso, saltando...');
        return;
    }
    
    refreshInProgress = true;
    
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
                // Parsear respuesta correctamente usando DOM nativo
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = response;

                // Crear jQuery wrapper del DOM parseado correctamente
                const newDoc = $(tempDiv);
                let hasCardsChanges = false;
                let hasCountersChanges = false;

                // Verificar cambios en tarjetas
                if (currentViewType === 'melaza') {
                    const newPipasContainer = newDoc.find('#pipas');
                    // Solo actualizar si hay contenido válido
                    if (newPipasContainer.length && newPipasContainer.find('.card').length > 0) {
                        hasCardsChanges = checkHashChangesImproved(newPipasContainer);
                        if (hasCardsChanges) {
                            updateMelazaView(newDoc);
                        }
                    } else {
                        console.log('Respuesta sin cards en pipas, no se actualiza');
                    }
                } else if (currentViewType === 'azucar') {
                    const newPlanasContainer = newDoc.find('#planas');
                    const newVolteoContainer = newDoc.find('#volteo');

                    // Solo actualizar si hay contenido válido en alguno
                    const hasPlanas = newPlanasContainer.length && newPlanasContainer.find('.card').length > 0;
                    const hasVolteo = newVolteoContainer.length && newVolteoContainer.find('.card').length > 0;

                    if (hasPlanas || hasVolteo) {
                        hasCardsChanges = checkHashChangesImprovedAzucar(newPlanasContainer, newVolteoContainer);
                        if (hasCardsChanges) {
                            updateAzucarView(newDoc);
                        }
                    } else {
                        console.log('Respuesta sin cards en planas/volteo, no se actualiza');
                    }
                }

                // SIEMPRE verificar cambios en contadores
                hasCountersChanges = checkCountersChanges(newDoc);
                if (hasCountersChanges) {
                    updateCommonSections(newDoc);
                }

                if (hasCardsChanges || hasCountersChanges) {
                    consecutiveErrors = 0;
                    // showUpdateNotification();
                    console.log('✓ Vista actualizada - Tarjetas:', hasCardsChanges, 'Contadores:', hasCountersChanges);
                } else {
                    console.log('No hay cambios detectados');
                }

            } catch (error) {
                console.error('Error procesando respuesta:', error);
                consecutiveErrors++;
            }
        },
        error: function(xhr, status, error) {
            consecutiveErrors++;
            console.error(`Error al verificar actualizaciones (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, error);

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

function checkCountersChanges(newDoc) {
    let newCountersText = '';
    
    // Capturar contadores según la vista
    if (currentViewType === 'melaza') {
        const newMelazaCounts = newDoc.find('.melaza-card .font-bold');
        newMelazaCounts.each(function() {
            newCountersText += $(this).text().trim() + '|';
        });
    } else {
        const newUnitCounts = newDoc.find('.unit-count');
        newUnitCounts.each(function() {
            newCountersText += $(this).text().trim() + '|';
        });
    }
    
    // Contadores de ingenios
    const newIngenioCounts = newDoc.find('.ingenio-count');
    newIngenioCounts.each(function() {
        newCountersText += $(this).text().trim() + '|';
    });
    
    const newHash = simpleHash(newCountersText);
    
    console.log(`Comparando contadores - Anterior: ${lastCountersHash}, Nuevo: ${newHash}`);
    console.log(`Texto de contadores: [${newCountersText.substring(0, 100)}...]`);
    
    if (newHash !== lastCountersHash) {
        console.log(`✓ Cambios en contadores detectados`);
        lastCountersHash = newHash;
        return true;
    }
    return false;
}

function checkHashChangesImproved(newContainer) {
    const newCards = newContainer.find('.card[data-codigo-generacion]');
    const newCodigos = newCards.map(function() {
        return $(this).attr('data-codigo-generacion');
    }).get().filter(code => code).sort().join('|');
    
    const newHash = simpleHash(newCodigos);
    
    console.log(`Comparando tarjetas - Anterior: ${lastDataHash}, Nuevo: ${newHash}`);
    
    if (newHash !== lastDataHash) {
        console.log(`✓ Cambios en tarjetas detectados`);
        lastDataHash = newHash;
        return true;
    }
    return false;
}

function checkHashChangesImprovedAzucar(newPlanasContainer, newVolteoContainer) {
    const planasCards = newPlanasContainer.find('.card[data-codigo-generacion]');
    const volteoCards = newVolteoContainer.find('.card[data-codigo-generacion]');
    
    const planasCodigos = planasCards.map(function() {
        return $(this).attr('data-codigo-generacion');
    }).get();
    
    const volteoCodigos = volteoCards.map(function() {
        return $(this).attr('data-codigo-generacion');
    }).get();
    
    const allCodigos = [...planasCodigos, ...volteoCodigos]
        .filter(code => code)
        .sort()
        .join('|');
    
    const newHash = simpleHash(allCodigos);
    
    console.log(`Comparando tarjetas - Anterior: ${lastDataHash}, Nuevo: ${newHash}`);
    console.log(`Planas: ${planasCodigos.length}, Volteo: ${volteoCodigos.length}`);
    
    if (newHash !== lastDataHash) {
        console.log(`✓ Cambios en tarjetas detectados`);
        lastDataHash = newHash;
        return true;
    }
    return false;
}

function updateMelazaView(newDoc) {
    try {
        const searchValue = $('#searchInput').val();
        const newPipasHtml = newDoc.find('#pipas').html();

        if (newPipasHtml) {
            $('#pipas').html(newPipasHtml);

            // Re-bind filtros de ingenio
            bindIngenioFilterCards();

            // Restaurar búsqueda si había
            if (searchValue) {
                $('#searchInput').val(searchValue);
            }

            // Restaurar filtro de ingenio (ya aplica filtros internamente)
            const hadFilter = restoreFilter();

            // Si no había filtro guardado, aplicar filtros de todas formas
            if (!hadFilter) {
                setTimeout(() => applyFilters(), 100);
            }

            console.log('Vista Melaza actualizada');
        }
    } catch (error) {
        console.error('Error actualizando vista Melaza:', error);
    }
}

function updateAzucarView(newDoc) {
    try {
        const searchValue = $('#searchInput').val();
        const newPlanasHtml = newDoc.find('#planas .row.g-3').html();
        const newVolteoHtml = newDoc.find('#volteo .row.g-3').html();

        if (newPlanasHtml && newVolteoHtml) {
            $('#planas .row.g-3').html(newPlanasHtml);
            $('#volteo .row.g-3').html(newVolteoHtml);

            // Re-bind filtros de ingenio
            bindIngenioFilterCards();

            // Restaurar búsqueda si había
            if (searchValue) {
                $('#searchInput').val(searchValue);
            }

            // Restaurar filtro de ingenio (ya aplica filtros internamente)
            const hadFilter = restoreFilter();

            // Si no había filtro guardado, aplicar filtros de todas formas
            if (!hadFilter) {
                setTimeout(() => applyFilters(), 100);
            }

            console.log('Vista Azúcar actualizada');
        }
    } catch (error) {
        console.error('Error actualizando vista Azúcar:', error);
    }
}

function updateCommonSections(newDoc) {
    try {
        if (currentViewType === 'melaza') {
            // Actualizar sección superior de Melaza
            const newUpperSection = newDoc.find('.upper-cards-section');
            if (newUpperSection.length) {
                $('.upper-cards-section').html(newUpperSection.html());
                console.log('Sección superior Melaza actualizada');
            }
        } else {
            // Actualizar sección superior de Azúcar
            const newUpperSection = newDoc.find('section.grid').first();
            if (newUpperSection.length) {
                $('section.grid').first().html(newUpperSection.html());
                console.log('Sección superior Azúcar actualizada');
            }
        }
        
        // Actualizar grid de ingenios (común para ambas)
        const newIngeniosGrid = newDoc.find('.ingenios-grid');
        if (newIngeniosGrid.length) {
            $('.ingenios-grid').html(newIngeniosGrid.html());

            // Re-bind filtros de ingenio después de actualizar
            bindIngenioFilterCards();

            // Restaurar estado visual del filtro activo
            restoreFilter();

            console.log('Grid de ingenios actualizado y eventos re-vinculados');
        }

    } catch (error) {
        console.warn('Error actualizando secciones comunes:', error);
    }
}

function showUpdateNotification() {
    const existingNotification = document.querySelector('.update-notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    const notification = document.createElement('div');
    notification.className = 'update-notification';
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
    const existingError = document.querySelector('.refresh-error');
    if (existingError) {
        existingError.remove();
    }
    
    const errorIndicator = document.createElement('div');
    errorIndicator.className = 'refresh-error';
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

function parseErrorMessage(xhr, defaultMessage) {
    var errorMessage = defaultMessage || 'Ocurrió un error inesperado.';
    
    try {
        var errorData = JSON.parse(xhr.responseText);
        
        if (errorData.errorMessage) {
            try {
                var nestedErrorData = JSON.parse(errorData.errorMessage);
                if (nestedErrorData.message) {
                    return nestedErrorData.message;
                }
            } catch (nestedParseError) {
                return errorData.errorMessage;
            }
        }
        
        if (errorData.message) {
            errorMessage = errorData.message;
        }
        
        if (errorData.error) {
            try {
                var nestedError = JSON.parse(errorData.error);
                if (nestedError.message) {
                    errorMessage = nestedError.message;
                }
            } catch (nestedParseError) {
                errorMessage = errorData.error;
            }
        }
        
        if (errorData.details) {
            errorMessage += '\n\nDetalles: ' + errorData.details;
        }
        
        if (errorData.errors && Array.isArray(errorData.errors)) {
            errorMessage += '\n\nErrores adicionales: ' + errorData.errors.join(', ');
        }
        
    } catch (parseError) {
        if (xhr.responseText) {
            if (xhr.responseText.includes('<html>') || xhr.responseText.includes('<!DOCTYPE')) {
                errorMessage = defaultMessage + '\n\nError del servidor (código: ' + xhr.status + ')';
            } else {
                errorMessage = xhr.responseText;
            }
        }
    }
    
    return errorMessage;
}

function parseSuccessResponse(response, defaultSuccessMessage) {
    if (response && typeof response === 'object' && response.errorMessage) {
        try {
            var nestedErrorData = JSON.parse(response.errorMessage);
            if (nestedErrorData.message) {
                return {
                    isError: true,
                    message: nestedErrorData.message
                };
            }
        } catch (nestedParseError) {
            return {
                isError: true,
                message: response.errorMessage
            };
        }
    }
    
    if (response && typeof response === 'object' && response.hasOwnProperty('success')) {
        if (response.success === false) {
            var errorMessage = response.message || 'Error desconocido.';
            
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
    
    if (typeof response === 'string' && response.includes('Error')) {
        return {
            isError: true,
            message: response
        };
    }
    
    return {
        isError: false,
        message: defaultSuccessMessage
    };
}

// FILTRADO POR INGENIO CON TARJETAS CLICKEABLES
// Namespace específico para AutorizacionIngreso para evitar conflictos con otras páginas
// Separado por vista (azucar/melaza) para independencia
const AutorizacionIngresoFilters = {
    azucar: {
        currentIngenioFilter: 'todos'
    },
    melaza: {
        currentIngenioFilter: 'todos'
    }
};

// Helper para obtener el filtro actual según la vista
function getCurrentFilters() {
    if (currentViewType === 'melaza') {
        return AutorizacionIngresoFilters.melaza;
    } else {
        return AutorizacionIngresoFilters.azucar;
    }
}

// Helper para obtener la clave de sessionStorage según la vista
function getStorageKey(suffix) {
    const prefix = currentViewType === 'melaza' ? 'autorizacionIngresoMelaza' : 'autorizacionIngreso';
    return `${prefix}_${suffix}`;
}

function applyFilters() {
    var input = document.getElementById("searchInput");
    var searchValue = input ? input.value.toLowerCase() : '';

    let cardWrappers;

    if (currentViewType === 'melaza') {
        cardWrappers = document.querySelectorAll("#pipas .unit-card-wrapper");
    } else if (currentViewType === 'azucar') {
        const planasWrappers = document.querySelectorAll("#planas .unit-card-wrapper");
        const volteoWrappers = document.querySelectorAll("#volteo .unit-card-wrapper");
        cardWrappers = [...planasWrappers, ...volteoWrappers];
    } else {
        cardWrappers = document.querySelectorAll(".unit-card-wrapper");
    }

    let visibleCount = 0;
    let hiddenCount = 0;

    const filters = getCurrentFilters();

    cardWrappers.forEach(function (cardWrapper) {
        const ingenio = cardWrapper.getAttribute('data-ingenio');
        var card = cardWrapper.querySelector('.card');

        if (card) {
            var cardText = card.innerText.toLowerCase();

            // Aplicar filtro de ingenio
            let matchesIngenioFilter = filters.currentIngenioFilter === 'todos' || ingenio === filters.currentIngenioFilter;

            // Aplicar búsqueda
            let matchesSearch = !searchValue || cardText.includes(searchValue);

            const isVisible = matchesIngenioFilter && matchesSearch;

            if (isVisible) {
                cardWrapper.style.display = "block";
                visibleCount++;
            } else {
                cardWrapper.style.display = "none";
                hiddenCount++;
            }
        }
    });

    console.log(`Filtro aplicado [${currentViewType}] - Búsqueda: "${searchValue}", Ingenio: "${filters.currentIngenioFilter}" - Visibles: ${visibleCount}, Ocultas: ${hiddenCount}`);

    // Guardar filtro actual con prefijo único según la vista
    sessionStorage.setItem(getStorageKey('currentIngenioFilter'), filters.currentIngenioFilter);
}

function restoreFilter() {
    const filters = getCurrentFilters();
    const savedIngenioFilter = sessionStorage.getItem(getStorageKey('currentIngenioFilter'));

    if (savedIngenioFilter && savedIngenioFilter !== 'todos') {
        // Restaurar el estado del filtro directamente sin toggle
        filters.currentIngenioFilter = savedIngenioFilter;

        // Actualizar visualización de tarjetas de ingenio clickeables
        document.querySelectorAll('.filter-ingenio-clickable').forEach(card => {
            const cardIngenio = card.getAttribute('data-filter-ingenio');

            if (cardIngenio === filters.currentIngenioFilter) {
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

        console.log(`🔄 Filtro restaurado [${currentViewType}]: ${filters.currentIngenioFilter}`);
        return true; // Indica que se restauró un filtro
    }

    return false; // No había filtro guardado
}

// FILTRADO POR INGENIO
function setIngenioFilter(ingenioCode) {
    const filters = getCurrentFilters();

    // Si se hace clic en el mismo ingenio, volver a "todos"
    if (filters.currentIngenioFilter === ingenioCode && ingenioCode !== 'todos') {
        filters.currentIngenioFilter = 'todos';
    } else {
        filters.currentIngenioFilter = ingenioCode;
    }

    // Actualizar visualización de tarjetas de ingenio clickeables
    document.querySelectorAll('.filter-ingenio-clickable').forEach(card => {
        const cardIngenio = card.getAttribute('data-filter-ingenio');

        if (filters.currentIngenioFilter === 'todos') {
            // Todos activos - remover borde
            card.style.border = '';
            card.style.boxShadow = '';
            card.style.opacity = '1';
            card.style.transform = 'scale(1)';
        } else if (cardIngenio === filters.currentIngenioFilter) {
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

    console.log(`🏭 Filtro de ingenio aplicado [${currentViewType}]: ${filters.currentIngenioFilter}`);
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

function confirmAuthorization(element) {
    const transporter = element.getAttribute('data-transporter') || 'No disponible';
    const trailerPlate = element.getAttribute('data-trailerplate') || 'No disponible';
    const plate = element.getAttribute('data-plate') || 'No disponible';
    const codigoGeneracion = element.getAttribute('data-codigo-generacion');

    if (!codigoGeneracion) {
        Swal.fire({
            title: 'Error',
            text: 'No se encontró el código de generación',
            icon: 'error',
            confirmButtonColor: '#3085d6',
            confirmButtonText: 'Aceptar'
        });
        return;
    }

    const message = `
        <p>¿Estás seguro de autorizar al camión con el siguiente detalle para entrar a planta?</p>
        <ul style="text-align: left; padding-left: 20px;">
            <li><strong>Código Generación:</strong> ${codigoGeneracion}</li>
            <li><strong>Motorista:</strong> ${transporter}</li>
            <li><strong>Placa Remolque:</strong> ${trailerPlate}</li>
            <li><strong>Placa Camión:</strong> ${plate}</li>
        </ul>
    `;

    Swal.fire({
        title: 'Confirmación',
        html: message,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Sí, autorizar',
        cancelButtonText: 'Cancelar'
    }).then((result) => {
        if (result.isConfirmed) {
            changeStatus(codigoGeneracion);
        }
    });
}

function changeStatus(codigoGeneracion) {
    if (!codigoGeneracion || codigoGeneracion.trim() === '') {
        Swal.fire({
            title: 'Error',
            text: 'Código de Generación no válido',
            icon: 'error',
            confirmButtonColor: '#3085d6',
            confirmButtonText: 'Aceptar'
        });
        return;
    }

    window.AlmapacUtils.showSpinner();

    const token = document.querySelector('input[name="__RequestVerificationToken"]')?.value || '';
    
    let url;
    if (currentViewType === 'melaza') {
        url = '/AutorizacionIngresoMelaza/ChangeTransactionStatus';
    } else {
        url = '/AutorizacionIngreso/ChangeTransactionStatus';
    }

    console.log(`Cambiando estado para código: ${codigoGeneracion}, Vista: ${currentViewType}, URL: ${url}`);

    fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'RequestVerificationToken': token
        },
        body: JSON.stringify({ codeGen: codigoGeneracion })
    })
    .then(response => {
        return response.json().then(data => ({
            status: response.status,
            ok: response.ok,
            data: data
        }));
    })
    .then(result => {
        console.log("Respuesta del servidor:", result);
        
        if (result.ok) {
            Swal.fire({
                title: '¡Operación exitosa!',
                text: 'El ingreso ha sido autorizado correctamente',
                icon: 'success',
                showConfirmButton: false,
                timer: 2000
            }).then(() => {
                console.log('Forzando actualización después de autorización exitosa');
                checkForUpdates();
            });
        } else {
            let errorMessage = 'Error al cambiar el estado. Por favor, intente nuevamente.';
            
            if (result.data) {
                if (result.data.errorMessage) {
                    try {
                        const parsedError = JSON.parse(result.data.errorMessage);
                        errorMessage = parsedError.message || result.data.errorMessage;
                    } catch (e) {
                        errorMessage = result.data.errorMessage;
                    }
                } else if (result.data.message) {
                    errorMessage = result.data.message;
                }
            }
            
            Swal.fire({
                title: 'Error',
                text: errorMessage,
                icon: 'error',
                confirmButtonText: 'Aceptar'
            });
        }
    })
    .catch(error => {
        console.error("Error en la petición:", error);
        Swal.fire({
            title: 'Error',
            text: 'Error de conexión. Por favor, intente nuevamente.',
            icon: 'error',
            confirmButtonText: 'Aceptar'
        });
    })
    .finally(() => {
        window.AlmapacUtils.hideSpinner();
    });
}

const style = document.createElement('style');
style.textContent = `
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
    
    .update-notification div {
        backdrop-filter: blur(10px);
    }
    
    .refresh-error div {
        backdrop-filter: blur(10px);
    }
`;
document.head.appendChild(style);

console.log('Sistema de autorización inicializado.');