// =====================
// Reportes - SOLO Recepciones
// =====================

// ===== Helpers DOM
const q  = (s) => document.querySelector(s);

// ===== UI refs (según tu Index.cshtml)
const selReporte  = q('#f-reporte');               // solo tiene value="1"
const selIngenio  = q('#f-ingenio');
const selProducto = q('#f-producto');
const selPuntoAlmacenaje = q('#f-punto-almacenaje');
const puntoAlmacenajeContainer = q('#punto-almacenaje-container');
const fDesde      = q('#f-desde');
const fHasta      = q('#f-hasta');

const btnBuscar = q('#btn-generar');
const btnPdf    = q('#btn-pdf');
const btnExcel  = q('#btn-excel');

const exportsBar = q('#exports');
const resumenContainer = q('#resumen-container');
const resultSection = q('#result');
const tblWrap    = q('.table-wrapper');
const thead      = q('#thead');
const tbody      = q('#tbody');
const estadoContainer = q('#reportes-estado');

// Totales
const totalesSection = q('#totales-section');
const totalPesoBruto = q('#total-peso-bruto');
const totalPesoTara = q('#total-peso-tara');
const totalPesoNeto = q('#total-peso-neto');

// Opcionales (en tu HTML actual no existen / están comentados)
const inputSearch = q('#f-busqueda');  // (está comentado en tu cshtml)
const pager       = q('#pager');       // (no existe en tu cshtml actual)

// ===== Estado
let allRows = [];
let page = 1;
let limit = 10; // default
let lastSearchParams = null;
let lastPagination = null; // si el API devuelve { pagination: {...} }

// ===== Rutas del MVC
const API_ROUTES = {
  consultar: '/Reportes/Consultar',
  exportar:  '/Reportes/Export',
  clientes:  '/Reportes/Clientes',
  productos: '/Reportes/Productos',
  almacenes: '/Reportes/Almacenes'
};

// NOTA: El mapeo de headers y formateo de datos ahora se hace en el backend (ReceptionReportModel.cs)
// El JS solo renderiza los datos ya procesados

// =====================
// Estados visuales
// =====================
function showEstado(kind, text, iconClass) {
  if (!estadoContainer) return;
  estadoContainer.classList.remove('hidden');
  estadoContainer.innerHTML = `
    <div class="estado-content">
      <i class="fas ${iconClass || 'fa-info-circle'} estado-icon"></i>
      <p class="estado-texto">${escapeHtml(text || '')}</p>
    </div>
  `;
}

function hideEstado() {
  estadoContainer?.classList?.add('hidden');
  hideLoadingOverlay();
}

// =====================
// Spinner 
// =====================
function showLoadingOverlay() {
  const spinner = document.getElementById('spinner-overlay');
  if (spinner) {
    spinner.classList.add('show');
    spinner.style.display = '';
  }
  // Ocultar el estado si está visible
  estadoContainer?.classList?.add('hidden');
}

function hideLoadingOverlay() {
  const spinner = document.getElementById('spinner-overlay');
  if (spinner) {
    spinner.classList.remove('show');
  }
}

function showLoadingState() {
  showLoadingOverlay();
}

function showEmptyState() {
  hideLoadingOverlay();
  showEstado('empty', 'No se encontraron resultados con los filtros seleccionados', 'fa-inbox');
}

function showErrorState(mensaje = 'Ocurrió un error al consultar los datos') {
  hideLoadingOverlay();
  showEstado('error', mensaje, 'fa-exclamation-triangle');
}

function showInitialState() {
  showEstado('', 'Completa los filtros y presiona Buscar para ver los resultados', 'fa-filter');
}

