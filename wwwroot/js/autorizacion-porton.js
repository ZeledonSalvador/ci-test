/* ==============================
   ADAPTACIÓN: MARCHAMOS DINÁMICOS
   ============================== */

// Variables globales
var datosConErroresGlobal = [];
var informacionEnvioGlobal = {
    codigoGeneracion: '',
    nombreIngenio: ''
};

// Variables para auto-refresh
let autoRefreshEnabled = true;
let autoRefreshInterval = null;
let refreshIntervalMs = 30000; // 30s
let lastDataHash = null;
let modalsOpen = 0;

// Variables globales marchamos / reporte
var marchamosConErroresGlobal = [];
var todosLosMarchamosEscaneadosGlobal = []; // NUEVO: Todos los marchamos escaneados en orden
var marchamosEsperadosGlobal = []; // NUEVO: Marchamos esperados del sistema en orden
var informacionEnvioMarchamosGlobal = {
    codigoGeneracion: '',
    nombreIngenio: '',
    nombreMotorista: ''
};

// ===== NUEVO: Estado dinámico de marchamos =====
let expectedSeals = 0; // N que devuelve el backend

$(window).on('load', function () {
    $("#spinner-overlay").fadeOut("slow");

    // Calcular hash inicial ANTES de iniciar auto-refresh
    calculateDataHash();

    // Iniciar auto-refresh después de un pequeño delay para asegurar que el DOM esté listo
    setTimeout(function() {
        startAutoRefresh();
    }, 500);

    setupModalEvents();

    // Evitar recarga por clicks genéricos en botones del navbar
    // ✅ solo navbar
    document.querySelectorAll("nav .btn, .navbar .btn").forEach(btn => {
        btn.addEventListener("click", function (event) {
            event.preventDefault();
        });
    });
});

// También inicializar cuando el documento esté listo (respaldo)
$(document).ready(function() {
    // Si hay tarjetas visibles, calcular hash
    const cards = document.querySelectorAll('.container-fluid .card');
    if (cards.length > 0) {
        console.log('Tarjetas encontradas en carga inicial:', cards.length);
    }
});

function closeModalById(selector) {
    const el = document.querySelector(selector);
    if (!el) return;

    // Bootstrap 5
    if (window.bootstrap && bootstrap.Modal) {
        const inst = bootstrap.Modal.getInstance(el) || new bootstrap.Modal(el);
        inst.hide();
    }
    // Bootstrap 4 (jQuery)
    else if (window.$ && typeof $(el).modal === 'function') {
        $(el).modal('hide');
    }

    // Limpieza de respaldo
    setTimeout(() => {
        document.body.classList.remove('modal-open');
        document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
        document.body.style.paddingRight = '';
    }, 150);
}

// Click en la X → cerrar (funciona con .close de BS4 o .btn-close de BS5)
// Helper compatible BS4 / BS5 para cerrar un modal por elemento
function hideModal(el) {
    if (!el) return;

    // Bootstrap 5 (todas las variantes)
    if (window.bootstrap && bootstrap.Modal) {
        try {
            let inst = null;
            if (typeof bootstrap.Modal.getOrCreateInstance === 'function') {
                inst = bootstrap.Modal.getOrCreateInstance(el);
            } else if (typeof bootstrap.Modal.getInstance === 'function') {
                inst = bootstrap.Modal.getInstance(el) || new bootstrap.Modal(el);
            } else {
                inst = new bootstrap.Modal(el); // 5.0
            }
            inst.hide();
            return;
        } catch (e) { /* seguimos al fallback */ }
    }

    // Bootstrap 4 (jQuery plugin)
    if (window.$ && $.fn && typeof $.fn.modal === 'function') {
        $(el).modal('hide');
        return;
    }

    // Fallback manual (por si no hay bootstrap JS)
    el.classList.remove('show');
    el.setAttribute('aria-hidden', 'true');
    el.style.display = 'none';
    document.body.classList.remove('modal-open');
    document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
    document.body.style.paddingRight = '';
}

// Click en la X o en cualquier elemento con data-dismiss/bs-dismiss dentro del modal
document.addEventListener('click', function (e) {
    const btn = e.target.closest(
        '#rutaModal [data-dismiss="modal"], ' +
        '#rutaModal [data-bs-dismiss="modal"], ' +
        '#rutaModal .close, ' +
        '#rutaModal .btn-close'
    );
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    hideModal(document.getElementById('rutaModal'));
});

// Evita doble auto-validación
let __sealAutoValidating = false;

function isModalOpen() {
    const el = document.getElementById('rutaModal');
    return el && (el.classList.contains('show') || el.getAttribute('aria-hidden') === 'false');
}

function getAllSealInputs() {
    return Array.from(document.querySelectorAll('#sealsContainer .seal-input'));
}

function getFirstEmptyIndex() {
    const inputs = getAllSealInputs();
    for (let i = 0; i < inputs.length; i++) {
        if (inputs[i].value.trim() === '') return i;
    }
    return -1;
}

function focusFirstEmptySealInput(select = true) {
    const idx = getFirstEmptyIndex();
    const inputs = getAllSealInputs();
    if (idx === -1) {
        autoValidateIfReady();
        return;
    }
    const el = inputs[idx];
    if (!el) return;
    if (document.activeElement !== el) {
        el.focus();
        if (select && el.select) el.select();
    }
}

function moveToNext(currentIdx) {
    const inputs = getAllSealInputs();
    const next = inputs[currentIdx + 1];
    if (next) {
        next.focus();
        next.select && next.select();
    } else {
        autoValidateIfReady();
    }
}

function allSealsFilled() {
    const inputs = getAllSealInputs();
    const expected = Number(document.getElementById('expectedSeals')?.value || expectedSeals || inputs.length);
    const filled = inputs.filter(i => i.value.trim() !== '').length;
    return expected > 0 && filled >= expected;
}

