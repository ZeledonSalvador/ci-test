/**
 * LISTA DE TRANSACCIONES - JAVASCRIPT
 * Manejo de filtros, búsqueda y paginación
 */

// ==========================================
// VARIABLES GLOBALES
// ==========================================
let currentPage = 1;
let pageSize = 10;
let currentFilters = {
    search: '',
    estado: '',
    producto: '',
    fechaInicio: '',
    fechaFin: ''
};
let pollingInterval = null;
let isLoadingTransactions = false; // Prevenir solicitudes concurrentes
let currentAbortController = null; // Para cancelar solicitudes pendientes

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', async function () {
    // Esperar a que PERMISSION esté inicializado
    await PERMISSION.init();

    // Restaurar filtros desde localStorage PRIMERO
    restaurarFiltros();

    // Configurar UI según rol (esto puede sobrescribir algunos filtros si es necesario)
    configurarUISegunRol();

    // Asegurar que las pestañas estén visibles y activas
    inicializarPestanas();

    initializeEventListeners();
    loadTransacciones();

    // Iniciar polling automático cada 15 segundos
    iniciarPolling();
});

// Detener polling y cancelar solicitudes cuando el usuario abandona la página
window.addEventListener('beforeunload', function () {
    detenerPolling();

    // Cancelar cualquier solicitud pendiente
    if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
    }
});

// ==========================================
// CONFIGURACIÓN SEGÚN ROL
// ==========================================
function configurarUISegunRol() {
    const userRole = PERMISSION.getRoleCode();
    const codBascula = PERMISSION.getCodBascula();

    // Establecer estado 3 (Pesaje Salida) por defecto para todos los roles
    // Siempre se establece como predeterminado
    if (!currentFilters.estado) {
        currentFilters.estado = '3';
    }

    // FILTRO AUTOMÁTICO DE PRODUCTO SEGÚN BÁSCULA (para todos los roles)
    // Solo aplicar si el usuario ingresó con básculas 3, 4 o 5
    if (codBascula === '3') {
        currentFilters.producto = 'MEL-001';
    } else if (codBascula === '4' || codBascula === '5') {
        currentFilters.producto = 'AZ-001';
    }
    // Para otras básculas (1, 2, etc.), no se aplica filtro automático

    // Si es PESADOR, ocultar filtro de Producto
    if (userRole.toUpperCase() === 'PESADOR') {
        const productoGroup = document.querySelector('#productoFilter')?.closest('.lt-filter-group');

        if (productoGroup) productoGroup.style.display = 'none';

        // Forzar estado 3 para Pesador
        currentFilters.estado = '3';
    }
}

// ==========================================
// PERSISTENCIA DE FILTROS
// ==========================================
function guardarFiltros() {
    try {
        localStorage.setItem('listaTransacciones_filters', JSON.stringify(currentFilters));
        localStorage.setItem('listaTransacciones_page', currentPage.toString());
        localStorage.setItem('listaTransacciones_pageSize', pageSize.toString());
    } catch (e) {
        console.error('Error al guardar filtros:', e);
    }
}

function restaurarFiltros() {
    try {
        const savedFilters = localStorage.getItem('listaTransacciones_filters');
        const savedPage = localStorage.getItem('listaTransacciones_page');
        const savedPageSize = localStorage.getItem('listaTransacciones_pageSize');

        if (savedFilters) {
            const filters = JSON.parse(savedFilters);
            currentFilters = { ...currentFilters, ...filters };

            // Aplicar a los inputs (no hay estadoFilter)
            document.getElementById('searchInput').value = currentFilters.search || '';
            document.getElementById('productoFilter').value = currentFilters.producto || '';
            document.getElementById('fechaInicioFilter').value = currentFilters.fechaInicio || '';
            document.getElementById('fechaFinFilter').value = currentFilters.fechaFin || '';
        }

        if (savedPage) {
            const parsedPage = parseInt(savedPage);
            if (!isNaN(parsedPage) && parsedPage > 0) {
                currentPage = parsedPage;
            }
        }

        if (savedPageSize) {
            const parsedSize = parseInt(savedPageSize);
            // Validar que sea un valor válido (10, 20, 30)
            if ([10, 20, 30].includes(parsedSize)) {
                pageSize = parsedSize;
                document.getElementById('pageSizeSelect').value = pageSize.toString();
            } else {
                // Si no es válido, usar 10 por defecto
                pageSize = 10;
                document.getElementById('pageSizeSelect').value = '10';
            }
        } else {
            // Si no hay valor guardado, asegurar que sea 10
            pageSize = 10;
            document.getElementById('pageSizeSelect').value = '10';
        }

        // FILTRO AUTOMÁTICO DE PRODUCTO SEGÚN BÁSCULA (para todos los roles)
        // Solo aplicar si el usuario ingresó con básculas 3, 4 o 5
        const codBascula = PERMISSION.getCodBascula();
        if (codBascula === '3') {
            currentFilters.producto = 'MEL-001';
        } else if (codBascula === '4' || codBascula === '5') {
            currentFilters.producto = 'AZ-001';
        }

        // Establecer estado 3 por defecto si no hay estado guardado (para todos los roles)
        if (!currentFilters.estado) {
            currentFilters.estado = '3';
        }
    } catch (e) {
        console.error('Error al restaurar filtros:', e);
    }
}

// ==========================================
// MODO DE VISTA (SIDEBAR vs PESTAÑAS)
// ==========================================
function inicializarPestanas() {
    // Asegurar que las pestañas siempre estén visibles
    const statusTabs = document.getElementById('statusTabs');
    if (statusTabs) {
        statusTabs.style.display = 'flex';
    }

    // Actualizar pestaña activa según el filtro actual
    actualizarPestanasEstado();

    // Actualizar columnas de fecha según el estado
    actualizarColumnasFecha();
}

