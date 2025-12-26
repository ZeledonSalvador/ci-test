/**
 * DETALLE DE TRANSACCIÓN - JAVASCRIPT
 * Manejo de secciones colapsables y acciones
 */

// ==========================================
// VARIABLES GLOBALES PARA TRACKING DE CAMBIOS
// ==========================================
let valoresOriginales = {};
let hayCambiosPendientes = false;

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Detalle Transacción JS cargado');

    // Esperar a que PERMISSION esté inicializado
    await PERMISSION.init();

    // Validar estado de la transacción (debe ser 11 para editar)
    validarEstadoTransaccion();

    // Validar si ya tiene marchamos/comprobante y deshabilitar edición
    validarMarchamosYComprobante();

    // IMPORTANTE: Bloquear comprobante SIEMPRE (nunca permitir edición manual)
    bloquearComprobanteParaSiempre();

    // Configurar permisos de edición según rol
    configurarPermisosEdicion();

    initializeCollapsibles();
    initializeEventListeners();

    // Guardar valores originales para detectar cambios
    guardarValoresOriginales();

    // Configurar listeners para detectar cambios
    configurarDeteccionCambios();

    // Configurar navegación automática entre marchamos
    configurarNavegacionMarchamos();

    // Configurar validación solo números en inputs de marchamos
    configurarValidacionSoloNumerosMarchamos();

    // Poner foco en el input de humedad al iniciar (si está habilitado)
    enfocarCampoHumedad();

    // Restaurar posición de scroll si viene de una recarga
    restaurarPosicionScroll();

    // Cargar datos de pesajes desde el ViewBag
    cargarDatosPesajes();
});

// ==========================================
// CARGAR DATOS DE PESAJES Y CONSOLIDADO
// ==========================================
function cargarDatosPesajes() {
    try {
        // Obtener datos del ViewBag inyectados en el HTML
        const pesajesDataElement = document.getElementById('pesajes-data');
        const consolidadoDataElement = document.getElementById('consolidado-data');

        if (!pesajesDataElement || !consolidadoDataElement) {
            console.warn('No se encontraron elementos de datos de pesajes');
            return;
        }

        const pesajes = JSON.parse(pesajesDataElement.textContent || '[]');
        const consolidado = JSON.parse(consolidadoDataElement.textContent || '{"detalle":[],"total":0}');

        console.log('Pesajes cargados:', pesajes);
        console.log('Consolidado cargado:', consolidado);

        // Renderizar historial de pesajes
        renderizarHistorialPesajes(pesajes);

        // Renderizar consolidado
        renderizarConsolidadoPesos(consolidado);

    } catch (error) {
        console.error('Error al cargar datos de pesajes:', error);
    }
}

