// ===== Helpers DOM
const q  = (s) => document.querySelector(s);
const qa = (s) => Array.from(document.querySelectorAll(s));

// ===== UI refs
const selReporte  = q('#f-reporte');   // mode: "1" | "2" | "3"
const selIngenio  = q('#f-ingenio');   // ej: "ICHP", "CASSA", ...
const selProducto = q('#f-producto');  // "AZ-001" | "MEL-001" | ''
const fDesde      = q('#f-desde');
const fHasta      = q('#f-hasta');

const btnBuscar = q('#btn-generar');
const btnPdf    = q('#btn-pdf');
const btnExcel  = q('#btn-excel');

const exportsBar = q('#exports');
const tblWrap    = q('.table-wrapper');
const thead      = q('#thead');
const tbody      = q('#tbody');
const toolbar    = q('#toolbar');
const estadoContainer = q('#reportes-estado');
const resumenContainer = q('#resumen-container');
const resumenTotal = q('#resumen-total');
const resumenMinEntrada = q('#resumen-min-entrada');
const resumenMaxSalida = q('#resumen-max-salida');


const spin    = q('#spin');     // opcional
const btnText = q('#btn-text'); // "Buscar"

// NUEVO: búsqueda y paginación
const inputSearch = q('#f-busqueda');   // <input type="search" id="f-busqueda" ...>
const pager       = q('#pager');        // <div id="pager"></div>
const pageSizeSel = q('#page-size');    // opcional: <select id="page-size">...</select>

// ===== Estado de tabla en cliente
let allRows = [];        // dataset crudo desde API
let filteredRows = [];   // tras filtros (ingenio/producto/búsqueda)
let page = 1;
let perPage = 25;        // default
let activeMode = '2';
let lastSearchParams = null; // Guardar parámetros de última búsqueda exitosa

// ===== Rutas del MVC
const API_ROUTES = {
  consultar: '/Reportes/Consultar',
  exportar:  '/Reportes/Export'
};

// ===== Configuración de reportes: qué filtros aplican
const REPORT_CONFIG = {
  '1': { // Lista Negra Motoristas
    name: 'Lista Negra Motoristas',
    requiredFilters: ['fechas'],
    optionalFilters: ['ingenio', 'producto']
  },
  '2': { // Ingreso de Camiones
    name: 'Ingreso de Camiones',
    requiredFilters: ['fechas'],
    optionalFilters: ['ingenio', 'producto']
  },
  '3': { // Requiere Barrido
    name: 'Requiere Barrido',
    requiredFilters: ['ingenio', 'fechas'],
    optionalFilters: []
  }
};

// ===== Validación básica (para habilitar/deshabilitar botón)
function isValid() {
  const mode = selReporte?.value?.trim();
  const d1 = fDesde?.value?.trim();
  const d2 = fHasta?.value?.trim();
  if (!mode || !d1 || !d2) return false;
  return new Date(d1) <= new Date(d2);
}

// ===== Validación específica por tipo de reporte
function validateReportFilters(mode) {
  const config = REPORT_CONFIG[mode];
  if (!config) {
    return { valid: false, message: 'Tipo de reporte no válido' };
  }

  const ingenio = selIngenio?.value?.trim();
  const from = fDesde?.value?.trim();
  const to = fHasta?.value?.trim();

  // Validar filtros requeridos
  if (config.requiredFilters.includes('ingenio') && !ingenio) {
    return { valid: false, message: `Para el reporte "${config.name}" debes seleccionar un Ingenio específico` };
  }

  if (config.requiredFilters.includes('fechas')) {
    if (!from || !to) {
      return { valid: false, message: 'Debes seleccionar las fechas de inicio y fin' };
    }

    const dateFrom = new Date(from);
    const dateTo = new Date(to);

    if (dateFrom > dateTo) {
      return { valid: false, message: 'La fecha de inicio no puede ser posterior a la fecha de fin' };
    }
  }

  return { valid: true };
}