function restaurarModoVista() {
    try {
        const savedMode = localStorage.getItem('listaTransacciones_viewMode') || 'sidebar';
        aplicarModoVista(savedMode);
    } catch (e) {
        console.error('Error al restaurar modo de vista:', e);
        aplicarModoVista('sidebar');
    }
}

function aplicarModoVista(mode) {
    const container = document.querySelector('.container-fluid.mt-3');
    const statusTabs = document.getElementById('statusTabs');
    const filtersColumn = document.getElementById('filtersColumn');
    const toggleFiltersContainer = document.getElementById('toggleFiltersContainer');
    const tableColumn = document.getElementById('tableColumn');

    // Guardar estado actual de visibilidad de filtros
    const isFiltersVisible = !filtersColumn.classList.contains('d-none') &&
        window.getComputedStyle(filtersColumn).display !== 'none';

    if (mode === 'tabs') {
        // Modo pestañas
        container.classList.add('lt-tabs-mode');
        statusTabs.style.display = 'flex';
        toggleFiltersContainer.style.display = 'block'; // Mantener botón de filtros visible

        // Mantener el estado de visibilidad de los filtros
        if (!isFiltersVisible) {
            filtersColumn.classList.add('d-none');
            tableColumn.classList.remove('col-lg-9', 'col-md-8');
            tableColumn.classList.add('col-12');
        } else {
            filtersColumn.classList.remove('d-none');
            tableColumn.classList.remove('col-12');
            tableColumn.classList.add('col-lg-9', 'col-md-8');
        }

        // Asegurar que filtersColumn tenga las clases de columna
        if (!filtersColumn.classList.contains('col-lg-3')) {
            filtersColumn.classList.add('col-lg-3', 'col-md-4');
        }

        // Actualizar pestañas según el filtro actual
        actualizarPestanasEstado();
    } else {
        // Modo sidebar
        container.classList.remove('lt-tabs-mode');
        statusTabs.style.display = 'none';
        toggleFiltersContainer.style.display = 'block';

        // Mantener estado de sidebar (si estaba abierto o cerrado)
        const isFiltersVisible = !filtersColumn.classList.contains('d-none') &&
            window.getComputedStyle(filtersColumn).display !== 'none';

        if (isFiltersVisible) {
            tableColumn.classList.remove('col-12');
            tableColumn.classList.add('col-lg-9', 'col-md-8');
        }
    }

    // Guardar preferencia
    try {
        localStorage.setItem('listaTransacciones_viewMode', mode);
    } catch (e) {
        console.error('Error al guardar modo de vista:', e);
    }
}

function actualizarPestanasEstado() {
    const tabButtons = document.querySelectorAll('.lt-tab-button');
    const currentStatus = currentFilters.estado;

    tabButtons.forEach(btn => {
        const btnStatus = btn.getAttribute('data-status');
        if (btnStatus === currentStatus) {
            btn.classList.add('active-tab');
        } else {
            btn.classList.remove('active-tab');
        }
    });
}

function actualizarColumnasFecha() {
    const estado = currentFilters.estado;
    const colCreacion = document.querySelectorAll('.col-fecha-creacion');
    const colEntrada = document.querySelectorAll('.col-fecha-entrada');
    const colSalida = document.querySelectorAll('.col-fecha-salida');
    const colComprobante = document.querySelectorAll('.col-comprobante');
    const colPesoEntrada = document.querySelectorAll('.col-peso-entrada');
    const colPesoSalida = document.querySelectorAll('.col-peso-salida');
    const colPesoNeto = document.querySelectorAll('.col-peso-neto');

    // Por defecto, mostrar todas las columnas de fecha
    colCreacion.forEach(col => col.style.display = '');
    colEntrada.forEach(col => col.style.display = '');
    colSalida.forEach(col => col.style.display = '');

    // Mostrar comprobante solo para estados 3 (Pesaje Salida) y 4 (Terminada)
    if (estado === '3' || estado === '4') {
        colComprobante.forEach(col => col.style.display = '');
    } else {
        colComprobante.forEach(col => col.style.display = 'none');
    }

    if (estado === '1') {
        // Autorizada: Solo Fecha Creación, ocultar columnas de peso
        colEntrada.forEach(col => col.style.display = 'none');
        colSalida.forEach(col => col.style.display = 'none');
        colPesoEntrada.forEach(col => col.style.display = 'none');
        colPesoSalida.forEach(col => col.style.display = 'none');
        colPesoNeto.forEach(col => col.style.display = 'none');
    } else if (estado === '2') {
        // Pesaje Entrada: Fecha Creación y Entrada, solo mostrar Peso Entrada
        colSalida.forEach(col => col.style.display = 'none');
        colPesoEntrada.forEach(col => col.style.display = '');
        colPesoSalida.forEach(col => col.style.display = 'none');
        colPesoNeto.forEach(col => col.style.display = 'none');
    } else if (estado === '3') {
        // Pesaje Salida: Fecha Creación y Entrada (ocultar Salida), mostrar los 3 pesos
        colSalida.forEach(col => col.style.display = 'none');
        colPesoEntrada.forEach(col => col.style.display = '');
        colPesoSalida.forEach(col => col.style.display = '');
        colPesoNeto.forEach(col => col.style.display = '');
    } else if (estado === '4') {
        // Terminada: mostrar todas las columnas de fecha y los 3 pesos
        colPesoEntrada.forEach(col => col.style.display = '');
        colPesoSalida.forEach(col => col.style.display = '');
        colPesoNeto.forEach(col => col.style.display = '');
    } else {
        // Por defecto, ocultar columnas de peso
        colPesoEntrada.forEach(col => col.style.display = 'none');
        colPesoSalida.forEach(col => col.style.display = 'none');
        colPesoNeto.forEach(col => col.style.display = 'none');
    }
}