function renderizarHistorialPesajes(pesajes) {
    const container = document.getElementById('pesajes-container');
    if (!container) return;

    if (!pesajes || pesajes.length === 0) {
        container.innerHTML = '<p class="text-muted text-center py-4">No hay pesajes registrados</p>';
        return;
    }

    // Obtener el tipo de producto para determinar límite de alerta
    const productoInput = document.getElementById('hdnProducto');
    const producto = productoInput ? productoInput.value : '';
    const esMelaza = producto.toUpperCase().includes('MELAZA');
    const limiteAlerta = esMelaza ? 225 : 100;

    console.log('Producto:', producto, 'Es melaza:', esMelaza, 'Límite alerta:', limiteAlerta);

    // Encontrar el último pesaje (número más alto)
    const ultimoPesaje = pesajes.reduce((max, pesaje) => pesaje.numero > max.numero ? pesaje : max, pesajes[0]);
    console.log('Último pesaje:', ultimoPesaje?.numero);

    let html = '';

    pesajes.forEach(pesaje => {
        const difBruto = (pesaje.bruto?.diferencia || 0);
        const difTara = (pesaje.tara?.diferencia || 0);
        const difNeto = (pesaje.neto?.diferencia || 0);

        // Validar si la diferencia de peso neto excede el límite (comparar valor absoluto)
        const difNetoAbs = Math.abs(difNeto);
        const excedeLimite = difNetoAbs >= limiteAlerta;

        console.log(`Pesaje #${pesaje.numero}: difNeto=${difNeto}, difNetoAbs=${difNetoAbs}, limiteAlerta=${limiteAlerta}, excedeLimite=${excedeLimite}`);

        html += `
            <div class="pesaje-item">
                <div class="table-responsive">
                    <table class="dt-table">
                        <thead>
                            <tr>
                                <th>#${pesaje.numero}</th>
                                <th>Concepto</th>
                                <th>Almapac</th>
                                <th>Cliente</th>
                                <th>Diferencia de peso</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td></td>
                                <td>Peso bruto</td>
                                <td>${formatNumber(pesaje.bruto?.pesoAlmapac || 0)}</td>
                                <td>${formatNumber(pesaje.bruto?.pesoCliente || 0)}</td>
                                <td class="${difBruto < 0 ? 'dt-text-danger' : ''}">${formatNumber(difBruto)}</td>
                            </tr>
                            <tr class="dt-row-bold">
                                <td></td>
                                <td>Peso neto</td>
                                <td>${formatNumber(pesaje.neto?.pesoAlmapac || 0)}</td>
                                <td>${formatNumber(pesaje.neto?.pesoCliente || 0)}</td>
                                <td class="${excedeLimite ? 'dt-text-danger' : ''}">${formatNumber(difNeto)}</td>
                            </tr>
                            <tr>
                                <td></td>
                                <td>Peso tara</td>
                                <td>${formatNumber(pesaje.tara?.pesoAlmapac || 0)}</td>
                                <td>${formatNumber(pesaje.tara?.pesoCliente || 0)}</td>
                                <td class="${difTara < 0 ? 'dt-text-danger' : ''}">${formatNumber(difTara)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    // Mostrar alerta solo si el último pesaje excede el límite
    if (ultimoPesaje) {
        const difNetoUltimo = Math.abs(ultimoPesaje.neto?.diferencia || 0);
        if (difNetoUltimo >= limiteAlerta) {
            mostrarAlertaDiferencias([{
                numero: ultimoPesaje.numero,
                diferencia: difNetoUltimo
            }]);
        }
    }
}

function renderizarConsolidadoPesos(consolidado) {
    const tbody = document.getElementById('consolidado-tbody');
    const totalElement = document.getElementById('consolidado-total');

    if (!tbody || !totalElement) return;

    if (!consolidado || !consolidado.detalle || consolidado.detalle.length === 0) {
        tbody.innerHTML = '<tr><td colspan="2" class="text-muted text-center">No hay datos de consolidado</td></tr>';
        totalElement.textContent = '0.00';
        return;
    }

    let html = '';
    consolidado.detalle.forEach(item => {
        html += `
            <tr>
                <td>${item.numero}</td>
                <td>${formatNumber(item.pesoNeto || 0)}</td>
            </tr>
        `;
    });

    tbody.innerHTML = html;
    totalElement.textContent = formatNumber(consolidado.total || 0);
}

function formatNumber(num) {
    return parseFloat(num || 0).toLocaleString('es-ES', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function mostrarAlertaDiferencias(alertas) {
    const listaPesajes = alertas.map(alerta => `Pesaje #${alerta.numero}: ${formatNumber(alerta.diferencia)} KGS`).join('<br>');

    // Usar alerta normal
    Swal.fire({
        icon: 'warning',
        title: 'Diferencia de peso excede límite',
        html: listaPesajes,
        confirmButtonText: 'Aceptar',
        confirmButtonColor: '#182A6E'
    });
}

// ==========================================
// VALIDACIÓN DE ESTADO DE TRANSACCIÓN
// ==========================================
function validarEstadoTransaccion() {
    const currentStatus = parseInt(document.getElementById('hdnCurrentStatus')?.value || '0');
    console.log('Estado actual de la transacción:', currentStatus);

    // Solo permitir edición si el estado es 11 (En Proceso)
    if (currentStatus !== 11) {
        console.log('Transacción no está en estado 11 - Deshabilitando edición');

        // Deshabilitar todos los campos editables
        const camposEditables = [
            '#txtHumedad',
            '#txtMarchamo1',
            '#txtMarchamo2',
            '#txtMarchamo3',
            '#txtMarchamo4'
        ];

        camposEditables.forEach(selector => {
            const campo = document.querySelector(selector);
            if (campo) {
                campo.setAttribute('disabled', 'disabled');
                campo.setAttribute('readonly', 'readonly');
                campo.style.opacity = '0.6';
                campo.style.cursor = 'not-allowed';
                campo.title = 'Solo se puede editar cuando el estado es "En Proceso"';
            }
        });

        // Deshabilitar botones de anular
        const botonesAnular = document.querySelectorAll('.dt-btn-anular');
        botonesAnular.forEach(btn => {
            btn.setAttribute('disabled', 'disabled');
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
            btn.style.pointerEvents = 'none';
            btn.title = 'Solo se puede anular cuando el estado es "En Proceso"';
        });

        // Deshabilitar botón Guardar
        const btnGuardar = document.getElementById('btnGuardar');
        if (btnGuardar) {
            btnGuardar.setAttribute('disabled', 'disabled');
            btnGuardar.style.opacity = '0.5';
            btnGuardar.style.cursor = 'not-allowed';
            btnGuardar.style.pointerEvents = 'none';
            btnGuardar.title = 'Solo se puede guardar cuando el estado es "En Proceso"';
        }

        // Deshabilitar botón Agregar Observación
        const btnAgregarObservacion = document.getElementById('btnAgregarObservacion');
        if (btnAgregarObservacion) {
            btnAgregarObservacion.setAttribute('disabled', 'disabled');
            btnAgregarObservacion.style.opacity = '0.5';
            btnAgregarObservacion.style.cursor = 'not-allowed';
            btnAgregarObservacion.style.pointerEvents = 'none';
            btnAgregarObservacion.title = 'Solo se puede agregar observación cuando el estado es "En Proceso"';
        }

        // Deshabilitar botón Imprimir
        const btnImprimir = document.getElementById('btnImprimir');
        if (btnImprimir) {
            btnImprimir.setAttribute('disabled', 'disabled');
            btnImprimir.style.opacity = '0.5';
            btnImprimir.style.cursor = 'not-allowed';
            btnImprimir.style.pointerEvents = 'none';
            btnImprimir.title = 'Solo se puede imprimir cuando el estado es "En Proceso"';
        }

        // Deshabilitar botón Completar
        const btnCompletar = document.getElementById('btnCompletar');
        if (btnCompletar) {
            btnCompletar.setAttribute('disabled', 'disabled');
            btnCompletar.style.opacity = '0.5';
            btnCompletar.style.cursor = 'not-allowed';
            btnCompletar.style.pointerEvents = 'none';
            btnCompletar.title = 'Solo se puede completar cuando el estado es "En Proceso"';
        }

        // Deshabilitar botón Agregar Pesaje
        const btnAgregarPesaje = document.getElementById('btnAgregarPesaje');
        if (btnAgregarPesaje) {
            btnAgregarPesaje.setAttribute('disabled', 'disabled');
            btnAgregarPesaje.style.opacity = '0.5';
            btnAgregarPesaje.style.cursor = 'not-allowed';
            btnAgregarPesaje.style.pointerEvents = 'none';
            btnAgregarPesaje.title = 'Solo se puede agregar pesaje cuando el estado es "En Proceso"';
        }
    } else {
        console.log('Transacción en estado 11 - Edición habilitada');
    }
}

// ==========================================
// VALIDACIÓN DE MARCHAMOS Y COMPROBANTE
// ==========================================
function validarMarchamosYComprobante() {
    const currentStatus = parseInt(document.getElementById('hdnCurrentStatus')?.value || '0');
    const tieneMarchamos = document.getElementById('hdnTieneMarchamos')?.value === 'true';
    const tieneComprobante = document.getElementById('hdnTieneComprobante')?.value === 'true';
    const comprobanteImpreso = document.getElementById('hdnComprobanteImpreso')?.value === 'true';

    console.log('Tiene marchamos asignados:', tieneMarchamos);
    console.log('Tiene comprobante asignado:', tieneComprobante);
    console.log('Comprobante impreso:', comprobanteImpreso);

    // IMPORTANTE: Si el status no es 11, no hacer nada (ya se deshabilitó todo en validarEstadoTransaccion)
    if (currentStatus !== 11) {
        console.log('Status no es 11 - Saltando validación de marchamos/comprobante (ya deshabilitado)');
        return;
    }

    // Verificar si el comprobante actual existe (puede haber sido anulado)
    const comprobanteActual = document.getElementById('txtComprobante')?.value?.trim() || '';
    const hayComprobanteActivo = comprobanteActual !== '';

    // NUEVA LÓGICA: Solo bloquear si el comprobante fue impreso Y todavía existe (no fue anulado)
    // Si el comprobante fue anulado (campo vacío), permitir edición aunque antes haya sido impreso
    if (comprobanteImpreso && hayComprobanteActivo) {
        // COMPROBANTE YA IMPRESO Y ACTIVO: Bloquear marchamos con valor, permitir editar vacíos
        console.log('Comprobante impreso y activo - Permitiendo agregar nuevos marchamos');

        // Deshabilitar solo humedad (ya que afecta el comprobante impreso)
        const campoHumedad = document.querySelector('#txtHumedad');
        if (campoHumedad) {
            campoHumedad.setAttribute('readonly', 'readonly');
            campoHumedad.setAttribute('disabled', 'disabled');
            campoHumedad.style.backgroundColor = '#e9ecef';
            campoHumedad.style.cursor = 'not-allowed';
            campoHumedad.style.opacity = '0.6';
            campoHumedad.title = 'No se puede editar - el comprobante ya fue impreso';
        }

        // Para marchamos: solo bloquear los que tienen valor, permitir editar los vacíos
        const camposMarchamos = [
            '#txtMarchamo1',
            '#txtMarchamo2',
            '#txtMarchamo3',
            '#txtMarchamo4'
        ];

        camposMarchamos.forEach(selector => {
            const campo = document.querySelector(selector);
            if (campo) {
                if (campo.value) {
                    // Marchamo con valor: hacer readonly (no editable pero puede ser anulado)
                    campo.setAttribute('readonly', 'readonly');
                    campo.style.backgroundColor = '#e9ecef';
                    campo.style.cursor = 'not-allowed';
                    campo.style.opacity = '0.6';
                    campo.title = 'Marchamo guardado - use Anular para quitarlo';
                } else {
                    // Marchamo vacío: permitir edición para agregar nuevo
                    campo.removeAttribute('readonly');
                    campo.removeAttribute('disabled');
                    campo.style.backgroundColor = '';
                    campo.style.cursor = '';
                    campo.style.opacity = '';
                    campo.title = 'Puede agregar un nuevo marchamo';
                }
            }
        });

        // MOSTRAR botones de anular para marchamos con valor (siempre permitir anular)
        const botonesAnular = document.querySelectorAll('.dt-btn-anular');
        botonesAnular.forEach(btn => {
            const input = btn.previousElementSibling || btn.parentElement.querySelector('input');
            if (input && input.id.includes('Marchamo') && input.value) {
                btn.removeAttribute('disabled');
                btn.style.display = 'inline-block';
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
                btn.style.pointerEvents = 'auto';
                btn.title = 'Anular este marchamo';
            } else if (input && input.id.includes('Marchamo') && !input.value) {
                btn.style.display = 'none';
            }
            // SIEMPRE mostrar botón anular para comprobante si tiene valor
            if (input && input.id === 'txtComprobante' && input.value) {
                btn.removeAttribute('disabled');
                btn.style.display = 'inline-block';
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
                btn.style.pointerEvents = 'auto';
                btn.title = 'Anular este comprobante';
            }
        });

        // HABILITAR botón Guardar (para permitir guardar nuevos marchamos)
        const btnGuardar = document.getElementById('btnGuardar');
        if (btnGuardar) {
            btnGuardar.removeAttribute('disabled');
            btnGuardar.style.opacity = '1';
            btnGuardar.style.cursor = 'pointer';
            btnGuardar.style.pointerEvents = 'auto';
            btnGuardar.title = 'Guardar cambios en marchamos';
            console.log('Botón Guardar HABILITADO (permitir agregar nuevos marchamos)');
        }

        // HABILITAR botón Imprimir (permitir reimprimir después de cambios en marchamos)
        const btnImprimir = document.getElementById('btnImprimir');
        if (btnImprimir) {
            btnImprimir.removeAttribute('disabled');
            btnImprimir.style.opacity = '1';
            btnImprimir.style.cursor = 'pointer';
            btnImprimir.style.pointerEvents = 'auto';
            btnImprimir.title = 'Reimprimir comprobante';
            console.log('Botón Imprimir HABILITADO (permitir reimprimir)');
        }

        // HABILITAR botón Completar (ya que el comprobante fue impreso)
        const btnCompletar = document.getElementById('btnCompletar');
        if (btnCompletar) {
            btnCompletar.removeAttribute('disabled');
            btnCompletar.style.opacity = '1';
            btnCompletar.style.cursor = 'pointer';
            btnCompletar.style.pointerEvents = 'auto';
            btnCompletar.title = 'Completar transacción';
        }
    } else {
        // COMPROBANTE NO IMPRESO: Permitir edición según si tiene marchamos/comprobante asignados
        console.log('Comprobante no impreso - Habilitando edición y opciones de anular según corresponda');

        // LÓGICA PARA HUMEDAD: Siempre editable mientras el comprobante no esté impreso
        const campoHumedad = document.querySelector('#txtHumedad');
        if (campoHumedad) {
            campoHumedad.removeAttribute('readonly');
            campoHumedad.removeAttribute('disabled');
            campoHumedad.style.backgroundColor = '';
            campoHumedad.style.cursor = '';
            campoHumedad.style.opacity = '';
            campoHumedad.title = '';
            console.log('Humedad habilitada para edición (comprobante no impreso)');
        }

        // LÓGICA PARA MARCHAMOS
        if (tieneMarchamos) {
            // Tiene marchamos: mostrar como readonly y habilitar botones de anular
            const camposMarchamos = [
                '#txtMarchamo1',
                '#txtMarchamo2',
                '#txtMarchamo3',
                '#txtMarchamo4'
            ];

            camposMarchamos.forEach(selector => {
                const campo = document.querySelector(selector);
                if (campo && campo.value) {
                    campo.setAttribute('readonly', 'readonly');
                    campo.style.backgroundColor = '#e9ecef';
                    campo.style.cursor = 'default';
                    campo.title = 'Use el botón Anular para modificar';
                }
            });

            // Mostrar botones de anular para marchamos con valor
            const botonesAnular = document.querySelectorAll('.dt-btn-anular');
            botonesAnular.forEach(btn => {
                const input = btn.previousElementSibling || btn.parentElement.querySelector('input');
                if (input && input.id.includes('Marchamo') && input.value) {
                    btn.removeAttribute('disabled');
                    btn.style.display = 'inline-block';
                    btn.style.opacity = '1';
                    btn.style.cursor = 'pointer';
                    btn.style.pointerEvents = 'auto';
                    btn.title = 'Anular este marchamo';
                } else if (input && input.id.includes('Marchamo') && !input.value) {
                    btn.style.display = 'none';
                }
            });
        } else {
            // No tiene marchamos: permitir edición
            const camposMarchamos = [
                '#txtMarchamo1',
                '#txtMarchamo2',
                '#txtMarchamo3',
                '#txtMarchamo4'
            ];

            camposMarchamos.forEach(selector => {
                const campo = document.querySelector(selector);
                if (campo) {
                    campo.removeAttribute('readonly');
                    campo.removeAttribute('disabled');
                    campo.style.backgroundColor = '';
                    campo.style.cursor = '';
                    campo.style.opacity = '';
                    campo.title = '';
                }
            });

            // Ocultar botones de anular marchamos
            const botonesAnular = document.querySelectorAll('.dt-btn-anular');
            botonesAnular.forEach(btn => {
                const input = btn.previousElementSibling || btn.parentElement.querySelector('input');
                if (input && input.id.includes('Marchamo')) {
                    btn.style.display = 'none';
                }
            });
        }

        // LÓGICA PARA COMPROBANTE
        const campoComprobante = document.querySelector('#txtComprobante');
        if (campoComprobante) {
            // SIEMPRE readonly - el comprobante nunca se edita manualmente
            campoComprobante.setAttribute('readonly', 'readonly');
            campoComprobante.setAttribute('disabled', 'disabled');
            campoComprobante.style.backgroundColor = '#f8f9fa';
            campoComprobante.style.cursor = 'not-allowed';
            campoComprobante.title = 'El comprobante es generado automáticamente';
        }

        // SIEMPRE mostrar botón anular para comprobante si tiene valor (sin importar si fue asignado o dañado)
        const campoComprobante2 = document.getElementById('txtComprobante');
        const botonesAnularComprobante = document.querySelectorAll('.dt-btn-anular');
        botonesAnularComprobante.forEach(btn => {
            const input = btn.previousElementSibling || btn.parentElement.querySelector('input');
            if (input && input.id === 'txtComprobante') {
                if (campoComprobante2 && campoComprobante2.value && campoComprobante2.value.trim() !== '') {
                    // Tiene comprobante: SIEMPRE habilitar botón de anular
                    btn.removeAttribute('disabled');
                    btn.style.display = 'inline-block';
                    btn.style.opacity = '1';
                    btn.style.cursor = 'pointer';
                    btn.style.pointerEvents = 'auto';
                    btn.title = 'Anular este comprobante';
                } else {
                    // No tiene comprobante: ocultar botón de anular
                    btn.style.display = 'none';
                }
            }
        });

        // Habilitar botón Guardar (siempre habilitado cuando comprobante no está impreso O fue anulado)
        const btnGuardar = document.getElementById('btnGuardar');
        if (btnGuardar) {
            btnGuardar.removeAttribute('disabled');
            btnGuardar.style.opacity = '1';
            btnGuardar.style.cursor = 'pointer';
            btnGuardar.style.pointerEvents = 'auto';
            btnGuardar.title = 'Guardar datos';
            console.log('Botón Guardar HABILITADO (comprobante no impreso o anulado)');
        }

        // CONTROLAR ESTADO DE BOTONES IMPRIMIR Y COMPLETAR (solo si status es 11)
        const btnImprimir = document.getElementById('btnImprimir');
        const btnCompletar = document.getElementById('btnCompletar');

        // BOTÓN IMPRIMIR: habilitado si tiene comprobante asignado Y no ha sido impreso
        if (tieneComprobante && !comprobanteImpreso) {
            if (btnImprimir) {
                btnImprimir.removeAttribute('disabled');
                btnImprimir.style.opacity = '1';
                btnImprimir.style.cursor = 'pointer';
                btnImprimir.style.pointerEvents = 'auto';
                btnImprimir.title = 'Imprimir comprobante';
            }
        } else {
            if (btnImprimir) {
                btnImprimir.setAttribute('disabled', 'disabled');
                btnImprimir.style.opacity = '0.6';
                btnImprimir.style.cursor = 'not-allowed';
                btnImprimir.style.pointerEvents = 'none';
                btnImprimir.title = comprobanteImpreso ? 'El comprobante ya fue impreso' : 'Debe guardar los datos antes de imprimir';
            }
        }

        // BOTÓN COMPLETAR: habilitado SOLO si el comprobante fue impreso
        if (comprobanteImpreso) {
            if (btnCompletar) {
                btnCompletar.removeAttribute('disabled');
                btnCompletar.style.opacity = '1';
                btnCompletar.style.cursor = 'pointer';
                btnCompletar.style.pointerEvents = 'auto';
                btnCompletar.title = 'Completar transacción';
            }
        } else {
            if (btnCompletar) {
                btnCompletar.setAttribute('disabled', 'disabled');
                btnCompletar.style.opacity = '0.6';
                btnCompletar.style.cursor = 'not-allowed';
                btnCompletar.style.pointerEvents = 'none';
                btnCompletar.title = 'Debe imprimir el comprobante antes de completar';
            }
        }
    }
}

// ==========================================
// BLOQUEO PERMANENTE DEL COMPROBANTE
// ==========================================
function bloquearComprobanteParaSiempre() {
    const campoComprobante = document.querySelector('#txtComprobante');

    if (campoComprobante) {
        // FORZAR readonly y disabled
        campoComprobante.setAttribute('readonly', 'readonly');
        campoComprobante.setAttribute('disabled', 'disabled');
        campoComprobante.style.backgroundColor = '#e9ecef';
        campoComprobante.style.cursor = 'not-allowed';
        campoComprobante.style.pointerEvents = 'none';
        campoComprobante.title = 'El comprobante es generado automáticamente y no puede editarse';

        // Prevenir cualquier intento de edición con eventos
        campoComprobante.addEventListener('keydown', function(e) {
            e.preventDefault();
            return false;
        });

        campoComprobante.addEventListener('keypress', function(e) {
            e.preventDefault();
            return false;
        });

        campoComprobante.addEventListener('paste', function(e) {
            e.preventDefault();
            return false;
        });

        campoComprobante.addEventListener('input', function(e) {
            e.preventDefault();
            return false;
        });

        campoComprobante.addEventListener('change', function(e) {
            e.preventDefault();
            return false;
        });

        console.log('Campo de comprobante bloqueado permanentemente');
    }
}

// ==========================================
// CONFIGURACIÓN DE PERMISOS
// ==========================================
function configurarPermisosEdicion() {
    const userRole = PERMISSION.getRoleCode();
    console.log('Configurando permisos para rol:', userRole);

    // Solo ADMINISTRADOR o PESADOR pueden editar marchamos y humedad
    const puedeEditar = PERMISSION.hasAnyRole('ADMINISTRADOR', 'PESADOR');

    if (!puedeEditar) {
        // Deshabilitar campos de edición
        const camposRestringidos = [
            '#txtHumedad',
            '#txtMarchamo1',
            '#txtMarchamo2',
            '#txtMarchamo3',
            '#txtMarchamo4'
        ];

        camposRestringidos.forEach(selector => {
            const campo = document.querySelector(selector);
            if (campo) {
                campo.setAttribute('disabled', 'disabled');
                campo.style.opacity = '0.6';
                campo.style.cursor = 'not-allowed';
                campo.title = 'No tiene permisos para editar este campo';
            }
        });

        // Deshabilitar botones de anular marchamos
        const botonesAnular = document.querySelectorAll('.dt-btn-anular');
        botonesAnular.forEach(btn => {
            btn.setAttribute('disabled', 'disabled');
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
            btn.title = 'No tiene permisos para esta acción';
        });

        // Deshabilitar botón guardar
        const btnGuardar = document.getElementById('btnGuardar');
        if (btnGuardar) {
            btnGuardar.setAttribute('disabled', 'disabled');
            btnGuardar.style.opacity = '0.5';
            btnGuardar.style.cursor = 'not-allowed';
            btnGuardar.title = 'No tiene permisos para guardar cambios';
        }

        console.log('Campos de edición deshabilitados para rol:', userRole);
    } else {
        console.log('Usuario con permisos de edición:', userRole);
    }
}

// ==========================================
// SECCIONES COLAPSABLES
// ==========================================
function initializeCollapsibles() {
    // Manejar el toggle de las secciones
    const sectionHeaders = document.querySelectorAll('.dt-section-header');

    sectionHeaders.forEach(header => {
        const targetId = header.getAttribute('data-target');
        const target = document.querySelector(targetId);

        if (target) {
            // Inicializar el header con la clase correcta según el estado del collapse
            if ($(target).hasClass('show')) {
                header.classList.remove('collapsed');
            } else {
                header.classList.add('collapsed');
            }

            // Eventos de Bootstrap collapse para manejar el icono
            $(target).on('show.bs.collapse', function() {
                header.classList.remove('collapsed');
            });

            $(target).on('hide.bs.collapse', function() {
                header.classList.add('collapsed');
            });
        }
    });
}

// ==========================================
// EVENT LISTENERS
// ==========================================
function initializeEventListeners() {
    // Botón Guardar
    const btnGuardar = document.getElementById('btnGuardar');
    if (btnGuardar) {
        btnGuardar.addEventListener('click', guardarTransaccion);

        // Permitir navegar hacia atrás con Shift+Tab desde el botón Guardar
        btnGuardar.addEventListener('keydown', function(e) {
            if (e.key === 'Tab' && e.shiftKey) {
                e.preventDefault();
                // Buscar el último campo habilitado
                const camposOrden = ['txtMarchamo4', 'txtMarchamo3', 'txtMarchamo2', 'txtMarchamo1', 'txtHumedad'];
                for (const id of camposOrden) {
                    const campo = document.getElementById(id);
                    if (campo && !campo.disabled && !campo.readOnly) {
                        campo.focus();
                        campo.select();
                        break;
                    }
                }
            } else if (e.key === 'Enter') {
                // Permitir activar el botón con Enter
                e.preventDefault();
                guardarTransaccion();
            }
        });
    }

    // Botón Imprimir
    const btnImprimir = document.getElementById('btnImprimir');
    if (btnImprimir) {
        btnImprimir.addEventListener('click', function() {
            const codeGen = document.getElementById('hdnCodeGen')?.value;
            if (codeGen) {
                imprimirComprobanteSinModal(codeGen);
            }
        });
    }

    // Botón Cerrar (antes Cancelar)
    const btnCerrar = document.getElementById('btnCerrar');
    if (btnCerrar) {
        btnCerrar.addEventListener('click', cancelarTransaccion);
    }

    // Botón Agregar Pesaje
    const btnAgregarPesaje = document.getElementById('btnAgregarPesaje');
    if (btnAgregarPesaje) {
        btnAgregarPesaje.addEventListener('click', nuevoPesaje);
    }

    // Botón Completar
    const btnCompletar = document.getElementById('btnCompletar');
    if (btnCompletar) {
        btnCompletar.addEventListener('click', function() {
            const codeGen = document.getElementById('hdnCodeGen')?.value;
            if (codeGen) {
                completarTransaccion(codeGen);
            }
        });
    }

    // Botón Agregar Observación
    const btnAgregarObservacion = document.getElementById('btnAgregarObservacion');
    if (btnAgregarObservacion) {
        btnAgregarObservacion.addEventListener('click', function(e) {
            e.stopPropagation();
            $('#modalObservacion').modal('show');
        });
    }

    // Confirmar Observación
    const btnConfirmarObservacion = document.getElementById('btnConfirmarObservacion');
    if (btnConfirmarObservacion) {
        btnConfirmarObservacion.addEventListener('click', agregarObservacion);
    }

    // Botones Anular
    const botonesAnular = document.querySelectorAll('.dt-btn-anular');
    botonesAnular.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const input = this.previousElementSibling || this.parentElement.querySelector('input');
            if (input) {
                const inputId = input.id;
                if (inputId.includes('Marchamo')) {
                    abrirModalAnularMarchamo(inputId);
                } else if (inputId === 'txtComprobante') {
                    abrirModalAnularComprobante();
                }
            }
        });
    });

    // Confirmar Anular Marchamo
    const btnConfirmarAnularMarchamo = document.getElementById('btnConfirmarAnularMarchamo');
    if (btnConfirmarAnularMarchamo) {
        btnConfirmarAnularMarchamo.addEventListener('click', confirmarAnularMarchamo);
    }

    // Confirmar Anular Comprobante
    const btnConfirmarAnularComprobante = document.getElementById('btnConfirmarAnularComprobante');
    if (btnConfirmarAnularComprobante) {
        btnConfirmarAnularComprobante.addEventListener('click', confirmarAnularComprobante);
    }
}

