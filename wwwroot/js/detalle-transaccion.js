/**
 * DETALLE DE TRANSACCIÓN - JAVASCRIPT
 * Manejo de secciones colapsables y acciones
 */

// ==========================================
// VARIABLES GLOBALES PARA TRACKING DE CAMBIOS
// ==========================================
let valoresOriginales = {};
let hayCambiosPendientes = false;
let __guardandoEnProceso = false;
let __imprimiendoEnProceso = false;

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', async function () {
    console.log('Detalle Transacción JS cargado');

    // Esperar a que PERMISSION esté inicializado
    await PERMISSION.init();

    // Validar estado de la transacción (debe ser 11 para editar)
    validarEstadoTransaccion();

    // Validar específicamente el botón de anular tarjeta (status debe estar entre 3 y 10)
    validarBotonAnularTarjeta();

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

    // Configurar comportamiento del campo de humedad
    configurarCampoHumedad();

    // Configurar validación solo números en inputs de marchamos
    configurarValidacionSoloNumerosMarchamos();

    // Poner foco en el input de humedad al iniciar (si está habilitado)
    enfocarCampoHumedad();

    // Guardar codeGen en sessionStorage (backup per-tab para multi-pestaña y F5)
    const _cg = document.getElementById('hdnCodeGen')?.value;
    if (_cg) {
        sessionStorage.setItem('dt_codeGen', _cg);
        const _act = document.querySelector('.dt-breadcrumb-item.active')?.textContent?.trim();
        if (_act) sessionStorage.setItem('dt_actividad', _act);
    }

    // Restaurar posición de scroll si viene de una recarga
    restaurarPosicionScroll();

    // Restaurar valores temporales de campos no guardados
    restaurarValoresTemporales();

    // Configurar guardado automático antes de cerrar/recargar página
    configurarGuardadoAutomatico();

    // Cargar datos de pesajes desde el ViewBag
    cargarDatosPesajes();

    // Inicializar Select2 para el select de almacén (búsqueda)
    inicializarSelectAlmacen();

    // Configurar contador de caracteres para observaciones
    configurarContadorObservaciones();
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

    // Obtener umbral de repesaje desde system-config (valor negativo)
    const umbral = parseInt(document.getElementById('hdnUmbralRepesaje')?.value || '-100');

    console.log('Umbral de repesaje:', umbral);

    // Encontrar el último pesaje (número más alto)
    const ultimoPesaje = pesajes.reduce((max, pesaje) => pesaje.numero > max.numero ? pesaje : max, pesajes[0]);
    console.log('Último pesaje:', ultimoPesaje?.numero);

    let html = '';

    pesajes.forEach(pesaje => {
        const difBruto = (pesaje.bruto?.diferencia || 0);
        const difTara = (pesaje.tara?.diferencia || 0);
        const difNeto = (pesaje.neto?.diferencia || 0);

        // Validar si la diferencia de peso neto excede el umbral
        // El umbral es negativo (ej: -100), la diferencia debe ser <= umbral para activar alerta
        // Esto significa que peso cliente > peso Almapac (puede haber producto en la unidad)
        const excedeLimite = difNeto <= umbral;

        console.log(`Pesaje #${pesaje.numero}: difNeto=${difNeto}, umbral=${umbral}, excedeLimite=${excedeLimite}`);

        html += `
            <div class="pesaje-item">
                <div class="table-responsive">
                    <table class="dt-table dt-pesos-table">
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
                                <td>${formatNumber(difBruto)}</td>
                            </tr>
                            <tr>
                                <td></td>
                                <td>Peso tara</td>
                                <td>${formatNumber(pesaje.tara?.pesoAlmapac || 0)}</td>
                                <td>${formatNumber(pesaje.tara?.pesoCliente || 0)}</td>
                                <td>${formatNumber(difTara)}</td>
                            </tr>
                            <tr class="dt-row-bold">
                                <td></td>
                                <td>Peso neto</td>
                                <td>${formatNumber(pesaje.neto?.pesoAlmapac || 0)}</td>
                                <td>${formatNumber(pesaje.neto?.pesoCliente || 0)}</td>
                                <td class="${difNeto < 0 ? 'dt-text-danger' : ''}">${formatNumber(difNeto)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    // Mostrar alerta solo si el último pesaje tiene diferencia que excede el umbral
    // El umbral es negativo (ej: -100), la diferencia debe ser <= umbral para activar alerta
    // Solo mostrar en status 11 (En Proceso)
    const currentStatus = parseInt(document.getElementById('hdnCurrentStatus')?.value || '0');

    if (ultimoPesaje) {
        const difNetoUltimo = ultimoPesaje.neto?.diferencia || 0;
        const excedeLimiteUltimo = difNetoUltimo <= umbral;

        if (excedeLimiteUltimo) {
            // Solo mostrar alerta en status 11
            if (currentStatus === 11) {
                mostrarAlertaDiferencias([{
                    numero: ultimoPesaje.numero,
                    diferencia: Math.abs(difNetoUltimo)
                }]);
            }

            // Habilitar botón de agregar pesaje (repesaje opcional)
            habilitarBotonRepesaje();
        }
    }
}

// Habilitar botón de repesaje cuando se detecta diferencia (solo en status 11)
function habilitarBotonRepesaje() {
    const currentStatus = parseInt(document.getElementById('hdnCurrentStatus')?.value || '0');

    // Solo habilitar en status 11 (En Proceso)
    if (currentStatus !== 11) {
        console.log('Botón repesaje no habilitado - status no es 11');
        return;
    }

    const btnAgregarPesaje = document.getElementById('btnAgregarPesaje');
    if (btnAgregarPesaje) {
        btnAgregarPesaje.removeAttribute('disabled');
        btnAgregarPesaje.title = 'Agregar repesaje (opcional)';
    }
}

function renderizarConsolidadoPesos(consolidado) {
    const tbody = document.getElementById('consolidado-tbody');
    const consolidadoSection = document.querySelector('.dt-consolidado-section');

    if (!tbody) return;

    // Si no hay datos, ocultar toda la sección de consolidado
    if (!consolidado || !consolidado.detalle || consolidado.detalle.length === 0) {
        if (consolidadoSection) {
            consolidadoSection.style.display = 'none';
        }
        return;
    }

    // Si hay datos, mostrar la sección
    if (consolidadoSection) {
        consolidadoSection.style.display = 'block';
    }

    let html = '';
    consolidado.detalle.forEach(item => {
        html += `
            <tr>
                <td>${item.numero}</td>
                <td>&nbsp;</td>
                <td>${formatNumber(item.pesoNeto || 0)}</td>
                <td>&nbsp;</td>
                <td>&nbsp;</td>
            </tr>
        `;
    });

    // Agregar fila de Total
    html += `
        <tr class="dt-consolidado-total">
            <td>Total</td>
            <td>&nbsp;</td>
            <td>${formatNumber(consolidado.total || 0)}</td>
            <td>&nbsp;</td>
            <td>&nbsp;</td>
        </tr>
    `;

    tbody.innerHTML = html;
}

function formatNumber(num) {
    const numero = parseFloat(num || 0);

    // Si el número es entero, no mostrar decimales
    if (numero % 1 === 0) {
        let parteEntera = Math.round(numero).toString();
        // Agregar separador de miles (coma)
        parteEntera = parteEntera.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return parteEntera;
    }

    // Si tiene decimales, mostrarlos
    let formattedNum = numero.toFixed(2);
    const partes = formattedNum.split('.');
    let parteEntera = partes[0];
    const parteDecimal = partes[1];

    // Agregar separador de miles (coma) a la parte entera
    parteEntera = parteEntera.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    return `${parteEntera}.${parteDecimal}`;
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
                campo.title = 'Solo se puede editar cuando el estado es "En Proceso"';
            }
        });

        // Deshabilitar botones de anular
        const botonesAnular = document.querySelectorAll('.dt-btn-anular');
        botonesAnular.forEach(btn => {
            btn.setAttribute('disabled', 'disabled');
            btn.style.pointerEvents = 'none';
            btn.title = 'Solo se puede anular cuando el estado es "En Proceso"';
        });

        // Deshabilitar específicamente el botón de anular tarjeta si el status no está entre 3 y 10
        const btnAnularTarjeta = document.querySelector('.dt-btn-anular-tarjeta');
        if (btnAnularTarjeta) {
            btnAnularTarjeta.setAttribute('disabled', 'disabled');
            btnAnularTarjeta.style.pointerEvents = 'none';
            btnAnularTarjeta.title = 'Solo se puede anular cuando el estado es "En Proceso"';
        }

        // Deshabilitar botón Guardar
        const btnGuardar = document.getElementById('btnGuardar');
        if (btnGuardar) {
            btnGuardar.setAttribute('disabled', 'disabled');
            btnGuardar.title = 'Solo se puede guardar cuando el estado es "En Proceso"';
        }

        // NOTA: Botón Agregar Observación siempre está habilitado (sin importar el estado)

        // Deshabilitar botón Imprimir
        const btnImprimir = document.getElementById('btnImprimir');
        if (btnImprimir) {
            btnImprimir.setAttribute('disabled', 'disabled');
            btnImprimir.title = 'Solo se puede imprimir cuando el estado es "En Proceso"';
        }

        // Deshabilitar botón Completar
        const btnCompletar = document.getElementById('btnCompletar');
        if (btnCompletar) {
            btnCompletar.setAttribute('disabled', 'disabled');
            btnCompletar.title = 'Solo se puede completar cuando el estado es "En Proceso"';
        }

        // Deshabilitar botón Agregar Pesaje
        const btnAgregarPesaje = document.getElementById('btnAgregarPesaje');
        if (btnAgregarPesaje) {
            btnAgregarPesaje.setAttribute('disabled', 'disabled');
            btnAgregarPesaje.title = 'Solo se puede agregar pesaje cuando el estado es "En Proceso"';
        }
    } else {
        console.log('Transacción en estado 11 - Edición habilitada');
    }
}

// ==========================================
// VALIDACIÓN ESPECÍFICA BOTÓN ANULAR TARJETA
// ==========================================
function validarBotonAnularTarjeta() {
    const currentStatus = parseInt(document.getElementById('hdnCurrentStatus')?.value || '0');
    const botonesAnularTarjeta = document.querySelectorAll('.dt-btn-anular-tarjeta');

    console.log('Validando botón anular tarjeta - Status:', currentStatus);

    // El botón de anular tarjeta solo está habilitado si el status está entre 3 y 10
    if (currentStatus < 3 || currentStatus > 10) {
        console.log('Status fuera del rango 3-10 - Deshabilitando botón anular tarjeta');

        botonesAnularTarjeta.forEach(btn => {
            btn.setAttribute('disabled', 'disabled');
            btn.style.pointerEvents = 'none';
            btn.title = 'Solo se puede modificar la tarjeta cuando el estado está entre 3 y 10';
        });
    } else {
        console.log('Status en rango 3-10 - Botón anular tarjeta habilitado');

        botonesAnularTarjeta.forEach(btn => {
            btn.removeAttribute('disabled');
            btn.style.opacity = '';
            btn.style.cursor = '';
            btn.style.pointerEvents = 'auto';
            btn.title = 'Modificar tarjeta magnética';
        });
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
                    campo.title = 'Marchamo guardado - use Anular para quitarlo';
                } else {
                    // Marchamo vacío: permitir edición para agregar nuevo
                    campo.removeAttribute('readonly');
                    campo.removeAttribute('disabled');
                    campo.style.backgroundColor = '';
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
                btn.style.opacity = '';
                btn.style.cursor = '';
                btn.style.pointerEvents = 'auto';
                btn.title = 'Anular este marchamo';
            } else if (input && input.id.includes('Marchamo') && !input.value) {
                btn.style.display = 'none';
            }
            // SIEMPRE mostrar botón anular para comprobante si tiene valor
            if (input && input.id === 'txtComprobante' && input.value) {
                btn.removeAttribute('disabled');
                btn.style.display = 'inline-block';
                btn.style.opacity = '';
                btn.style.cursor = '';
                btn.style.pointerEvents = 'auto';
                btn.title = 'Anular este comprobante';
            }
        });

        // HABILITAR botón Guardar (para permitir guardar nuevos marchamos)
        const btnGuardar = document.getElementById('btnGuardar');
        if (btnGuardar) {
            btnGuardar.removeAttribute('disabled');
            btnGuardar.title = 'Guardar cambios en marchamos';
            console.log('Botón Guardar HABILITADO (permitir agregar nuevos marchamos)');
        }

        // HABILITAR botón Imprimir (permitir reimprimir después de cambios en marchamos)
        const btnImprimir = document.getElementById('btnImprimir');
        if (btnImprimir) {
            btnImprimir.removeAttribute('disabled');
            btnImprimir.title = 'Reimprimir comprobante';
            console.log('Botón Imprimir HABILITADO (permitir reimprimir)');
        }

        // HABILITAR botón Completar (ya que el comprobante fue impreso)
        const btnCompletar = document.getElementById('btnCompletar');
        if (btnCompletar) {
            btnCompletar.removeAttribute('disabled');
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
                    btn.style.opacity = '';
                    btn.style.cursor = '';
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
                    btn.style.opacity = '';
                    btn.style.cursor = '';
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
            btnGuardar.title = 'Guardar datos';
            console.log('Botón Guardar HABILITADO (comprobante no impreso o anulado)');
        }

        // CONTROLAR ESTADO DE BOTONES IMPRIMIR Y COMPLETAR (solo si status es 11)
        const btnImprimir = document.getElementById('btnImprimir');
        const btnCompletar = document.getElementById('btnCompletar');

        // Verificar si tiene los 4 marchamos ingresados (para productos de azúcar)
        const tieneTodosLosMarchamos = () => {
            const marchamo1 = document.getElementById('txtMarchamo1')?.value?.trim() || '';
            const marchamo2 = document.getElementById('txtMarchamo2')?.value?.trim() || '';
            const marchamo3 = document.getElementById('txtMarchamo3')?.value?.trim() || '';
            const marchamo4 = document.getElementById('txtMarchamo4')?.value?.trim() || '';

            // Para azúcar, deben estar los 4 marchamos completos
            return marchamo1 !== '' && marchamo2 !== '' && marchamo3 !== '' && marchamo4 !== '';
        };

        // Verificar si tiene al menos el marchamo1 (para melaza con ingenios específicos)
        const tieneAlMenosUnMarchamo = () => {
            const marchamo1 = document.getElementById('txtMarchamo1')?.value?.trim() || '';
            return marchamo1 !== '';
        };

        // Verificar si es producto de azúcar
        const esAzucar = esProductoAzucar();

        // Verificar si es melaza con ingenio CASSA o ICHP
        const esMelazaConIngenioEspecifico = () => {
            const producto = document.getElementById('hdnProducto')?.value || '';
            const ingenioCode = document.getElementById('hdnIngenioCode')?.value || '';
            const esMelaza = producto.toUpperCase().includes('MELAZA');
            const esIngenioEspecifico = ingenioCode === 'CASSA' || ingenioCode === 'ICHP';
            return esMelaza && esIngenioEspecifico;
        };

        const hasTodosLosMarchamos = tieneTodosLosMarchamos();
        const hasAlMenosUnMarchamo = tieneAlMenosUnMarchamo();
        const esMelazaEspecial = esMelazaConIngenioEspecifico();

        // BOTÓN IMPRIMIR: habilitado si tiene comprobante asignado Y no ha sido impreso
        // Y si es azúcar, debe tener los 4 marchamos ingresados
        // Y si es melaza con ingenio CASSA o ICHP, debe tener al menos marchamo1
        if (tieneComprobante && !comprobanteImpreso) {
            // Validación adicional para azúcar: debe tener los 4 marchamos
            if (esAzucar && !hasTodosLosMarchamos) {
                if (btnImprimir) {
                    btnImprimir.setAttribute('disabled', 'disabled');
                    btnImprimir.title = 'Debe ingresar los 4 marchamos antes de imprimir (producto de azúcar)';
                }
                // Validación adicional para melaza con ingenio CASSA o ICHP: debe tener al menos marchamo1
            } else if (esMelazaEspecial && !hasAlMenosUnMarchamo) {
                if (btnImprimir) {
                    btnImprimir.setAttribute('disabled', 'disabled');
                    btnImprimir.title = 'Debe ingresar al menos el marchamo 1 antes de imprimir (producto de melaza para ingenio CASSA o ICHP)';
                }
            } else {
                if (btnImprimir) {
                    btnImprimir.removeAttribute('disabled');
                    btnImprimir.title = 'Imprimir comprobante';
                }
            }
        } else {
            if (btnImprimir) {
                btnImprimir.setAttribute('disabled', 'disabled');
                btnImprimir.title = comprobanteImpreso ? 'El comprobante ya fue impreso' : 'Debe guardar los datos antes de imprimir';
            }
        }

        // BOTÓN COMPLETAR: habilitado SOLO si el comprobante fue impreso
        if (comprobanteImpreso) {
            if (btnCompletar) {
                btnCompletar.removeAttribute('disabled');
                btnCompletar.title = 'Completar transacción';
            }
        } else {
            if (btnCompletar) {
                btnCompletar.setAttribute('disabled', 'disabled');
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
        // FORZAR readonly y disabled (CSS maneja el estilo visual)
        campoComprobante.setAttribute('readonly', 'readonly');
        campoComprobante.setAttribute('disabled', 'disabled');
        campoComprobante.style.pointerEvents = 'none';
        campoComprobante.title = 'El comprobante es generado automáticamente y no puede editarse';

        // Prevenir cualquier intento de edición con eventos
        campoComprobante.addEventListener('keydown', function (e) {
            e.preventDefault();
            return false;
        });

        campoComprobante.addEventListener('keypress', function (e) {
            e.preventDefault();
            return false;
        });

        campoComprobante.addEventListener('paste', function (e) {
            e.preventDefault();
            return false;
        });

        campoComprobante.addEventListener('input', function (e) {
            e.preventDefault();
            return false;
        });

        campoComprobante.addEventListener('change', function (e) {
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
                campo.title = 'No tiene permisos para editar este campo';
            }
        });

        // Deshabilitar botones de anular marchamos
        const botonesAnular = document.querySelectorAll('.dt-btn-anular');
        botonesAnular.forEach(btn => {
            btn.setAttribute('disabled', 'disabled');
            btn.title = 'No tiene permisos para esta acción';
        });

        // Deshabilitar botón guardar
        const btnGuardar = document.getElementById('btnGuardar');
        if (btnGuardar) {
            btnGuardar.setAttribute('disabled', 'disabled');
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
            $(target).on('show.bs.collapse', function () {
                header.classList.remove('collapsed');
            });

            $(target).on('hide.bs.collapse', function () {
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
        btnGuardar.addEventListener('keydown', function (e) {
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

    // Contador de caracteres para Observaciones
    const txtObservaciones = document.getElementById('txtObservaciones');
    const charCount = document.getElementById('charCount');
    if (txtObservaciones && charCount) {
        txtObservaciones.addEventListener('input', function () {
            charCount.textContent = this.value.length;
        });
    }

    // Botón Imprimir
    const btnImprimir = document.getElementById('btnImprimir');
    if (btnImprimir) {
        btnImprimir.addEventListener('click', function () {
            const codeGen = document.getElementById('hdnCodeGen')?.value;
            if (codeGen) {
                try {
                    imprimirComprobanteSinModal(codeGen);
                } catch (error) {
                    console.error('Error al imprimir:', error);
                    Swal.fire({
                        icon: 'info',
                        title: 'Información',
                        text: 'No se pudo generar el comprobante. Por favor intente nuevamente.',
                        confirmButtonColor: '#182A6E',
                        confirmButtonText: 'Aceptar'
                    });
                }
            }
        });
    }

    // Botón Cerrar (antes Cancelar)
    const btnCerrar = document.getElementById('btnCerrar');
    if (btnCerrar && typeof cancelarTransaccion === 'function') {
        btnCerrar.addEventListener('click', cancelarTransaccion);
    }

    // Botón Cerrar en Banner
    const btnCerrarBanner = document.getElementById('btnCerrarBanner');
    if (btnCerrarBanner && typeof cancelarTransaccion === 'function') {
        btnCerrarBanner.addEventListener('click', cancelarTransaccion);
    }

    // Botón Agregar Pesaje
    const btnAgregarPesaje = document.getElementById('btnAgregarPesaje');
    if (btnAgregarPesaje && typeof nuevoPesaje === 'function') {
        btnAgregarPesaje.addEventListener('click', nuevoPesaje);
    }

    // Botón Completar
    const btnCompletar = document.getElementById('btnCompletar');
    if (btnCompletar) {
        btnCompletar.addEventListener('click', function () {
            const codeGen = document.getElementById('hdnCodeGen')?.value;
            if (codeGen) {
                completarTransaccion(codeGen);
            }
        });
    }


    // Botón Agregar Observación
    const btnAgregarObservacion = document.getElementById('btnAgregarObservacion');
    if (btnAgregarObservacion) {
        btnAgregarObservacion.addEventListener('click', function (e) {
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
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            const input = this.previousElementSibling || this.parentElement.querySelector('input');
            if (input) {
                const inputId = input.id;
                if (inputId.includes('Marchamo')) {
                    abrirModalAnularMarchamo(inputId);
                } else if (inputId === 'txtComprobante') {
                    abrirModalAnularComprobante();
                } else if (inputId === 'txtTarjeta') {
                    abrirModalModificarTarjeta();
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

    // Confirmar Modificar Tarjeta
    const btnConfirmarModificarTarjeta = document.getElementById('btnConfirmarModificarTarjeta');
    if (btnConfirmarModificarTarjeta) {
        btnConfirmarModificarTarjeta.addEventListener('click', confirmarModificarTarjeta);
    }
}

// ==========================================
// ACCIONES PRINCIPALES
// ==========================================
function guardarTransaccion() {
    // Prevenir doble clic
    if (__guardandoEnProceso) {
        console.log('Guardado ya en proceso, ignorando clic duplicado');
        return;
    }

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

    // Validar almacén obligatorio para producto melaza
    if (!validarAlmacenObligatorio()) {
        Swal.fire({
            icon: 'info',
            title: 'Almacén requerido',
            text: 'Debe seleccionar un almacén antes de guardar.',
            confirmButtonColor: '#182A6E',
            confirmButtonText: 'Aceptar'
        });
        // Enfocar el campo de almacén
        const ddlAlmacen = document.getElementById('ddlAlmacen');
        if (ddlAlmacen) {
            ddlAlmacen.focus();
        }
        return;
    }

    // Validar marchamos según el tipo de producto
    if (!validarMarchamosCompletos()) {
        Swal.fire({
            icon: 'info',
            title: 'Marchamos requeridos',
            text: 'Debe completar esta información antes de guardar.',
            confirmButtonColor: '#182A6E',
            confirmButtonText: 'Aceptar'
        });

        // Enfocar el primer marchamo vacío
        const marchamo1 = document.getElementById('txtMarchamo1')?.value?.trim() || '';

        if (!marchamo1) {
            document.getElementById('txtMarchamo1')?.focus();
        } else if (esAzucar) {
            // Solo para azúcar verificar los otros marchamos
            const marchamo2 = document.getElementById('txtMarchamo2')?.value?.trim() || '';
            const marchamo3 = document.getElementById('txtMarchamo3')?.value?.trim() || '';
            const marchamo4 = document.getElementById('txtMarchamo4')?.value?.trim() || '';

            if (!marchamo2) {
                document.getElementById('txtMarchamo2')?.focus();
            } else if (!marchamo3) {
                document.getElementById('txtMarchamo3')?.focus();
            } else if (!marchamo4) {
                document.getElementById('txtMarchamo4')?.focus();
            }
        }
        return;
    }

    // Verificar si tiene comprobante asignado
    const tieneComprobante = document.getElementById('hdnTieneComprobante')?.value === 'true';

    // Verificar si hay marchamos nuevos para enviar
    const marchamo1 = document.getElementById('txtMarchamo1')?.value?.trim() || '';
    const marchamo2 = document.getElementById('txtMarchamo2')?.value?.trim() || '';
    const marchamo3 = document.getElementById('txtMarchamo3')?.value?.trim() || '';
    const marchamo4 = document.getElementById('txtMarchamo4')?.value?.trim() || '';
    const hayMarchamosNuevos = marchamo1 || marchamo2 || marchamo3 || marchamo4;

    // Verificar si hay cambios en el almacén (para MELAZA)
    const hiddenAlmacenId = document.getElementById('hdnAlmacenId');
    const almacenActual = hiddenAlmacenId ? hiddenAlmacenId.value : '';
    const almacenOriginal = document.getElementById('hdnWarehouseId')?.value || '';
    const hayCambioAlmacen = almacenActual !== almacenOriginal;

    // Verificar si hay cambios en observaciones
    const observacionesActual = document.getElementById('txtObservaciones')?.value?.trim() || '';
    const observacionesOriginal = valoresOriginales.observaciones || '';
    const hayCambioObservaciones = observacionesActual !== observacionesOriginal;

    // Si ya tiene comprobante Y no hay marchamos nuevos Y no hay cambios en almacén Y no hay cambios en observaciones, no hacer petición
    if (tieneComprobante && !hayMarchamosNuevos && !hayCambioAlmacen && !hayCambioObservaciones) {
        Swal.fire({
            icon: 'success',
            title: 'Actualizado',
            text: 'Los datos se actualizaron correctamente.',
            confirmButtonColor: '#182A6E',
            confirmButtonText: 'Aceptar',
            timer: 1500,
            showConfirmButton: false
        });
        return;
    }

    const datos = recopilarDatos();

    // Guardar directamente sin confirmación adicional (reducir alertas)
    guardarTransaccionAPI(datos);
}

function guardarTransaccionAPI(datos) {
    console.log('Guardando transacción:', datos);

    __guardandoEnProceso = true;

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
        .then(response => {
            if (!response.ok) {
                throw new Error(`Error del servidor: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            Swal.close();

            if (data.success) {
                // Actualizar valores originales después de guardar exitosamente
                guardarValoresOriginales();

                // Verificar si se guardó sin comprobante
                const comprobanteGuardado = datos.comprobante && datos.comprobante !== '';
                const tieneComprobante = document.getElementById('hdnTieneComprobante')?.value === 'true';

                // Si no se guardó comprobante y no lo tiene asignado, mostrar advertencia
                if (!comprobanteGuardado && !tieneComprobante) {
                    Swal.fire({
                        icon: 'warning',
                        title: 'Atención',
                        html: 'Actualmente no hay comprobantes disponibles para esta báscula. Comuníquese con el auditor para solicitar la asignación de nuevos comprobantes.',
                        confirmButtonColor: '#182A6E',
                        confirmButtonText: 'Entendido',
                        allowOutsideClick: false
                    }).then(() => {
                        const codeGen = document.getElementById('hdnCodeGen')?.value;
                        if (codeGen) {
                            recargarDetalleTransaccion(codeGen);
                        } else {
                            __guardandoEnProceso = false;
                        }
                    });
                } else {
                    Swal.fire({
                        icon: 'success',
                        title: 'Guardado',
                        text: 'Los datos se guardaron correctamente.',
                        confirmButtonColor: '#182A6E',
                        confirmButtonText: 'Aceptar',
                        timer: 1500,
                        showConfirmButton: false
                    }).then(() => {
                        const codeGen = document.getElementById('hdnCodeGen')?.value;
                        if (codeGen) {
                            recargarDetalleTransaccion(codeGen);
                        } else {
                            __guardandoEnProceso = false;
                        }
                    });
                }
            } else {
                __guardandoEnProceso = false;
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
            __guardandoEnProceso = false;
            Swal.close();
            console.error('Error:', error);
            Swal.fire({
                icon: 'info',
                title: 'Información',
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
    // Prevenir doble clic en imprimir
    if (__imprimiendoEnProceso) {
        console.log('Impresión ya en proceso, ignorando clic duplicado');
        return;
    }
    __imprimiendoEnProceso = true;

    // Generar directamente el comprobante en nueva ventana
    if (typeof generarComprobanteHTML === 'function') {
        generarComprobanteHTML(codeGen);
    } else {
        __imprimiendoEnProceso = false;
        console.error('Función generarComprobanteHTML no encontrada');
        Swal.fire({
            icon: 'info',
            title: 'Información',
            text: 'No se pudo generar el comprobante.',
            confirmButtonColor: '#182A6E',
            confirmButtonText: 'Aceptar'
        });
    }
}

// Función legacy (ya no se usa)
function mostrarModalImpresionPersonalizado(codeGen) {
    // Deprecated - usar imprimirComprobanteSinModal directamente
}

// Función legacy (ya no se usa)
function generarComprobanteEnNuevaVentana(codeGen) {
    // Deprecated - usar imprimirComprobanteSinModal directamente
}

// Función original legacy (ya no se usa)
function imprimirComprobanteSinModalOld(codeGen) {
    // Deprecated
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
        .then(response => {
            if (!response.ok) {
                throw new Error(`Error del servidor: ${response.status}`);
            }
            return response.json();
        })
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
                    __imprimiendoEnProceso = false;
                    const cg = document.getElementById('hdnCodeGen')?.value;
                    if (cg) {
                        recargarDetalleTransaccion(cg);
                    } else {
                        // Sin codeGen no se puede recargar via POST, redirigir a lista
                        window.location.href = '/ListaTransacciones';
                    }
                }, 2000);
            } else {
                __imprimiendoEnProceso = false;
                console.error('Error al registrar impresión:', data.message);

                // Mostrar notificación de error
                Swal.fire({
                    icon: 'info',
                    title: 'Información',
                    text: 'No se pudo registrar la impresión.',
                    confirmButtonColor: '#182A6E',
                    confirmButtonText: 'Aceptar',
                    timer: 2000,
                    showConfirmButton: false
                });
            }
        })
        .catch(error => {
            __imprimiendoEnProceso = false;
            console.error('Error al registrar impresión:', error);

            // Mostrar notificación de error de conexión
            Swal.fire({
                icon: 'info',
                title: 'Información',
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
    setTimeout(function () {
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
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Error del servidor: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    console.log('Impresión registrada correctamente en el API');
                } else {
                    console.error('Error al registrar impresión:', data.message);
                }
                // Recargar la página usando POST para preservar el codeGen en sesión
                __imprimiendoEnProceso = false;
                recargarDetalleTransaccion(codeGen);
            })
            .catch(error => {
                console.error('Error al registrar impresión:', error);
                // Recargar la página usando POST para preservar el codeGen en sesión
                __imprimiendoEnProceso = false;
                recargarDetalleTransaccion(codeGen);
            });
    }, 300);
}