function autoValidateIfReady() {
    if (__sealAutoValidating) return;

    if (allSealsFilled()) {
        __sealAutoValidating = true;
        validarInformacion(); // tu función existente
    }
}


/* ==============================
   POLLING Y DETECCIÓN DE CAMBIOS
   ============================== */
function startAutoRefresh() {
    if (autoRefreshInterval) clearInterval(autoRefreshInterval);

    autoRefreshInterval = setInterval(function () {
        if (autoRefreshEnabled && modalsOpen === 0) {
            console.log('Verificando actualizaciones automáticamente...');
            checkForUpdates();
        } else {
            console.log('Auto-refresh pausado - Modales abiertos:', modalsOpen);
        }
    }, refreshIntervalMs);

    console.log('Auto-refresh automático iniciado cada 30 segundos');
}

function checkForUpdates() {
    $.ajax({
        type: "GET",
        url: window.location.pathname,
        cache: false,
        timeout: 10000,
        headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        },
        success: function (response) {
            try {
                // Crear un documento temporal para parsear el HTML correctamente
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = response;

                // Buscar el container-fluid que contiene las cards (el principal, no los del header/footer)
                const containers = tempDiv.querySelectorAll('.container-fluid');
                let targetContainer = null;

                // Encontrar el container que tiene las cards
                for (let container of containers) {
                    if (container.querySelectorAll('.card').length > 0) {
                        targetContainer = container;
                        break;
                    }
                }

                if (!targetContainer) {
                    console.log('No se encontró contenedor con cards');
                    return;
                }

                // Calcular hash incluyendo la estructura de secciones (operativas vs inconsistencias)
                const newCards = targetContainer.querySelectorAll('.card');

                // Contar cards por sección para detectar cambios de status
                const operativasSection = targetContainer.querySelector('.row.mt-3');
                const inconsistenciasSection = targetContainer.querySelector('.inconsistencies-section');

                const cardsOperativas = operativasSection ? operativasSection.querySelectorAll('.card').length : 0;
                const cardsInconsistencias = inconsistenciasSection ? inconsistenciasSection.querySelectorAll('.card').length : 0;

                // Incluir conteo por sección + contenido de las cards en el hash
                const sectionInfo = `OP:${cardsOperativas}|INC:${cardsInconsistencias}|`;
                const newDataString = sectionInfo + Array.from(newCards).map(card => card.textContent.trim()).join('|||');
                const newHash = simpleHash(newDataString);

                console.log('Cards - Operativas:', cardsOperativas, 'Inconsistencias:', cardsInconsistencias, 'Hash nuevo:', newHash, 'Hash actual:', lastDataHash);

                // Solo actualizar si hay cards Y el hash es diferente
                if (newCards.length > 0 && newHash !== lastDataHash) {
                    console.log('Cambios detectados, actualizando vista...');
                    const searchValue = $('#searchInput').val();

                    // Obtener el container actual en la página
                    const currentContainers = document.querySelectorAll('.container-fluid');
                    for (let container of currentContainers) {
                        if (container.querySelectorAll('.card').length > 0 || container.querySelector('.row.mt-3')) {
                            container.innerHTML = targetContainer.innerHTML;
                            break;
                        }
                    }

                    if (searchValue) {
                        $('#searchInput').val(searchValue);
                        if (typeof filterCards === 'function') filterCards();
                    }
                    lastDataHash = newHash;
                    console.log('Vista actualizada exitosamente. Cards:', newCards.length);
                } else if (newCards.length === 0) {
                    console.log('Respuesta sin cards, no se actualiza');
                } else {
                    console.log('No hay cambios nuevos');
                }
            } catch (error) {
                console.error('Error procesando respuesta:', error);
            }
        },
        error: function (xhr, status, error) {
            console.error('Error al verificar actualizaciones:', error);
            if (status !== 'timeout' && status !== 'abort') {
                var errorMessage = parseErrorMessage(xhr, 'Error al verificar actualizaciones');
                console.error('Detalles del error:', errorMessage);
                showRefreshError();
            }
        }
    });
}