function toggleBtn() { btnBuscar.disabled = !isValid(); }

// ===== Gestión dinámica de filtros según tipo de reporte
function updateFiltersState() {
  const mode = selReporte?.value?.trim();

  // mode="3" es "Requiere Barrido"
  if (mode === '3') {
    // Deshabilitar el filtro de Producto
    if (selProducto) {
      selProducto.disabled = true;
      selProducto.value = ''; // Limpiar selección
      selProducto.classList.add('qp-disabled-field');
    }
  } else {
    // Rehabilitar el filtro de Producto para otros reportes
    if (selProducto) {
      selProducto.disabled = false;
      selProducto.classList.remove('qp-disabled-field');
    }
  }
}

[selReporte, selIngenio, selProducto, fDesde, fHasta].forEach(el => {
  if (el) {
    el.addEventListener('input', toggleBtn);
    el.addEventListener('change', toggleBtn);
  }
});

// Ejecutar updateFiltersState cuando cambie el tipo de reporte
if (selReporte) {
  selReporte.addEventListener('change', updateFiltersState);
}

// ===== Funciones de manejo de estado UI
function showEstado(tipo, mensaje, icono = 'fa-filter') {
  if (!estadoContainer) return;

  // Remover clases de estado previas
  estadoContainer.classList.remove('loading', 'error', 'empty', 'hidden');

  // Aplicar nueva clase según tipo
  if (tipo) estadoContainer.classList.add(tipo);

  // Actualizar contenido
  const iconElement = estadoContainer.querySelector('.estado-icon');
  const textoElement = estadoContainer.querySelector('.estado-texto');

  if (iconElement) {
    iconElement.className = `fas ${icono} estado-icon`;
  }

  if (textoElement) {
    textoElement.textContent = mensaje;
  }
}

function hideEstado() {
  if (estadoContainer) {
    estadoContainer.classList.add('hidden');
  }
}

function showLoadingState() {
  showEstado('loading', 'Consultando datos, por favor espera...', 'fa-spinner fa-pulse');
}

function showEmptyState() {
  showEstado('empty', 'No se encontraron resultados con los filtros seleccionados', 'fa-inbox');
}

function showErrorState(mensaje = 'Ocurrió un error al consultar los datos') {
  showEstado('error', mensaje, 'fa-exclamation-triangle');
}

function showInitialState() {
  showEstado('', 'Completa los filtros y presiona Buscar para ver los resultados', 'fa-filter');
}

// ===== Funciones para manejo de resumen
function showResumen(summary) {
  if (!resumenContainer || !summary) return;

  if (resumenTotal) resumenTotal.textContent = summary.total || 0;
  if (resumenMinEntrada) resumenMinEntrada.textContent = formatDateTime(summary.minEntrada) || '-';
  if (resumenMaxSalida) resumenMaxSalida.textContent = formatDateTime(summary.maxSalida) || '-';

  resumenContainer.classList.remove('hidden');
}

function hideResumen() {
  if (resumenContainer) {
    resumenContainer.classList.add('hidden');
  }
}

// ===== Función para formatear fecha/hora
function formatDateTime(isoString) {
  if (!isoString) return '-';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '-';

    const pad = n => String(n).padStart(2, '0');
    const day = pad(date.getDate());
    const month = pad(date.getMonth() + 1);
    const year = date.getFullYear();
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());

    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return '-';
  }
}