// Función para cancelar la impresión si el usuario presionó Cancelar
function cancelarImpresion(codeGen) {
    console.log('Impresión cancelada - No se registra');
    // Simplemente no hacer nada - no registrar la impresión
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
    // FECHA DE ENTRADA: Fecha del status 7
    const fechaEntraRaw = document.getElementById('hdnFechaEntra')?.value || '-';
    const fechaEntraFormateada = formatearFechaImpresion(fechaEntraRaw);

    // FECHA DE SALIDA: Fecha del status 11
    const fechaSaleRaw = document.getElementById('hdnFechaSale')?.value || '-';
    const fechaSaleFormateada = formatearFechaImpresion(fechaSaleRaw);

    // Función para formatear pesos: quitar .00 y mantener valor original
    function formatearPeso(pesoStr) {
        if (!pesoStr || pesoStr === '-' || pesoStr === '' || pesoStr === 'undefined') return '0';

        // Limpiar el string: quitar espacios y texto extra
        let pesoLimpio = pesoStr.toString().trim();

        // Si contiene "Kgs" u otro texto, extraerlo primero
        pesoLimpio = pesoLimpio.replace(/kgs?/gi, '').trim();

        // Quitar comas de separadores de miles (ej: 28,015.00 -> 28015.00)
        pesoLimpio = pesoLimpio.replace(/,/g, '');

        // Ahora solo dejar dígitos, punto decimal y signo negativo
        pesoLimpio = pesoLimpio.replace(/[^\d.-]/g, '');

        const peso = parseFloat(pesoLimpio);
        if (isNaN(peso) || peso === 0) return '0';

        // Si tiene decimales, mantenerlos; si no, quitar el .00
        let formattedPeso = peso % 1 === 0 ? Math.round(peso).toString() : peso.toFixed(2);

        // Agregar separador de miles (coma) a números >= 1000
        formattedPeso = formattedPeso.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

        return formattedPeso;
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

        // Control de Pesaje - Almapac
        // Neto: Consolidado total
        // Bruto y Tara: Del pesaje 1
        pesoBrutoAlmapac: (() => {
            try {
                const pesajesData = JSON.parse(document.getElementById('pesajes-data')?.textContent || '[]');
                const pesaje1 = pesajesData.find(p => p.numero === 1);
                return formatearPeso(pesaje1?.bruto?.pesoAlmapac || '0');
            } catch (e) {
                console.error('Error al obtener peso bruto:', e);
                return '0';
            }
        })(),
        pesoNetoAlmapac: (() => {
            try {
                const consolidadoData = JSON.parse(document.getElementById('consolidado-data')?.textContent || '{"total":0}');
                const pesoNetoValue = consolidadoData.total || '0';
                console.log('Peso Neto Consolidado RAW:', pesoNetoValue);
                const formatted = formatearPeso(pesoNetoValue);
                console.log('Peso Neto Consolidado FORMATEADO:', formatted);
                return formatted;
            } catch (e) {
                console.error('Error al obtener peso neto consolidado:', e);
                return '0';
            }
        })(),
        pesoTaraAlmapac: (() => {
            try {
                const pesajesData = JSON.parse(document.getElementById('pesajes-data')?.textContent || '[]');
                // Tomar el último pesaje (el de mayor número)
                const ultimoPesaje = pesajesData.reduce((max, p) => (p.numero > (max?.numero || 0) ? p : max), null);
                return formatearPeso(ultimoPesaje?.tara?.pesoAlmapac || '0');
            } catch (e) {
                console.error('Error al obtener peso tara:', e);
                return '0';
            }
        })(),

        // Control de Despacho - Humedad convertida a porcentaje (0.10 → 10%)
        humedad: (() => {
            const val = parseFloat(document.getElementById('txtHumedad')?.value || '0');
            return val > 0 ? (val * 100).toFixed(0) + '%' : '0%';
        })(),
        comprobante: document.getElementById('txtComprobante')?.value || '-',
        pesador: document.getElementById('hdnNombreUsuario')?.value || '-',

        // Marchamos (separados por /)
        marchamos: [
            document.getElementById('txtMarchamo1')?.value,
            document.getElementById('txtMarchamo2')?.value,
            document.getElementById('txtMarchamo3')?.value,
            document.getElementById('txtMarchamo4')?.value
        ].filter(m => m && m.trim() !== '').join('/') || '-',

        // Observaciones
        observaciones: document.getElementById('txtObservaciones')?.value || ' ',

        // Fechas para impresión
        fechaEntra: fechaEntraFormateada,
        pesoIn: formatearPeso(document.getElementById('hdnPesoIn')?.value),
        fechaSale: fechaSaleFormateada  // Fecha/hora actual del momento de generación
    };

    // Crear iframe oculto para impresión (evita problemas con ventanas en Firefox)
    let printFrame = document.getElementById('printFrame');
    if (printFrame) {
        printFrame.remove();
    }

    printFrame = document.createElement('iframe');
    printFrame.id = 'printFrame';
    printFrame.style.position = 'absolute';
    printFrame.style.top = '-10000px';
    printFrame.style.left = '-10000px';
    printFrame.style.width = '0';
    printFrame.style.height = '0';
    printFrame.style.border = 'none';
    document.body.appendChild(printFrame);

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
                    font-family: 'Calibri', Arial, sans-serif;
                    font-size: 11pt;
                    font-weight: 500;
                    background: white;
                    color: #000000;
                    position: relative;
                    text-transform: uppercase;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
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
                    font-weight: 500;
                    line-height: 1.2;
                }

                /* Margen izquierdo solo para los valores (columna derecha) */
                .campo[style*="left: 5.3cm"] {
                    padding-left: 0.2cm;
                }

                .campo-oculto {
                    position: absolute;
                    font-size: 11pt;
                    font-weight: 500;
                    line-height: 1.2;
                    color: transparent !important;
                }

                .pesos-columna {
                    position: absolute;
                    text-align: right;
                    font-size: 11pt;
                    font-weight: 500;
                    width: 3cm;
                }

                .campo-observaciones {
                    position: absolute;
                    font-size: 11pt;
                    font-weight: 500;
                    line-height: 1.2;
                    width: 14cm;
                    word-wrap: break-word;
                    white-space: normal;
                    word-break: break-word;
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
            </style>
        </head>
        <body>
            <div class="comprobante">
                <!-- NÚMERO DE COMPROBANTE - Esquina superior derecha -->
                <div class="campo" style="top: 2.1cm; right: 3.5cm;">${datos.comprobante}</div>

                <!-- ENTRADA - Label (OCULTO - ya está en la hoja pre-impresa) -->
                <div class="campo-oculto" style="top: 3.2cm; left: 0.7cm;">ENTRADA:</div>
                <!-- ENTRADA - Value (formato fecha hora) -->
                <div class="campo" style="top: 3.2cm; left: 5.3cm;">${datos.fechaEntra}</div>

                <!-- INGENIO - Label (OCULTO - ya está en la hoja pre-impresa) -->
                <div class="campo-oculto" style="top: 3.7cm; left: 0.7cm;">INGENIO:</div>
                <!-- INGENIO - Value -->
                <div class="campo" style="top: 3.7cm; left: 5.3cm;">${datos.cliente}</div>

                <!-- TRANSPORTE - Label (OCULTO - ya está en la hoja pre-impresa) -->
                <div class="campo-oculto" style="top: 4.5cm; left: 0.7cm;">TRANSPORTE:</div>
                <!-- TRANSPORTE - Value -->
                <div class="campo" style="top: 4.5cm; left: 5.3cm;">${datos.transportista}</div>

                <!-- MOTORISTA - Label (OCULTO - ya está en la hoja pre-impresa) -->
                <div class="campo-oculto" style="top: 5cm; left: 0.7cm;">MOTORISTA:</div>
                <!-- MOTORISTA - Value -->
                <div class="campo" style="top: 5cm; left: 5.3cm;">${datos.motorista}</div>

                <!-- PLACAS - Label (OCULTO - ya está en la hoja pre-impresa) -->
                <div class="campo-oculto" style="top: 5.5cm; left: 0.7cm;">PLACAS:</div>
                <!-- PLACAS - Value -->
                <div class="campo" style="top: 5.5cm; left: 5.3cm;">${datos.camion}/${datos.remolque}</div>

                <!-- SALIDA - Label (OCULTO - ya está en la hoja pre-impresa) -->
                <div class="campo-oculto" style="top: 6.9cm; left: 0.7cm;">SALIDA:</div>
                <!-- SALIDA - Value (formato fecha hora) -->
                <div class="campo" style="top: 6.9cm; left: 5.3cm;">${datos.fechaSale}</div>

                <!-- PESO BRUTO (al final límite derecho) -->
                <div class="pesos-columna" style="top: 6.9cm; right: 3.5cm;">${datos.pesoBrutoAlmapac} Kgs</div>

                <!-- Label vacío para alineación -->
                <div class="campo-oculto" style="top: 7.35cm; left: 0.7cm;"></div>
                <!-- PESO TARA - Value (columna central) -->
                <div class="campo" style="top: 7.35cm; left: 5.3cm;"></div>
                <!-- PESO TARA (al final límite derecho) -->
                <div class="pesos-columna" style="top: 7.35cm; right: 3.5cm;">${datos.pesoTaraAlmapac} Kgs</div>

                <!-- PRODUCTO - Label (OCULTO - ya está en la hoja pre-impresa) -->
                <div class="campo-oculto" style="top: 7.8cm; left: 0.7cm;">PRODUCTO:</div>
                <!-- PRODUCTO - Value -->
                <div class="campo" style="top: 7.8cm; left: 5.3cm;">${datos.producto}</div>
                <!-- PESO NETO (al final límite derecho) -->
                <div class="pesos-columna" style="top: 7.8cm; right: 3.5cm;">${datos.pesoNetoAlmapac} Kgs</div>

                <!-- TRANSACCIÓN - Label (OCULTO - ya está en la hoja pre-impresa) -->
                <div class="campo-oculto" style="top: 9.5cm; left: 0.7cm;">TRANSACCION:</div>
                <!-- TRANSACCIÓN - Value -->
                <div class="campo" style="top: 9.5cm; left: 5.3cm;">${datos.transaccion}</div>
                <!-- PESADOR - Label y Value (al final de la fila de TRANSACCIÓN) -->
                <div class="campo" style="top: 9.5cm; right: 3.5cm;">PESADOR: ${datos.pesador}</div>

                <!-- HUMEDAD - Label (OCULTO - ya está en la hoja pre-impresa) -->
                <div class="campo-oculto" style="top: 9.95cm; left: 0.7cm;">HUMEDAD</div>
                <!-- HUMEDAD - Value -->
                <div class="campo" style="top: 9.95cm; left: 5.3cm;">${datos.humedad}</div>

                <!-- ENVÍO CLIENTE (NR) - Label (VISIBLE - no está en la hoja pre-impresa) -->
                <div class="campo" style="top: 10.9cm; left: 1.0cm;">ENVIO CLIENTE(NR)</div>
                <!-- ENVÍO CLIENTE (NR) - Value -->
                <div class="campo" style="top: 10.9cm; left: 5.3cm;">${datos.codigoGeneracion}</div>

                <!-- LICENCIA - Label (VISIBLE - no está en la hoja pre-impresa) -->
                <div class="campo" style="top: 11.5cm; left: 1.0cm;">LICENCIA</div>
                <!-- LICENCIA - Value -->
                <div class="campo" style="top: 11.5cm; left: 5.3cm;">${datos.licencia}</div>

                <!-- MARCHAMOS - Label (VISIBLE - no está en la hoja pre-impresa) -->
                <div class="campo" style="top: 12.1cm; left: 1.0cm;">MARCHAMOS</div>
                <!-- MARCHAMOS - Value -->
                <div class="campo" style="top: 12.1cm; left: 5.3cm;">${datos.marchamos}</div>

                <!-- OBSERVACIONES - Sin Label, abarcan ancho completo -->
                <div class="campo-observaciones" style="top: 14.1cm; left: 1.0cm;">${datos.observaciones}</div>
            </div>
        </body>
        </html>
    `;

    // Función que ejecuta la impresión (se llama una sola vez)
    let __impresionEjecutada = false;
    function ejecutarImpresion() {
        if (__impresionEjecutada) return;
        __impresionEjecutada = true;

        setTimeout(function () {
            try {
                printFrame.contentWindow.focus();
                printFrame.contentWindow.print();
            } catch (e) {
                try {
                    printFrame.contentWindow.print();
                } catch (e2) {
                    console.error('No se pudo imprimir:', e2);
                }
            }

            // Registrar impresión después de imprimir
            setTimeout(function () {
                registrarImpresionAutomatica(codeGen);
                // Limpiar iframe después de un tiempo
                setTimeout(function () {
                    if (printFrame && printFrame.parentNode) {
                        printFrame.parentNode.removeChild(printFrame);
                    }
                }, 1000);
            }, 500);
        }, 300);
    }

    // Asignar onload ANTES de escribir contenido para no perder el evento
    printFrame.onload = ejecutarImpresion;

    // Escribir contenido en el iframe
    const frameDoc = printFrame.contentWindow || printFrame.contentDocument;
    const doc = frameDoc.document || frameDoc;
    doc.open();
    doc.write(htmlContent);
    doc.close();

    // Respaldo: si onload no se dispara después de 2 segundos, ejecutar de todas formas
    setTimeout(function () {
        if (!__impresionEjecutada) {
            console.warn('onload del iframe no se disparó, ejecutando impresión por respaldo');
            ejecutarImpresion();
        }
    }, 2000);
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
    // Fallback: si no viene codeGen, intentar desde sessionStorage
    if (!codeGen) codeGen = sessionStorage.getItem('dt_codeGen');
    if (!codeGen) { window.location.href = '/ListaTransacciones'; return; }

    // Guardar posición de scroll antes de recargar
    guardarPosicionScroll();

    // Guardar valores temporales de campos no guardados (marchamos y humedad)
    guardarValoresTemporales();

    // Obtener la actividad actual
    const actividadElement = document.querySelector('.dt-breadcrumb-item.active');
    const actividad = actividadElement ? actividadElement.textContent.trim()
        : (sessionStorage.getItem('dt_actividad') || 'Detalle de Transacción');

    // Crear formulario para hacer POST al mismo endpoint
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/DetalleTransaccion';

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

// ==========================================
// PRESERVACIÓN DE VALORES TEMPORALES
// ==========================================
function guardarValoresTemporales() {
    try {
        const codeGen = document.getElementById('hdnCodeGen')?.value;
        if (!codeGen) return;

        const valoresTemporales = {
            marchamo1: document.getElementById('txtMarchamo1')?.value || '',
            marchamo2: document.getElementById('txtMarchamo2')?.value || '',
            marchamo3: document.getElementById('txtMarchamo3')?.value || '',
            marchamo4: document.getElementById('txtMarchamo4')?.value || '',
            humedad: document.getElementById('txtHumedad')?.value || '',
            timestamp: Date.now(),
            codeGen: codeGen
        };

        sessionStorage.setItem('detalleTransaccion_valores', JSON.stringify(valoresTemporales));
        console.log('Valores temporales guardados');
    } catch (e) {
        console.error('Error al guardar valores temporales:', e);
    }
}

// Bandera para indicar si el cierre es intencional
let cierreIntencional = false;

function configurarGuardadoAutomatico() {
    // Guardar valores temporales antes de cerrar o recargar la página
    window.addEventListener('beforeunload', function () {
        // Solo guardar si NO es un cierre intencional
        if (!cierreIntencional) {
            guardarValoresTemporales();
        }
    });
}

function restaurarValoresTemporales() {
    try {
        const savedData = sessionStorage.getItem('detalleTransaccion_valores');
        if (!savedData) return;

        const valoresTemporales = JSON.parse(savedData);
        const codeGenActual = document.getElementById('hdnCodeGen')?.value;

        // Solo restaurar si es la misma transacción y los datos son recientes (menos de 1 minuto)
        const ahora = Date.now();
        if (valoresTemporales.codeGen !== codeGenActual || ahora - valoresTemporales.timestamp >= 60000) {
            sessionStorage.removeItem('detalleTransaccion_valores');
            return;
        }

        // Verificar si hay un marchamo que fue anulado (no restaurarlo)
        const marchamoAnuladoId = sessionStorage.getItem('marchamoAnulado');

        // Restaurar valores solo si los campos están vacíos (no sobrescribir valores del servidor)
        const txtMarchamo1 = document.getElementById('txtMarchamo1');
        const txtMarchamo2 = document.getElementById('txtMarchamo2');
        const txtMarchamo3 = document.getElementById('txtMarchamo3');
        const txtMarchamo4 = document.getElementById('txtMarchamo4');
        const txtHumedad = document.getElementById('txtHumedad');

        // Restaurar marchamo1 solo si no fue el que se anuló
        if (txtMarchamo1 && !txtMarchamo1.value && valoresTemporales.marchamo1 && marchamoAnuladoId !== 'txtMarchamo1') {
            txtMarchamo1.value = valoresTemporales.marchamo1;
        }
        // Restaurar marchamo2 solo si no fue el que se anuló
        if (txtMarchamo2 && !txtMarchamo2.value && valoresTemporales.marchamo2 && marchamoAnuladoId !== 'txtMarchamo2') {
            txtMarchamo2.value = valoresTemporales.marchamo2;
        }
        // Restaurar marchamo3 solo si no fue el que se anuló
        if (txtMarchamo3 && !txtMarchamo3.value && valoresTemporales.marchamo3 && marchamoAnuladoId !== 'txtMarchamo3') {
            txtMarchamo3.value = valoresTemporales.marchamo3;
        }
        // Restaurar marchamo4 solo si no fue el que se anuló
        if (txtMarchamo4 && !txtMarchamo4.value && valoresTemporales.marchamo4 && marchamoAnuladoId !== 'txtMarchamo4') {
            txtMarchamo4.value = valoresTemporales.marchamo4;
        }
        if (txtHumedad && valoresTemporales.humedad) {
            // Para humedad, restaurar siempre si el valor guardado es diferente del valor actual
            const humedadActual = parseFloat(txtHumedad.value) || 0;
            const humedadGuardada = parseFloat(valoresTemporales.humedad) || 0;
            if (Math.abs(humedadActual - humedadGuardada) > 0.001) {
                txtHumedad.value = valoresTemporales.humedad;
            }
        }

        console.log('Valores temporales restaurados');

        // Limpiar datos guardados
        sessionStorage.removeItem('detalleTransaccion_valores');
        sessionStorage.removeItem('marchamoAnulado');

    } catch (e) {
        console.warn('No se pudo restaurar valores temporales:', e);
        try {
            sessionStorage.removeItem('detalleTransaccion_valores');
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
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Error del servidor: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                Swal.close();

                if (data.success) {
                    Swal.fire({
                        icon: 'success',
                        title: 'Completado',
                        text: data.message || 'Transacción completada correctamente',
                        confirmButtonColor: '#182A6E',
                        confirmButtonText: 'Aceptar',
                        timer: 2000,
                        showConfirmButton: false
                    }).then(() => {
                        // Regresar a lista de transacciones
                        window.location.href = '/ListaTransacciones';
                    });
                } else {
                    Swal.fire({
                        icon: 'info',
                        title: 'Información',
                        text: data.message || 'Error al completar la transacción',
                        confirmButtonColor: '#182A6E',
                        confirmButtonText: 'Aceptar'
                    });
                }
            })
            .catch(error => {
                console.error('Error:', error);
                Swal.fire({
                    icon: 'info',
                    title: 'Información',
                    text: 'Error de conexión con el servidor',
                    confirmButtonColor: '#182A6E',
                    confirmButtonText: 'Aceptar'
                });
            });
    });
}


function cancelarTransaccion() {
    // Marcar como cierre intencional para evitar que beforeunload guarde de nuevo
    cierreIntencional = true;

    // Limpiar datos temporales del sessionStorage al cerrar intencionalmente
    try {
        sessionStorage.removeItem('detalleTransaccion_valores');
        sessionStorage.removeItem('marchamoAnulado');
        sessionStorage.removeItem('detalleTransaccion_scroll');
    } catch (e) {
        console.error('Error al limpiar sessionStorage:', e);
    }

    // Regresar a lista de transacciones
    window.location.href = '/ListaTransacciones';
}

function nuevoPesaje() {
    const codeGen = document.getElementById('hdnCodeGen')?.value;

    if (!codeGen) {
        Swal.fire({
            icon: 'info',
            title: 'Información',
            text: 'No se pudo obtener el código de generación',
            confirmButtonColor: '#182A6E',
            confirmButtonText: 'Aceptar'
        });
        return;
    }

    Swal.fire({
        title: '¿Solicitar nuevo pesaje?',
        text: 'Se enviará la unidad a nuevo pesaje. ¿Desea continuar?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#182A6E',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Sí, solicitar',
        cancelButtonText: 'Cancelar'
    }).then((result) => {
        if (result.isConfirmed) {
            solicitarRepesaje(codeGen);
        }
    });
}

async function solicitarRepesaje(codeGen) {
    try {
        Swal.fire({
            title: 'Procesando...',
            text: 'Generando transacción',
            allowOutsideClick: false,
            didOpen: () => Swal.showLoading()
        });

        const response = await fetch('/DetalleTransaccion/SolicitarRepesaje', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ codeGen: codeGen })
        });

        if (!response.ok) {
            throw new Error(`Error del servidor: ${response.status}`);
        }

        const data = await response.json();

        if (data.success) {
            await Swal.fire({
                icon: 'success',
                title: 'Nuevo pesaje solicitado',
                text: data.message || 'La unidad ha sido enviada a nuevo pesaje',
                confirmButtonColor: '#182A6E',
                confirmButtonText: 'Aceptar'
            });

            // Recargar la página usando POST para preservar codeGen en sesión
            recargarDetalleTransaccion(codeGen);
        } else {
            Swal.fire({
                icon: 'info',
                title: 'Información',
                text: data.message || 'No se pudo solicitar el nuevo pesaje',
                confirmButtonColor: '#182A6E',
                confirmButtonText: 'Aceptar'
            });
        }
    } catch (error) {
        console.error('Error al solicitar repesaje:', error);
        Swal.fire({
            icon: 'info',
            title: 'Información',
            text: 'Ocurrió un error al solicitar el nuevo pesaje. Intente nuevamente más tarde.',
            confirmButtonColor: '#182A6E',
            confirmButtonText: 'Aceptar'
        });
    }
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
            confirmButtonColor: '#182A6E',
            confirmButtonText: 'Aceptar'

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
        .then(response => {
            if (!response.ok) {
                throw new Error(`Error del servidor: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                // Cerrar modal y limpiar
                $('#modalObservacion').modal('hide');
                txtObservacion.value = '';

                Swal.fire({
                    icon: 'success',
                    title: 'Agregado',
                    text: 'Observación agregada correctamente',
                    confirmButtonColor: '#182A6E',
                    confirmButtonText: 'Aceptar',
                    timer: 2000,
                    showConfirmButton: false
                }).then(() => {
                    // Recargar usando POST para preservar el codeGen en sesión
                    const cg = document.getElementById('hdnCodeGen')?.value;
                    if (cg) {
                        recargarDetalleTransaccion(cg);
                    }
                });
            } else {
                Swal.fire({
                    icon: 'info',
                    title: 'Información',
                    text: data.message || 'Error al agregar la observación',
                    confirmButtonColor: '#182A6E',
                    confirmButtonText: 'Aceptar'
                });
            }
        })
        .catch(error => {
            console.error('Error:', error);
            Swal.fire({
                icon: 'info',
                title: 'Información',
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
    document.getElementById('grpOtroMotivoMarchamo').style.display = 'none';

    // Event listener para mostrar/ocultar campo "Otro"
    const ddlMotivo = document.getElementById('ddlMotivoMarchamo');
    ddlMotivo.onchange = function () {
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
            document.getElementById('txtOtroMotivoMarchamo').focus();
            return;
        }
        motivo = otroMotivo; // Usar el motivo personalizado
    }

    if (!sealCode) {
        Swal.fire({
            icon: 'info',
            title: 'Información',
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
            motivo: motivo
        })
    })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Error del servidor: ${response.status}`);
            }
            return response.json();
        })
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
                    // Marcar el marchamo anulado para no restaurarlo
                    try {
                        sessionStorage.setItem('marchamoAnulado', inputId);
                    } catch (e) {
                        console.error('Error al guardar marchamo anulado:', e);
                    }

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
                icon: 'info',
                title: 'Información',
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
    document.getElementById('grpOtroMotivoComprobante').style.display = 'none';

    // Event listener para mostrar/ocultar campo "Otro"
    const ddlMotivo = document.getElementById('ddlMotivoComprobante');
    ddlMotivo.onchange = function () {
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
            motivo: motivo
        })
    })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Error del servidor: ${response.status}`);
            }
            return response.json();
        })
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
                icon: 'info',
                title: 'Información',
                text: 'Error de conexión con el servidor',
                confirmButtonColor: '#182A6E',
                confirmButtonText: 'Aceptar'
            });
        });
}