function calculateDataHash() {
    // Buscar el container-fluid que contiene las cards (no el del header)
    const containers = document.querySelectorAll('.container-fluid');
    let container = null;

    for (let c of containers) {
        if (c.querySelectorAll('.card').length > 0) {
            container = c;
            break;
        }
    }

    if (!container) {
        console.log('No se encontró contenedor con cards para calcular hash inicial');
        return;
    }

    const cards = container.querySelectorAll('.card');

    // Contar cards por sección para detectar cambios de status
    const operativasSection = container.querySelector('.row.mt-3');
    const inconsistenciasSection = container.querySelector('.inconsistencies-section');

    const cardsOperativas = operativasSection ? operativasSection.querySelectorAll('.card').length : 0;
    const cardsInconsistencias = inconsistenciasSection ? inconsistenciasSection.querySelectorAll('.card').length : 0;

    // Incluir conteo por sección + contenido de las cards en el hash
    const sectionInfo = `OP:${cardsOperativas}|INC:${cardsInconsistencias}|`;
    const dataString = sectionInfo + Array.from(cards).map(card => card.textContent.trim()).join('|||');
    lastDataHash = simpleHash(dataString);

    console.log('Hash inicial calculado - Operativas:', cardsOperativas, 'Inconsistencias:', cardsInconsistencias, 'Total cards:', cards.length);
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

function showUpdateNotification() {
    const notification = document.createElement('div');
    notification.innerHTML = `
        <div style="position: fixed; top: 20px; right: 20px; z-index: 10000; 
                    background: rgba(40,167,69,0.95); color: white; 
                    padding: 12px 18px; border-radius: 6px; font-size: 14px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
            <i class="fas fa-check-circle"></i> Datos actualizados
        </div>
    `;
    document.body.appendChild(notification);
    setTimeout(() => { if (notification.parentNode) notification.remove(); }, 3000);
}

/* ==============================
   MODALES → pausar auto-refresh
   ============================== */
function setupModalEvents() {
    $('.modal').on('show.bs.modal', function () {
        modalsOpen++;
        console.log('Modal abierto. Total modales:', modalsOpen);
    });
    $('.modal').on('hidden.bs.modal', function () {
        modalsOpen = Math.max(0, modalsOpen - 1);
        console.log('Modal cerrado. Total modales:', modalsOpen);
    });
}

// Evitar submit/auto-click por Enter dentro del modal
$(document).ready(function () {
  const $modal = $('#rutaModal');

  // Si hay form dentro del modal, jamás enviarlo por Enter implícito
  $modal.find('form').on('submit', function (e) { e.preventDefault(); });

  // Capturar Enter en cualquier input de sellos y evitar que "suba"
  $modal.on('keydown', '.seal-input', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  // Asegúrate que botones del footer tengan type="button"
  $modal.find('.modal-footer button').each(function () {
    if (!this.getAttribute('type')) this.setAttribute('type', 'button');
  });
});


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
    setTimeout(() => { if (errorIndicator.parentNode) document.body.removeChild(errorIndicator); }, 4000);
}

/* ==============================
   PARSEO DE ERRORES / RESPUESTAS
   ============================== */
function parseErrorMessage(xhr, defaultMessage) {
    var errorMessage = defaultMessage || 'Ocurrió un error inesperado.';
    try {
        var errorData = JSON.parse(xhr.responseText);
        if (errorData.message) errorMessage = errorData.message;
        if (errorData.error) {
            try {
                var nestedError = JSON.parse(errorData.error);
                if (nestedError.message) errorMessage = nestedError.message;
            } catch (nestedParseError) {
                errorMessage = errorData.error;
            }
        }
        if (errorData.details) errorMessage += '\n\nDetalles: ' + errorData.details;
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
    if (response && typeof response === 'object' && response.hasOwnProperty('success')) {
        if (response.success === false) {
            var errorMessage = response.message || 'Error desconocido.';
            if (response.error) {
                try {
                    var errorObject = JSON.parse(response.error);
                    if (errorObject.message) errorMessage = errorObject.message;
                } catch (e) {
                    if (response.error !== response.message) errorMessage = response.error;
                }
            }
            return { isError: true, message: errorMessage };
        }
        if (response.success === true) {
            return { isError: false, message: response.message || defaultSuccessMessage };
        }
    }
    if (typeof response === 'string' && response.includes('Error')) {
        return { isError: true, message: response };
    }
    return { isError: false, message: defaultSuccessMessage };
}

/* ==============================
   UTILIDADES DINÁMICAS MARCHAMOS
   ============================== */
function renderSealInputs(count) {
    const container = document.getElementById('sealsContainer');
    const expectedSealsInput = document.getElementById('expectedSeals');
    const expectedSealCodesInput = document.getElementById('expectedSealCodes');

    container.innerHTML = '';
    expectedSeals = Math.max(1, Number(count) || 0);
    if (expectedSealsInput) expectedSealsInput.value = expectedSeals;

    const frag = document.createDocumentFragment();
    for (let i = 1; i <= expectedSeals; i++) {
        const div = document.createElement('div');
        div.className = 'col-12';
        div.innerHTML = `
      <div class="form-group">
        <label for="txt_marchamo${i}" class="col-form-label">Marchamo ${i}:</label>
        <input type="text" class="form-control seal-input"
               id="txt_marchamo${i}" data-idx="${i - 1}"
               maxlength="60" autocomplete="off">
      </div>`;
        frag.appendChild(div);
    }

    container.appendChild(frag);

    attachSealInputBehaviors();       // ← listeners de escaneo y foco
    focusFirstEmptySealInput();       // ← foco al primer vacío al abrir/renderizar

    if (expectedSealCodesInput && !expectedSealCodesInput.value) expectedSealCodesInput.value = '';
}

// ===== Config =====
const SCAN_MIN_CHARS = 6;       // mínimo típico que llega del escáner
const SCAN_MAX_INTERVAL = 30;   // ms máx. entre teclas para considerarlo escaneo
const AUTO_VALIDATE_ONLY_ON_SCAN = true; // true = solo autovalida si fue escaneo

// Estado para detectar "ritmo de escaneo"
function makeScanDetector() {
  return {
    lastTs: 0,
    streak: 0,
    isScanLike: false,
    reset() { this.lastTs = 0; this.streak = 0; this.isScanLike = false; }
  };
}


function attachSealInputBehaviors() {
  const inputs = getAllSealInputs();
  const container = document.getElementById('sealsContainer');

  inputs.forEach((input, idx) => {
    input.dataset.idx = String(idx);

    // Detector por input (se reinicia al enfocar)
    let detector = makeScanDetector();

    input.addEventListener('focus', () => detector.reset());

    // Enter/Tab → siguiente (controlado)
    input.addEventListener('keydown', (e) => {
      // Bloquea submit/auto-click
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();

        // Si es último input y todos llenos → validar
        const isLast = idx === inputs.length - 1;
        if (isLast) {
          if (!AUTO_VALIDATE_ONLY_ON_SCAN || detector.isScanLike) {
            autoValidateIfReady();
          } else {
            // Si no es escáner, solo mover foco para no "mandar" cosas sin querer
            moveToNext(idx);
          }
        } else {
          moveToNext(idx);
        }
        return;
      }

      if (e.key === 'Tab') {
        // Tab navega, pero evita side-effects en form
        e.stopPropagation();
      }

      // Marcar ritmo de tecleo (escáner = muy rápido)
      const now = performance.now();
      const delta = now - (detector.lastTs || now);
      detector.lastTs = now;

      // Filtra teclas de control
      const isChar = e.key.length === 1 || e.key === 'Spacebar' || e.key === ' ';
      if (isChar) {
        if (delta <= SCAN_MAX_INTERVAL) detector.streak++;
        else detector.streak = 0;

        // Consideramos "scan-like" si hubo varios chars rapidísimos y tamaño decente
        const val = input.value;
        if (!detector.isScanLike && (detector.streak >= 3 || (val && val.length >= SCAN_MIN_CHARS))) {
          detector.isScanLike = true;
        }
      }
    });

    // Si el escáner inyecta \r o \n → limpiar y avanzar
    input.addEventListener('input', (e) => {
      const el = e.target;
      let v = el.value;

      // 1) Escáner mete CR/LF
      if (/\r|\n/.test(v)) {
        el.value = v.replace(/[\r\n]+/g, '').trim();
        detector.isScanLike = true; // probablemente escáner
        // Si es el último, valida; si no, avanza
        const isLast = idx === inputs.length - 1;
        if (isLast) {
          if (!AUTO_VALIDATE_ONLY_ON_SCAN || detector.isScanLike) {
            autoValidateIfReady();
          } else {
            moveToNext(idx);
          }
        } else {
          moveToNext(idx);
        }
        return;
      }

      // 2) Pegar (paste) de un tirón: tratar como escaneo si es largo
      if (e.inputType === 'insertFromPaste' && v.trim().length >= SCAN_MIN_CHARS) {
        detector.isScanLike = true;
        const isLast = idx === inputs.length - 1;
        if (isLast) {
          if (!AUTO_VALIDATE_ONLY_ON_SCAN || detector.isScanLike) {
            autoValidateIfReady();
          }
        } else {
          moveToNext(idx);
        }
        return;
      }

      // 3) ⚠️ Importante: Ya NO avanzamos por longitud mientras escriben manual.
      //    Solo, si ya están todos llenos y PERMITIMOS autovalidar sin escáner:
      if (!AUTO_VALIDATE_ONLY_ON_SCAN && allSealsFilled()) {
        autoValidateIfReady();
      }
    });

    // Mantener el foco "en el siguiente vacío" si se van del input
    input.addEventListener('blur', () => {
      setTimeout(() => {
        if (!isModalOpen()) return;
        const active = document.activeElement;
        const footer = document.querySelector('#rutaModal .modal-footer');
        if (footer && active && footer.contains(active)) return;
        if (!active || !container.contains(active) || !active.classList.contains('seal-input')) {
          focusFirstEmptySealInput(false);
        }
      }, 30);
    });
  });

  // Reajuste por clic fuera
  container.addEventListener('focusout', () => {
    setTimeout(() => {
      if (!isModalOpen()) return;
      const active = document.activeElement;
      const footer = document.querySelector('#rutaModal .modal-footer');
      if (footer && active && footer.contains(active)) return;
      if (!active || !container.contains(active) || !active.classList.contains('seal-input')) {
        focusFirstEmptySealInput(false);
      }
    }, 30);
  }, { once: true });
}


function getEnteredSeals() {
    return Array.from(document.querySelectorAll('#sealsContainer .seal-input'))
        .map(i => i.value.trim())
        .filter(v => v !== '');
}

function findDuplicados(arr) {
    const c = new Map(), dups = [];
    for (const v of arr) {
        c.set(v, (c.get(v) || 0) + 1);
        if (c.get(v) === 2) dups.push(v);
    }
    return dups;
}

function marcarInvalidos(lista) {
    const inputs = Array.from(document.querySelectorAll('#sealsContainer .seal-input'));
    inputs.forEach((input, idx) => {
        const v = input.value.trim();
        if (v && lista.includes(v)) input.classList.add('error-field');
    });
}

function marcarDesdeMensaje(mensaje, ingresados) {
    // Soporta: "Los siguientes marchamos no son válidos: A, B"
    const m = /no [a-z\s]*válidos:\s*([^.]+)/i.exec(mensaje || '');
    let lista = [];
    if (m) lista = m[1].split(',').map(s => s.trim()).filter(Boolean);
    else lista = ingresados.slice(); // si no hay detalle, marca todos
    marcarInvalidos(lista);
}

/* ==============================
   CONFIGURACIÓN DE MODAL MARCHAMOS
   ============================== */

// Unificar handlers de show.bs.modal (evitar duplicados)
$(document).ready(function () {
    $('#rutaModal').off('show.bs.modal').on('show.bs.modal', function (event) {
        const button = $(event.relatedTarget);
        const codigoGeneracion = button.data('codigo-generacion');
        const nombreIngenio = decodeHtml(button.data('nombre-ingenio') || '').replace(/_/g, ' ');
        const nombreMotorista = decodeHtml(button.data('nombre-motorista') || '').replace(/_/g, ' ');
        const truckType = button.data('trucktype'); // ya no se usa para inputs, lo conservamos por si lo ocupas

        $('#codigoGeneracionInput').val(codigoGeneracion);
        $('#hiddenTruckType').val(truckType || '');

        informacionEnvioMarchamosGlobal.codigoGeneracion = codigoGeneracion;
        informacionEnvioMarchamosGlobal.nombreIngenio = nombreIngenio;
        informacionEnvioMarchamosGlobal.nombreMotorista = nombreMotorista;

        $(this).find('.modal-title').text(nombreMotorista + ' - ' + nombreIngenio);

        // ===== NUEVO: solicitar N marchamos al backend y renderizar =====
        //$("#spinner-overlay").show();
        $.getJSON('/AutorizacionPorton/Seals', { codeGen: codigoGeneracion })
            .done(function (r) {
                const codes = (r && r.codes) ? r.codes : [];
                $('#expectedSealCodes').val(codes.join(','));
                renderSealInputs((r && r.count) ? r.count : 1);
            })
            .fail(function () {
                // fallback a 1
                $('#expectedSealCodes').val('');
                renderSealInputs(1);
            })
            .always(function () {
                $("#spinner-overlay").hide();
            });
    });

    // Limpiar dinámicos al cerrar el modal
    $('#rutaModal').off('hidden.bs.modal').on('hidden.bs.modal', function () {
        const container = document.getElementById('sealsContainer');
        if (container) container.innerHTML = '';
        const expectedSealsInput = document.getElementById('expectedSeals');
        if (expectedSealsInput) expectedSealsInput.value = '0';
        const expectedSealCodesInput = document.getElementById('expectedSealCodes');
        if (expectedSealCodesInput) expectedSealCodesInput.value = '';
        const hiddenField = document.getElementById('codigoGeneracionInput');
        if (hiddenField) hiddenField.value = '';
        expectedSeals = 0;

        setTimeout(function () {
            $('body').removeClass('modal-open');
            $('.modal-backdrop').remove();
            $('body').css('padding-right', '');
        }, 100);
    });
});

// Mantener soporte a botones .verRutaBtn
$(document).ready(function () {
    $('.verRutaBtn').off('click').on('click', function () {
        const codigoGen = $(this).data('codigo-generacion');
        const truckType = $(this).data('trucktype') || '';
        $('#codigoGeneracionInput').val(codigoGen);
        $('#hiddenTruckType').val(truckType);
        $('#rutaModal').modal('show'); // el show disparará el fetch y render
    });
});

/* ==============================
   BOTÓN REPORTAR - SOLUCIÓN CORRECTA
   ============================== */
$(document).ready(function () {
    $('#btnReportarMarchamos').off('click').on('click', function () {
        console.log("=== BOTÓN REPORTAR CLICKEADO ===");

        // Capturar TODOS los marchamos escaneados (en orden)
        todosLosMarchamosEscaneadosGlobal = getEnteredSeals();
        console.log("Todos los marchamos escaneados:", todosLosMarchamosEscaneadosGlobal);

        // Capturar los marchamos esperados del sistema (en orden)
        const expectedCodesStr = document.getElementById('expectedSealCodes')?.value || '';
        marchamosEsperadosGlobal = expectedCodesStr ? expectedCodesStr.split(',').map(c => c.trim()) : [];
        console.log("Marchamos esperados del sistema:", marchamosEsperadosGlobal);

        // Capturar solo los que tienen error (para mostrar en el modal)
        marchamosConErroresGlobal = capturarMarchamosConErrores();
        console.log("Marchamos con errores capturados:", marchamosConErroresGlobal);

        if (marchamosConErroresGlobal.length === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'No hay inconsistencias detectadas',
                text: 'Para reportar inconsistencias, primero debe validar la información.',
                confirmButtonText: 'Entendido'
            });
            return;
        }

        document.getElementById('codigoGeneracionModalMarchamos').value = informacionEnvioMarchamosGlobal.codigoGeneracion;
        mostrarMarchamosConErrores(marchamosConErroresGlobal, informacionEnvioMarchamosGlobal);

        $('#rutaModal').modal('hide');

        setTimeout(function () {
            $('body').removeClass('modal-open');
            $('.modal-backdrop').remove();
            $('body').css('padding-right', '');
            $('#modalReportarMarchamos').modal('show');
            console.log("Modal de reporte abierto");
        }, 500);

        console.log("Información completa del envío:", informacionEnvioMarchamosGlobal);
        console.log("Marchamos con errores almacenados globalmente:", marchamosConErroresGlobal);
        console.log("Todos los escaneados (para backend):", todosLosMarchamosEscaneadosGlobal);
        console.log("Esperados del sistema (para backend):", marchamosEsperadosGlobal);
    });
});