// =====================
// Utilidades
// =====================
function escapeHtml(text) {
  if (text == null) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

// Formatea número con separador de miles
function formatNumber(num) {
  if (num == null || isNaN(num)) return '0';
  return Number(num).toLocaleString('es-ES');
}

// Extrae filas de un JSON con distintas formas posibles
function extractRows(json) {
  if (!json) return [];
  // Priorizar 'rows' (como devuelve el backend transformado)
  const candidates = ['rows', 'Rows', 'data', 'Data', 'items', 'Items', 'result', 'Result', 'registros', 'list'];
  for (const key of candidates) {
    if (Array.isArray(json[key])) return json[key];
  }
  // fallback: si json es directamente un arreglo
  if (Array.isArray(json)) return json;
  return [];
}

// =====================
// Render tabla
// =====================
// NOTA: Los datos ya vienen procesados del backend con headers legibles y valores formateados
function renderTable(rows) {
  if (!rows || !rows.length) {
    thead.innerHTML = '';
    tbody.innerHTML = '';
    resumenContainer?.classList?.add('hidden');
    return;
  }

  const cols = Array.from(new Set(rows.flatMap(r => Object.keys(r || {}))));

  // Los headers ya vienen con el nombre legible del backend
  thead.innerHTML = '<tr>' + cols.map(c => `<th>${c}</th>`).join('') + '</tr>';

  // Los valores ya vienen formateados del backend (fechas, humedad, mensajes especiales)
  // Algunos valores contienen HTML (como <br>), por eso no usamos escapeHtml en ellos
  tbody.innerHTML = rows.map(r => (
    '<tr>' + cols.map(c => {
      const value = r?.[c];
      // Si el valor contiene <br>, no escapar (es HTML intencional del backend)
      if (typeof value === 'string' && value.includes('<br>')) {
        return `<td>${value}</td>`;
      }
      return `<td>${escapeHtml(value ?? '')}</td>`;
    }).join('') + '</tr>'
  )).join('');

  resumenContainer?.classList?.remove('hidden');
  btnPdf && (btnPdf.disabled = true);   // PDF no se usa para Recepciones (lo dejamos hidden)
  btnExcel && (btnExcel.disabled = false);
}

// =====================
// Render Totales
// =====================
function renderTotales(totales) {
  if (!totalesSection) return;

  if (!totales) {
    totalesSection.classList.add('hidden');
    return;
  }

  // Actualizar valores
  if (totalPesoBruto) {
    totalPesoBruto.textContent = `${formatNumber(totales.pesoBrutoAlmapac)} KG`;
  }
  if (totalPesoTara) {
    totalPesoTara.textContent = `${formatNumber(totales.pesoTaraAlmapac)} KG`;
  }
  if (totalPesoNeto) {
    totalPesoNeto.textContent = `${formatNumber(totales.pesoNetoAlmapac)} KG`;
  }

  // Mostrar sección
  totalesSection.classList.remove('hidden');
}

function hideTotales() {
  totalesSection?.classList?.add('hidden');
}

// =====================
// Paginación (estilo Correlativo Marchamo)
// =====================
function renderPager(total, currentPage, perPage, totalPagesFromApi) {
  if (!pager) return;

  const totalPages = totalPagesFromApi || Math.max(1, Math.ceil(total / perPage));

  // Si no hay datos o solo 1 página, ocultar paginador pero mostrar selector de registros
  if (total === 0) {
    pager.classList.add('hidden');
    pager.innerHTML = '';
    return;
  }

  // Mostrar el paginador
  pager.classList.remove('hidden');

  // Construir lista de páginas a mostrar (con elipsis)
  const pagesToShow = [];
  const addPage = (p) => {
    if (p >= 1 && p <= totalPages && !pagesToShow.includes(p)) {
      pagesToShow.push(p);
    }
  };

  // Siempre mostrar primera y segunda página
  addPage(1);
  addPage(2);

  // Páginas alrededor de la actual
  for (let p = currentPage - 1; p <= currentPage + 1; p++) {
    addPage(p);
  }

  // Siempre mostrar penúltima y última página
  addPage(totalPages - 1);
  addPage(totalPages);

  // Ordenar
  pagesToShow.sort((a, b) => a - b);

  // Generar HTML de números de página con elipsis
  let pagesHtml = '';
  for (let i = 0; i < pagesToShow.length; i++) {
    const p = pagesToShow[i];
    const prev = i > 0 ? pagesToShow[i - 1] : null;

    // Agregar elipsis si hay un salto
    if (prev !== null && p - prev > 1) {
      pagesHtml += '<span class="ellipsis">…</span>';
    }

    const isCurrent = p === currentPage;
    pagesHtml += `
      <a class="page-num ${isCurrent ? 'current' : ''}"
         href="javascript:void(0)"
         data-page="${p}"
         ${isCurrent ? 'aria-current="page"' : ''}>
        ${p}
      </a>
    `;
  }

  // Generar HTML completo del paginador
  pager.innerHTML = `
    <div class="rpt-pagination-controls">
      ${totalPages > 1 ? `
        <div class="rpt-pagination-row">
          <div class="rpt-pagination-spacer"></div>

          <div class="rpt-pagination rpt-pagination-nav">
            <!-- Anterior -->
            <a class="page-nav ${currentPage <= 1 ? 'disabled' : ''}"
               href="javascript:void(0)"
               data-nav="prev"
               title="Anterior"
               aria-label="Página anterior">
              <i class="fas fa-angle-left"></i>
            </a>

            <!-- Números de página -->
            ${pagesHtml}

            <!-- Siguiente -->
            <a class="page-nav ${currentPage >= totalPages ? 'disabled' : ''}"
               href="javascript:void(0)"
               data-nav="next"
               title="Siguiente"
               aria-label="Página siguiente">
              <i class="fas fa-angle-right"></i>
            </a>
          </div>

          <!-- Selector de registros por página -->
          <div class="rpt-page-size-selector">
            <label for="rpt-page-size">Registros:</label>
            <select id="rpt-page-size">
              ${[10, 20, 30, 50].map(n => `
                <option value="${n}" ${n === perPage ? 'selected' : ''}>${n}</option>
              `).join('')}
            </select>
          </div>
        </div>
      ` : `
        <div class="rpt-pagination-row" style="justify-content: flex-end;">
          <div class="rpt-page-size-selector">
            <label for="rpt-page-size">Registros:</label>
            <select id="rpt-page-size">
              ${[10, 20, 30, 50].map(n => `
                <option value="${n}" ${n === perPage ? 'selected' : ''}>${n}</option>
              `).join('')}
            </select>
          </div>
        </div>
      `}
    </div>
  `;

  // Event listeners para navegación
  pager.querySelector('[data-nav="prev"]')?.addEventListener('click', () => {
    if (currentPage > 1) buscarRecepciones(currentPage - 1);
  });

  pager.querySelector('[data-nav="next"]')?.addEventListener('click', () => {
    if (currentPage < totalPages) buscarRecepciones(currentPage + 1);
  });

  pager.querySelectorAll('[data-page]')?.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const p = parseInt(link.getAttribute('data-page'), 10) || 1;
      if (p !== currentPage) {
        buscarRecepciones(p);
      }
    });
  });

  // Event listener para cambio de tamaño de página
  pager.querySelector('#rpt-page-size')?.addEventListener('change', (e) => {
    limit = parseInt(e.target.value, 10) || 25;
    buscarRecepciones(1); // Volver a página 1 al cambiar tamaño
  });
}