// ===== Función para escapar HTML y prevenir XSS
function escapeHtml(text) {
  if (text == null) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Estado inicial
toggleBtn();
updateFiltersState();
showInitialState();
hideResumen();

// ===== Query builders
function buildBaseParams() {
  const p = new URLSearchParams();
  const from = fDesde?.value;
  const to   = fHasta?.value;
  if (from) p.set('from', from);
  if (to)   p.set('to', to);

  // Checkbox opcional #onlyCompleted (útil solo para mode=2)
  const onlyCompleted = q('#onlyCompleted');
  if (onlyCompleted && onlyCompleted.checked) p.set('onlyCompleted', 'true');
  return p;
}

// ===== Util: extraer filas desde payload flexible
const ARRAY_CANDIDATES = ['rows','data','items','registros','list','result'];
function extractRows(json) {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== 'object') return [];
  for (const k of ARRAY_CANDIDATES) {
    if (Array.isArray(json[k])) return json[k];
  }
  for (const v of Object.values(json)) {
    if (Array.isArray(v) && v.length && typeof v[0] === 'object') return v;
  }
  return [];
}

// ===== Filtros en cliente (Ingenio / Producto)
function applyClientFilters(rows) {
  const gi = selIngenio?.value?.trim();   // ej "ICHP"
  const gp = selProducto?.value?.trim();  // "AZ-001" | "MEL-001"

  return rows.filter(r => {
    let ok = true;

    // Ingenio (campo "Cliente" o "cliente")
    if (gi) {
      const cli = (r.cliente ?? r.Cliente ?? '').toString().toUpperCase();
      ok = ok && (cli === gi.toUpperCase() || cli.includes(gi.toUpperCase()));
    }

    // Producto (código exacto)
    if (gp) {
      const prod = (r.producto ?? r.Producto ?? '').toString().toUpperCase();
      ok = ok && prod === gp.toUpperCase();
    }

    return ok;
  });
}

// ===== Búsqueda por texto libre (todas las columnas)
function applyTextSearch(rows, term) {
  const t = (term || '').trim().toLowerCase();
  if (!t) return rows;
  return rows.filter(row => {
    for (const v of Object.values(row)) {
      if ((v ?? '').toString().toLowerCase().includes(t)) return true;
    }
    return false;
  });
}

// ===== Paginación (slice)
function slicePage(rows, page, perPage) {
  const start = (page - 1) * perPage;
  return rows.slice(start, start + perPage);
}

// ===== Render tabla
function renderTable(rowsForPage, colsSource) {
  if (!rowsForPage || !rowsForPage.length) {
    thead.innerHTML = '';
    tbody.innerHTML = '';
    tblWrap?.classList?.add('hidden');
    exportsBar?.classList?.add('hidden');
    return;
  }

  // columnas consistentes (derivadas del dataset filtrado completo)
  const cols = colsSource && colsSource.length
    ? Array.from(new Set(colsSource.flatMap(r => Object.keys(r))))
    : Array.from(new Set(rowsForPage.flatMap(r => Object.keys(r))));

  thead.innerHTML = '<tr>' + cols.map(c => `<th>${escapeHtml(c)}</th>`).join('') + '</tr>';
  tbody.innerHTML = rowsForPage.map(r =>
    '<tr>' + cols.map(c => {
      const value = r[c];
      // Intentar formatear si parece ser fecha ISO
      if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}T/)) {
        return `<td>${escapeHtml(formatDateTime(value))}</td>`;
      }
      return `<td>${escapeHtml(value ?? '')}</td>`;
    }).join('') + '</tr>'
  ).join('');

  tblWrap?.classList?.remove('hidden');
  exportsBar?.classList?.remove('hidden');
  btnPdf.disabled = false;
  btnExcel.disabled = false;
}