// ==========================================
// MODIFICAR TARJETA MAGNÉTICA
// ==========================================
function abrirModalModificarTarjeta() {
    const tarjetaActual = document.getElementById('txtTarjeta')?.value || '';

    // Mostrar tarjeta actual en el modal
    document.getElementById('txtTarjetaActual').value = tarjetaActual;

    // Limpiar campos
    document.getElementById('ddlMotivoTarjeta').value = '';
    document.getElementById('txtNuevaTarjeta').value = '';

    // Mostrar modal
    $('#modalModificarTarjeta').modal('show');

    // Enfocar el select de motivo después de mostrar el modal
    setTimeout(() => {
        document.getElementById('ddlMotivoTarjeta').focus();
    }, 500);
}

function confirmarModificarTarjeta() {
    const codeGen = document.getElementById('hdnCodeGen')?.value;
    const tarjetaActual = document.getElementById('txtTarjetaActual')?.value || '';
    const motivo = document.getElementById('ddlMotivoTarjeta')?.value || '';
    const nuevaTarjeta = document.getElementById('txtNuevaTarjeta')?.value?.trim();

    // Validar que se haya seleccionado un motivo
    if (!motivo) {
        Swal.fire({
            icon: 'info',
            title: 'Campo requerido',
            text: 'Por favor seleccione un motivo del cambio',
            confirmButtonColor: '#182A6E',
            confirmButtonText: 'Aceptar'
        });
        document.getElementById('ddlMotivoTarjeta').focus();
        return;
    }

    // Validar que se haya ingresado una nueva tarjeta
    if (!nuevaTarjeta) {
        Swal.fire({
            icon: 'info',
            title: 'Campo requerido',
            text: 'Por favor ingrese el número de la nueva tarjeta',
            confirmButtonColor: '#182A6E',
            confirmButtonText: 'Aceptar'
        });
        document.getElementById('txtNuevaTarjeta').focus();
        return;
    }

    // Validar que sea un número válido
    const numeroTarjeta = parseInt(nuevaTarjeta, 10);
    if (isNaN(numeroTarjeta) || numeroTarjeta <= 0) {
        Swal.fire({
            icon: 'info',
            title: 'Número inválido',
            text: 'Por favor ingrese un número de tarjeta válido',
            confirmButtonColor: '#182A6E',
            confirmButtonText: 'Aceptar'
        });
        document.getElementById('txtNuevaTarjeta').focus();
        return;
    }

    // Validar que sea diferente a la actual
    if (nuevaTarjeta === tarjetaActual) {
        Swal.fire({
            icon: 'info',
            title: 'Sin cambios',
            text: 'La nueva tarjeta debe ser diferente a la actual',
            confirmButtonColor: '#182A6E',
            confirmButtonText: 'Aceptar'
        });
        document.getElementById('txtNuevaTarjeta').focus();
        return;
    }

    // Mostrar loading en el botón
    const btnConfirmar = document.getElementById('btnConfirmarModificarTarjeta');
    const spinner = btnConfirmar.querySelector('.spinner-border');
    const btnText = btnConfirmar.querySelector('.btn-text');
    spinner.classList.remove('d-none');
    btnText.textContent = 'Guardando...';
    btnConfirmar.disabled = true;

    // Llamar al controlador para modificar la tarjeta (el controlador registra en bitácora)
    fetch('/DetalleTransaccion/ModificarTarjeta', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            codeGen: codeGen,
            cardNumber: numeroTarjeta,
            motivo: motivo
        })
    })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Error del servidor: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            // Ocultar loading
            spinner.classList.add('d-none');
            btnText.textContent = 'Guardar';
            btnConfirmar.disabled = false;

            if (data.success) {
                // Cerrar modal
                $('#modalModificarTarjeta').modal('hide');

                // Mostrar mensaje de éxito y recargar
                Swal.fire({
                    icon: 'success',
                    title: 'Tarjeta modificada',
                    text: 'La tarjeta magnética ha sido actualizada correctamente.',
                    confirmButtonColor: '#182A6E',
                    confirmButtonText: 'Aceptar',
                    timer: 1500,
                    showConfirmButton: false
                }).then(() => {
                    // Recargar la página para mostrar los datos actualizados
                    if (codeGen) {
                        recargarDetalleTransaccion(codeGen);
                    }
                });
            } else {
                Swal.fire({
                    icon: 'info',
                    title: 'Información',
                    text: data.message || 'No se pudo modificar la tarjeta',
                    confirmButtonColor: '#182A6E',
                    confirmButtonText: 'Aceptar'
                });
            }
        })
        .catch(error => {
            // Ocultar loading
            spinner.classList.add('d-none');
            btnText.textContent = 'Guardar';
            btnConfirmar.disabled = false;

            console.error('Error:', error);
            Swal.fire({
                icon: 'info',
                title: 'Información',
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
    // Verificar qué datos ya están asignados en el servidor (según la API response)
    const tieneMarchamos = document.getElementById('hdnTieneMarchamos')?.value === 'true';
    const tieneComprobante = document.getElementById('hdnTieneComprobante')?.value === 'true';
    const comprobanteActual = document.getElementById('txtComprobante')?.value || '';

    console.log('DEBUG recopilarDatos - tieneMarchamos:', tieneMarchamos);
    console.log('DEBUG recopilarDatos - tieneComprobante:', tieneComprobante);
    console.log('DEBUG recopilarDatos - comprobanteActual:', comprobanteActual);

    const datos = {
        codeGen: document.getElementById('hdnCodeGen')?.value || '',
        humedad: document.getElementById('txtHumedad')?.value || ''
    };

    // Obtener valores actuales de marchamos
    const marchamo1Actual = document.getElementById('txtMarchamo1')?.value || '';
    const marchamo2Actual = document.getElementById('txtMarchamo2')?.value || '';
    const marchamo3Actual = document.getElementById('txtMarchamo3')?.value || '';
    const marchamo4Actual = document.getElementById('txtMarchamo4')?.value || '';

    // Si NO tiene marchamos asignados previamente, enviar todos los marchamos actuales
    if (!tieneMarchamos) {
        datos.marchamo1 = marchamo1Actual;
        datos.marchamo2 = marchamo2Actual;
        datos.marchamo3 = marchamo3Actual;
        datos.marchamo4 = marchamo4Actual;
    } else {
        // Si ya tiene marchamos, solo enviar los que tengan valor actual
        if (marchamo1Actual) datos.marchamo1 = marchamo1Actual;
        if (marchamo2Actual) datos.marchamo2 = marchamo2Actual;
        if (marchamo3Actual) datos.marchamo3 = marchamo3Actual;
        if (marchamo4Actual) datos.marchamo4 = marchamo4Actual;
    }

    // Solo enviar comprobante si NO está guardado en el servidor Y tiene un valor
    // - Si hdnTieneComprobante = false y hay valor: el comprobante viene de /next → SÍ enviar
    // - Si hdnTieneComprobante = true: el comprobante ya está guardado en el envío → NO enviar
    // - Si el campo está vacío: NO enviar (no hay comprobante disponible)
    if (!tieneComprobante && comprobanteActual) {
        datos.comprobante = comprobanteActual;
        console.log('DEBUG recopilarDatos - Incluyendo comprobante en datos:', comprobanteActual);
    } else if (tieneComprobante) {
        console.log('DEBUG recopilarDatos - NO incluyendo comprobante (ya está guardado)');
    } else {
        console.log('DEBUG recopilarDatos - NO incluyendo comprobante (campo vacío - no disponible)');
    }

    // Obtener warehouseId del input de almacén (solo para MELAZA)
    const hiddenAlmacenId = document.getElementById('hdnAlmacenId');
    if (hiddenAlmacenId) {
        const warehouseIdSeleccionado = hiddenAlmacenId.value;
        if (warehouseIdSeleccionado && warehouseIdSeleccionado !== '') {
            // Enviar como entero (el API lo recibe como int)
            datos.warehouseId = parseInt(warehouseIdSeleccionado, 10);
            console.log('DEBUG recopilarDatos - Incluyendo warehouseId:', datos.warehouseId);
        }
    }

    // Obtener observaciones (siempre incluir, incluso si está vacío)
    const observacionesTextarea = document.getElementById('txtObservaciones');
    if (observacionesTextarea) {
        const observacionesValue = observacionesTextarea.value.trim();
        datos.observaciones = observacionesValue;
        console.log('DEBUG recopilarDatos - Incluyendo observaciones:', datos.observaciones);
    }

    console.log('DEBUG recopilarDatos - datos finales:', datos);
    return datos;
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
        marchamo4: normalizarValor(document.getElementById('txtMarchamo4')?.value),
        warehouseId: normalizarValor(document.getElementById('hdnAlmacenId')?.value),
        observaciones: normalizarValor(document.getElementById('txtObservaciones')?.value)
    };
    hayCambiosPendientes = false;
}

function configurarDeteccionCambios() {
    const campos = ['txtHumedad', 'txtMarchamo1', 'txtMarchamo2', 'txtMarchamo3', 'txtMarchamo4', 'txtObservaciones'];

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

    // Agregar listener para el select de almacén (MELAZA)
    const ddlAlmacen = document.getElementById('ddlAlmacen');
    if (ddlAlmacen) {
        ddlAlmacen.addEventListener('change', detectarCambios);
    }
}

function detectarCambios() {
    const valoresActuales = {
        humedad: normalizarValor(document.getElementById('txtHumedad')?.value),
        marchamo1: normalizarValor(document.getElementById('txtMarchamo1')?.value),
        marchamo2: normalizarValor(document.getElementById('txtMarchamo2')?.value),
        marchamo3: normalizarValor(document.getElementById('txtMarchamo3')?.value),
        marchamo4: normalizarValor(document.getElementById('txtMarchamo4')?.value),
        warehouseId: normalizarValor(document.getElementById('hdnAlmacenId')?.value),
        observaciones: normalizarValor(document.getElementById('txtObservaciones')?.value)
    };

    hayCambiosPendientes =
        valoresActuales.humedad !== valoresOriginales.humedad ||
        valoresActuales.marchamo1 !== valoresOriginales.marchamo1 ||
        valoresActuales.marchamo2 !== valoresOriginales.marchamo2 ||
        valoresActuales.marchamo3 !== valoresOriginales.marchamo3 ||
        valoresActuales.marchamo4 !== valoresOriginales.marchamo4 ||
        valoresActuales.warehouseId !== valoresOriginales.warehouseId ||
        valoresActuales.observaciones !== valoresOriginales.observaciones;
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
            // Detector de escaneo por campo
            const detector = {
                lastTs: 0,
                streak: 0,
                isScanLike: false,
                autoAdvanceTimer: null,
                autoAdvanceTriggered: false,
                reset() {
                    this.lastTs = 0;
                    this.streak = 0;
                    this.isScanLike = false;
                    this.autoAdvanceTriggered = false;
                    if (this.autoAdvanceTimer) {
                        clearTimeout(this.autoAdvanceTimer);
                        this.autoAdvanceTimer = null;
                    }
                }
            };

            // Resetear detector al enfocar
            campo.addEventListener('focus', () => detector.reset());

            // Detectar Enter o Tab para navegar
            campo.addEventListener('keydown', function (e) {
                // Detectar ritmo de escaneo
                const now = performance.now();
                const delta = now - (detector.lastTs || now);
                detector.lastTs = now;

                const isChar = e.key.length === 1 || e.key === 'Spacebar' || e.key === ' ';
                if (isChar) {
                    if (delta <= 30) { // 30ms máximo entre teclas para considerarlo escaneo
                        detector.streak++;
                    } else {
                        detector.streak = 0;
                    }

                    // Si hay 2+ caracteres consecutivos muy rápidos, es un escáner
                    if (detector.streak >= 2) {
                        detector.isScanLike = true;
                    }
                }

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
            campo.addEventListener('paste', function () {
                detector.isScanLike = true; // El paste generalmente es de un escáner
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

            // Auto-avanzar SOLO si fue detectado como escaneo
            campo.addEventListener('input', function () {
                const v = this.value;

                // Limpiar timer anterior
                if (detector.autoAdvanceTimer) {
                    clearTimeout(detector.autoAdvanceTimer);
                    detector.autoAdvanceTimer = null;
                }

                // Si el escáner inyecta \r o \n
                if (/\r|\n/.test(v)) {
                    this.value = v.replace(/[\r\n]+/g, '').trim();
                    detector.isScanLike = true;

                    // Avanzar al siguiente campo
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

                    if (!encontrado) {
                        const btnGuardar = document.getElementById('btnGuardar');
                        if (btnGuardar && !btnGuardar.disabled) {
                            btnGuardar.focus();
                        }
                    }
                    return;
                }

                // Solo auto-avanzar si fue detectado como escaneo Y tiene al menos 2 caracteres
                if (detector.isScanLike && v.trim().length >= 2 && !detector.autoAdvanceTriggered) {
                    // Esperar 80ms después del último input para asegurar que el escáner terminó
                    detector.autoAdvanceTimer = setTimeout(() => {
                        detector.autoAdvanceTriggered = true;

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
                    }, 80); // Esperar 80ms después del último carácter
                }
                // Si es escritura manual (no es escaneo), NO auto-avanzar
                // El usuario debe presionar Enter/Tab para avanzar
            });
        }
    });
}

// ==========================================
// CONFIGURACIÓN CAMPO HUMEDAD
// ==========================================
function configurarCampoHumedad() {
    const campoHumedad = document.getElementById('txtHumedad');
    if (!campoHumedad) return;

    let yaSeleccionado = false;

    campoHumedad.addEventListener('focus', function () {
        // Solo seleccionar el contenido la primera vez
        if (!yaSeleccionado) {
            const valorInicial = this.getAttribute('data-initial-value');
            // Si el valor actual es igual al valor inicial, seleccionar todo
            if (this.value === valorInicial) {
                this.select();
                yaSeleccionado = true;
            }
        }
    });

    // Resetear la bandera cuando el usuario cambia el valor manualmente
    campoHumedad.addEventListener('input', function () {
        yaSeleccionado = true;
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
            campo.addEventListener('keypress', function (e) {
                // Permitir solo números (0-9)
                const char = e.key;

                // Permitir solo dígitos
                if (!/^\d$/.test(char)) {
                    e.preventDefault();
                    return false;
                }
            });

            // Validar y limpiar al pegar
            campo.addEventListener('paste', function () {
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
            campo.addEventListener('input', function () {
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
// CONTADOR DE CARACTERES PARA OBSERVACIONES
// ==========================================
function configurarContadorObservaciones() {
    const textarea = document.getElementById('txtObservaciones');
    const charCount = document.getElementById('charCount');

    if (!textarea || !charCount) {
        console.log('No se encontró textarea de observaciones o contador');
        return;
    }

    // Actualizar contador al escribir
    textarea.addEventListener('input', function () {
        charCount.textContent = this.value.length;
    });

    // Inicializar contador con el valor actual
    charCount.textContent = textarea.value.length;
    console.log('Contador de caracteres configurado para observaciones');
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

function validarMarchamosCompletos() {
    const esAzucar = esProductoAzucar();

    if (esAzucar) {
        // Para azúcar, validar que los 4 marchamos estén completos antes de guardar
        const marchamo1 = document.getElementById('txtMarchamo1')?.value?.trim() || '';
        const marchamo2 = document.getElementById('txtMarchamo2')?.value?.trim() || '';
        const marchamo3 = document.getElementById('txtMarchamo3')?.value?.trim() || '';
        const marchamo4 = document.getElementById('txtMarchamo4')?.value?.trim() || '';

        // Si alguno está vacío, retornar false
        if (!marchamo1 || !marchamo2 || !marchamo3 || !marchamo4) {
            console.log('Producto azúcar - debe completar los 4 marchamos antes de guardar');
            return false;
        }

        console.log('Producto azúcar - los 4 marchamos están completos');
        return true;
    } else {
        // Para melaza, solo validar marchamo1 si el ingenio es CASSA o ICHP
        const ingenioCode = document.getElementById('hdnIngenioCode')?.value || '';
        const esIngenioEspecifico = ingenioCode === 'CASSA' || ingenioCode === 'ICHP';

        if (esIngenioEspecifico) {
            const marchamo1 = document.getElementById('txtMarchamo1')?.value?.trim() || '';
            if (!marchamo1) {
                console.log('Producto melaza con ingenio CASSA/ICHP - debe ingresar marchamo 1');
                return false;
            }
        }

        console.log('Producto melaza - validación de marchamos OK');
        return true;
    }
}

function validarAlmacenObligatorio() {
    // Solo validar almacén para productos de melaza
    if (esProductoAzucar()) {
        return true; // Azúcar no requiere almacén
    }

    // Verificar si el campo de almacén existe en el formulario (solo visible en status 11)
    const ddlAlmacen = document.getElementById('ddlAlmacen');
    if (!ddlAlmacen) {
        return true;
    }

    const almacenSeleccionado = ddlAlmacen.value?.trim() || '';

    if (!almacenSeleccionado || almacenSeleccionado === '') {
        return false;
    }
    return true;
}

// ==========================================
// INICIALIZAR CUSTOM SEARCHABLE SELECT PARA ALMACÉN
// ==========================================
function inicializarSelectAlmacen() {
    const inputAlmacen = document.getElementById('ddlAlmacen');
    const hiddenAlmacenId = document.getElementById('hdnAlmacenId');
    const dropdown = document.getElementById('almacenDropdown');
    const searchInput = document.getElementById('almacenSearch');
    const optionsList = document.getElementById('almacenOptionsList');

    if (!inputAlmacen || !dropdown) return;

    // Marcar opción seleccionada al cargar
    const currentValue = hiddenAlmacenId ? hiddenAlmacenId.value : '';
    if (currentValue) {
        const options = optionsList.querySelectorAll('.dropdown-option');
        options.forEach(option => {
            if (option.getAttribute('data-value') === currentValue) {
                option.classList.add('selected');
            }
        });
    }

    // Abrir dropdown al hacer click en el input
    inputAlmacen.addEventListener('click', function (e) {
        e.stopPropagation();

        // No permitir abrir si está deshabilitado
        if (inputAlmacen.disabled) {
            return;
        }

        dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        if (dropdown.style.display === 'block') {
            searchInput.value = '';
            filterOptions('');
            searchInput.focus();

            // Auto scroll a la opción seleccionada
            const selectedOption = optionsList.querySelector('.dropdown-option.selected');
            if (selectedOption) {
                selectedOption.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        }
    });

    // Buscar opciones
    searchInput.addEventListener('input', function () {
        filterOptions(this.value);
    });

    // Seleccionar opción
    const options = optionsList.querySelectorAll('.dropdown-option');
    options.forEach(option => {
        option.addEventListener('click', function () {
            const value = this.getAttribute('data-value');
            const text = this.getAttribute('data-text');

            inputAlmacen.value = text;
            hiddenAlmacenId.value = value;

            // Remover selección previa y marcar la nueva
            options.forEach(opt => opt.classList.remove('selected'));
            this.classList.add('selected');

            dropdown.style.display = 'none';
            detectarCambios();
        });
    });

    // Cerrar dropdown al hacer click fuera
    document.addEventListener('click', function (e) {
        if (!inputAlmacen.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });

    // Filtrar opciones
    function filterOptions(searchText) {
        const normalizedSearch = searchText.toLowerCase().trim();
        options.forEach(option => {
            const text = option.getAttribute('data-text').toLowerCase();
            if (text.includes(normalizedSearch)) {
                option.classList.remove('hidden');
            } else {
                option.classList.add('hidden');
            }
        });
    }

    // Navegación con teclado
    searchInput.addEventListener('keydown', function (e) {
        const visibleOptions = Array.from(options).filter(opt => !opt.classList.contains('hidden'));
        const currentIndex = visibleOptions.findIndex(opt => opt.classList.contains('selected'));

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (currentIndex < visibleOptions.length - 1) {
                visibleOptions.forEach(opt => opt.classList.remove('selected'));
                visibleOptions[currentIndex + 1].classList.add('selected');
                visibleOptions[currentIndex + 1].scrollIntoView({ block: 'nearest' });
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (currentIndex > 0) {
                visibleOptions.forEach(opt => opt.classList.remove('selected'));
                visibleOptions[currentIndex - 1].classList.add('selected');
                visibleOptions[currentIndex - 1].scrollIntoView({ block: 'nearest' });
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const selected = visibleOptions.find(opt => opt.classList.contains('selected'));
            if (selected) {
                selected.click();
            } else if (visibleOptions.length > 0) {
                visibleOptions[0].click();
            }
        } else if (e.key === 'Escape') {
            dropdown.style.display = 'none';
        }
    });
}

// ==========================================
// ATAJOS DE TECLADO (Alt + tecla)
// ==========================================
function initializeKeyboardShortcutsDT() {
    console.log('Shortcuts: Initializing keyboard shortcuts...');
    document.addEventListener('keydown', function (e) {
        if (!e.altKey) return;

        console.log('Shortcuts: Alt key pressed +', e.key);

        const activeTag = document.activeElement?.tagName?.toLowerCase();
        const isInInput = ['input', 'select', 'textarea'].includes(activeTag);
        const modalOpen = document.body.classList.contains('modal-open');

        switch (e.key) {
            case 'g':
            case 'G':
                if (modalOpen || isInInput) return;
                e.preventDefault();
                console.log('Shortcuts: Alt+G detected (Save)');
                { const btn = document.getElementById('btnGuardar'); if (btn && !btn.disabled) btn.click(); }
                break;

            case 'p':
            case 'P':
                if (modalOpen || isInInput) return;
                e.preventDefault();
                console.log('Shortcuts: Alt+P detected (Print)');
                { const btn = document.getElementById('btnImprimir'); if (btn && !btn.disabled) btn.click(); }
                break;

            case 'c':
            case 'C':
                if (modalOpen || isInInput) return;
                e.preventDefault();
                console.log('Shortcuts: Alt+C detected (Complete)');
                { const btn = document.getElementById('btnCompletar'); if (btn && !btn.disabled) btn.click(); }
                break;

            case 'n':
            case 'N':
                if (modalOpen || isInInput) return;
                e.preventDefault();
                console.log('Shortcuts: Alt+N detected (New Weighing)');
                { const btn = document.getElementById('btnAgregarPesaje'); if (btn && !btn.disabled) btn.click(); }
                break;

            case 'w':
            case 'W':
                if (modalOpen || isInInput) return;
                e.preventDefault();
                console.log('Shortcuts: Alt+W detected (Close)');
                { const btn = document.getElementById('btnCerrar'); if (btn) btn.click(); }
                break;

            case 'ArrowUp':
                if (modalOpen || isInInput) return;
                e.preventDefault();
                window.scrollBy({ top: -120, behavior: 'smooth' });
                break;

            case 'ArrowDown':
                if (modalOpen || isInInput) return;
                e.preventDefault();
                window.scrollBy({ top: 120, behavior: 'smooth' });
                break;

            case 'x':
            case 'X':
                e.preventDefault();
                console.log('Shortcuts: Alt+X detected (Toggle Help)');
                toggleShortcutsPanelDT();
                break;
        }
    });
}

function toggleShortcutsPanelDT() {
    console.log('Shortcuts: Toggling help panel');
    const panel = document.getElementById('dt-shortcuts-panel');
    if (panel) {
        panel.classList.toggle('dt-shortcuts-visible');
        console.log('Shortcuts: Panel is now', panel.classList.contains('dt-shortcuts-visible') ? 'VISIBLE' : 'HIDDEN');
    } else {
        console.error('Shortcuts: Panel element NOT FOUND');
    }
}

function createShortcutsPanelDT() {
    console.log('Shortcuts: Creating help panel...');
    if (document.getElementById('dt-shortcuts-panel')) {
        console.log('Shortcuts: Panel already exists, skipping creation');
        return;
    }

    const panel = document.createElement('div');
    panel.id = 'dt-shortcuts-panel';
    panel.className = 'dt-shortcuts-panel';
    panel.innerHTML = `
        <div class="dt-shortcuts-header">
            <i class="fas fa-keyboard"></i> Atajos de teclado
            <button class="dt-shortcuts-close" onclick="toggleShortcutsPanelDT()" title="Cerrar">&times;</button>
        </div>
        <div class="dt-shortcuts-body">
            <div class="dt-shortcut-item">
                <span class="dt-shortcut-keys"><kbd>Alt</kbd>+<kbd>G</kbd></span>
                <span class="dt-shortcut-desc">Guardar</span>
            </div>
            <div class="dt-shortcut-item">
                <span class="dt-shortcut-keys"><kbd>Alt</kbd>+<kbd>P</kbd></span>
                <span class="dt-shortcut-desc">Imprimir</span>
            </div>
            <div class="dt-shortcut-item">
                <span class="dt-shortcut-keys"><kbd>Alt</kbd>+<kbd>C</kbd></span>
                <span class="dt-shortcut-desc">Completar</span>
            </div>
            <div class="dt-shortcut-item">
                <span class="dt-shortcut-keys"><kbd>Alt</kbd>+<kbd>N</kbd></span>
                <span class="dt-shortcut-desc">Nuevo pesaje</span>
            </div>
            <div class="dt-shortcut-item">
                <span class="dt-shortcut-keys"><kbd>Alt</kbd>+<kbd>W</kbd></span>
                <span class="dt-shortcut-desc">Cerrar</span>
            </div>
            <hr class="dt-shortcut-divider">
            <div class="dt-shortcut-item">
                <span class="dt-shortcut-keys"><kbd>Alt</kbd>+<kbd>&#8593;</kbd> / <kbd>&#8595;</kbd></span>
                <span class="dt-shortcut-desc">Scroll p&aacute;gina</span>
            </div>
            <hr class="dt-shortcut-divider">
            <div class="dt-shortcut-item">
                <span class="dt-shortcut-keys"><kbd>Alt</kbd>+<kbd>X</kbd></span>
                <span class="dt-shortcut-desc">Mostrar/ocultar ayuda</span>
            </div>
        </div>
    `;
    document.body.appendChild(panel);
    console.log('Shortcuts: Panel created and appended to body');
}

// Inicializar atajos: el script se carga al final del body, el DOM ya está listo
console.log('Shortcuts: Reaching initialization block, readyState:', document.readyState);
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
        console.log('Shortcuts: DOMContentLoaded fired');
        createShortcutsPanelDT();
        initializeKeyboardShortcutsDT();
    });
} else {
    // DOM ya está listo (caso más común cuando el script está en @section Scripts)
    console.log('Shortcuts: Executing direct initialization');
    createShortcutsPanelDT();
    initializeKeyboardShortcutsDT();
}