/* ==============================
   VALIDACIÓN DINÁMICA - AJUSTADA
   ============================== */
function validarInformacion() {
    var codigoGeneracion = document.getElementById('codigoGeneracionInput').value;

    // Limpiar errores previos
    resetErrorFieldsMarchamos([]);

    const ingresados = getEnteredSeals();
    // Evita dobles envíos si ya se disparó automáticamente
    if (__sealAutoValidating && $("#spinner-overlay").is(":visible")) {
        return;
    }
    __sealAutoValidating = true;

    if (ingresados.length === 0) {
        Swal.fire({ icon: 'warning', title: 'Datos incompletos', text: 'Debe ingresar al menos un marchamo.', confirmButtonText: 'Aceptar' });
        __sealAutoValidating = false;
        return;
    }

    // Duplicados
    const dups = findDuplicados(ingresados);
    if (dups.length) {
        marcarInvalidos(dups);
        Swal.fire({ icon: 'error', title: 'Error en la validación', text: 'Los números de marchamo no pueden repetirse.', confirmButtonText: 'Aceptar' });
        __sealAutoValidating = false;
        return;
    }

    const expected = Number(document.getElementById('expectedSeals')?.value || expectedSeals || 0);
    if (expected > 0 && ingresados.length !== expected) {
        Swal.fire({ icon: 'error', title: 'Error en la validación', text: `Este envío requiere ${expected} marchamo(s); ingresaste ${ingresados.length}.`, confirmButtonText: 'Aceptar' });
        __sealAutoValidating = false;
        return;
    }

    $("#spinner-overlay").css('display', 'flex');

    // MODIFICACIÓN: Siempre usar el endpoint existente ValidarMarchamos
    // Para más de 4 marchamos, haremos múltiples llamadas o mostraremos un mensaje de limitación
    
    if (expected > 4) {
        // Mostrar advertencia pero proceder con el endpoint existente usando solo los primeros 4
        console.warn(`Este envío tiene ${expected} marchamos, pero el sistema actual solo puede validar 4 a la vez. Se validarán los primeros 4.`);
        
        // Usar solo los primeros 4 marchamos
        const primerosCuatro = ingresados.slice(0, 4);
        
        const payload = {
            codigoGeneracion: codigoGeneracion,
            marchamo1: primerosCuatro[0] || '',
            marchamo2: primerosCuatro[1] || '',
            marchamo3: primerosCuatro[2] || '',
            marchamo4: primerosCuatro[3] || ''
        };

        $.ajax({
            type: "POST",
            url: "/AutorizacionPorton/ValidarMarchamos",
            data: JSON.stringify(payload),
            contentType: "application/json; charset=utf-8",
            success: function (resultado) {
                if (typeof resultado === 'string' && resultado.includes("correctos")) {
                    // Si hay más de 4 marchamos, mostrar advertencia pero continuar
                    let mensaje = resultado;
                    if (expected > 4) {
                        mensaje += `\n\nNota: Se validaron los primeros 4 marchamos de ${expected} total. Los marchamos restantes deben ser verificados manualmente.`;
                    }
                        changeStatus(codigoGeneracion);
                } else {
                    var debeMarcarParaReporte = esErrorDeCoincidencia(resultado);
                    if (debeMarcarParaReporte) marcarMarchamosNoValidosParaReporte(resultado, primerosCuatro);
                    Swal.fire({ icon: 'error', title: 'Error en la validación', text: resultado, confirmButtonText: 'Aceptar' });
                }
            },
            error: function (xhr, status, errorThrown) {
                console.error("Error en la solicitud: ", xhr.responseText);
                var errorMessage = parseErrorMessage(xhr, 'Error al validar los marchamos');
                var debeMarcarParaReporte = esErrorDeCoincidencia(errorMessage);
                if (debeMarcarParaReporte) marcarMarchamosNoValidosParaReporte(errorMessage, primerosCuatro);
                Swal.fire({ icon: 'error', title: 'Error de validación', text: errorMessage, confirmButtonText: 'Aceptar' });
            },
            complete: function () {
                $("#spinner-overlay").hide();
                __sealAutoValidating = false;
            }
        });
        return;
    }

    // <= 4 marchamos → endpoint actual normal
    const payload = {
        codigoGeneracion: codigoGeneracion,
        marchamo1: ingresados[0] || '',
        marchamo2: ingresados[1] || '',
        marchamo3: ingresados[2] || '',
        marchamo4: ingresados[3] || ''
    };

    $.ajax({
        type: "POST",
        url: "/AutorizacionPorton/ValidarMarchamos",
        data: JSON.stringify(payload),
        contentType: "application/json; charset=utf-8",
        success: function (resultado) {
            if (typeof resultado === 'string' && resultado.includes("correctos")) {
                changeStatus(codigoGeneracion);
            } else {
                var debeMarcarParaReporte = esErrorDeCoincidencia(resultado);
                if (debeMarcarParaReporte) marcarMarchamosNoValidosParaReporte(resultado, ingresados);
                Swal.fire({ icon: 'error', title: 'Error en la validación', text: resultado, confirmButtonText: 'Aceptar' });
            }
        },
        error: function (xhr, status, errorThrown) {
            console.error("Error en la solicitud: ", xhr.responseText);
            var errorMessage = parseErrorMessage(xhr, 'Error al validar los marchamos');
            var debeMarcarParaReporte = esErrorDeCoincidencia(errorMessage);
            if (debeMarcarParaReporte) marcarMarchamosNoValidosParaReporte(errorMessage, ingresados);
            Swal.fire({ icon: 'error', title: 'Error de validación', text: errorMessage, confirmButtonText: 'Aceptar' });
        },
        complete: function () {
            $("#spinner-overlay").hide();
            __sealAutoValidating = false;
        }
    });
}