// ==========================================
// EVENT LISTENERS
// ==========================================
function initializeEventListeners() {
    // Click en pestañas de estado
    const statusTabButtons = document.querySelectorAll('.lt-tab-button');
    statusTabButtons.forEach(btn => {
        btn.addEventListener('click', function () {
            const status = this.getAttribute('data-status');

            // Actualizar filtro
            currentFilters.estado = status;
            currentPage = 1;

            // Actualizar pestañas activas
            actualizarPestanasEstado();

            // Actualizar visibilidad de columnas según el estado
            actualizarColumnasFecha();

            // Guardar y recargar
            guardarFiltros();
            loadTransacciones();
        });
    });

    // Toggle del panel de filtros
    const toggleFiltersBtn = document.getElementById('toggleFiltersBtn');
    const filtersColumn = document.getElementById('filtersColumn');
    const tableColumn = document.getElementById('tableColumn');

    toggleFiltersBtn.addEventListener('click', function () {
        const isHidden = filtersColumn.classList.contains('d-none') ||
            window.getComputedStyle(filtersColumn).display === 'none';

        if (isHidden) {
            // Mostrar filtros al lado de la tabla
            filtersColumn.classList.remove('d-none');
            filtersColumn.style.display = '';

            // Asegurarse de que las clases de columna estén correctas
            if (!filtersColumn.classList.contains('col-lg-3')) {
                filtersColumn.classList.add('col-lg-3', 'col-md-4');
            }

            // Ajustar tabla
            tableColumn.classList.remove('col-12');
            tableColumn.classList.add('col-lg-9', 'col-md-8');
        } else {
            // Ocultar filtros
            filtersColumn.classList.add('d-none');

            // Ajustar tabla a ancho completo
            tableColumn.classList.remove('col-lg-9', 'col-md-8');
            tableColumn.classList.add('col-12');
        }
    });

    // Búsqueda en tiempo real (con debounce de 800ms)
    const searchInput = document.getElementById('searchInput');
    let searchTimeout;
    const DEBOUNCE_DELAY = 800; // Tiempo de espera antes de ejecutar la búsqueda
    const MIN_SEARCH_LENGTH = 3; // Mínimo de caracteres para buscar (0 para limpiar)

    searchInput.addEventListener('focus', function () {
        // Pausar polling mientras el usuario está buscando
        detenerPolling();
    });

    searchInput.addEventListener('blur', function () {
        // Reanudar polling cuando termina de buscar
        setTimeout(() => iniciarPolling(), 1000);
    });

    searchInput.addEventListener('input', function () {
        clearTimeout(searchTimeout);
        const searchValue = searchInput.value.trim();

        searchTimeout = setTimeout(function () {
            // Solo buscar si tiene mínimo de caracteres o está vacío (para limpiar filtro)
            if (searchValue.length >= MIN_SEARCH_LENGTH || searchValue.length === 0) {
                currentFilters.search = searchValue;
                currentPage = 1;
                guardarFiltros();
                loadTransacciones();
            }
        }, DEBOUNCE_DELAY);
    });

    // Búsqueda inmediata al presionar Enter
    searchInput.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            clearTimeout(searchTimeout);
            currentFilters.search = searchInput.value.trim();
            currentPage = 1;
            guardarFiltros();
            loadTransacciones();
        }
    });

    // Botón aplicar filtros
    const applyFiltersBtn = document.getElementById('applyFiltersBtn');
    applyFiltersBtn.addEventListener('click', function () {
        applyFilters();
    });

    // Enter en los inputs de filtros
    const filterInputs = document.querySelectorAll('.lt-filter-select, .lt-filter-input');
    filterInputs.forEach(input => {
        input.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                applyFilters();
            }
        });
    });

    // Validación de fechas
    const fechaInicioInput = document.getElementById('fechaInicioFilter');
    const fechaFinInput = document.getElementById('fechaFinFilter');

    fechaInicioInput.addEventListener('change', function () {
        if (fechaFinInput.value && this.value > fechaFinInput.value) {
            Swal.fire({
                icon: 'warning',
                title: 'Fecha inválida',
                text: 'La fecha de inicio no puede ser mayor que la fecha fin',
                confirmButtonColor: '#182A6E',
                confirmButtonText: 'Aceptar'
            });
            this.value = '';
        }
    });

    fechaFinInput.addEventListener('change', function () {
        if (fechaInicioInput.value && this.value < fechaInicioInput.value) {
            Swal.fire({
                icon: 'warning',
                title: 'Fecha inválida',
                text: 'La fecha fin no puede ser menor que la fecha de inicio',
                confirmButtonColor: '#182A6E',
                confirmButtonText: 'Aceptar'
            });
            this.value = '';
        }
    });

    // Cambio de tamaño de página
    const pageSizeSelect = document.getElementById('pageSizeSelect');
    pageSizeSelect.addEventListener('change', function () {
        pageSize = parseInt(this.value);
        currentPage = 1;
        guardarFiltros();
        loadTransacciones();
    });
}

// ==========================================
// APLICAR FILTROS
// ==========================================
function applyFilters() {
    const productoFilter = document.getElementById('productoFilter');
    const fechaInicioFilter = document.getElementById('fechaInicioFilter');
    const fechaFinFilter = document.getElementById('fechaFinFilter');

    // No actualizar estado desde aquí, solo desde las pestañas
    currentFilters.producto = productoFilter.value;
    currentFilters.fechaInicio = fechaInicioFilter.value;
    currentFilters.fechaFin = fechaFinFilter.value;

    currentPage = 1;

    // Actualizar pestañas y columnas
    actualizarPestanasEstado();
    actualizarColumnasFecha();

    // Guardar filtros en localStorage
    guardarFiltros();

    loadTransacciones();
}