// =====================
// Construcción de URL + Fetch
// =====================
function buildSearchParams(pageToFetch) {
  const ingenioCode = selIngenio?.value?.trim() || '';
  const from = fDesde?.value?.trim() || '';
  const to = fHasta?.value?.trim() || '';
  const producto = selProducto?.value?.trim() || '';
  const almacenCodigo = selPuntoAlmacenaje?.value?.trim() || '';

  const params = new URLSearchParams({ mode: '1' });

  if (from) params.set('from', from);
  if (to) params.set('to', to);

  // OJO: el MVC que dejamos limpio traduce ingenioCode -> clienteCodigo para la API
  if (ingenioCode) params.set('ingenioCode', ingenioCode);
  if (producto) params.set('productoCodigo', producto);
  if (almacenCodigo) params.set('almacenCodigo', almacenCodigo);

  // Preparado para paginación por parámetros (cuando el API soporte)
  params.set('page', String(pageToFetch));
  params.set('limit', String(limit));

  return {
    ingenioCode, from, to, producto, almacenCodigo,
    url: `${API_ROUTES.consultar}?${params.toString()}`
  };
}

async function buscarRecepciones(pageToFetch = 1) {
  // Validación mínima: solo que esté seleccionado Recepciones
  const mode = selReporte?.value?.trim();
  if (!mode || mode !== '1') {
    showErrorState('Debes seleccionar un reporte');
    return;
  }

  page = pageToFetch;

  const built = buildSearchParams(page);
  lastSearchParams = {
    mode: '1',
    ...built,
    reportKey: 'Recepciones'
  };

  showLoadingState();

  try {
    const resp = await fetch(built.url, { method: 'GET' });

    if (resp.status === 401) {
      hideTotales();
      showErrorState('No tienes permisos para acceder a este reporte.');
      if (pager) {
        pager.innerHTML = '';
        pager.classList.add('hidden');
      }
      return;
    }
    if (!resp.ok) {
      const txt = await resp.text();
      hideTotales();
      showErrorState(`Error consultando datos. (${resp.status})`);
      console.error('Error API:', txt);
      if (pager) {
        pager.innerHTML = '';
        pager.classList.add('hidden');
      }
      return;
    }

    const json = await resp.json();

    // filas
    const rowsRaw = extractRows(json);
    allRows = Array.isArray(rowsRaw) ? rowsRaw : [];

    // paginación (si existe)
    lastPagination = json.pagination || json.Pagination || null;

    // totales (si existen)
    const totales = json.totales || json.Totales || null;

    // render
    if (!allRows.length) {
      renderTable([]);
      hideTotales();
      showEmptyState();
      if (pager) {
        pager.innerHTML = '';
        pager.classList.add('hidden');
      }
      return;
    }

    hideEstado();
    renderTable(allRows);
    renderTotales(totales);

    // Si existe paginación del API, usarla; si no, fallback
    if (lastPagination && Number.isFinite(+lastPagination.total)) {
      renderPager(
        +lastPagination.total,
        +lastPagination.page || page,
        +lastPagination.limit || limit,
        +lastPagination.totalPages || null
      );
    } else {
      // fallback: no hay info de paginación (se asume “una página”)
      renderPager(allRows.length, 1, allRows.length, 1);
    }

    // Export Excel (Recepciones)
    if (btnExcel) {
      btnExcel.onclick = () => {
        if (!lastSearchParams) return;
        const p = new URLSearchParams({
          mode: '1',
          format: 'excel'
        });
        if (lastSearchParams.from) p.set('from', lastSearchParams.from);
        if (lastSearchParams.to) p.set('to', lastSearchParams.to);
        if (lastSearchParams.ingenioCode) p.set('ingenioCode', lastSearchParams.ingenioCode);
        if (lastSearchParams.producto) p.set('productoCodigo', lastSearchParams.producto);
        if (lastSearchParams.almacenCodigo) p.set('almacenCodigo', lastSearchParams.almacenCodigo);

        // Export NO debe ir paginado: se exporta todo lo filtrado
        window.location = `${API_ROUTES.exportar}?${p.toString()}`;
      };
    }

  } catch (err) {
    console.error('Error en consulta recepciones:', err);
    renderTable([]);
    hideTotales();
    showErrorState('No se pudo obtener el reporte. Verifica tu conexión e inténtalo nuevamente.');
    if (pager) {
      pager.innerHTML = '';
      pager.classList.add('hidden');
    }
  }
}