// Detecta errores de coincidencia para marcar/repotar
function esErrorDeCoincidencia(mensaje) {
    return mensaje.includes("no son válidos") ||
        mensaje.includes("no válidos") ||
        mensaje.includes("no existen") ||
        mensaje.includes("incorrectos");
}

// Marcar solo marchamos inválidos (dinámico)
function marcarMarchamosNoValidosParaReporte(mensaje, ingresados) {
    console.log("Marcando marchamos no válidos para reporte:", mensaje);
    const regex = /no [a-z\s]*válidos:\s*([^.]+)/i;
    const match = mensaje.match(regex);
    if (match) {
        const noValidos = match[1].split(',').map(m => m.trim()).filter(Boolean);
        marcarInvalidos(noValidos);
    } else {
        // Si no pudimos extraer, marcar todo lo ingresado
        marcarInvalidos(ingresados);
    }
}

// (Compatibilidad) Limpieza de error-field; ahora recorre dinámicos
function resetErrorFieldsMarchamos(camposConError) {
    const inputs = Array.from(document.querySelectorAll('#sealsContainer .seal-input'));
    if (inputs.length) {
        inputs.forEach(function (el) {
            if (!camposConError || !camposConError.length) el.classList.remove('error-field');
        });
        return;
    }
    // Fallback a 4 campos (si existieran)
    const campos = ['txt_marchamo1', 'txt_marchamo2', 'txt_marchamo3', 'txt_marchamo4'];
    campos.forEach(function (id) {
        var elemento = document.getElementById(id);
        if (elemento && (!camposConError || !camposConError.includes(id))) {
            elemento.classList.remove('error-field');
        }
    });
}

