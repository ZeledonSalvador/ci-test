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

// ==========================================
// INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', async function() {
    // Esperar a que PERMISSION esté inicializado
    await PERMISSION.init();

    // Configurar UI según rol
    configurarUISegunRol();

    // Restaurar filtros desde localStorage
    restaurarFiltros();

    initializeEventListeners();
    loadTransacciones();

    // Iniciar polling automático cada 15 segundos
    iniciarPolling();
});

// Detener polling cuando el usuario abandona la página
window.addEventListener('beforeunload', function() {
    detenerPolling();
});

// ==========================================
// CONFIGURACIÓN SEGÚN ROL
// ==========================================
function configurarUISegunRol() {
    const userRole = PERMISSION.getRoleCode();
    const codBascula = PERMISSION.getCodBascula();

    // Establecer estado 11 por defecto para todos los roles (si no tienen filtro guardado)
    if (!currentFilters.estado) {
        currentFilters.estado = '11';
    }

    // FILTRO AUTOMÁTICO DE PRODUCTO SEGÚN BÁSCULA (para todos los roles)
    // Solo aplicar si el usuario ingresó con básculas 3, 4 o 5
    if (codBascula === '3') {
        currentFilters.producto = 'MEL-001';
    } else if (codBascula === '4' || codBascula === '5') {
        currentFilters.producto = 'AZ-001';
    }
    // Para otras básculas (1, 2, etc.), no se aplica filtro automático

    // Si es PESADOR, ocultar filtros de Estado y Producto
    if (userRole.toUpperCase() === 'PESADOR') {
        const estadoGroup = document.querySelector('#estadoFilter').closest('.lt-filter-group');
        const productoGroup = document.querySelector('#productoFilter').closest('.lt-filter-group');

        if (estadoGroup) estadoGroup.style.display = 'none';
        if (productoGroup) productoGroup.style.display = 'none';

        // Forzar estado 11 para Pesador
        currentFilters.estado = '11';
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

            // Aplicar a los inputs
            document.getElementById('searchInput').value = currentFilters.search || '';
            document.getElementById('estadoFilter').value = currentFilters.estado || '';
            document.getElementById('productoFilter').value = currentFilters.producto || '';
            document.getElementById('fechaInicioFilter').value = currentFilters.fechaInicio || '';
            document.getElementById('fechaFinFilter').value = currentFilters.fechaFin || '';
        }

        if (savedPage) {
            currentPage = parseInt(savedPage);
        }

        if (savedPageSize) {
            pageSize = parseInt(savedPageSize);
            document.getElementById('pageSizeSelect').value = pageSize.toString();
        }

        // FILTRO AUTOMÁTICO DE PRODUCTO SEGÚN BÁSCULA (para todos los roles)
        // Solo aplicar si el usuario ingresó con básculas 3, 4 o 5
        const codBascula = PERMISSION.getCodBascula();
        if (codBascula === '3') {
            currentFilters.producto = 'MEL-001';
        } else if (codBascula === '4' || codBascula === '5') {
            currentFilters.producto = 'AZ-001';
        }

        // Si es Pesador, aplicar configuraciones especiales
        const userRole = PERMISSION.getRoleCode();
        if (userRole.toUpperCase() === 'PESADOR') {
            // Forzar estado 11 si no hay estado guardado
            if (!currentFilters.estado) {
                currentFilters.estado = '11';
            }
        }
    } catch (e) {
        console.error('Error al restaurar filtros:', e);
    }
}