// ==========================================
// ACCIONES PRINCIPALES
// ==========================================
function guardarTransaccion() {
    // Validar humedad obligatoria para producto azúcar
    if (!validarHumedadObligatoria()) {
        Swal.fire({
            icon: 'info',
            title: 'Humedad requerida',
            text: 'La humedad es obligatoria para este producto. Por favor ingrese un valor válido.',
            confirmButtonColor: '#182A6E',
            confirmButtonText: 'Aceptar'
        });
        // Enfocar el campo de humedad
        const campoHumedad = document.getElementById('txtHumedad');
        if (campoHumedad) {
            campoHumedad.focus();
            campoHumedad.select();
        }
        return;
    }

    const datos = recopilarDatos();

    // Guardar directamente sin confirmación adicional (reducir alertas)
    guardarTransaccionAPI(datos);
}

function guardarTransaccionAPI(datos) {
    console.log('Guardando transacción:', datos);

    // Mostrar loading normal
    Swal.fire({
        title: 'Guardando',
        text: 'Por favor espere...',
        icon: 'info',
        allowOutsideClick: false,
        showConfirmButton: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    // Llamar al servidor para guardar
    fetch('/DetalleTransaccion/Guardar', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(datos)
    })
    .then(response => response.json())
    .then(data => {
        Swal.close();

        if (data.success) {
            // Actualizar valores originales después de guardar exitosamente
            guardarValoresOriginales();

            // Mostrar éxito breve y recargar
            Swal.fire({
                icon: 'success',
                title: 'Guardado',
                text: 'Los datos se guardaron correctamente.',
                confirmButtonColor: '#182A6E',
                confirmButtonText: 'Aceptar',
                timer: 1500,
                showConfirmButton: false
            }).then(() => {
                // Hacer refresh de la página para mostrar los datos actualizados
                recargarDetalleTransaccion(datos.codeGen);
            });
        } else {
            // Mostrar mensaje informativo con respuesta del servidor
            Swal.fire({
                icon: 'info',
                title: 'Información',
                text: data.message || 'No se pudo guardar la transacción',
                confirmButtonColor: '#182A6E',
                confirmButtonText: 'Aceptar'
            });
        }
    })
    .catch(error => {
        Swal.close();
        console.error('Error:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Error de conexión con el servidor',
            confirmButtonColor: '#182A6E',
            confirmButtonText: 'Aceptar'
        });
    });
}