// =====================
// UI: solo Recepciones
// =====================
function updateFiltersStateRecepciones() {
  // Para Recepciones, el filtro de punto de almacenaje se muestra
  puntoAlmacenajeContainer?.classList?.remove('hidden');

  // Producto habilitado
  if (selProducto) {
    selProducto.disabled = false;
    selProducto.classList.remove('qp-disabled-field');
  }

  // PDF oculto (Recepciones solo Excel en tu UI)
  if (btnPdf) {
    btnPdf.classList.add('hidden');
    btnPdf.disabled = true;
  }
}

// =====================
// Habilitar / Deshabilitar filtros según selección de reporte
// =====================
function setFiltersEnabled(enabled) {
  const filterElements = [selIngenio, selProducto, selPuntoAlmacenaje, fDesde, fHasta];

  filterElements.forEach(el => {
    if (!el) return;
    el.disabled = !enabled;
    if (enabled) {
      el.classList.remove('qp-disabled-field');
    } else {
      el.classList.add('qp-disabled-field');
    }
  });

  // Botón buscar
  if (btnBuscar) {
    btnBuscar.disabled = !enabled;
  }
}

// Calcula fecha de inicio (2 meses atrás) y fecha de fin (hoy) en formato YYYY-MM-DD
function setDefaultDates() {
  const today = new Date();
  const twoMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 2, today.getDate());

  const formatDate = (d) => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  if (fDesde) fDesde.value = formatDate(twoMonthsAgo);
  if (fHasta) fHasta.value = formatDate(today);
}