// ===== Render paginador
function renderPager(total, page, perPage) {
  if (!pager) return;

  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const from = total ? (page - 1) * perPage + 1 : 0;
  const to   = Math.min(total, page * perPage);

  // Ventana corta de páginas
  const pages = [];
  const maxBtns = 7;
  let start = Math.max(1, page - Math.floor(maxBtns/2));
  let end   = Math.min(totalPages, start + maxBtns - 1);
  if (end - start + 1 < maxBtns) start = Math.max(1, end - maxBtns + 1);
  for (let i = start; i <= end; i++) pages.push(i);

  pager.innerHTML = `
    <div class="pager">
      <div class="pager__info">
        Mostrando <strong>${from}-${to}</strong> de <strong>${total}</strong>
      </div>
      <div class="pager__controls">
        <button class="pager__btn" data-nav="prev" ${page<=1?'disabled':''}>&laquo; Anterior</button>
        ${pages.map(p => `
          <button class="pager__btn ${p===page?'is-active':''}" data-page="${p}">${p}</button>
        `).join('')}
        <button class="pager__btn" data-nav="next" ${page>=totalPages?'disabled':''}>Siguiente &raquo;</button>
      </div>
      <div class="pager__size">
        <label>Tamaño:
          <select id="page-size" class="pager__select">
            ${[10,25,50,100].map(n => `<option value="${n}" ${n===perPage?'selected':''}>${n}</option>`).join('')}
          </select>
        </label>
      </div>
    </div>
  `;

  // Delegación de eventos
  pager.querySelector('[data-nav="prev"]')?.addEventListener('click', () => {
    if (page > 1) { page--; runPipeline(); }
  });
  pager.querySelector('[data-nav="next"]')?.addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil(filteredRows.length / perPage));
    if (page < totalPages) { page++; runPipeline(); }
  });
  pager.querySelectorAll('[data-page]')?.forEach(btn => {
    btn.addEventListener('click', () => {
      page = parseInt(btn.getAttribute('data-page'), 10) || 1;
      runPipeline();
    });
  });
  pager.querySelector('#page-size')?.addEventListener('change', (e) => {
    perPage = parseInt(e.target.value, 10) || 25;
    page = 1; // reset
    runPipeline();
  });
}

// ===== Pipeline: filtros -> búsqueda -> paginar -> render
function runPipeline() {
  filteredRows = applyClientFilters(allRows);
  filteredRows = applyTextSearch(filteredRows, inputSearch?.value);

  const pageRows = slicePage(filteredRows, page, perPage);
  renderTable(pageRows, filteredRows);
  renderPager(filteredRows.length, page, perPage);
  // Mostrar la toolbar solo cuando haya datos cargados
  if (toolbar) {
    if (allRows.length > 0) toolbar.classList.remove('hidden');
    else toolbar.classList.add('hidden');
  }
}

// ===== Debounce simple para búsqueda
function debounce(fn, ms=250) {
  let t; return (...args) => {
    clearTimeout(t); t = setTimeout(() => fn(...args), ms);
  };
}
inputSearch?.addEventListener('input', debounce(() => {
  page = 1;
  runPipeline();
}, 200));