function mostrarModalImpresion(codeGen) {
    Swal.fire({
        title: '¿Desea imprimir el comprobante?',
        text: 'Debe seleccionar una opción para continuar',
        icon: 'question',
        showCancelButton: true,
        showDenyButton: false,
        allowOutsideClick: false,
        allowEscapeKey: false,
        allowEnterKey: false,
        confirmButtonColor: '#182A6E',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Sí, imprimir',
        cancelButtonText: 'No, gracias'
    }).then((result) => {
        if (result.isConfirmed) {
            // Usuario seleccionó imprimir
            imprimirComprobante(codeGen);
        } else if (result.dismiss === Swal.DismissReason.cancel) {
            // Usuario seleccionó NO imprimir
            mostrarResultadoFinal(true, codeGen);
        } else {
            // Si por alguna razón se cierra sin seleccionar, volver a mostrar
            mostrarModalImpresion(codeGen);
        }
    });
}

function imprimirComprobante(codeGen) {
    // Mostrar mensaje de generación
    Swal.fire({
        title: 'Generando comprobante',
        text: 'Por favor espere...',
        icon: 'info',
        allowOutsideClick: false,
        showConfirmButton: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    // Simular generación de PDF (2 segundos)
    setTimeout(() => {
        Swal.close();

        // Generar el diseño del comprobante
        generarComprobanteHTML(codeGen);

        // Después de generar, mostrar resultado final
        setTimeout(() => {
            mostrarResultadoFinal(false, codeGen);
        }, 500);
    }, 2000);
}

// Función para imprimir comprobante directamente sin modal de confirmación
function imprimirComprobanteSinModal(codeGen) {
    // Mostrar mensaje de generación
    Swal.fire({
        title: 'Generando comprobante',
        text: 'Por favor espere...',
        icon: 'info',
        allowOutsideClick: false,
        showConfirmButton: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    // Simular generación de PDF (2 segundos)
    setTimeout(() => {
        Swal.close();

        // Generar el diseño del comprobante
        // El registro de impresión se hará solo cuando el usuario imprima realmente
        generarComprobanteHTML(codeGen);

        // Mostrar mensaje de éxito simple
        Swal.fire({
            icon: 'success',
            title: 'Comprobante generado',
            text: 'El comprobante se ha generado correctamente.',
            confirmButtonColor: '#182A6E',
            confirmButtonText: 'Aceptar',
            timer: 2000
        });
    }, 2000);
}

// Función para registrar la impresión del comprobante en el API
function registrarImpresionComprobante(codeGen) {
    fetch('/DetalleTransaccion/RegistrarImpresion', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            codeGen: codeGen,
            fechaImpresion: new Date().toISOString()
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            console.log('Impresión registrada correctamente en el API');

            // Mostrar notificación de éxito
            Swal.fire({
                icon: 'success',
                title: 'Comprobante impreso',
                text: 'El comprobante ha sido impreso y registrado correctamente.',
                confirmButtonColor: '#182A6E',
                confirmButtonText: 'Aceptar',
                timer: 2000,
                showConfirmButton: false
            });

            // Recargar la página para mostrar el estado actualizado del comprobante
            setTimeout(() => {
                guardarPosicionScroll();
                location.reload();
            }, 2000);
        } else {
            console.error('Error al registrar impresión:', data.message);

            // Mostrar notificación de error
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'No se pudo registrar la impresión.',
                confirmButtonColor: '#182A6E',
                confirmButtonText: 'Aceptar',
                timer: 2000,
                showConfirmButton: false
            });
        }
    })
    .catch(error => {
        console.error('Error al registrar impresión:', error);

        // Mostrar notificación de error de conexión
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Error de conexión al registrar impresión.',
            confirmButtonColor: '#182A6E',
            confirmButtonText: 'Aceptar',
            timer: 2000,
            showConfirmButton: false
        });
    });
}

// Función para registrar impresión automáticamente sin preguntar (llamada desde ventana de impresión)
function registrarImpresionAutomatica(codeGen) {
    // Pequeño delay para asegurar que la ventana de impresión se cerró
    setTimeout(function() {
        // Registrar automáticamente sin mostrar mensaje al usuario
        fetch('/DetalleTransaccion/RegistrarImpresion', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                codeGen: codeGen,
                fechaImpresion: new Date().toISOString()
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                console.log('Impresión registrada correctamente en el API');

                // Mostrar notificación de éxito simple
                Swal.fire({
                    icon: 'success',
                    title: 'Comprobante impreso',
                    text: 'El comprobante ha sido impreso correctamente.',
                    confirmButtonColor: '#182A6E',
                    confirmButtonText: 'Aceptar',
                    timer: 2000,
                    showConfirmButton: false
                }).then(() => {
                    // Recargar la página para mostrar el estado actualizado
                    guardarPosicionScroll();
                    location.reload();
                });
            } else {
                console.error('Error al registrar impresión:', data.message);

                // Mostrar notificación de error
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'No se pudo registrar la impresión: ' + (data.message || 'Error desconocido'),
                    confirmButtonColor: '#182A6E',
                    confirmButtonText: 'Aceptar'
                });
            }
        })
        .catch(error => {
            Swal.close();
            console.error('Error al registrar impresión:', error);

            // Mostrar notificación de error de conexión
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Error de conexión al registrar impresión.',
                confirmButtonColor: '#182A6E',
                confirmButtonText: 'Aceptar'
            });
        });
    }, 300);
}

// Función legacy para compatibilidad (ya no se usa para preguntar)
function mostrarConfirmacionImpresion(codeGen) {
    // Redirigir a la nueva función automática
    registrarImpresionAutomatica(codeGen);
}

// Función helper para formatear fechas de ISO 8601 a DD/MM/YYYY HH:MM:SS
function formatearFechaImpresion(fechaISO) {
    if (!fechaISO || fechaISO === '-' || fechaISO === '') return '-';

    try {
        // Formato esperado: "2025-11-20T16:22:15.68" o "2025-11-20T16:22:15"
        const fecha = new Date(fechaISO);

        // Validar que la fecha sea válida
        if (isNaN(fecha.getTime())) {
            console.warn('Fecha inválida:', fechaISO);
            return '-';
        }

        const dia = String(fecha.getDate()).padStart(2, '0');
        const mes = String(fecha.getMonth() + 1).padStart(2, '0');
        const anio = fecha.getFullYear();

        const horas = String(fecha.getHours()).padStart(2, '0');
        const minutos = String(fecha.getMinutes()).padStart(2, '0');
        const segundos = String(fecha.getSeconds()).padStart(2, '0');

        return `${dia}/${mes}/${anio} ${horas}:${minutos}:${segundos}`;
    } catch (e) {
        console.error('Error al formatear fecha:', fechaISO, e);
        return '-';
    }
}