// ==========================================
// CARGAR TRANSACCIONES
// ==========================================
function loadTransacciones(showLoadingSpinner = true, retryCount = 0) {
    // Prevenir solicitudes concurrentes
    if (isLoadingTransactions) {
        console.log('Ya hay una solicitud en curso, ignorando...');
        return;
    }

    // Cancelar solicitud anterior si existe
    if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
    }

    // Marcar que estamos cargando
    isLoadingTransactions = true;

    // Crear nuevo AbortController para esta solicitud
    currentAbortController = new AbortController();
    const timeoutId = setTimeout(() => {
        if (currentAbortController) {
            currentAbortController.abort();
        }
    }, 30000); // Timeout de 30 segundos

    if (showLoadingSpinner) {
        showLoading();
    }

    // Construir URL con parámetros
    const params = new URLSearchParams({
        page: currentPage,
        size: pageSize
    });

    if (currentFilters.search) params.append('search', currentFilters.search);
    if (currentFilters.estado) params.append('estado', currentFilters.estado);
    if (currentFilters.producto) params.append('producto', currentFilters.producto);
    if (currentFilters.fechaInicio) params.append('fechaInicio', currentFilters.fechaInicio);
    if (currentFilters.fechaFin) params.append('fechaFin', currentFilters.fechaFin);

    // Agregar timestamp para evitar caché del navegador
    params.append('_t', Date.now());

    // Llamar al endpoint del controlador
    fetch(`/ListaTransacciones/ObtenerTransacciones?${params.toString()}`, {
        headers: {
            'X-Requested-With': 'XMLHttpRequest',
            'Cache-Control': 'no-cache, no-store'
        },
        cache: 'no-store',
        signal: currentAbortController.signal
    })
        .then(response => {
            clearTimeout(timeoutId);

            // Verificar si la sesión expiró (401 Unauthorized)
            if (response.status === 401) {
                return response.json().then(data => {
                    Swal.fire({
                        icon: 'warning',
                        title: 'Sesión expirada',
                        text: data.message || 'Su sesión ha expirado. Será redirigido al inicio de sesión.',
                        confirmButtonColor: '#182A6E',
                        confirmButtonText: 'Aceptar',
                        allowOutsideClick: false
                    }).then(() => {
                        window.location.href = '/Login';
                    });
                    return null; // Retornar null para detener el flujo
                });
            }

            if (!response.ok) {
                throw new Error(`Error ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            // Si data es null, significa que la sesión expiró y ya se manejó
            if (!data) return;

            if (data.success) {
                // Ocultar loading
                hideLoading();

                // Renderizar los datos
                renderTable(data.data);
                renderPagination(data.pagination);

                // Actualizar pestañas si está en modo tabs
                const currentMode = localStorage.getItem('listaTransacciones_viewMode');
                if (currentMode === 'tabs') {
                    actualizarPestanasEstado();
                }

                // Resetear contador de reintentos en caso de éxito
                retryCount = 0;
            } else {
                // Mostrar el mensaje del servidor si está disponible
                const errorMsg = data.message || 'Error al cargar las transacciones';
                showError(errorMsg);
            }
        })
        .catch(error => {
            clearTimeout(timeoutId);

            // Ignorar errores de abort (cancelación intencional)
            if (error.name === 'AbortError') {
                console.log('Solicitud cancelada (timeout o nueva solicitud)');
                hideLoading();

                // Si fue por timeout y no es polling, intentar reintentar
                if (showLoadingSpinner && retryCount < 2) {
                    console.log(`Reintentando... (intento ${retryCount + 1}/2)`);
                    setTimeout(() => {
                        loadTransacciones(showLoadingSpinner, retryCount + 1);
                    }, 2000); // Esperar 2 segundos antes de reintentar
                } else if (showLoadingSpinner) {
                    showError('La solicitud tardó demasiado tiempo. Por favor, intente nuevamente.');
                }
                return;
            }

            console.error('Error al cargar transacciones:', error);

            // Si es un error de red y no es polling, intentar reintentar
            if (showLoadingSpinner && retryCount < 2) {
                console.log(`Reintentando después de error... (intento ${retryCount + 1}/2)`);
                setTimeout(() => {
                    loadTransacciones(showLoadingSpinner, retryCount + 1);
                }, 2000);
            } else {
                showError('Error al conectar con el servidor. Por favor, verifique su conexión.');
            }
        })
        .finally(() => {
            // Liberar el lock de carga
            isLoadingTransactions = false;
            currentAbortController = null;
        });
}

// ==========================================
// RENDERIZAR TABLA
// ==========================================
function renderTable(transacciones) {
    const tableBody = document.getElementById('tableBody');
    const noDataMessage = document.getElementById('noDataMessage');

    if (!transacciones || transacciones.length === 0) {
        tableBody.innerHTML = '';
        // Restaurar contenido original del mensaje de no datos
        noDataMessage.innerHTML = `
            <i class="fas fa-inbox fa-3x"></i>
            <p>No se encontraron transacciones.</p>
        `;
        noDataMessage.style.display = 'block';
        return;
    }

    noDataMessage.style.display = 'none';

    // Primero, limpiar event listeners anteriores
    tableBody.innerHTML = '';

    // Crear y agregar filas con event listeners
    transacciones.forEach((t) => {
        const row = document.createElement('tr');
        row.className = 'lt-row-clickable';

        // Crear celdas con valores seguros (fechas ya vienen formateadas del backend)
        const fechaCreacion = t.fechaCreacion || '-';
        const fechaEntrada = t.fechaEntrada || '-';
        const fechaSalida = t.fechaSalida || '-';
        const envio = t.envio || '-';
        const producto = t.productoNombre || '-';
        const cliente = t.cliente || '-';
        const tarjeta = t.tarjeta || '-';
        const placaCamion = t.placaCamion || '-';
        const placaRemolque = t.placaRemolque || '-';

        // Mostrar comprobante solo para estados 11 (En Despacho) y 12 (Terminada)
        const mostrarComprobante = t.currentStatus == 11 || t.currentStatus == 12;
        const comprobante = mostrarComprobante && t.noComprobante ? t.noComprobante : '-';

        // Pesos
        const pesoEntrada = t.pesajeEntrada != null ? t.pesajeEntrada.toLocaleString('es-SV') : '-';
        const pesoSalida = t.pesajeSalida != null ? t.pesajeSalida.toLocaleString('es-SV') : '-';
        const pesoNeto = t.pesoNeto != null ? t.pesoNeto.toLocaleString('es-SV') : '-';

        row.innerHTML = `
            <td>${envio}</td>
            <td class="col-comprobante">${comprobante}</td>
            <td class="col-fecha-creacion">${fechaCreacion}</td>
            <td class="col-fecha-entrada">${fechaEntrada}</td>
            <td class="col-fecha-salida">${fechaSalida}</td>
            <td>${placaCamion}</td>
            <td>${placaRemolque}</td>
            <td class="col-peso-entrada">${pesoEntrada}</td>
            <td class="col-peso-salida">${pesoSalida}</td>
            <td class="col-peso-neto">${pesoNeto}</td>
            <td>${producto}</td>
            <td>${cliente}</td>
            <td>${tarjeta}</td>
        `;

        // Agregar event listener directamente a la fila
        row.addEventListener('click', function () {
            verDetalleTransaccion(t.codeGen, t.actividad);
        });

        tableBody.appendChild(row);
    });

    // Actualizar visibilidad de columnas según el estado
    actualizarColumnasFecha();
}

// ==========================================
// VER DETALLE DE TRANSACCIÓN
// ==========================================
function verDetalleTransaccion(codeGen, actividad) {
    // Crear formulario oculto para enviar por POST
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/DetalleTransaccion';
    form.style.display = 'none';

    // Campo codeGen
    const inputCodeGen = document.createElement('input');
    inputCodeGen.type = 'hidden';
    inputCodeGen.name = 'codeGen';
    inputCodeGen.value = codeGen;
    form.appendChild(inputCodeGen);

    // Campo actividad
    const inputActividad = document.createElement('input');
    inputActividad.type = 'hidden';
    inputActividad.name = 'actividad';
    inputActividad.value = actividad;
    form.appendChild(inputActividad);

    document.body.appendChild(form);
    form.submit();
}

// ==========================================
// RENDERIZAR PAGINACIÓN
// ==========================================
function renderPagination(pagination) {
    if (!pagination) return;

    const { currentPage: page, pageSize: size, totalRecords, totalPages } = pagination;
    const paginationNav = document.getElementById('paginationNav');
    const paginationInfo = document.getElementById('paginationInfo');

    if (!paginationNav) return;

    // Actualizar información de paginación
    if (paginationInfo) {
        const startRecord = totalRecords === 0 ? 0 : ((page - 1) * size) + 1;
        const endRecord = Math.min(page * size, totalRecords);
        paginationInfo.textContent = `Mostrando ${startRecord} - ${endRecord} de ${totalRecords}`;
    }

    // Si solo hay una página, ocultar paginación
    if (totalPages <= 1) {
        paginationNav.innerHTML = '';
        return;
    }

    // Generar array de páginas a mostrar
    const pagesToShow = [];
    function addPage(p) {
        if (p >= 1 && p <= totalPages && !pagesToShow.includes(p)) {
            pagesToShow.push(p);
        }
    }

    addPage(1);
    addPage(2);
    for (let p = page - 1; p <= page + 1; p++) {
        addPage(p);
    }
    addPage(totalPages - 1);
    addPage(totalPages);
    pagesToShow.sort((a, b) => a - b);

    // Generar HTML de paginación
    let html = '';

    // Botón anterior
    const prevDisabled = page <= 1 ? 'disabled' : '';
    html += `<a class="page-nav ${prevDisabled}" href="javascript:void(0)"
             onclick="${page > 1 ? `navigateToPage(${page - 1})` : 'return false'}"
             title="Anterior" aria-label="Página anterior">
                <i class="fas fa-angle-left"></i>
             </a>`;

    // Números de página
    for (let i = 0; i < pagesToShow.length; i++) {
        const p = pagesToShow[i];
        const prev = i > 0 ? pagesToShow[i - 1] : null;

        // Agregar ellipsis si hay salto
        if (prev !== null && p - prev > 1) {
            html += '<span class="ellipsis">…</span>';
        }

        // Agregar número de página
        const isCurrent = p === page;
        html += `<a class="page-num ${isCurrent ? 'current' : ''}"
                 href="javascript:void(0)"
                 onclick="${!isCurrent ? `navigateToPage(${p})` : 'return false'}"
                 aria-current="${isCurrent ? 'page' : ''}">
                    ${p}
                 </a>`;
    }

    // Botón siguiente
    const nextDisabled = page >= totalPages ? 'disabled' : '';
    html += `<a class="page-nav ${nextDisabled}" href="javascript:void(0)"
             onclick="${page < totalPages ? `navigateToPage(${page + 1})` : 'return false'}"
             title="Siguiente" aria-label="Página siguiente">
                <i class="fas fa-angle-right"></i>
             </a>`;

    paginationNav.innerHTML = html;
}

// ==========================================
// NAVEGAR A PÁGINA
// ==========================================
function navigateToPage(page) {
    currentPage = page;
    guardarFiltros();
    loadTransacciones();
}

// ==========================================
// UTILIDADES
// ==========================================
function showLoading() {
    document.getElementById('noDataMessage').style.display = 'none';

    // Insertar indicador de carga dentro del tbody (colspan 100 abarca todas las columnas visibles)
    const tableBody = document.getElementById('tableBody');
    if (tableBody) {
        tableBody.innerHTML = `
            <tr class="lt-loading-row">
                <td colspan="100">
                    <div class="lt-loading-indicator">
                        <div class="lt-spinner"></div>
                        <span>Cargando...</span>
                    </div>
                </td>
            </tr>
        `;
    }

    const paginationContainer = document.getElementById('paginationContainer');
    if (paginationContainer) {
        paginationContainer.style.opacity = '0.5';
    }
}

function hideLoading() {
    const paginationContainer = document.getElementById('paginationContainer');
    if (paginationContainer) {
        paginationContainer.style.opacity = '1';
    }
}

function showError(message) {
    hideLoading();
    const tableBody = document.getElementById('tableBody');
    const noDataMessage = document.getElementById('noDataMessage');

    tableBody.innerHTML = '';
    noDataMessage.innerHTML = `
        <i class="fas fa-exclamation-triangle fa-3x" style="color: #dc3545;"></i>
        <p style="color: #dc3545; font-weight: 600;">${escapeHtml(message)}</p>
    `;
    noDataMessage.style.display = 'block';
}

function showInfo(message) {
    hideLoading();
    const tableBody = document.getElementById('tableBody');
    const noDataMessage = document.getElementById('noDataMessage');

    tableBody.innerHTML = '';
    noDataMessage.innerHTML = `
        <i class="fas fa-info-circle fa-3x" style="color: #17a2b8;"></i>
        <p style="color: #17a2b8; font-weight: 600;">${escapeHtml(message)}</p>
    `;
    noDataMessage.style.display = 'block';
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

function formatearFecha(fechaISO) {
    if (!fechaISO || fechaISO === null) return '-';
    try {
        const fecha = new Date(fechaISO);
        // Verificar si la fecha es válida
        if (isNaN(fecha.getTime())) return '-';

        const dia = String(fecha.getDate()).padStart(2, '0');
        const mes = String(fecha.getMonth() + 1).padStart(2, '0');
        const anio = fecha.getFullYear();
        const horas = String(fecha.getHours()).padStart(2, '0');
        const minutos = String(fecha.getMinutes()).padStart(2, '0');
        return `${dia}/${mes}/${anio} ${horas}:${minutos}`;
    } catch (e) {
        return '-';
    }
}
// ==========================================
// POLLING AUTOMÁTICO
// ==========================================
function iniciarPolling() {
    // Evitar crear múltiples intervalos
    if (pollingInterval) {
        return;
    }

    // Recargar transacciones cada 30 segundos (30000 ms)
    // No mostrar spinner durante recargas automáticas
    pollingInterval = setInterval(function () {
        // Solo hacer polling si no hay una carga en progreso
        if (!isLoadingTransactions) {
            loadTransacciones(false);
        } else {
            console.log('Polling omitido - hay una solicitud en curso');
        }
    }, 30000);
}

function detenerPolling() {
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
}

// ==========================================
// FUNCIONES AUXILIARES PARA DEBUGGING
// ==========================================
window.debugTransacciones = function () {
    console.log('=== DEBUG INFO ===');
    console.log('Página actual:', currentPage);
    console.log('Tamaño de página:', pageSize);
    console.log('Filtros actuales:', currentFilters);
    console.log('Polling activo:', pollingInterval !== null);
};

// ==========================================
// MODAL CUOTAS DE ALMACENAJE
// ==========================================
let cuotasData = null;

function cargarSelectsCuotas() {
    const headers = { 'X-Requested-With': 'XMLHttpRequest' };

    // Cargar almacenes
    fetch('/ListaTransacciones/ObtenerAlmacenes', { headers })
        .then(response => response.json())
        .then(data => {
            if (data.success && data.data) {
                const select = document.getElementById('cuotasAlmacen');
                data.data.forEach(item => {
                    const option = document.createElement('option');
                    option.value = item.id;
                    option.textContent = item.name;
                    select.appendChild(option);
                });
            }
        })
        .catch(error => console.error('Error al cargar almacenes:', error));

    // Cargar clientes
    fetch('/ListaTransacciones/ObtenerClientes', { headers })
        .then(response => response.json())
        .then(data => {
            if (data.success && data.data) {
                const select = document.getElementById('cuotasCliente');
                data.data.forEach(item => {
                    const option = document.createElement('option');
                    option.value = item.code;
                    option.textContent = item.name;
                    select.appendChild(option);
                });
            }
        })
        .catch(error => console.error('Error al cargar clientes:', error));

    // Cargar productos
    fetch('/ListaTransacciones/ObtenerProductos', { headers })
        .then(response => response.json())
        .then(data => {
            if (data.success && data.data) {
                const select = document.getElementById('cuotasProducto');
                data.data.forEach(item => {
                    const option = document.createElement('option');
                    option.value = item.code;
                    option.textContent = item.name;
                    select.appendChild(option);
                });
            }
        })
        .catch(error => console.error('Error al cargar productos:', error));
}

function initializeCuotasModal() {
    // Configurar fechas por defecto (ayer hasta hoy)
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const formatDate = (date) => date.toISOString().split('T')[0];

    document.getElementById('cuotasFechaDesde').value = formatDate(yesterday);
    document.getElementById('cuotasFechaHasta').value = formatDate(today);

    // Cargar almacenes, clientes y productos dinámicamente
    cargarSelectsCuotas();

    // Event listeners para filtros
    const filterElements = [
        'cuotasFechaDesde',
        'cuotasFechaHasta',
        'cuotasAlmacen',
        'cuotasCliente',
        'cuotasProducto'
    ];

    filterElements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', loadCuotasData);
        }
    });

    // Event listener para cuando se abre el modal
    $('#cuotasModal').on('show.bs.modal', function () {
        detenerPolling();
        loadCuotasData();
    });

    // Event listener para cuando se cierra el modal
    $('#cuotasModal').on('hidden.bs.modal', function () {
        iniciarPolling();
    });

    // Event listeners para secciones colapsables
    setupCuotasCollapseEvents();
}

function setupCuotasCollapseEvents() {
    // Manejar el toggle manualmente para evitar conflictos con Bootstrap
    $('#headerTotalAlmacen').off('click').on('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const content = $('#contentTotalAlmacen');
        const isExpanded = content.hasClass('show');

        if (isExpanded) {
            content.removeClass('show');
            $(this).attr('aria-expanded', 'false');
        } else {
            content.addClass('show');
            $(this).attr('aria-expanded', 'true');
        }
    });

    $('#headerTotalIngenio').off('click').on('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        const content = $('#contentTotalIngenio');
        const isExpanded = content.hasClass('show');

        if (isExpanded) {
            content.removeClass('show');
            $(this).attr('aria-expanded', 'false');
        } else {
            content.addClass('show');
            $(this).attr('aria-expanded', 'true');
        }
    });
}

function loadCuotasData() {
    const startDate = document.getElementById('cuotasFechaDesde').value;
    const endDate = document.getElementById('cuotasFechaHasta').value;
    const warehouseId = document.getElementById('cuotasAlmacen').value;
    const client = document.getElementById('cuotasCliente').value;
    const product = document.getElementById('cuotasProducto').value;

    // Validar fechas
    if (startDate && endDate && startDate > endDate) {
        Swal.fire({
            icon: 'warning',
            title: 'Fecha inválida',
            text: 'La fecha desde no puede ser mayor que la fecha hasta',
            confirmButtonColor: '#182A6E',
            confirmButtonText: 'Aceptar'
        });
        return;
    }

    showCuotasLoading();

    // Construir URL con parámetros
    const params = new URLSearchParams();
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (warehouseId) params.append('warehouseId', warehouseId);
    if (client) params.append('client', client);
    if (product) params.append('product', product);

    fetch(`/ListaTransacciones/ObtenerCuotasAlmacenaje?${params.toString()}`, {
        headers: {
            'X-Requested-With': 'XMLHttpRequest'
        }
    })
        .then(response => {
            if (response.status === 401) {
                return response.json().then(data => {
                    Swal.fire({
                        icon: 'warning',
                        title: 'Sesión expirada',
                        text: data.message || 'Su sesión ha expirado. Será redirigido al inicio de sesión.',
                        confirmButtonColor: '#182A6E',
                        confirmButtonText: 'Aceptar',
                        allowOutsideClick: false
                    }).then(() => {
                        window.location.href = '/Login';
                    });
                    return null;
                });
            }

            if (!response.ok) {
                throw new Error('Error al cargar los datos de almacenaje');
            }
            return response.json();
        })
        .then(data => {
            if (!data) return;

            if (data.success) {
                cuotasData = data.data;
                renderCuotasData(data.data);
                hideCuotasLoading();
            } else {
                showCuotasError(data.message || 'Error al cargar los datos');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showCuotasError('Error al conectar con el servidor');
        });
}

function renderCuotasData(data) {
    const tbodyAlmacen = document.getElementById('tbodyTotalAlmacen');
    const tbodyCliente = document.getElementById('tbodyTotalCliente');
    const totalAlmacenValue = document.getElementById('totalAlmacenValue');
    const totalClienteValue = document.getElementById('totalClienteValue');
    const noDataElement = document.getElementById('cuotasNoData');
    const sectionsElements = document.querySelectorAll('.cuotas-section');

    // Verificar si hay datos
    const hasWarehouseData = data.totalsByWarehouse && data.totalsByWarehouse.length > 0;
    const hasClientData = data.totalsByClient && data.totalsByClient.length > 0;

    if (!hasWarehouseData && !hasClientData) {
        sectionsElements.forEach(el => el.classList.add('d-none'));
        noDataElement.style.display = 'block';
        return;
    }

    sectionsElements.forEach(el => el.classList.remove('d-none'));
    noDataElement.style.display = 'none';

    // Renderizar datos por almacén
    if (hasWarehouseData) {
        let htmlAlmacen = '';
        let totalAlmacenGeneral = 0;

        data.totalsByWarehouse.forEach(warehouse => {
            // Agregar detalles
            if (warehouse.details && warehouse.details.length > 0) {
                warehouse.details.forEach(detail => {
                    htmlAlmacen += `
                        <tr>
                            <td>${escapeHtml(detail.fecha)}</td>
                            <td>${escapeHtml(detail.almacen)}</td>
                            <td>${escapeHtml(detail.producto)}</td>
                            <td class="text-right">${formatNumber(detail.cantidad)} KGS</td>
                        </tr>
                    `;
                    totalAlmacenGeneral += detail.cantidad;
                });
            }
        });

        tbodyAlmacen.innerHTML = htmlAlmacen;
        totalAlmacenValue.textContent = formatNumber(totalAlmacenGeneral) + ' KGS';

        // Expandir la sección de almacén
        $('#contentTotalAlmacen').addClass('show');
        $('#headerTotalAlmacen').attr('aria-expanded', 'true');
    } else {
        tbodyAlmacen.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No hay datos</td></tr>';
        totalAlmacenValue.textContent = '0 KGS';
    }

    // Renderizar datos por cliente/ingenio
    if (hasClientData) {
        let htmlCliente = '';
        let totalClienteGeneral = 0;

        data.totalsByClient.forEach(client => {
            // Agregar detalles
            if (client.details && client.details.length > 0) {
                client.details.forEach(detail => {
                    htmlCliente += `
                        <tr>
                            <td>${escapeHtml(detail.fecha)}</td>
                            <td>${escapeHtml(client.clientName)}</td>
                            <td>${escapeHtml(detail.producto)}</td>
                            <td>${escapeHtml(detail.almacen)}</td>
                            <td class="text-right">${formatNumber(detail.cantidad)} KGS</td>
                        </tr>
                    `;
                    totalClienteGeneral += detail.cantidad;
                });
            }
        });

        tbodyCliente.innerHTML = htmlCliente;
        totalClienteValue.textContent = formatNumber(totalClienteGeneral) + ' KGS';
    } else {
        tbodyCliente.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No hay datos</td></tr>';
        totalClienteValue.textContent = '0 KGS';
    }
}

function showCuotasLoading() {
    document.getElementById('cuotasLoading').style.display = 'block';
    document.getElementById('cuotasNoData').style.display = 'none';
    document.querySelectorAll('.cuotas-section').forEach(el => el.classList.add('cuotas-loading-state'));
}

function hideCuotasLoading() {
    document.getElementById('cuotasLoading').style.display = 'none';
    document.querySelectorAll('.cuotas-section').forEach(el => el.classList.remove('cuotas-loading-state'));
}

function showCuotasError(message) {
    hideCuotasLoading();
    document.querySelectorAll('.cuotas-section').forEach(el => el.classList.add('d-none'));

    const noDataElement = document.getElementById('cuotasNoData');
    noDataElement.innerHTML = `
        <i class="fas fa-exclamation-triangle fa-3x" style="color: #dc3545;"></i>
        <p style="color: #dc3545; font-weight: 600;">${escapeHtml(message)}</p>
    `;
    noDataElement.style.display = 'block';
}

function formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return '0';
    return Number(num).toLocaleString('es-ES', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
}

// ==========================================
// ATAJOS DE TECLADO (Alt + tecla)
// ==========================================
function initializeKeyboardShortcuts() {
    document.addEventListener('keydown', function (e) {
        // Solo activar si Alt está presionado y no hay modal abierto
        if (!e.altKey) return;

        // No activar si el foco está en un input/select/textarea (excepto Alt+F)
        const activeTag = document.activeElement?.tagName?.toLowerCase();
        const isInInput = ['input', 'select', 'textarea'].includes(activeTag);

        // Verificar si hay un modal Bootstrap abierto
        const modalOpen = document.body.classList.contains('modal-open');

        switch (e.key) {
            case '1':
            case '2':
            case '3':
            case '4':
                if (modalOpen || isInInput) return;
                e.preventDefault();
                cambiarPestana(e.key);
                break;

            case 'ArrowLeft':
                if (modalOpen || isInInput) return;
                e.preventDefault();
                {
                    const tblScrollL = document.querySelector('.lt-table-scroll');
                    if (tblScrollL) tblScrollL.scrollBy({ left: -120, behavior: 'smooth' });
                }
                break;

            case 'ArrowRight':
                if (modalOpen || isInInput) return;
                e.preventDefault();
                {
                    const tblScrollR = document.querySelector('.lt-table-scroll');
                    if (tblScrollR) tblScrollR.scrollBy({ left: 120, behavior: 'smooth' });
                }
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

            case 'f':
            case 'F':
                e.preventDefault();
                const searchInput = document.getElementById('searchInput');
                if (searchInput) {
                    searchInput.focus();
                    searchInput.select();
                }
                break;

            case 'x':
            case 'X':
                e.preventDefault();
                toggleShortcutsPanel();
                break;
        }
    });
}

function cambiarPestana(numero) {
    const btn = document.querySelector(`.lt-tab-button[data-status="${numero}"]`);
    if (btn) {
        btn.click();
        // Feedback visual: flash breve en la pestaña
        btn.classList.add('lt-tab-flash');
        setTimeout(() => btn.classList.remove('lt-tab-flash'), 300);
    }
}

function toggleShortcutsPanel() {
    let panel = document.getElementById('lt-shortcuts-panel');
    if (panel) {
        panel.classList.toggle('lt-shortcuts-visible');
    }
}

function createShortcutsPanel() {
    if (document.getElementById('lt-shortcuts-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'lt-shortcuts-panel';
    panel.className = 'lt-shortcuts-panel';
    panel.innerHTML = `
        <div class="lt-shortcuts-header">
            <i class="fas fa-keyboard"></i> Atajos de teclado
            <button class="lt-shortcuts-close" onclick="toggleShortcutsPanel()" title="Cerrar">&times;</button>
        </div>
        <div class="lt-shortcuts-body">
            <div class="lt-shortcut-item">
                <span class="lt-shortcut-keys"><kbd>Alt</kbd>+<kbd>1</kbd></span>
                <span class="lt-shortcut-desc">Autorizada</span>
            </div>
            <div class="lt-shortcut-item">
                <span class="lt-shortcut-keys"><kbd>Alt</kbd>+<kbd>2</kbd></span>
                <span class="lt-shortcut-desc">Pesaje Entrada</span>
            </div>
            <div class="lt-shortcut-item">
                <span class="lt-shortcut-keys"><kbd>Alt</kbd>+<kbd>3</kbd></span>
                <span class="lt-shortcut-desc">Pesaje Salida</span>
            </div>
            <div class="lt-shortcut-item">
                <span class="lt-shortcut-keys"><kbd>Alt</kbd>+<kbd>4</kbd></span>
                <span class="lt-shortcut-desc">Terminada</span>
            </div>
            <hr class="lt-shortcut-divider">
            <div class="lt-shortcut-item">
                <span class="lt-shortcut-keys"><kbd>Alt</kbd>+<kbd>&#8592;</kbd></span>
                <span class="lt-shortcut-desc">Scroll tabla izq.</span>
            </div>
            <div class="lt-shortcut-item">
                <span class="lt-shortcut-keys"><kbd>Alt</kbd>+<kbd>&#8594;</kbd></span>
                <span class="lt-shortcut-desc">Scroll tabla der.</span>
            </div>
            <div class="lt-shortcut-item">
                <span class="lt-shortcut-keys"><kbd>Alt</kbd>+<kbd>&#8593;</kbd> / <kbd>&#8595;</kbd></span>
                <span class="lt-shortcut-desc">Scroll página</span>
            </div>
            <hr class="lt-shortcut-divider">
            <div class="lt-shortcut-item">
                <span class="lt-shortcut-keys"><kbd>Alt</kbd>+<kbd>F</kbd></span>
                <span class="lt-shortcut-desc">Enfocar búsqueda</span>
            </div>
            <div class="lt-shortcut-item">
                <span class="lt-shortcut-keys"><kbd>Alt</kbd>+<kbd>X</kbd></span>
                <span class="lt-shortcut-desc">Mostrar/ocultar ayuda</span>
            </div>
        </div>
    `;
    document.body.appendChild(panel);
}

// Inicializar modal de cuotas cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function () {
    // Verificar si el modal existe antes de inicializar
    if (document.getElementById('cuotasModal')) {
        initializeCuotasModal();
    }

    // Inicializar atajos de teclado
    createShortcutsPanel();
    initializeKeyboardShortcuts();
});