// ===== Helpers DOM
const q  = (s) => document.querySelector(s);
const qa = (s) => Array.from(document.querySelectorAll(s));

// ===== UI refs
const selReporte  = q('#f-reporte');   // mode: "1" | "2"
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

// ===== Rutas del MVC
const API_ROUTES = {
  consultar: '/Reportes/Consultar',
  exportar:  '/Reportes/Export'
};

// ===== Validación
function isValid() {
  const mode = selReporte?.value?.trim();
  const d1 = fDesde?.value?.trim();
  const d2 = fHasta?.value?.trim();
  if (!mode || !d1 || !d2) return false;
  return new Date(d1) <= new Date(d2);
}

function toggleBtn() { btnBuscar.disabled = !isValid(); }

[selReporte, selIngenio, selProducto, fDesde, fHasta].forEach(el => {
  if (el) {
    el.addEventListener('input', toggleBtn);
    el.addEventListener('change', toggleBtn);
  }
});
toggleBtn();

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

  thead.innerHTML = '<tr>' + cols.map(c => `<th>${c}</th>`).join('') + '</tr>';
  tbody.innerHTML = rowsForPage.map(r =>
    '<tr>' + cols.map(c => `<td>${r[c] ?? ''}</td>`).join('') + '</tr>'
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
  if (!isValid()) {
    alert('Selecciona el tipo de reporte y un rango de fechas válido.');
    return;
  }

  const mode = selReporte.value; // "1" o "2"
  activeMode = mode;

  // Loading state
  btnBuscar.disabled = true;
  if (spin)    spin.classList.remove('hidden');
  if (btnText) btnText.textContent = 'Buscando…';

  try {
    // 1) Consultar JSON al MVC (ahora SÍ enviamos mode)
    const params = buildBaseParams();
    params.set('mode', mode);
    const url = `${API_ROUTES.consultar}?${params.toString()}`;

    const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const json = await resp.json();

    // 2) Guardar dataset y correr pipeline
    const rowsRaw = extractRows(json);
    allRows = Array.isArray(rowsRaw) ? rowsRaw : [];
    page = 1; // reset
    runPipeline();

    // 3) Wire de exportaciones
    const base = buildBaseParams();
    btnPdf.onclick = () => {
      const p = new URLSearchParams(base);
      p.set('mode', mode);
      p.set('format', 'pdf');
      window.location = `${API_ROUTES.exportar}?${p.toString()}`;
    };
    btnExcel.onclick = () => {
      const p = new URLSearchParams(base);
      p.set('mode', mode);
      p.set('format', 'excel');
      window.location = `${API_ROUTES.exportar}?${p.toString()}`;
    };

  } catch (err) {
    console.error(err);
    allRows = [];
    runPipeline();
    alert('No se pudo obtener el reporte. Revisa los filtros e inténtalo nuevamente.');
  } finally {
    btnBuscar.disabled = false;
    if (spin)    spin.classList.add('hidden');
    if (btnText) btnText.textContent = 'Buscar';
  }
});