function generarComprobanteHTML(codeGen) {
    // Obtener datos de la transacción desde los elementos en la vista
    const allDtValues = document.querySelectorAll('.dt-value');

    // Obtener y formatear fechas ANTES de crear el HTML
    const fechaEntraRaw = document.getElementById('hdnFechaEntra')?.value || '-';
    const fechaEntraFormateada = formatearFechaImpresion(fechaEntraRaw);

    // FECHA DE SALIDA: Usar la fecha/hora actual del momento de generación del comprobante
    const fechaActual = new Date();
    const dia = String(fechaActual.getDate()).padStart(2, '0');
    const mes = String(fechaActual.getMonth() + 1).padStart(2, '0');
    const anio = fechaActual.getFullYear();
    const horas = String(fechaActual.getHours()).padStart(2, '0');
    const minutos = String(fechaActual.getMinutes()).padStart(2, '0');
    const segundos = String(fechaActual.getSeconds()).padStart(2, '0');
    const fechaSaleFormateada = `${dia}/${mes}/${anio} ${horas}:${minutos}:${segundos}`;

    // Función para formatear pesos: quitar .00 y mantener valor original
    function formatearPeso(pesoStr) {
        if (!pesoStr || pesoStr === '-' || pesoStr === '' || pesoStr === 'undefined') return '0';

        // Limpiar el string: quitar espacios, comas, y texto extra
        let pesoLimpio = pesoStr.toString().trim();

        // Si contiene "Kgs" u otro texto, extraer solo el número
        pesoLimpio = pesoLimpio.replace(/[^\d.-]/g, '');

        const peso = parseFloat(pesoLimpio);
        if (isNaN(peso) || peso === 0) return '0';

        // Si tiene decimales, mantenerlos; si no, quitar el .00
        return peso % 1 === 0 ? Math.round(peso).toString() : peso.toFixed(2);
    }

    const datos = {
        // Información General
        transaccion: allDtValues[0]?.textContent?.trim() || '-',
        cliente: allDtValues[1]?.textContent?.trim() || '-',
        producto: allDtValues[2]?.textContent?.trim() || '-',
        codigoGeneracion: allDtValues[3]?.textContent?.trim() || codeGen,
        transportista: allDtValues[4]?.textContent?.trim() || '-',
        camion: allDtValues[5]?.textContent?.trim() || '-',
        remolque: allDtValues[6]?.textContent?.trim() || '-',
        motorista: allDtValues[7]?.textContent?.trim() || '-',
        licencia: allDtValues[8]?.textContent?.trim() || '-',

        // Control de Pesaje - Almapac (de la tabla) - sin decimales .00
        pesoBrutoAlmapac: formatearPeso(document.querySelector('.dt-table tbody tr:nth-child(1) td:nth-child(2)')?.textContent?.trim()),
        pesoNetoAlmapac: formatearPeso(document.querySelector('.dt-table tbody tr:nth-child(2) td:nth-child(2)')?.textContent?.trim()),
        pesoTaraAlmapac: formatearPeso(document.querySelector('.dt-table tbody tr:nth-child(3) td:nth-child(2)')?.textContent?.trim()),

        // Control de Despacho - Humedad convertida a porcentaje (0.10 → 10%)
        humedad: (() => {
            const val = parseFloat(document.getElementById('txtHumedad')?.value || '0');
            return val > 0 ? (val * 100).toFixed(0) + '%' : '0%';
        })(),
        comprobante: document.getElementById('txtComprobante')?.value || '-',

        // Marchamos (separados por /)
        marchamos: [
            document.getElementById('txtMarchamo1')?.value,
            document.getElementById('txtMarchamo2')?.value,
            document.getElementById('txtMarchamo3')?.value,
            document.getElementById('txtMarchamo4')?.value
        ].filter(m => m && m.trim() !== '').join('/') || '-',

        // Fechas para impresión
        fechaEntra: fechaEntraFormateada,
        pesoIn: formatearPeso(document.getElementById('hdnPesoIn')?.value),
        fechaSale: fechaSaleFormateada  // Fecha/hora actual del momento de generación
    };

    // Crear ventana de impresión con diseño HTML
    const ventanaImpresion = window.open('', '_blank', 'width=800,height=600');

    if (ventanaImpresion) {
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Comprobante de Transacción - ${datos.transaccion}</title>
                <style>
                    /* Configuración para impresora matricial con papel pre-impreso */
                    @page {
                        size: portrait;
                        width: 17.8cm;
                        height: 21.5cm;
                        margin: 0;
                    }

                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }

                    body {
                        font-family: 'Courier New', Courier, monospace;
                        font-size: 11pt;
                        font-weight: normal;
                        background: white;
                        color: black;
                        position: relative;
                        text-transform: uppercase;
                    }

                    .comprobante {
                        position: relative;
                        width: 17.8cm;
                        height: 21.5cm;
                        padding: 0;
                    }

                    .campo {
                        position: absolute;
                        font-size: 11pt;
                        font-weight: normal;
                        line-height: 1.2;
                    }

                    .campo-oculto {
                        position: absolute;
                        font-size: 11pt;
                        font-weight: normal;
                        line-height: 1.2;
                        color: transparent !important;
                    }

                    .pesos-columna {
                        position: absolute;
                        text-align: right;
                        font-size: 11pt;
                        font-weight: normal;
                        width: 3cm;
                    }

                    /* Estilos de impresión */
                    @media print {
                        @page {
                            size: portrait;
                            width: 17.8cm;
                            height: 21.5cm;
                            margin: 0;
                        }

                        body {
                            margin: 0;
                            padding: 0;
                        }

                        * {
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                            color: black !important;
                        }

                        header, footer {
                            display: none !important;
                        }
                    }

                    /* Vista previa en pantalla */
                    @media screen {
                        body {
                            padding: 20px;
                            background: #e0e0e0;
                        }

                        .comprobante {
                            background: white;
                            box-shadow: 0 0 10px rgba(0,0,0,0.2);
                            margin: 0 auto;
                        }
                    }
                </style>
            </head>
            <body>
                <div class="comprobante">
                    <!-- ENTRADA - Label (OCULTO - ya está en la hoja pre-impresa) -->
                    <div class="campo-oculto" style="top: 0.1cm; left: 1.5cm;">ENTRADA:</div>
                    <!-- ENTRADA - Value (formato fecha hora) -->
                    <div class="campo" style="top: 0.1cm; left: 6cm;">${datos.fechaEntra}</div>
                    <!-- PESO ENTRADA (al final límite derecho) -->
                    <div class="pesos-columna" style="top: 0.1cm; right: 3.5cm;">${datos.pesoIn} Kgs</div>

                    <!-- INGENIO - Label (OCULTO - ya está en la hoja pre-impresa) -->
                    <div class="campo-oculto" style="top: 0.6cm; left: 1.5cm;">INGENIO:</div>
                    <!-- INGENIO - Value -->
                    <div class="campo" style="top: 0.6cm; left: 6cm;">${datos.cliente}</div>

                    <!-- TRANSPORTE - Label (OCULTO - ya está en la hoja pre-impresa) -->
                    <!-- 0.8cm después de INGENIO para mayor separación: 0.6 + 0.8 = 1.4cm -->
                    <div class="campo-oculto" style="top: 1.4cm; left: 1.5cm;">TRANSPORTE:</div>
                    <!-- TRANSPORTE - Value -->
                    <div class="campo" style="top: 1.4cm; left: 6cm;">${datos.transportista}</div>

                    <!-- MOTORISTA - Label (OCULTO - ya está en la hoja pre-impresa) -->
                    <!-- 0.5cm después de TRANSPORTE: 1.4 + 0.5 = 1.9cm -->
                    <div class="campo-oculto" style="top: 1.9cm; left: 1.5cm;">MOTORISTA:</div>
                    <!-- MOTORISTA - Value -->
                    <div class="campo" style="top: 1.9cm; left: 6cm;">${datos.motorista}</div>

                    <!-- PLACAS - Label (OCULTO - ya está en la hoja pre-impresa) -->
                    <!-- 0.5cm después de MOTORISTA: 1.9 + 0.5 = 2.4cm -->
                    <div class="campo-oculto" style="top: 2.4cm; left: 1.5cm;">PLACAS:</div>
                    <!-- PLACAS - Value -->
                    <div class="campo" style="top: 2.4cm; left: 6cm;">${datos.camion}/${datos.remolque}</div>

                    <!-- SALIDA - Label (OCULTO - ya está en la hoja pre-impresa) -->
                    <!-- Subir 0.1cm: 3.9 - 0.1 = 3.8cm -->
                    <div class="campo-oculto" style="top: 3.8cm; left: 1.5cm;">SALIDA:</div>
                    <!-- SALIDA - Value (formato fecha hora) -->
                    <div class="campo" style="top: 3.8cm; left: 6cm;">${datos.fechaSale}</div>

                    <!-- PESO BRUTO (al final límite derecho) -->
                    <div class="pesos-columna" style="top: 3.8cm; right: 3.5cm;">${datos.pesoBrutoAlmapac} Kgs</div>

                    <!-- Label vacío para alineación -->
                    <!-- 0.45cm después de PESO BRUTO (espacio proporcional): 3.8 + 0.45 = 4.25cm -->
                    <div class="campo-oculto" style="top: 4.25cm; left: 1.5cm;"></div>
                    <!-- PESO TARA - Value (columna central) -->
                    <div class="campo" style="top: 4.25cm; left: 6cm;"></div>
                    <!-- PESO TARA (al final límite derecho) -->
                    <div class="pesos-columna" style="top: 4.25cm; right: 3.5cm;">${datos.pesoTaraAlmapac} Kgs</div>

                    <!-- PRODUCTO - Label (OCULTO - ya está en la hoja pre-impresa) -->
                    <!-- 0.3cm después de PESO TARA: 4.4 + 0.3 = 4.7cm -->
                    <div class="campo-oculto" style="top: 4.7cm; left: 1.5cm;">PRODUCTO:</div>
                    <!-- PRODUCTO - Value -->
                    <div class="campo" style="top: 4.7cm; left: 6cm;">${datos.producto}</div>
                    <!-- PESO NETO (al final límite derecho) -->
                    <div class="pesos-columna" style="top: 4.7cm; right: 3.5cm;">${datos.pesoNetoAlmapac} Kgs</div>

                    <!-- TRANSACCIÓN - Label (OCULTO - ya está en la hoja pre-impresa) -->
                    <div class="campo-oculto" style="top: 6.4cm; left: 1.5cm;">TRANSACCION:</div>
                    <!-- TRANSACCIÓN - Value -->
                    <div class="campo" style="top: 6.4cm; left: 6cm;">${datos.transaccion}</div>

                    <!-- HUMEDAD - Label (OCULTO - ya está en la hoja pre-impresa) -->
                    <div class="campo-oculto" style="top: 6.85cm; left: 1.5cm;">HUMEDAD</div>
                    <!-- HUMEDAD - Value -->
                    <div class="campo" style="top: 6.85cm; left: 6cm;">${datos.humedad}</div>

                    <!-- ENVÍO CLIENTE (NR) - Label (VISIBLE - no está en la hoja pre-impresa) -->
                    <div class="campo" style="top: 7.8cm; left: 1.5cm;">ENVIO CLIENTE(NR)</div>
                    <!-- ENVÍO CLIENTE (NR) - Value -->
                    <div class="campo" style="top: 7.8cm; left: 6cm;">${datos.codigoGeneracion}</div>

                    <!-- LICENCIA - Label (VISIBLE - no está en la hoja pre-impresa) -->
                    <div class="campo" style="top: 8.4cm; left: 1.5cm;">LICENCIA</div>
                    <!-- LICENCIA - Value -->
                    <div class="campo" style="top: 8.4cm; left: 6cm;">${datos.licencia}</div>

                    <!-- MARCHAMOS - Label (VISIBLE - no está en la hoja pre-impresa) -->
                    <div class="campo" style="top: 9.0cm; left: 1.5cm;">MARCHAMOS</div>
                    <!-- MARCHAMOS - Value -->
                    <div class="campo" style="top: 9.0cm; left: 6cm;">${datos.marchamos}</div>
                </div>

                <script>
                    // Auto-imprimir al cargar
                    window.onload = function() {
                        setTimeout(function() {
                            window.print();
                        }, 500);
                    };

                    // Detectar cuando se cierra el diálogo de impresión
                    window.onafterprint = function() {
                        // Registrar automáticamente la impresión sin preguntar
                        if (window.opener && window.opener.registrarImpresionAutomatica) {
                            window.opener.registrarImpresionAutomatica('${codeGen}');
                        }
                        // Cerrar esta ventana inmediatamente
                        window.close();
                    };
                </script>
            </body>
            </html>
        `;

        // Para ventanas popup de impresión, document.write() es el método estándar
        // @ts-ignore - document.write es necesario para ventanas popup
        ventanaImpresion.document.open();
        ventanaImpresion.document.write(htmlContent);
        ventanaImpresion.document.close();
    } else {
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudo abrir la ventana de impresión. Verifique que no esté bloqueada por el navegador.',
            confirmButtonColor: '#182A6E',
            confirmButtonText: 'Aceptar'
        });
    }
}

function mostrarResultadoFinal(sinImprimir, codeGen) {
    const mensaje = sinImprimir
        ? 'Comprobante no impreso.'
        : 'Comprobante impreso correctamente.';

    Swal.fire({
        title: sinImprimir ? 'Guardado exitoso' : 'Impresión completada',
        html: `
            <p>${mensaje}</p>
            <p style="margin-top: 15px; color: #28a745; font-weight: 500;">
                <i class="fas fa-info-circle"></i>
                La página se refrescará para mostrar los datos actualizados.
            </p>
            <p style="margin-top: 15px; color: #dc3545; font-weight: 500;">
                <i class="fas fa-exclamation-triangle"></i>
                Si completa la transacción, esta acción no se podrá revertir.
            </p>
        `,
        icon: 'success',
        showCancelButton: true,
        confirmButtonColor: '#182A6E',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Completar',
        cancelButtonText: 'Continuar',
        allowOutsideClick: false
    }).then((result) => {
        if (result.isConfirmed) {
            // Completar transacción (cambiar a estado 12) y regresar a lista
            completarTransaccion(codeGen);
        } else {
            // Hacer refresh de la página para mostrar los datos actualizados (marchamos y comprobante)
            recargarDetalleTransaccion(codeGen);
        }
    });
}

// Función para recargar la página del detalle de transacción
function recargarDetalleTransaccion(codeGen) {
    // Guardar posición de scroll antes de recargar
    guardarPosicionScroll();

    // Mostrar loading mientras se recarga
    // Swal.fire({
    //     title: 'Actualizando',
    //     text: 'Recargando datos...',
    //     icon: 'info',
    //     allowOutsideClick: false,
    //     showConfirmButton: false,
    //     didOpen: () => {
    //         Swal.showLoading();
    //     }
    // });

    // Obtener la actividad actual
    const actividadElement = document.querySelector('.dt-breadcrumb-item.active');
    const actividad = actividadElement ? actividadElement.textContent.trim() : 'Detalle de Transacción';

    // Crear formulario para hacer POST al mismo endpoint
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/DetalleTransaccion';  // Sin /Index para mantener URL limpia

    // Agregar codeGen
    const inputCodeGen = document.createElement('input');
    inputCodeGen.type = 'hidden';
    inputCodeGen.name = 'codeGen';
    inputCodeGen.value = codeGen;
    form.appendChild(inputCodeGen);

    // Agregar actividad
    const inputActividad = document.createElement('input');
    inputActividad.type = 'hidden';
    inputActividad.name = 'actividad';
    inputActividad.value = actividad;
    form.appendChild(inputActividad);

    // Agregar al body y enviar
    document.body.appendChild(form);
    form.submit();
}

// ==========================================
// PRESERVACIÓN DE POSICIÓN DE SCROLL
// ==========================================
function guardarPosicionScroll() {
    try {
        const scrollData = {
            scrollY: window.scrollY || window.pageYOffset,
            scrollX: window.scrollX || window.pageXOffset,
            timestamp: Date.now()
        };
        sessionStorage.setItem('detalleTransaccion_scroll', JSON.stringify(scrollData));
        console.log('Posición de scroll guardada:', scrollData.scrollY);
    } catch (e) {
        console.error('Error al guardar posición de scroll:', e);
    }
}

function restaurarPosicionScroll() {
    try {
        const savedData = sessionStorage.getItem('detalleTransaccion_scroll');
        if (!savedData) return;

        const scrollData = JSON.parse(savedData);

        // Solo restaurar si los datos son recientes (menos de 30 segundos)
        const ahora = Date.now();
        if (ahora - scrollData.timestamp >= 30000) {
            sessionStorage.removeItem('detalleTransaccion_scroll');
            return;
        }

        // Función para hacer el scroll
        const hacerScroll = () => {
            try {
                window.scrollTo(scrollData.scrollX, scrollData.scrollY);
                console.log('Posición de scroll restaurada:', scrollData.scrollY);
            } catch (scrollError) {
                // Fallback para navegadores antiguos
                document.documentElement.scrollTop = scrollData.scrollY;
                document.body.scrollTop = scrollData.scrollY;
            }
        };

        // Intentar restaurar después de que el DOM esté listo
        if (document.readyState === 'complete') {
            setTimeout(hacerScroll, 50);
        } else {
            // Esperar a que la página cargue completamente
            window.addEventListener('load', () => setTimeout(hacerScroll, 50), { once: true });
        }

        // Limpiar datos guardados
        sessionStorage.removeItem('detalleTransaccion_scroll');

    } catch (e) {
        // Fallo silencioso - no es crítico
        console.warn('No se pudo restaurar posición de scroll:', e);
        try {
            sessionStorage.removeItem('detalleTransaccion_scroll');
        } catch (cleanupError) {
            // Ignorar
        }
    }
}

function completarTransaccion(codeGen) {
    // Mostrar confirmación con advertencia de acción irreversible
    Swal.fire({
        title: '¿Completar transacción?',
        text: 'Esta acción no se puede revertir. ¿Está seguro de que desea completar la transacción?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#182A6E',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Sí, completar',
        cancelButtonText: 'Cancelar'
    }).then((result) => {
        if (!result.isConfirmed) {
            return; // Usuario canceló
        }

        // Mostrar loading
        Swal.fire({
            title: 'Completando transacción',
            text: 'Por favor espere...',
            icon: 'info',
            allowOutsideClick: false,
            showConfirmButton: false,
            didOpen: () => {
                Swal.showLoading();
            }
        });

        // Llamar al servidor para completar (cambiar estado a 12)
        fetch('/DetalleTransaccion/CompletarTransaccion', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            codeGen: codeGen
        })
    })
    .then(response => response.json())
    .then(data => {
        Swal.close();

        if (data.success) {
            Swal.fire({
                icon: 'success',
                title: 'Completado',
                text: data.message || 'Transacción completada correctamente',
                confirmButtonColor: '#182A6E',
                timer: 2000,
                showConfirmButton: false
            }).then(() => {
                // Regresar a lista de transacciones
                window.location.href = '/ListaTransacciones';
            });
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: data.message || 'Error al completar la transacción',
                confirmButtonColor: '#182A6E',
                confirmButtonText: 'Aceptar'
            });
        }
        })
        .catch(error => {
            console.error('Error:', error);
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Error de conexión con el servidor',
                confirmButtonColor: '#182A6E',
                confirmButtonText: 'Aceptar'
            });
        });
    });
}

function cancelarTransaccion() {
    // Simplemente regresar a lista de transacciones
    window.location.href = '/ListaTransacciones';
}

function nuevoPesaje() {
    Swal.fire({
        title: '¿Crear nuevo pesaje?',
        text: 'Se iniciará un nuevo proceso de pesaje para esta transacción',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#182A6E',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Sí, iniciar',
        cancelButtonText: 'Cancelar'
    }).then((result) => {
        if (result.isConfirmed) {
            // Aquí iría la lógica para nuevo pesaje
            Swal.fire({
                icon: 'info',
                title: 'Nuevo Pesaje',
                text: 'Redirigiendo al área de pesaje...',
                confirmButtonColor: '#182A6E'
            });
        }
    });
}

function agregarObservacion() {
    const txtObservacion = document.getElementById('txtObservacion');
    const observacion = txtObservacion.value.trim();
    const codeGen = document.getElementById('hdnCodeGen')?.value;

    if (!observacion) {
        Swal.fire({
            icon: 'warning',
            title: 'Campo vacío',
            text: 'Por favor ingrese una observación',
            confirmButtonColor: '#182A6E'
        });
        return;
    }

    // Llamar al servidor para guardar la observación
    fetch('/DetalleTransaccion/AgregarObservacion', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            codeGen: codeGen,
            observacion: observacion
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            // Agregar a la timeline
            const nuevaObservacion = {
                fecha: new Date().toLocaleString('es-SV'),
                usuario: 'Usuario Actual',
                accion: observacion
            };

            // Insertar al inicio de la timeline
            const timeline = document.querySelector('.dt-timeline');
            if (timeline) {
                const nuevoItem = document.createElement('div');
                nuevoItem.className = 'dt-timeline-item';
                nuevoItem.innerHTML = `
                    <div class="dt-timeline-icon">
                        <i class="far fa-clock"></i>
                    </div>
                    <div class="dt-timeline-content">
                        <div class="dt-timeline-header">
                            <span class="dt-timeline-date">${escapeHtml(nuevaObservacion.fecha)}</span>
                            <span class="dt-timeline-user">${escapeHtml(nuevaObservacion.usuario)}</span>
                        </div>
                        <div class="dt-timeline-action">${escapeHtml(nuevaObservacion.accion)}</div>
                    </div>
                `;
                timeline.insertBefore(nuevoItem, timeline.firstChild);
            }

            // Cerrar modal y limpiar
            $('#modalObservacion').modal('hide');
            txtObservacion.value = '';

            Swal.fire({
                icon: 'success',
                title: 'Agregado',
                text: 'Observación agregada correctamente',
                confirmButtonColor: '#182A6E',
                timer: 2000,
                showConfirmButton: false
            });
        } else {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: data.message || 'Error al agregar la observación',
                confirmButtonColor: '#182A6E',
                confirmButtonText: 'Aceptar'
            });
        }
    })
    .catch(error => {
        console.error('Error:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Error de conexión con el servidor',
            confirmButtonColor: '#182A6E',
            confirmButtonText: 'Aceptar'
        });
    });
}

function abrirModalAnularMarchamo(inputId) {
    const input = document.getElementById(inputId);
    const marchamoNumero = inputId.replace('txtMarchamo', '');

    // Actualizar título del modal
    document.getElementById('tituloAnularMarchamo').textContent = `Anular Marchamo ${marchamoNumero}`;

    // Guardar referencia del input
    document.getElementById('hdnMarchamoId').value = inputId;

    // Limpiar campos
    document.getElementById('ddlMotivoMarchamo').value = '';
    document.getElementById('txtOtroMotivoMarchamo').value = '';
    document.getElementById('txtObservacionMarchamo').value = '';
    document.getElementById('grpOtroMotivoMarchamo').style.display = 'none';

    // Event listener para mostrar/ocultar campo "Otro"
    const ddlMotivo = document.getElementById('ddlMotivoMarchamo');
    ddlMotivo.onchange = function() {
        const grpOtro = document.getElementById('grpOtroMotivoMarchamo');
        if (this.value === 'Otro') {
            grpOtro.style.display = 'block';
            document.getElementById('txtOtroMotivoMarchamo').focus();
        } else {
            grpOtro.style.display = 'none';
            document.getElementById('txtOtroMotivoMarchamo').value = '';
        }
    };

    // Mostrar modal
    $('#modalAnularMarchamo').modal('show');
}

function confirmarAnularMarchamo() {
    let motivo = document.getElementById('ddlMotivoMarchamo').value;
    const otroMotivo = document.getElementById('txtOtroMotivoMarchamo').value.trim();
    const observacion = document.getElementById('txtObservacionMarchamo').value.trim();
    const inputId = document.getElementById('hdnMarchamoId').value;
    const codeGen = document.getElementById('hdnCodeGen')?.value;

    // Obtener el valor del código del marchamo
    const input = document.getElementById(inputId);
    const sealCode = input ? input.value : '';

    if (!motivo) {
        Swal.fire({
            icon: 'info',
            title: 'Campo requerido',
            text: 'Por favor seleccione un motivo de anulación',
            confirmButtonColor: '#182A6E'
        });
        return;
    }

    // Si seleccionó "Otro", validar que haya ingresado el motivo personalizado
    if (motivo === 'Otro') {
        if (!otroMotivo) {
            Swal.fire({
                icon: 'info',
                title: 'Campo requerido',
                text: 'Por favor especifique el motivo de anulación',
                confirmButtonColor: '#182A6E',
                confirmButtonText: 'Aceptar'

            });
            document.getElementById('txtOtroMotivoMarchamo').focus();
            return;
        }
        motivo = otroMotivo; // Usar el motivo personalizado
    }

    if (!sealCode) {
        Swal.fire({
            icon: 'warning',
            title: 'Error',
            text: 'No se encontró el código del marchamo',
            confirmButtonColor: '#182A6E',
            confirmButtonText: 'Aceptar'

        });
        return;
    }

    // Mostrar loading en el botón
    const btnConfirmar = document.getElementById('btnConfirmarAnularMarchamo');
    const spinner = btnConfirmar.querySelector('.spinner-border');
    const btnText = btnConfirmar.querySelector('.btn-text');
    spinner.classList.remove('d-none');
    btnText.textContent = 'Anulando...';
    btnConfirmar.disabled = true;

    // Llamar al servidor para anular el marchamo
    fetch('/DetalleTransaccion/AnularMarchamo', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            codeGen: codeGen,
            sealCode: sealCode,
            motivo: motivo,
            observacion: observacion
        })
    })
    .then(response => response.json())
    .then(data => {
        // Ocultar loading
        spinner.classList.add('d-none');
        btnText.textContent = 'Anular';
        btnConfirmar.disabled = false;

        if (data.success) {
            // Cerrar modal
            $('#modalAnularMarchamo').modal('hide');

            // Mostrar mensaje de éxito y recargar
            Swal.fire({
                icon: 'success',
                title: 'Anulado',
                text: 'Marchamo anulado correctamente.',
                confirmButtonColor: '#182A6E',
                confirmButtonText: 'Aceptar',
                timer: 1500,
                showConfirmButton: false
            }).then(() => {
                // Recargar la página para mostrar los datos actualizados
                const codeGen = document.getElementById('hdnCodeGen')?.value;
                if (codeGen) {
                    recargarDetalleTransaccion(codeGen);
                }
            });
        } else {
            Swal.fire({
                icon: 'info',
                title: 'Información',
                text: data.message || 'No se pudo anular el marchamo',
                confirmButtonColor: '#182A6E',
                confirmButtonText: 'Aceptar'
            });
        }
    })
    .catch(error => {
        // Ocultar loading
        spinner.classList.add('d-none');
        btnText.textContent = 'Anular';
        btnConfirmar.disabled = false;

        console.error('Error:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Error de conexión con el servidor',
            confirmButtonColor: '#182A6E',
            confirmButtonText: 'Aceptar'
        });
    });
}

function abrirModalAnularComprobante() {
    // Limpiar campos
    document.getElementById('ddlMotivoComprobante').value = '';
    document.getElementById('txtOtroMotivoComprobante').value = '';
    document.getElementById('txtObservacionComprobante').value = '';
    document.getElementById('grpOtroMotivoComprobante').style.display = 'none';

    // Event listener para mostrar/ocultar campo "Otro"
    const ddlMotivo = document.getElementById('ddlMotivoComprobante');
    ddlMotivo.onchange = function() {
        const grpOtro = document.getElementById('grpOtroMotivoComprobante');
        if (this.value === 'Otro') {
            grpOtro.style.display = 'block';
            document.getElementById('txtOtroMotivoComprobante').focus();
        } else {
            grpOtro.style.display = 'none';
            document.getElementById('txtOtroMotivoComprobante').value = '';
        }
    };

    // Mostrar modal
    $('#modalAnularComprobante').modal('show');
}

function confirmarAnularComprobante() {
    let motivo = document.getElementById('ddlMotivoComprobante').value;
    const otroMotivo = document.getElementById('txtOtroMotivoComprobante').value.trim();
    const observacion = document.getElementById('txtObservacionComprobante').value.trim();
    const codeGen = document.getElementById('hdnCodeGen')?.value;

    // Obtener el número de comprobante directamente del input (para casos donde no está asignado al shipment)
    const numeroComprobante = document.getElementById('txtComprobante')?.value?.trim() || '';

    if (!motivo) {
        Swal.fire({
            icon: 'info',
            title: 'Campo requerido',
            text: 'Por favor seleccione un motivo de anulación',
            confirmButtonColor: '#182A6E',
            confirmButtonText: 'Aceptar'
        });
        return;
    }

    // Validar que haya un número de comprobante
    if (!numeroComprobante) {
        Swal.fire({
            icon: 'info',
            title: 'Sin comprobante',
            text: 'No hay número de comprobante para anular',
            confirmButtonColor: '#182A6E',
            confirmButtonText: 'Aceptar'
        });
        return;
    }

    // Si seleccionó "Otro", validar que haya ingresado el motivo personalizado
    if (motivo === 'Otro') {
        if (!otroMotivo) {
            Swal.fire({
                icon: 'info',
                title: 'Campo requerido',
                text: 'Por favor especifique el motivo de anulación',
                confirmButtonColor: '#182A6E',
                confirmButtonText: 'Aceptar'
            });
            document.getElementById('txtOtroMotivoComprobante').focus();
            return;
        }
        motivo = otroMotivo; // Usar el motivo personalizado
    }

    // Mostrar loading en el botón
    const btnConfirmar = document.getElementById('btnConfirmarAnularComprobante');
    const spinner = btnConfirmar.querySelector('.spinner-border');
    const btnText = btnConfirmar.querySelector('.btn-text');
    spinner.classList.remove('d-none');
    btnText.textContent = 'Anulando...';
    btnConfirmar.disabled = true;

    // Llamar al servidor para anular el comprobante (enviar número directamente del input)
    fetch('/DetalleTransaccion/AnularComprobante', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            codeGen: codeGen,
            numeroComprobante: numeroComprobante,
            motivo: motivo,
            observacion: observacion
        })
    })
    .then(response => response.json())
    .then(data => {
        // Ocultar loading
        spinner.classList.add('d-none');
        btnText.textContent = 'Anular';
        btnConfirmar.disabled = false;

        if (data.success) {
            // Cerrar modal
            $('#modalAnularComprobante').modal('hide');

            // Mostrar mensaje de éxito y recargar
            Swal.fire({
                icon: 'success',
                title: 'Anulado',
                text: 'Comprobante anulado correctamente.',
                confirmButtonColor: '#182A6E',
                confirmButtonText: 'Aceptar',
                timer: 1500,
                showConfirmButton: false
            }).then(() => {
                // Recargar la página para mostrar los datos actualizados
                const codeGen = document.getElementById('hdnCodeGen')?.value;
                if (codeGen) {
                    recargarDetalleTransaccion(codeGen);
                }
            });
        } else {
            Swal.fire({
                icon: 'info',
                title: 'Información',
                text: data.message || 'No se pudo anular el comprobante',
                confirmButtonColor: '#182A6E',
                confirmButtonText: 'Aceptar'
            });
        }
    })
    .catch(error => {
        // Ocultar loading
        spinner.classList.add('d-none');
        btnText.textContent = 'Anular';
        btnConfirmar.disabled = false;

        console.error('Error:', error);
        Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'Error de conexión con el servidor',
            confirmButtonColor: '#182A6E',
            confirmButtonText: 'Aceptar'
        });
    });
}

// ==========================================
// UTILIDADES
// ==========================================
function recopilarDatos() {
    return {
        codeGen: document.getElementById('hdnCodeGen')?.value || '',
        comprobante: document.getElementById('txtComprobante')?.value || '',
        humedad: document.getElementById('txtHumedad')?.value || '',
        marchamo1: document.getElementById('txtMarchamo1')?.value || '',
        marchamo2: document.getElementById('txtMarchamo2')?.value || '',
        marchamo3: document.getElementById('txtMarchamo3')?.value || '',
        marchamo4: document.getElementById('txtMarchamo4')?.value || ''
    };
}

function escapeHtml(text) {
    if (text == null) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

// ==========================================
// DETECCIÓN DE CAMBIOS
// ==========================================

// Función para normalizar valores (trim y convertir a string)
function normalizarValor(valor) {
    if (valor === null || valor === undefined) return '';
    return String(valor).trim();
}

function guardarValoresOriginales() {
    valoresOriginales = {
        humedad: normalizarValor(document.getElementById('txtHumedad')?.value),
        marchamo1: normalizarValor(document.getElementById('txtMarchamo1')?.value),
        marchamo2: normalizarValor(document.getElementById('txtMarchamo2')?.value),
        marchamo3: normalizarValor(document.getElementById('txtMarchamo3')?.value),
        marchamo4: normalizarValor(document.getElementById('txtMarchamo4')?.value)
    };
    hayCambiosPendientes = false;
    console.log('Valores originales guardados:', valoresOriginales);
}

function configurarDeteccionCambios() {
    const campos = ['txtHumedad', 'txtMarchamo1', 'txtMarchamo2', 'txtMarchamo3', 'txtMarchamo4'];

    campos.forEach(id => {
        const campo = document.getElementById(id);
        if (campo) {
            // Usar múltiples eventos para capturar todos los cambios
            campo.addEventListener('input', detectarCambios);
            campo.addEventListener('change', detectarCambios);
            campo.addEventListener('blur', detectarCambios);
            campo.addEventListener('keyup', detectarCambios);
        }
    });
}

function detectarCambios() {
    const valoresActuales = {
        humedad: normalizarValor(document.getElementById('txtHumedad')?.value),
        marchamo1: normalizarValor(document.getElementById('txtMarchamo1')?.value),
        marchamo2: normalizarValor(document.getElementById('txtMarchamo2')?.value),
        marchamo3: normalizarValor(document.getElementById('txtMarchamo3')?.value),
        marchamo4: normalizarValor(document.getElementById('txtMarchamo4')?.value)
    };

    hayCambiosPendientes =
        valoresActuales.humedad !== valoresOriginales.humedad ||
        valoresActuales.marchamo1 !== valoresOriginales.marchamo1 ||
        valoresActuales.marchamo2 !== valoresOriginales.marchamo2 ||
        valoresActuales.marchamo3 !== valoresOriginales.marchamo3 ||
        valoresActuales.marchamo4 !== valoresOriginales.marchamo4;

    console.log('Cambios detectados:', hayCambiosPendientes);
}

function hayCambios() {
    detectarCambios();
    return hayCambiosPendientes;
}

// ==========================================
// NAVEGACIÓN AUTOMÁTICA ENTRE MARCHAMOS
// ==========================================
function configurarNavegacionMarchamos() {
    // Orden de navegación: Humedad -> Marchamo1 -> Marchamo2 -> Marchamo3 -> Marchamo4 -> Guardar
    const camposOrden = ['txtHumedad', 'txtMarchamo1', 'txtMarchamo2', 'txtMarchamo3', 'txtMarchamo4'];

    camposOrden.forEach((id, index) => {
        const campo = document.getElementById(id);
        if (campo) {
            // Detectar Enter o Tab para navegar
            campo.addEventListener('keydown', function(e) {
                // Solo manejar Tab y Enter (no Shift+Tab, eso lo maneja el navegador)
                if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) {
                    e.preventDefault();

                    // Buscar el siguiente campo habilitado
                    let encontrado = false;
                    for (let i = index + 1; i < camposOrden.length; i++) {
                        const siguienteCampo = document.getElementById(camposOrden[i]);
                        if (siguienteCampo && !siguienteCampo.disabled && !siguienteCampo.readOnly) {
                            siguienteCampo.focus();
                            siguienteCampo.select();
                            encontrado = true;
                            break;
                        }
                    }

                    // Si no hay siguiente campo habilitado, ir al botón Guardar
                    if (!encontrado) {
                        const btnGuardar = document.getElementById('btnGuardar');
                        if (btnGuardar && !btnGuardar.disabled) {
                            btnGuardar.focus();
                        }
                    }
                }
            });

            // Detectar pegado (escaneo de código de barras típicamente pega el valor)
            campo.addEventListener('paste', function() {
                // Pequeño delay para que el valor se pegue primero
                setTimeout(() => {
                    if (this.value.trim() !== '') {
                        // Buscar el siguiente campo habilitado
                        let encontrado = false;
                        for (let i = index + 1; i < camposOrden.length; i++) {
                            const siguienteCampo = document.getElementById(camposOrden[i]);
                            if (siguienteCampo && !siguienteCampo.disabled && !siguienteCampo.readOnly) {
                                siguienteCampo.focus();
                                siguienteCampo.select();
                                encontrado = true;
                                break;
                            }
                        }

                        // Si no hay siguiente campo, ir al botón Guardar
                        if (!encontrado) {
                            const btnGuardar = document.getElementById('btnGuardar');
                            if (btnGuardar && !btnGuardar.disabled) {
                                btnGuardar.focus();
                            }
                        }
                    }
                }, 100);
            });

            // Auto-avanzar cuando el campo tiene contenido y pierde el foco brevemente
            // (útil para escáneres que envían datos rápidamente)
            let ultimoValor = campo.value;
            campo.addEventListener('input', function() {
                // Si el valor cambió significativamente (escaneo completo)
                if (this.value.length > 3 && this.value !== ultimoValor) {
                    ultimoValor = this.value;
                }
            });
        }
    });
}

// ==========================================
// VALIDACIÓN SOLO NÚMEROS EN MARCHAMOS
// ==========================================
function configurarValidacionSoloNumerosMarchamos() {
    const marchamos = ['txtMarchamo1', 'txtMarchamo2', 'txtMarchamo3', 'txtMarchamo4'];

    marchamos.forEach(id => {
        const campo = document.getElementById(id);
        if (campo) {
            // Prevenir entrada de letras y caracteres especiales
            campo.addEventListener('keypress', function(e) {
                // Permitir solo números (0-9)
                const char = e.key;

                // Permitir solo dígitos
                if (!/^\d$/.test(char)) {
                    e.preventDefault();
                    return false;
                }
            });

            // Validar y limpiar al pegar
            campo.addEventListener('paste', function() {
                // Pequeño delay para obtener el valor pegado
                setTimeout(() => {
                    // Limpiar cualquier carácter que no sea número
                    const valorLimpio = this.value.replace(/\D/g, '');
                    if (this.value !== valorLimpio) {
                        this.value = valorLimpio;
                        console.log(`Marchamo limpiado: caracteres no numéricos removidos en ${id}`);
                    }
                }, 10);
            });

            // Validar al cambiar el valor (por si se copia/pega con mouse)
            campo.addEventListener('input', function() {
                // Limpiar cualquier carácter que no sea número
                const valorOriginal = this.value;
                const valorLimpio = this.value.replace(/\D/g, '');
                if (valorOriginal !== valorLimpio) {
                    this.value = valorLimpio;
                    console.log(`Marchamo limpiado en input: caracteres no numéricos removidos en ${id}`);
                }
            });
        }
    });

    console.log('Validación solo números configurada para inputs de marchamos');
}

// ==========================================
// ENFOQUE EN CAMPO INICIAL
// ==========================================
function enfocarCampoHumedad() {
    const currentStatus = parseInt(document.getElementById('hdnCurrentStatus')?.value || '0');

    // Solo enfocar si el status es 11 (editable)
    if (currentStatus !== 11) {
        console.log('No se enfoca campo inicial - status no es 11');
        return;
    }

    // Pequeño delay para asegurar que la página esté completamente cargada
    setTimeout(() => {
        // Si es producto azúcar, enfocar humedad; si no, enfocar marchamo 1
        if (esProductoAzucar()) {
            const campoHumedad = document.getElementById('txtHumedad');
            if (campoHumedad && !campoHumedad.disabled && !campoHumedad.readOnly) {
                campoHumedad.focus();
                campoHumedad.select();
                console.log('Foco puesto en campo de humedad (producto azúcar)');
            }
        } else {
            // Para melaza u otros productos, enfocar marchamo 1
            const campoMarchamo1 = document.getElementById('txtMarchamo1');
            if (campoMarchamo1 && !campoMarchamo1.disabled && !campoMarchamo1.readOnly) {
                campoMarchamo1.focus();
                campoMarchamo1.select();
                console.log('Foco puesto en marchamo 1 (producto no azúcar)');
            }
        }
    }, 300);
}

// ==========================================
// VALIDACIÓN DE PRODUCTO AZÚCAR (HUMEDAD OBLIGATORIA)
// ==========================================
function esProductoAzucar() {
    const producto = document.getElementById('hdnProducto')?.value || '';
    // Azúcar requiere humedad, Melaza no
    const esAzucar = producto.toUpperCase().includes('AZUCAR') ||
                     producto.toUpperCase().includes('AZÚCAR') ||
                     producto.toUpperCase().includes('SUGAR');
    const esMelaza = producto.toUpperCase().includes('MELAZA');

    // Si es melaza, NO es producto que requiere humedad
    // Si contiene azúcar O no es melaza (por defecto requiere), entonces sí requiere
    return !esMelaza;
}

function validarHumedadObligatoria() {
    if (!esProductoAzucar()) {
        console.log('Producto es melaza - humedad no obligatoria');
        return true; // Melaza no requiere humedad
    }

    const humedad = document.getElementById('txtHumedad')?.value || '';
    const humedadNum = parseFloat(humedad);

    if (!humedad || humedad.trim() === '' || isNaN(humedadNum) || humedadNum <= 0) {
        return false; // Humedad vacía o inválida para producto azúcar
    }

    return true;
}