// Limpia las fechas y los filtros cuando se deselecciona el reporte
function clearFilters() {
  if (fDesde) fDesde.value = '';
  if (fHasta) fHasta.value = '';
  if (selIngenio) selIngenio.value = '';
  if (selProducto) selProducto.value = '';
  if (selPuntoAlmacenaje) selPuntoAlmacenaje.value = '';
  puntoAlmacenajeContainer?.classList?.add('hidden');
}

// Maneja el cambio del select de reporte
function onReporteChange() {
  const mode = selReporte?.value?.trim();

  if (!mode) {
    // Sin reporte seleccionado: deshabilitar todo
    setFiltersEnabled(false);
    clearFilters();
    // Ocultar resultados previos
    resumenContainer?.classList?.add('hidden');
    pager?.classList?.add('hidden');
    hideTotales();
    showEstado('', 'Selecciona un reporte para comenzar', 'fa-filter');
  } else {
    // Reporte seleccionado: habilitar filtros y preseleccionar fechas
    setFiltersEnabled(true);
    setDefaultDates();
    updateFiltersStateRecepciones();
    showEstado('', 'Completa los filtros y presiona Buscar para ver los resultados', 'fa-filter');
  }
}

// =====================
// Carga dinámica de dropdowns
// =====================
async function populateDropdown(selectEl, url, defaultOptionText = 'Todos') {
  if (!selectEl) return;

  // Conservar solo la opción por defecto
  selectEl.innerHTML = `<option value="">${escapeHtml(defaultOptionText)}</option>`;

  try {
    const resp = await fetch(url, { method: 'GET' });
    if (!resp.ok) {
      console.error(`Error cargando ${url}: ${resp.status}`);
      return;
    }

    const json = await resp.json();
    if (!json.success || !Array.isArray(json.data)) return;

    json.data.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.code;
      opt.textContent = item.name;
      selectEl.appendChild(opt);
    });
  } catch (err) {
    console.error(`Error cargando dropdown desde ${url}:`, err);
  }
}

async function loadDropdowns() {
  await Promise.all([
    populateDropdown(selIngenio, API_ROUTES.clientes, 'Todos'),
    populateDropdown(selProducto, API_ROUTES.productos, 'Todos'),
    populateDropdown(selPuntoAlmacenaje, API_ROUTES.almacenes, 'Todos')
  ]);
}

// =====================
// Init
// =====================
document.addEventListener('DOMContentLoaded', () => {
  // Iniciar sin reporte seleccionado
  if (selReporte) selReporte.value = '';

  // Deshabilitar filtros inicialmente
  setFiltersEnabled(false);
  showEstado('', 'Selecciona un reporte para comenzar', 'fa-filter');

  // Cargar datos de dropdowns desde la API
  loadDropdowns();

  // Escuchar cambio de reporte
  selReporte?.addEventListener('change', onReporteChange);

  // Buscar
  btnBuscar?.addEventListener('click', () => buscarRecepciones(1));

  // Búsqueda local (si reactivas el toolbar)
  if (inputSearch) {
    inputSearch.addEventListener('input', () => {
      // Esto filtra SOLO la página cargada (si el API pagina).
      const term = inputSearch.value?.trim()?.toLowerCase() || '';
      if (!term) {
        renderTable(allRows);
        return;
      }
      const filtered = allRows.filter(r =>
        Object.values(r || {}).some(v => String(v ?? '').toLowerCase().includes(term))
      );
      renderTable(filtered);
    });
  }
});