/* ==============================
   CAPTURAR / MOSTRAR ERRORES
   ============================== */
function capturarMarchamosConErrores() {
    var marchamosConErrores = [];
    console.log("=== INICIANDO CAPTURA DE MARCHAMOS CON ERRORES ===");

    const inputs = Array.from(document.querySelectorAll('#sealsContainer .seal-input'));
    if (inputs.length) {
        inputs.forEach((input, idx) => {
            if (input.classList.contains('error-field')) {
                const valor = (input.value || '').trim();
                if (valor) {
                    const n = idx + 1;
                    marchamosConErrores.push({
                        campo: `marchamo${n}`, // mantiene "marchamo1..n"
                        label: `Marchamo ${n}`,
                        valor: valor,
                        sealCode: valor
                    });
                    console.log(`Marchamo ${n} con error agregado: ${valor} posición: marchamo${n}`);
                }
            }
        });
    } else {
        // Fallback a 4 (si aún existieran)
        for (let i = 1; i <= 4; i++) {
            const marchamoInput = document.getElementById(`txt_marchamo${i}`);
            if (marchamoInput && marchamoInput.classList.contains('error-field')) {
                const valor = marchamoInput.value.trim();
                if (valor) {
                    marchamosConErrores.push({
                        campo: `marchamo${i}`,
                        label: `Marchamo ${i}`,
                        valor: valor,
                        sealCode: valor
                    });
                    console.log(`Marchamo ${i} con error agregado:`, valor, `posición: marchamo${i}`);
                }
            }
        }
    }

    console.log("Total marchamos con errores capturados:", marchamosConErrores.length);
    console.log("Marchamos con errores capturados:", marchamosConErrores);
    console.log("=== FIN CAPTURA DE MARCHAMOS CON ERRORES ===");
    return marchamosConErrores;
}