// ==========================================
// EVENT LISTENERS
// ==========================================
function initializeEventListeners() {
    // Toggle del panel de filtros
    const toggleFiltersBtn = document.getElementById('toggleFiltersBtn');
    const filtersColumn = document.getElementById('filtersColumn');
    const tableColumn = document.getElementById('tableColumn');

    toggleFiltersBtn.addEventListener('click', function() {
        if (filtersColumn.style.display === 'none') {
            // Mostrar filtros
            filtersColumn.style.display = 'block';
            tableColumn.classList.remove('col-12');
            tableColumn.classList.add('col-lg-9', 'col-md-8');
        } else {
            // Ocultar filtros
            filtersColumn.style.display = 'none';
            tableColumn.classList.remove('col-lg-9', 'col-md-8');
            tableColumn.classList.add('col-12');
        }
    });

    // Búsqueda en tiempo real (con debounce de 800ms)
    const searchInput = document.getElementById('searchInput');
    let searchTimeout;
    const DEBOUNCE_DELAY = 800; // Tiempo de espera antes de ejecutar la búsqueda
    const MIN_SEARCH_LENGTH = 3; // Mínimo de caracteres para buscar (0 para limpiar)

    searchInput.addEventListener('focus', function() {
        // Pausar polling mientras el usuario está buscando
        detenerPolling();
    });

    searchInput.addEventListener('blur', function() {
        // Reanudar polling cuando termina de buscar
        setTimeout(() => iniciarPolling(), 1000);
    });

    searchInput.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        const searchValue = searchInput.value.trim();

        searchTimeout = setTimeout(function() {
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
    searchInput.addEventListener('keypress', function(e) {
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
    applyFiltersBtn.addEventListener('click', function() {
        applyFilters();
    });

    // Enter en los inputs de filtros
    const filterInputs = document.querySelectorAll('.lt-filter-select, .lt-filter-input');
    filterInputs.forEach(input => {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                applyFilters();
            }
        });
    });

    // Validación de fechas
    const fechaInicioInput = document.getElementById('fechaInicioFilter');
    const fechaFinInput = document.getElementById('fechaFinFilter');

    fechaInicioInput.addEventListener('change', function() {
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

    fechaFinInput.addEventListener('change', function() {
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
    pageSizeSelect.addEventListener('change', function() {
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
    const estadoFilter = document.getElementById('estadoFilter');
    const productoFilter = document.getElementById('productoFilter');
    const fechaInicioFilter = document.getElementById('fechaInicioFilter');
    const fechaFinFilter = document.getElementById('fechaFinFilter');

    currentFilters.estado = estadoFilter.value;
    currentFilters.producto = productoFilter.value;
    currentFilters.fechaInicio = fechaInicioFilter.value;
    currentFilters.fechaFin = fechaFinFilter.value;

    currentPage = 1;

    // Guardar filtros en localStorage
    guardarFiltros();

    loadTransacciones();
}

// ==========================================
// CARGAR TRANSACCIONES
// ==========================================
function loadTransacciones(showLoadingSpinner = true) {
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

    // Llamar al endpoint del controlador
    fetch(`/ListaTransacciones/ObtenerTransacciones?${params.toString()}`)
        .then(response => {
            if (!response.ok) {
                throw new Error('Error al cargar las transacciones');
            }
            return response.json();
        })
        .then(data => {
            if (data.success) {
                renderTable(data.data);
                renderPagination(data.pagination);
                hideLoading();

                // Si hay mensaje pero no hay datos, mostrarlo como info
                if (data.message && (!data.data || data.data.length === 0)) {
                    showInfo(data.message);
                }
            } else {
                // Mostrar el mensaje del servidor si está disponible
                const errorMsg = data.message || 'Error al cargar las transacciones';
                showError(errorMsg);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            showError('Error al conectar con el servidor');
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

        row.innerHTML = `
            <td>${escapeHtml(t.fechaEntrada)}</td>
            <td>${escapeHtml(t.transaccion)}</td>
            <td>${escapeHtml(t.producto)}</td>
            <td>${escapeHtml(t.cliente)}</td>
            <td>${escapeHtml(t.tarjeta)}</td>
            <td>${escapeHtml(t.actividad)}</td>
            <td>${escapeHtml(t.placaCamion)}</td>
            <td>${escapeHtml(t.placaRemolque)}</td>
        `;

        // Agregar event listener directamente a la fila
        row.addEventListener('click', function() {
            verDetalleTransaccion(t.codeGen, t.actividad);
        });

        tableBody.appendChild(row);
    });
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
    document.getElementById('loadingMessage').style.display = 'block';
    document.getElementById('noDataMessage').style.display = 'none';
    document.querySelector('.lt-table-container').style.opacity = '0.5';
    document.getElementById('paginationContainer').style.opacity = '0.5';
}

function hideLoading() {
    document.getElementById('loadingMessage').style.display = 'none';
    document.querySelector('.lt-table-container').style.opacity = '1';
    document.getElementById('paginationContainer').style.opacity = '1';
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

// ==========================================
// POLLING AUTOMÁTICO
// ==========================================
function iniciarPolling() {
    // Evitar crear múltiples intervalos
    if (pollingInterval) {
        return;
    }

    // Recargar transacciones cada 15 segundos (15000 ms)
    // No mostrar spinner durante recargas automáticas
    pollingInterval = setInterval(function() {
        loadTransacciones(false);
    }, 15000);
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
window.debugTransacciones = function() {
    console.log('=== DEBUG INFO ===');
    console.log('Página actual:', currentPage);
    console.log('Tamaño de página:', pageSize);
    console.log('Filtros actuales:', currentFilters);
    console.log('Polling activo:', pollingInterval !== null);
};