// ===== Acciones
btnBuscar?.addEventListener('click', async () => {
  const mode = selReporte.value;

  // Validación básica
  if (!isValid()) {
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        title: 'Campos incompletos',
        text: 'Selecciona el tipo de reporte y un rango de fechas válido',
        icon: 'warning',
        confirmButtonColor: '#182A6E'
      });
    } else {
      alert('Selecciona el tipo de reporte y un rango de fechas válido.');
    }
    return;
  }

  // Validación específica por tipo de reporte
  const validation = validateReportFilters(mode);
  if (!validation.valid) {
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        title: 'Validación de filtros',
        text: validation.message,
        icon: 'warning',
        confirmButtonColor: '#182A6E'
      });
    } else {
      alert(validation.message);
    }
    return;
  }

  activeMode = mode;

  // Preparar parámetros de búsqueda (formato YYYY-MM-DD)
  const ingenioCode = selIngenio?.value?.trim() || '';
  const from = fDesde?.value?.trim(); // Ya viene en formato YYYY-MM-DD del input date
  const to = fHasta?.value?.trim();   // Ya viene en formato YYYY-MM-DD del input date
  const producto = selProducto?.value?.trim() || '';

  // Guardar parámetros para exportación
  lastSearchParams = {
    mode,
    ingenioCode,
    from,
    to,
    producto,
    reportKey: REPORT_CONFIG[mode]?.name || 'Reporte'
  };

  console.log('Parámetros de búsqueda:', lastSearchParams);

  // Loading state
  btnBuscar.disabled = true;
  if (spin) spin.classList.remove('hidden');
  if (btnText) btnText.textContent = 'Buscando…';
  showLoadingState();

  try {
    // 1) Construir URL de consulta
    let url;
    if (mode === '3') {
      // Para Requiere Barrido, usar parámetros específicos
      const params = new URLSearchParams({
        mode: '3',
        ingenioCode,
        from,
        to
      });
      url = `${API_ROUTES.consultar}?${params.toString()}`;
    } else {
      // Para otros reportes, usar buildBaseParams existente
      const params = buildBaseParams();
      params.set('mode', mode);
      url = `${API_ROUTES.consultar}?${params.toString()}`;
    }

    const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });

    // Manejo de errores HTTP específicos
    if (resp.status === 403) {
      hideEstado();
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          title: 'Acceso Denegado',
          text: 'No tienes permisos para acceder a este reporte. Contacta al administrador.',
          icon: 'error',
          confirmButtonColor: '#182A6E'
        });
      } else {
        alert('No tienes permisos para acceder a este reporte');
      }
      return;
    }

    if (!resp.ok) {
      const errorText = await resp.text();
      console.error('Error del servidor:', errorText);
      throw new Error(`HTTP ${resp.status}`);
    }

    const json = await resp.json();

    // 2) Procesar respuesta según el tipo de reporte
    if (mode === '3') {
      // Requiere Barrido: response tiene {rows, summary}
      const rowsRaw = json.rows || [];
      allRows = Array.isArray(rowsRaw) ? rowsRaw : [];

      // Mostrar resumen si existe
      if (json.summary) {
        showResumen(json.summary);
      } else {
        hideResumen();
      }
    } else {
      // Otros reportes: usar extractRows existente
      const rowsRaw = extractRows(json);
      allRows = Array.isArray(rowsRaw) ? rowsRaw : [];
      hideResumen(); // No hay resumen en otros reportes
    }

    page = 1; // reset

    // 3) Manejar estado visual según resultados
    if (allRows.length === 0) {
      showEmptyState();
      hideResumen();
    } else {
      hideEstado();
    }

    runPipeline();

    // 4) Configurar botones de exportación (SIEMPRE para modo 3 "Requiere Barrido")
    if (mode === '3') {
      // Habilitar botones inmediatamente después de búsqueda válida
      exportsBar?.classList?.remove('hidden');
      btnPdf.disabled = false;
      btnExcel.disabled = false;
    }

    btnPdf.onclick = () => {
      if (!lastSearchParams) return;

      const p = new URLSearchParams({
        mode: lastSearchParams.mode,
        from: lastSearchParams.from,
        to: lastSearchParams.to,
        format: 'pdf'
      });

      if (lastSearchParams.mode === '3') {
        p.set('ingenioCode', lastSearchParams.ingenioCode);
      }

      window.location = `${API_ROUTES.exportar}?${p.toString()}`;
    };

    btnExcel.onclick = () => {
      if (!lastSearchParams) return;

      const p = new URLSearchParams({
        mode: lastSearchParams.mode,
        from: lastSearchParams.from,
        to: lastSearchParams.to,
        format: 'excel'
      });

      if (lastSearchParams.mode === '3') {
        p.set('ingenioCode', lastSearchParams.ingenioCode);
      }

      window.location = `${API_ROUTES.exportar}?${p.toString()}`;
    };

  } catch (err) {
    console.error('Error en consulta:', err);
    allRows = [];
    hideResumen();
    runPipeline();
    showErrorState('No se pudo obtener el reporte. Verifica tu conexión e inténtalo nuevamente.');
  } finally {
    btnBuscar.disabled = false;
    if (spin) spin.classList.add('hidden');
    if (btnText) btnText.textContent = 'Buscar';
  }
});