function mostrarMarchamosConErrores(marchamosConErrores, informacionEnvio) {
    var errorCard = document.getElementById('errorDetailsCardMarchamos');
    var reportedMarchamosList = document.getElementById('reportedMarchamosList');

    var modalTitle = `Reportar Inconsistencias - ${informacionEnvio.nombreMotorista} - ${informacionEnvio.nombreIngenio}`;
    document.querySelector('#modalReportarMarchamos .modal-title').textContent = modalTitle;

    errorCard.style.display = 'block';
    reportedMarchamosList.innerHTML = '';

    if (marchamosConErrores.length > 0) {
        marchamosConErrores.forEach(function (marchamo) {
            var div = document.createElement('div');
            div.className = 'inconsistency-item';
            div.innerHTML = `
                <i class="fas fa-exclamation-circle"></i> 
                <strong>${marchamo.label}:</strong> ${marchamo.valor}
            `;
            reportedMarchamosList.appendChild(div);
        });
    }
}

/* ==============================
   REPORTE - SOLUCIÓN CORRECTA (envía todos los datos)
   ============================== */
function guardarReporteMarchamos() {
    var comentario = document.getElementById('comentarioMarchamos').value.trim();
    var codigoGeneracion = document.getElementById('codigoGeneracionModalMarchamos').value;

    console.log("=== INICIANDO GUARDAR REPORTE MARCHAMOS ===");
    console.log("Comentario:", comentario);
    console.log("Código de generación:", codigoGeneracion);
    console.log("Marchamos con errores:", marchamosConErroresGlobal);
    console.log("Todos los escaneados:", todosLosMarchamosEscaneadosGlobal);
    console.log("Esperados del sistema:", marchamosEsperadosGlobal);

    if (!comentario) {
        Swal.fire({ icon: 'warning', title: 'Comentario requerido', text: 'Debe ingresar un comentario explicando la inconsistencia detectada.', confirmButtonText: 'Aceptar' });
        return;
    }

    if (marchamosConErroresGlobal.length === 0) {
        Swal.fire({ icon: 'warning', title: 'Sin datos inconsistentes', text: 'Debe tener al menos un marchamo marcado como inconsistente para enviar el reporte.', confirmButtonText: 'Aceptar' });
        return;
    }

    // SOLUCIÓN CORRECTA: Construir seals con comparación posición por posición
    // El backend puede comparar escaneados vs esperados para determinar la posición real del error
    var sealsData = [];

    // Comparar posición por posición: escaneado vs esperado
    const maxLen = Math.max(todosLosMarchamosEscaneadosGlobal.length, marchamosEsperadosGlobal.length);
    for (let i = 0; i < maxLen; i++) {
        const escaneado = todosLosMarchamosEscaneadosGlobal[i] || '';
        const esperado = marchamosEsperadosGlobal[i] || '';

        // Si son diferentes, este es un marchamo con inconsistencia
        if (escaneado !== esperado && escaneado !== '') {
            sealsData.push({
                position: `marchamo${i + 1}`,  // Posición REAL en el sistema (basada en el índice)
                sealCode: escaneado,            // Código escaneado (el nuevo/correcto)
                expectedCode: esperado          // Código esperado del sistema (el incorrecto)
            });
        }
    }

    console.log("Seals data construido:", sealsData);

    $.ajax({
        type: "POST",
        url: "/AutorizacionPorton/GuardarReporteMarchamos",
        data: JSON.stringify({
            codigoGeneracion: codigoGeneracion,
            comentario: comentario,
            marchamosInconsistentes: marchamosConErroresGlobal,
            tipoReporte: 'SEALS',
            seals: sealsData,
            // NUEVO: Enviar arrays completos para que el backend tenga toda la información
            allScannedSeals: todosLosMarchamosEscaneadosGlobal,
            expectedSeals: marchamosEsperadosGlobal
        }),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        beforeSend: function () {
            $("#spinner-overlay").css('display', 'flex');
            console.log("Enviando solicitud al servidor...");
        },
        success: function (response) {
            console.log("Respuesta del servidor:", response);
            if (response.success) {
                Swal.fire({
                    icon: 'success',
                    title: 'Reporte Enviado',
                    text: `La inconsistencia para ${informacionEnvioMarchamosGlobal.nombreIngenio} ha sido reportada exitosamente.`,
                    showConfirmButton: false,
                    timer: 2000
                }).then(() => {
                    cerrarModalReporte();
                    location.reload();
                });
            } else {
                Swal.fire({ icon: 'error', title: 'Error', text: response.message || 'Error al procesar el reporte.', confirmButtonText: 'Aceptar' });
            }
        },
        error: function (xhr, status, error) {
            console.error("Error en la solicitud:", xhr);
            console.error("Texto de respuesta:", xhr.responseText);

            let errorMessage = 'Error al procesar el reporte.';

            try {
                const response = JSON.parse(xhr.responseText);
                if (response.message) {
                    errorMessage = response.message;
                }

                // Si hay detalles adicionales del API
                if (response.details) {
                    try {
                        const details = JSON.parse(response.details);
                        if (details.message) {
                            errorMessage = details.message;
                        }
                    } catch (e) {
                        // Si details no es JSON, usarlo como string
                        errorMessage += '\n\nDetalles: ' + response.details;
                    }
                }
            } catch (e) {
                errorMessage = 'Error al conectar con el servidor: ' + error;
            }

            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: errorMessage,
                confirmButtonText: 'Aceptar'
            });
        },
        complete: function () {
            $("#spinner-overlay").hide();
            console.log("Solicitud completada");
        }
    });
}

/* ==============================
   CAMBIO DE ESTADO (igual)
   ============================== */
function changeStatus(codigoGeneracion) {
    const predefinedStatusId = 5;
    if (!codigoGeneracion || codigoGeneracion.trim() === '') {
        Swal.fire({ title: 'Error', text: 'Por favor, ingrese un Código de Generación', icon: 'error', confirmButtonColor: '#3085d6', confirmButtonText: 'Aceptar' });
        return;
    }

    $("#spinner-overlay").css("display", "flex");

    $.ajax({
        type: "POST",
        url: "/AutorizacionPorton/Autorizar",
        contentType: "application/json; charset=utf-8",
        data: JSON.stringify({
            codeGen: codigoGeneracion,
            predefinedStatusId: predefinedStatusId
        }),
        success: function (response) {
            console.log("Respuesta del backend:", response);
            if (response.successMessage) {
                Swal.fire({ icon: 'success', title: '¡Actualización exitosa!', text: 'El estado se actualizó correctamente.', showConfirmButton: false, timer: 1000 })
                    .then(() => { location.reload(); });
            } else {
                Swal.fire({ icon: 'error', title: 'Error', text: response.errorMessage || 'Hubo un problema al procesar la solicitud.', confirmButtonText: 'Aceptar' });
            }
        },
        error: function (xhr, status, error) {
            console.error("Error AJAX:", error);
            Swal.fire({ icon: 'error', title: 'Error de conexión', text: 'Hubo un problema al conectar con el servidor.', confirmButtonText: 'Aceptar' });
        },
        complete: function () {
            $("#spinner-overlay").hide();
        }
    });
}

function cerrarModalReporte() {
    $('#modalReportarMarchamos').modal('hide');
    setTimeout(function () {
        $('body').removeClass('modal-open');
        $('.modal-backdrop').remove();
        $('body').css('padding-right', '');
    }, 300);
}

/* ==============================
   LIMPIEZA MODAL REPORTE (igual)
   ============================== */
$('#modalReportarMarchamos').on('hidden.bs.modal', function () {
    document.getElementById('comentarioMarchamos').value = '';
    document.getElementById('errorDetailsCardMarchamos').style.display = 'none';
    document.getElementById('codigoGeneracionModalMarchamos').value = '';
    marchamosConErroresGlobal = [];
    todosLosMarchamosEscaneadosGlobal = []; // Limpiar marchamos escaneados
    marchamosEsperadosGlobal = []; // Limpiar marchamos esperados
    informacionEnvioMarchamosGlobal = { codigoGeneracion: '', nombreIngenio: '', nombreMotorista: '' };

    setTimeout(function () {
        $('body').removeClass('modal-open');
        $('.modal-backdrop').remove();
        $('body').css('padding-right', '');
    }, 100);

    console.log("Modal de reporte cerrado y limpiado");
});

/* ==============================
   BÚSQUEDA TARJETAS (igual)
   ============================== */
function filterCards() {
    const input = document.getElementById("searchInput");
    if (!input) return;
    const searchValue = input.value.toLowerCase().trim();
    if (searchValue) sessionStorage.setItem('searchValue', searchValue);
    else sessionStorage.removeItem('searchValue');

    const vehicleCards = document.querySelectorAll(".unit-card-wrapper, .card");
    console.log(`Filtrando ${vehicleCards.length} tarjetas con término: "${searchValue}"`);

    let visibleCount = 0;
    vehicleCards.forEach(function (card) {
        const cardText = card.innerText.toLowerCase();
        const isVisible = !searchValue || cardText.includes(searchValue);
        card.style.display = isVisible ? "" : "none";
        if (isVisible) visibleCount++;
    });

    console.log(`Tarjetas visibles: ${visibleCount} de ${vehicleCards.length}`);
}

/* ==============================
   UTILS
   ============================== */
function decodeHtml(html) {
    var txt = document.createElement("textarea");
    txt.innerHTML = html || '';
    return txt.value;
}

/* ==============================
   CSS dinámico para errores (igual)
   ============================== */
$(document).ready(function () {
    if (!document.getElementById('polling-styles')) {
        const style = document.createElement('style');
        style.id = 'polling-styles';
        style.textContent = `
            .inconsistency-item {
                padding: 8px 12px;
                margin: 4px 0;
                background-color: #f8f9fa;
                border-left: 3px solid #dc3545;
                border-radius: 4px;
            }
            .error-field {
                border-color: #dc3545 !important;
                box-shadow: 0 0 0 0.2rem rgba(220, 53, 69, 0.25) !important;
            }
        `;
        document.head.appendChild(style);
    }
});


