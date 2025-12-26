let autoRefreshEnabled = true;
let autoRefreshInterval = null;
let refreshIntervalMs = 10000; // 10 segundos fijo
let lastDataHash = null; // Para detectar cambios
let lastFiltersHash = null;
let modalsOpen = 0; // Contador de modales abiertos
let inFlight = false;
let currentAbort = null;

function startAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
  }

  autoRefreshInterval = setInterval(function () {
    if (autoRefreshEnabled && modalsOpen === 0) {
      console.log('Verificando actualizaciones automáticamente...');
      checkForUpdates();
      // También refresca gráficos por placa si están en la vista
      if (document.getElementById("chart-transito-placa")
        || document.getElementById("chart-descarga-placa")
        || document.getElementById("chart-espera-placa")) {
        fetchAndRenderPlacas();
      }
    } else {
      console.log('Auto-refresh pausado - Modales abiertos:', modalsOpen);
    }
  }, refreshIntervalMs);

  console.log('Auto-refresh automático iniciado cada 30 segundos');
}

async function checkForUpdates() {
  await fetchAndRender();
}

// ====== Colores corporativos ======
const COLOR_BLUE = "#0000A3";   // Volteo
const COLOR_ORANGE = "#FD6104"; // Plana
const COLOR_BLACK = "#82807F";  // Pipa
const AXIS_COLOR = "#9aa3b2";
const GRID_COLOR = "rgba(0,0,0,0.12)";

// ====== Flags ======
const USE_BAR_RECIBIDOS = false; // pon true si prefieres barras
const FIT_TO_BOX = false;        // modo scroll (gráfico más ancho que el contenedor)

// ====== Config de scroll/ancho ======
const SCROLL_CFG = {
  pxPerLabel: 28,
  overshoot: 1.08,
  minBase: 0,
  maxWide: 3000
};

// ====== Estado (instancias de charts) ======
let chFinalizados, chRecibidos, chAzucar, chPromedio;
let lastLabels = [];
let lastLabelsSig = "";

// ====== Helpers DOM / formato ======
const $ = (id) => document.getElementById(id);
const byId = $;

function num(n) { return Number(n || 0).toLocaleString("es-SV"); }
function fmtHHMM(mins) {
  if (mins == null || isNaN(mins)) return "00 h 00 min";
  const h = Math.floor(mins / 60), m = Math.round(mins % 60);
  return `${String(h).padStart(2, "0")} h ${String(m).padStart(2, "0")} min`;
}
function fmtMMSS(secs) {
  if (secs == null || isNaN(secs)) return "0 min 00 seg";
  const m = Math.floor(secs / 60), s = Math.round(secs % 60);
  return `${m} min ${String(s).padStart(2, "0")} seg`;
}
function toMMSS(totalSeconds) {
  const s = Math.max(0, Math.round(Number(totalSeconds) || 0));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${String(ss).padStart(2, "0")}`;
}

// ====== Leyenda mejorada ======
function upgradeLegendMarkup(root = document) {
  const legends = root.querySelectorAll('.legend');
  legends.forEach(lg => {
    const firstText = Array.from(lg.childNodes).find(
      n => n.nodeType === Node.TEXT_NODE && n.textContent.trim()
    );
    if (firstText && !lg.querySelector('.legend-title')) {
      const title = document.createElement('span');
      title.className = 'legend-title';
      title.textContent = firstText.textContent.trim().replace(/\s+/, ' ');
      lg.insertBefore(title, firstText);
      lg.removeChild(firstText);
    }
    if (lg.querySelector('.legend-item')) return;
    const toKind = (dot) =>
      dot.classList.contains('dot-blue') ? 'volteo' :
        dot.classList.contains('dot-orange') ? 'plana' :
          dot.classList.contains('dot-black') ? 'pipa' : null;

    lg.querySelectorAll('.dot').forEach(dot => {
      const kind = toKind(dot);
      if (!kind) return;
      let next = dot.nextSibling;
      while (next && next.nodeType === Node.TEXT_NODE && !next.textContent.trim()) {
        next = next.nextSibling;
      }
      const item = document.createElement('span');
      item.className = `legend-item legend-${kind}`;
      lg.insertBefore(item, dot);
      item.appendChild(dot);
      if (next) item.appendChild(next);
    });
  });
}
function toggleLegendFor(canvasId, vis) {
  const card = byId(canvasId)?.closest('.chart-card');
  if (!card) return;
  upgradeLegendMarkup(card);
  const show = (cls, on) => {
    card.querySelectorAll(`.legend .legend-${cls}`).forEach(el => { el.style.display = on ? '' : 'none'; });
  };
  show('volteo', !!vis.volteo);
  show('plana', !!vis.plana);
  show('pipa', !!vis.pipa);
}

// ====== Scroll helpers ======
function ensureScrollableWidth(canvasId, labels, cfg = SCROLL_CFG) {
  if (FIT_TO_BOX) return;
  const canvas = $(canvasId);
  if (!canvas) return;
  const scroll = canvas.closest(".chart-scroll");
  const inner = scroll?.querySelector(".chart-inner");
  if (!inner || !scroll) return;

  const n = (labels?.length || 0);
  const contW = scroll.clientWidth || 0;
  const required = n * cfg.pxPerLabel;

  let width;
  if (required <= contW) width = contW;
  else {
    width = Math.max(required, Math.ceil(contW * cfg.overshoot));
    if (cfg.maxWide) width = Math.min(width, cfg.maxWide);
  }
  inner.style.width = width + "px";
}
function ensureAllScrollableWidths(labels) {
  ensureScrollableWidth("chart-finalizados", labels);
  ensureScrollableWidth("chart-recibidos", labels);
  ensureScrollableWidth("chart-azucar", labels);
  ensureScrollableWidth("chart-promedio", labels);
}
function refreshChartAfterResize(id) {
  const chart = Chart.getChart(id);
  if (chart) chart.resize();
}

// ====== Escala Y ======
function calcTightScale(maxVal, { minTop = 5, headroom = 0.15 } = {}) {
  const vmax = Math.max(0, Number(maxVal) || 0);
  const baseMax = vmax === 0 ? minTop : vmax * (1 + headroom);
  const targetTicks = 5;
  const rough = baseMax / targetTicks;
  const pow = Math.pow(10, Math.floor(Math.log10(rough || 1)));
  const mult = rough / pow;
  const niceMult = mult <= 1 ? 1 : mult <= 2 ? 2 : mult <= 5 ? 5 : 10;
  const step = niceMult * pow;
  const max = Math.max(minTop, Math.ceil(baseMax / step) * step);
  return { max, step };
}

// ====== UI sizes ======
const CHART_UI = {
  fontSize: 11,
  pointRadius: 2,
  lineWidth: 2,
  xRotation: 90,
  gridWidth: 1,
  padBottom: 28
};

// ====== Opciones base ======
function baseOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    resizeDelay: 100,
    interaction: { mode: "index", intersect: false },
    layout: { padding: { top: 0, right: 8, bottom: CHART_UI.padBottom, left: 8 } },
    elements: {
      point: { radius: CHART_UI.pointRadius, hitRadius: 6 },
      line: { borderWidth: CHART_UI.lineWidth }
    },
    scales: {
      x: {
        offset: false,
        ticks: {
          color: AXIS_COLOR,
          autoSkip: false,
          minRotation: CHART_UI.xRotation,
          maxRotation: CHART_UI.xRotation,
          padding: 6,
          font: { size: CHART_UI.fontSize }
        },
        grid: { display: true, color: GRID_COLOR, lineWidth: CHART_UI.gridWidth, drawBorder: false },
        border: { display: true, color: AXIS_COLOR, width: 1 }
      },
      y: {
        beginAtZero: true,
        ticks: { color: AXIS_COLOR, padding: 6, font: { size: CHART_UI.fontSize } },
        grid: { display: true, color: GRID_COLOR, lineWidth: CHART_UI.gridWidth, drawBorder: false },
        border: { display: true, color: AXIS_COLOR, width: 1 }
      }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: "index",
        intersect: false,
        titleFont: { size: CHART_UI.fontSize + 1 },
        bodyFont: { size: CHART_UI.fontSize }
      },
      zoom: {
        pan: { enabled: true, mode: 'x' },
        zoom: { enabled: true, mode: 'x' }
      }
    }
  };
}

// ====== Constructores de charts ======
function line2Series(canvasId, labA, labB, labC) {
  const ctx = $(canvasId);
  const opts = baseOptions();
  return new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        { label: labA, borderColor: COLOR_BLUE, backgroundColor: COLOR_BLUE, data: [], tension: .25, pointRadius: CHART_UI.pointRadius, borderWidth: CHART_UI.lineWidth, fill: false },
        { label: labB, borderColor: COLOR_ORANGE, backgroundColor: COLOR_ORANGE, data: [], tension: .25, pointRadius: CHART_UI.pointRadius, borderWidth: CHART_UI.lineWidth, fill: false },
        { label: labC, borderColor: COLOR_BLACK, backgroundColor: COLOR_BLACK, data: [], tension: .25, pointRadius: CHART_UI.pointRadius, borderWidth: CHART_UI.lineWidth, fill: false }
      ]
    },
    options: opts
  });
}
function line1Series(canvasId, label) {
  const ctx = $(canvasId);
  const opts = baseOptions();
  return new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        { label, borderColor: COLOR_BLUE, backgroundColor: COLOR_BLUE, data: [], tension: .25, pointRadius: CHART_UI.pointRadius, borderWidth: CHART_UI.lineWidth, fill: false }
      ]
    },
    options: opts
  });
}
function bar2Series(canvasId, labA, labB, labC) {
  const ctx = $(canvasId);
  const opts = baseOptions();
  opts.scales.x.stacked = false;
  opts.scales.y.stacked = false;
  return new Chart(ctx, {
    type: "bar",
    data: {
      labels: [],
      datasets: [
        { label: labA, backgroundColor: COLOR_BLUE, data: [], borderRadius: 6, barPercentage: 0.7, categoryPercentage: 0.7 },
        { label: labB, backgroundColor: COLOR_ORANGE, data: [], borderRadius: 6, barPercentage: 0.7, categoryPercentage: 0.7 },
        { label: labC, backgroundColor: COLOR_BLACK, data: [], borderRadius: 6, barPercentage: 0.7, categoryPercentage: 0.7 }
      ]
    },
    options: opts
  });
}

// ====== Setters 1/2/3 series ======
function setLine2(chart, labels, a, b, yTitle = "", yOverride) {
  const A = (a || []).map(Number);
  const B = (b || []).map(Number);
  chart.data.labels = labels || [];
  chart.data.datasets[0].data = A;
  chart.data.datasets[1].data = B;

  const ymax = Math.max(0, ...A, ...B);
  const base = calcTightScale(ymax, { minTop: yOverride?.minTop ?? 5, headroom: yOverride?.headroom ?? 0.15 });
  const final = { ...base, ...yOverride };

  const y = chart.options.scales.y;
  y.min = 0;
  y.max = final.max;
  y.ticks.stepSize = final.step;
  y.ticks.precision = 0;
  y.ticks.callback = (val) => Number(val).toLocaleString("es-SV");
  y.title = { display: !!yTitle, text: yTitle };
  chart.update();
}
function setLine1(chart, labels, a, yTitle = "", yOverride) {
  const A = (a || []).map(Number);
  chart.data.labels = labels || [];
  chart.data.datasets[0].data = A;

  const ymax = Math.max(0, ...A);
  const base = calcTightScale(ymax, { minTop: yOverride?.minTop ?? 5, headroom: yOverride?.headroom ?? 0.15 });
  const final = { ...base, ...yOverride };

  const y = chart.options.scales.y;
  y.min = 0;
  y.max = final.max;
  y.ticks.stepSize = final.step;
  y.ticks.precision = 0;
  y.ticks.callback = (val) => Number(val).toLocaleString("es-SV");
  y.title = { display: !!yTitle, text: yTitle };
  chart.update();
}
function setBar2(chart, labels, a, b, yTitle = "", yOverride) {
  setLine2(chart, labels, a, b, yTitle, yOverride);
}

// === 3 series (Volteo, Plana, Pipa) ===
function setLine3(chart, labels, a, b, c, yTitle = "", yOverride) {
  const A = (a || []).map(Number);
  const B = (b || []).map(Number);
  const C = (c || []).map(Number);
  chart.data.labels = labels || [];
  chart.data.datasets[0].data = A;
  chart.data.datasets[1].data = B;
  chart.data.datasets[2].data = C;

  const ymax = Math.max(0, ...A, ...B, ...C);
  const base = calcTightScale(ymax, { minTop: yOverride?.minTop ?? 5, headroom: yOverride?.headroom ?? 0.15 });
  const final = { ...base, ...yOverride };

  const y = chart.options.scales.y;
  y.min = 0;
  y.max = final.max;
  y.ticks.stepSize = final.step;
  y.ticks.precision = 0;
  y.ticks.callback = (val) => Number(val).toLocaleString("es-SV");
  y.title = { display: !!yTitle, text: yTitle };
  chart.update();
}
function setBar3(chart, labels, a, b, c, yTitle = "", yOverride) {
  setLine3(chart, labels, a, b, c, yTitle, yOverride);
}

// ====== Helpers de mapeo del response (Estatus + Rows) ======
function normalizeTruckType(t) {
  const u = String(t || '').toUpperCase().trim().replace(/\s+/g, '');
  if (u === 'V' || u === 'VOLTEO' || u === 'VOLTEOS' || u === 'T') return 'volteo';
  if (u === 'R' || u === 'PLANA' || u === 'PLANAS' || u === 'PLANO' || u === 'PLANOS') return 'plana';
  if (u === 'P' || u === 'PI' || u === 'PIPA' || u === 'PIPAS') return 'pipa';
  return 'otro';
}
function normalizeProductKind(value) {
  const v = (value ?? '').toString().trim().toUpperCase();
  if (v === '' || v === 'TODOS' || v === 'ALL') return 'todos';
  if (v.includes('MEL') || v.includes('MEL-001')) return 'melaza';
  if (v.includes('AZ') || v.includes('AZ-001')) return 'azucar';
  return 'otros';
}
const selectedProductOnLoad = document.getElementById('f-producto')?.value || '';
const kindOnLoad = normalizeProductKind(selectedProductOnLoad);

function fmtDDMMYY(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}-${mm}-${yy}`;
}
function buildLabelsFromRows(rows) {
  const set = new Set();
  for (const r of rows || []) {
    const id = Number(r.predefined_status_id);
    if (id !== 2 && id !== 12) continue; // sólo recibidos/finalizados
    const d = new Date(r.fecha); d.setHours(0, 0, 0, 0);
    set.add(fmtDDMMYY(d));
  }
  return Array.from(set).sort((a, b) => {
    const [da, ma, ya] = a.split('-').map(Number);
    const [db, mb, yb] = b.split('-').map(Number);
    return new Date(2000 + ya, ma - 1, da) - new Date(2000 + yb, mb - 1, db);
  });
}
function buildSeriesByStatus(rows, labels, statusId) {
  const idx = Object.fromEntries(labels.map((l, i) => [l, i]));
  const serie = {
    volteo: Array(labels.length).fill(0),
    plana: Array(labels.length).fill(0),
    pipa: Array(labels.length).fill(0),
    total: Array(labels.length).fill(0)
  };
  for (const r of rows || []) {
    if (Number(r.predefined_status_id) !== Number(statusId)) continue;
    const d = new Date(r.fecha); d.setHours(0, 0, 0, 0);
    const key = fmtDDMMYY(d);
    const i = idx[key]; if (i == null) continue;
    const cat = normalizeTruckType(r.truck_type);
    const val = Number(r.total) || 0;
    if (cat === 'volteo') serie.volteo[i] += val;
    else if (cat === 'plana') serie.plana[i] += val;
    else if (cat === 'pipa') serie.pipa[i] += val;
    serie.total[i] += val;
  }
  return serie;
}

// === LEGADO (bloques viejos) -> shape unificado ===
function mapResumenFromLegacyBlocks(resp) {
  const kpi = {
    enTransito: Number(resp?.EnTransito?.Total || 0),
    enParqueo: Number(resp?.Prechequeado?.Total || 0),
    autorizados: Number(resp?.Autorizado?.Total || 0),
    tiempoEsperaMin: 0,
    tiempoAtencionMin: 0,
    flujoPorDiaTon: 0,
    promDescargaPlanasSeg: 0,
    promDescargaVolteoSeg: 0,
    promDescargaPipaSeg: 0
  };

  const fechasSet = new Set();
  const pushFechas = (dias) => (dias || []).forEach(d => fechasSet.add(String(d.Fecha)));
  pushFechas(resp?.Finalizado?.Dias);
  pushFechas(resp?.Prechequeado?.Dias);
  const etiquetas = Array.from(fechasSet).sort((a, b) => {
    const [da, ma, ya] = a.split('-').map(Number);
    const [db, mb, yb] = b.split('-').map(Number);
    return new Date(2000 + ya, ma - 1, da) - new Date(2000 + yb, mb - 1, db);
  });

  function serieFromDias(dias) {
    const idx = Object.fromEntries(etiquetas.map((l, i) => [l, i]));
    const empty = {
      total: new Array(etiquetas.length).fill(0),
      volteo: new Array(etiquetas.length).fill(0),
      plana: new Array(etiquetas.length).fill(0),
      pipa: new Array(etiquetas.length).fill(0),
    };
    for (const d of (dias || [])) {
      const i = idx[String(d.Fecha)];
      if (i == null) continue;
      const tt = d.TruckType || {};
      empty.total[i] += Number(d.Total || 0);
      empty.volteo[i] += Number(tt.Volteo || 0);
      empty.plana[i] += Number(tt.Planas || 0);
      empty.pipa[i] += Number(tt.Pipa || 0);
    }
    return empty;
  }

  const finalizados = serieFromDias(resp?.Finalizado?.Dias);
  const recibidos = serieFromDias(resp?.Prechequeado?.Dias);

  return {
    kpi,
    charts: { fechas: etiquetas, finalizados, recibidos }
  };
}

// === NUEVO: parser único robusto (soluciona la falta de mapResumenResponse) ===
function mapResumenResponse(resp) {
  if (!resp) return null;

  // /dashboard/summary con debug devuelve { ok, dto, debug }; en normal, devuelve {kpi, charts}
  const maybeDto = resp?.dto || resp;
  if (maybeDto?.kpi && maybeDto?.charts) return maybeDto;

  // Si viene “v2 crudo” con Rows + Estatus
  if (resp?.Rows && Array.isArray(resp.Rows)) {
    const etiquetas = buildLabelsFromRows(resp.Rows);
    const finalizados = buildSeriesByStatus(resp.Rows, etiquetas, 12);
    const recibidos = buildSeriesByStatus(resp.Rows, etiquetas, 2);
    const kpi = {
      enTransito: Number(resp?.Estatus?.EnTransito || 0),
      enParqueo: Number(resp?.Estatus?.EnParqueo || resp?.Prechequeado?.Total || 0),
      autorizados: Number(resp?.Estatus?.Autorizado || resp?.Autorizado?.Total || 0),
      tiempoEsperaMin: 0, tiempoAtencionMin: 0, flujoPorDiaTon: 0,
      promDescargaPlanasSeg: 0, promDescargaVolteoSeg: 0, promDescargaPipaSeg: 0
    };
    return { kpi, charts: { fechas: etiquetas, finalizados, recibidos } };
  }

  // Legado por bloques
  return mapResumenFromLegacyBlocks(resp);
}

document.addEventListener("DOMContentLoaded", () => {
  // Fecha por defecto: últimos 30 días
  const hasta = new Date();
  const desde = new Date(hasta); desde.setDate(hasta.getDate() - 30);
  $("f-desde") && ($("f-desde").value = desde.toISOString().slice(0, 10));
  $("f-hasta") && ($("f-hasta").value = hasta.toISOString().slice(0, 10));

  // Listeners filtros
  ["f-desde", "f-hasta", "f-ingenio", "f-producto", "f-hour-start", "f-hour-end"]
    .forEach(id => $(id)?.addEventListener("change", fetchAndRender));
  $("f-apply")?.addEventListener("click", fetchAndRender);

  // Crear charts vacíos...
  chFinalizados = line2Series("chart-finalizados", "Volteo", "Plana", "Pipa");
  chRecibidos = USE_BAR_RECIBIDOS
    ? bar2Series("chart-recibidos", "Volteo", "Plana", "Pipa")
    : line2Series("chart-recibidos", "Volteo", "Plana", "Pipa");
  chAzucar = line2Series("chart-azucar", "Azúcar", "Melaza", "Otros");
  chPromedio = line2Series("chart-promedio", "Volteo", "Plana", "Pipa");

  // Resize...
  window.addEventListener('resize', () => {
    if (!FIT_TO_BOX && lastLabels?.length) {
      ensureAllScrollableWidths(lastLabels);
      ["chart-finalizados", "chart-recibidos", "chart-azucar", "chart-promedio"].forEach(refreshChartAfterResize);
    }
  });

  // Primer render
  fetchAndRender();
  startAutoRefresh();
});


function stableStringify(obj) {
  // stringify determinista por claves (para que el hash no cambie por orden)
  const seen = new WeakSet();
  return JSON.stringify(obj, function (k, v) {
    if (v && typeof v === 'object') {
      if (seen.has(v)) return;
      seen.add(v);
      const keys = Object.keys(v).sort();
      const out = {};
      for (const key of keys) out[key] = v[key];
      return out;
    }
    return v;
  });
}

// Extrae SOLO lo relevante para detectar cambios (evita ruido)
function buildDataSignatureDto(dto) {
  try {
    const L = dto?.charts?.fechas || [];
    const f = dto?.charts?.finalizados || {};
    const r = dto?.charts?.recibidos || {};
    const k = dto?.kpi || {};
    return {
      fechas: L,
      fin: { v: f.volteo || [], p: f.plana || [], pi: f.pipa || [] },
      rec: { v: r.volteo || [], p: r.plana || [], pi: r.pipa || [] },
      kpi: {
        t: k.enTransito || 0,
        p: k.enParqueo || 0,
        a: k.autorizados || 0,
        te: k.tiempoEsperaMin || 0,
        ta: k.tiempoAtencionMin || 0,
        fl: k.flujoPorDiaTon || 0
      }
    };
  } catch {
    return null;
  }
}

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return h;
}

async function fetchDataOnly() {
  const selectedProduct = $("f-producto")?.value || "";
  const q = new URLSearchParams({
    from: $("f-desde")?.value,
    to: $("f-hasta")?.value,
    ingenio: $("f-ingenio")?.value || "",
    product: selectedProduct,
    _ts: Date.now().toString() // evita caché
  });

  // Horas (si existen)
  const hsEl = $("f-hour-start");
  const heEl = $("f-hour-end");
  if (hsEl && heEl) {
    const hf = parseInt((hsEl.value || "00:00").split(":")[0], 10);
    const ht = parseInt((heEl.value || "23:59").split(":")[0], 10);
    const hourFrom = Number.isFinite(hf) ? Math.max(0, Math.min(23, hf)) : 0;
    const hourTo = Number.isFinite(ht) ? Math.max(0, Math.min(23, ht)) : 23;
    q.set("hourFrom", String(hourFrom));
    q.set("hourTo", String(hourTo));
  }

  const res = await fetch(`/dashboard/summary?${q.toString()}`, {
    method: "GET",
    cache: "reload",
    headers: {
      "Accept": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0"
    },
    credentials: "same-origin"
  });
  console.log("[FETCH] Summary URL:", res);

  if (!res.ok) return null;

  const raw = await res.json();
  const data = mapResumenResponse(raw);
  return { raw, data };
}


// ====== Llamada al endpoint + pintado ======
async function fetchAndRender() {
  if (inFlight) return;
  if (modalsOpen > 0) return;

  inFlight = true;
  let pack = null;
  try {
    pack = await fetchDataOnly();   // ← usa la nueva función
  } catch (e) {
    console.error("Error obteniendo datos:", e);
  } finally {
    inFlight = false;
  }
  if (!pack || !pack.data) return;

  // === Hash de filtros (si cambian, SIEMPRE repinta aunque el dto sea igual) ===
  const fHashObj = {
    from: $("f-desde")?.value || "",
    to: $("f-hasta")?.value || "",
    ingenio: $("f-ingenio")?.value || "",
    product: $("f-producto")?.value || "",
    hourFrom: $("f-hour-start")?.value || "",
    hourTo: $("f-hour-end")?.value || "",
  };
  const filtersHash = stableStringify(fHashObj);

  // === Hash del dto para evitar repintar si no cambió ===
  const sig = buildDataSignatureDto(pack.data);
  const sigStr = stableStringify(sig);
  const newHash = simpleHash(sigStr);
  const filtersChanged = (lastFiltersHash !== filtersHash);

  if (lastDataHash !== null && newHash === lastDataHash && !filtersChanged) {
    console.log("Sin cambios en los datos. No se repinta.");
    return;
  }
  lastDataHash = newHash;
  lastFiltersHash = filtersHash;

  // === Render (pega aquí TU código de pintado actual; KPIs + charts) ===
  const data = pack.data;

  // … KPIs …
  byId("kpi-en-transito").innerText = num(data.kpi.enTransito);
  byId("kpi-en-parqueo").innerText = num(data.kpi.enParqueo);
  byId("kpi-autorizados").innerText = num(data.kpi.autorizados);
  byId("kpi-tiempo-espera").innerText = fmtHHMM(data.kpi.tiempoEsperaMin);
  byId("kpi-tiempo-atencion").innerText = fmtHHMM(data.kpi.tiempoAtencionMin);
  byId("kpi-flujo-dia").innerText = `${Number(data.kpi.flujoPorDiaTon || 0).toFixed(2)} Ton`;
  byId("kpi-prom-planas").innerText = fmtMMSS(data.kpi.promDescargaPlanasSeg);
  byId("kpi-prom-volteo").innerText = fmtMMSS(data.kpi.promDescargaVolteoSeg);
  byId("kpi-prom-pipa").innerText = fmtMMSS(data.kpi.promDescargaPipaSeg);

  // … visibilidad por producto …
  const selectedProduct = $("f-producto")?.value || "";
  const kind = normalizeProductKind(selectedProduct);
  const kPlanas = byId("kpi-prom-planas")?.closest(".kpi");
  const kVolteo = byId("kpi-prom-volteo")?.closest(".kpi");
  const kPipa = byId("kpi-prom-pipa")?.closest(".kpi");
  if (kPlanas) kPlanas.style.display = (kind !== 'melaza') ? "" : "none";
  if (kVolteo) kVolteo.style.display = (kind !== 'melaza') ? "" : "none";
  if (kPipa) kPipa.style.display = (kind === 'melaza' || kind === 'todos') ? "" : "none";

  // … series y labels …
  const finVol = data.charts.finalizados?.volteo || [];
  const finPla = data.charts.finalizados?.plana || [];
  const finPip = data.charts.finalizados?.pipa || [];
  const recVol = data.charts.recibidos?.volteo || [];
  const recPla = data.charts.recibidos?.plana || [];
  const recPip = data.charts.recibidos?.pipa || [];

  const L = data.charts.fechas || [];
  lastLabels = L;
  const labelsSig = stableStringify(L);
  
  if (labelsSig !== lastLabelsSig) {
    // reset suave para evitar arrastre de puntos
    try { if (chFinalizados) { chFinalizados.data.labels = []; chFinalizados.data.datasets.forEach(d=>d.data=[]); chFinalizados.update(); } } catch {}
    try { if (chRecibidos)   { chRecibidos.data.labels   = []; chRecibidos.data.datasets.forEach(d=>d.data=[]);   chRecibidos.update(); }   } catch {}
    try { if (chAzucar)      { chAzucar.data.labels      = []; chAzucar.data.datasets.forEach(d=>d.data=[]);      chAzucar.update(); }      } catch {}
    try { if (chPromedio)    { chPromedio.data.labels    = []; chPromedio.data.datasets.forEach(d=>d.data=[]);    chPromedio.update(); }    } catch {}
    lastLabelsSig = labelsSig;
  }

  ensureAllScrollableWidths(L);

  const VIS = (kind === 'melaza') ? { volteo: false, plana: false, pipa: true } : { volteo: true, plana: true, pipa: true };
  const mkZeros = () => new Array(L.length).fill(0);

  // Finalizados
  chFinalizados.data.datasets[0].hidden = !VIS.volteo;
  chFinalizados.data.datasets[1].hidden = !VIS.plana;
  chFinalizados.data.datasets[2].hidden = !VIS.pipa;
  setLine3(chFinalizados, L,
    VIS.volteo ? finVol : mkZeros(),
    VIS.plana ? finPla : mkZeros(),
    VIS.pipa ? finPip : mkZeros(),
    "Camiones Finalizados"
  );
  toggleLegendFor("chart-finalizados", VIS);
  refreshChartAfterResize("chart-finalizados");

  // Recibidos
  chRecibidos.data.datasets[0].hidden = !VIS.volteo;
  chRecibidos.data.datasets[1].hidden = !VIS.plana;
  chRecibidos.data.datasets[2].hidden = !VIS.pipa;
  const setter3 = USE_BAR_RECIBIDOS ? setBar3 : setLine3;
  setter3(chRecibidos, L,
    VIS.volteo ? recVol : mkZeros(),
    VIS.plana ? recPla : mkZeros(),
    VIS.pipa ? recPip : mkZeros(),
    "Camiones Recibidos"
  );
  toggleLegendFor("chart-recibidos", VIS);
  refreshChartAfterResize("chart-recibidos");

  // Toneladas por producto (si viene)
  const tA = data.charts?.toneladasPorProducto?.azucar || [];
  const tM = data.charts?.toneladasPorProducto?.melaza || [];
  const tO = data.charts?.toneladasPorProducto?.otros || [];
  const showAz = (kind !== 'melaza');
  const showMe = (kind !== 'azucar');
  const showOt = (kind === 'todos' || kind === 'otros');

  chAzucar.data.datasets[0].hidden = !showAz;
  chAzucar.data.datasets[1].hidden = !showMe;
  chAzucar.data.datasets[2].hidden = !showOt;
  const zeros = () => new Array(L.length).fill(0);
  setLine3(chAzucar, L,
    showAz ? tA : zeros(),
    showMe ? tM : zeros(),
    showOt ? tO : zeros(),
    "Toneladas"
  );
  refreshChartAfterResize("chart-azucar");

  // Promedios (si viene)
  const pVol = data.charts?.promedioDescarga?.volteo || [];
  const pPla = data.charts?.promedioDescarga?.plana || [];
  const pPip = data.charts?.promedioDescarga?.pipa || [];
  chPromedio.data.datasets[0].hidden = !VIS.volteo;
  chPromedio.data.datasets[1].hidden = !VIS.plana;
  chPromedio.data.datasets[2].hidden = !VIS.pipa;

  const zeros3 = () => new Array(L.length).fill(0);
  setLine3(chPromedio, L,
    VIS.volteo ? pVol : zeros3(),
    VIS.plana ? pPla : zeros3(),
    VIS.pipa ? pPip : zeros3(),
    "Promedio Descarga (min)"
  );

  if (chPromedio?.options?.plugins?.tooltip) {
    const txt = data.charts?.promedioDescargaTxt || {};
    chPromedio.options.plugins.tooltip.callbacks = {
      label: (ctx) => {
        const i = ctx.dataIndex;
        const arr = ctx.datasetIndex === 0 ? txt.volteo
          : ctx.datasetIndex === 1 ? txt.plana
            : txt.pipa;
        const pretty = (arr && arr[i]) ? arr[i]
          : `${Math.floor(ctx.parsed.y)}:${String(Math.round((ctx.parsed.y % 1) * 60)).padStart(2, "0")}`;
        return `${ctx.dataset.label}: ${pretty}`;
      }
    };
    chPromedio.update();
  }
  refreshChartAfterResize("chart-promedio");
}


// ====== DASH SWITCHER (panel lateral) ======
function initDashSwitcher() {
  const root = document.getElementById('dash-switcher');
  if (!root) return;

  const tab = document.getElementById('dash-switcher-tab');
  const panel = document.getElementById('dash-switcher-panel');
  const closeBtn = root.querySelector('.dash-switcher__close');
  const backdrop = document.getElementById('dash-switcher-backdrop');

  const open = () => { root.setAttribute('aria-expanded', 'true'); tab.setAttribute('aria-expanded', 'true'); backdrop.hidden = false; panel.focus(); };
  const close = () => { root.setAttribute('aria-expanded', 'false'); tab.setAttribute('aria-expanded', 'false'); backdrop.hidden = true; };

  tab?.addEventListener('click', () => (root.getAttribute('aria-expanded') === 'true' ? close() : open()));
  closeBtn?.addEventListener('click', close);
  backdrop?.addEventListener('click', close);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  panel?.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (a) { close(); }
  });
}
document.addEventListener('DOMContentLoaded', initDashSwitcher);

// Registro SEGURO del plugin de zoom (evita romper si no está cargado)
if (window.Chart && window.ChartZoom) {
  Chart.register(window.ChartZoom);
} else {
  console.warn("chartjs-plugin-zoom no cargado; el zoom estará deshabilitado");
}

// ============================
//  Recepción (helpers específicos)
// ============================
function pad2(n) { return String(n).padStart(2, "0"); }
function secondsToHHMM(secs) {
  const s = Math.max(0, Math.floor(Number(secs || 0)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h} h ${pad2(m)} min`;
}
function timeInputToHour(t /* "HH:MM" */) {
  if (!t || typeof t !== "string") return 0;
  const [hh] = t.split(":");
  const n = Number(hh);
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 23) : 0;
}
function timeToMinutes(v) {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).trim();
  if (!s || s === "0") return 0;
  const parts = s.split(":").map(Number);
  if (parts.some(n => !Number.isFinite(n))) return 0;
  if (parts.length === 3) {
    const [hh, mm, ss] = parts;
    return (hh * 60) + mm + (ss / 60);
  }
  if (parts.length === 2) {
    const [mm, ss] = parts;
    return mm + (ss / 60);
  }
  return Number(s) || 0;
}

// (Opcional) leer filtros desde la vista de Recepción
function readRecepcionFiltersFromView() {
  const hourStartEl = document.getElementById("f-hour-start");
  const hourEndEl = document.getElementById("f-hour-end");
  const ingenioEl = document.getElementById("f-ingenio");
  const productEl = document.getElementById("f-producto");

  const hourFrom = timeInputToHour(hourStartEl?.value || "00:00");
  const hourTo = timeInputToHour(hourEndEl?.value || "23:59");

  const ingenioId = (ingenioEl?.value || "").trim();
  const product = (productEl?.value || "").trim();

  return { hourFrom, hourTo, ingenioId, product };
}

// (Opcional) flujo dedicado a Recepción-hoy por si lo quieres usar directo
async function fetchRecepcionData({ hourFrom, hourTo, ingenioId, product }) {
  const qs = new URLSearchParams({ hourFrom: String(hourFrom), hourTo: String(hourTo) });
  if ((ingenioId ?? "").trim()) qs.set("ingenioId", ingenioId.trim());
  if ((product ?? "").trim()) qs.set("product", product.trim());

  const [rResumen, rProm] = await Promise.all([
    fetch(`/dashboard/resumen-hoy?${qs.toString()}`, { headers: { "Accept": "application/json" } }),
    fetch(`/dashboard/promedios-atencion-hoy?hourFrom=${hourFrom}&hourTo=${hourTo}`, { headers: { "Accept": "application/json" } })
  ]);

  const resumen = rResumen.ok ? await rResumen.json() : null;
  const promedios = rProm.ok ? await rProm.json() : null;

  const hours = [];
  for (let h = hourFrom; h <= hourTo; h++) hours.push(`${String(h).padStart(2, "0")}:00`);
  const hasPrevios = (resumen?.Rows || []).some(r => String(r.hora).toLowerCase() === "previos");
  const labels = hasPrevios ? ["previos", ...hours] : hours;

  const empty = () => Array(labels.length).fill(0);
  const series = {
    finalizados: { volteo: empty(), plana: empty(), pipa: empty() },
    recibidos: { volteo: empty(), plana: empty(), pipa: empty() }
  };
  const idx = Object.fromEntries(labels.map((l, i) => [l, i]));

  const toKind = (t) => {
    const u = String(t || '').toUpperCase().trim().replace(/\s+/g, '');
    if (u === 'V' || u === 'VOLTEO' || u === 'VOLTEOS' || u === 'T') return 'volteo';
    if (u === 'R' || u === 'PLANA' || u === 'PLANAS' || u === 'PLANO' || u === 'PLANOS') return 'plana';
    if (u === 'P' || u === 'PI' || u === 'PIPA' || u === 'PIPAS') return 'pipa';
    return null;
  };

  for (const r of (resumen?.Rows || [])) {
    const statusId = Number(r.predefined_status_id ?? r.current_status ?? 0);

    // Etiqueta de hora
    let label = String(r.hora || '').trim();
    if (!label) {
      const d = new Date(r.fecha);
      label = `${String(d.getHours()).padStart(2, '0')}:00`;
    } else if (label !== 'previos' && !/^\d{2}:\d{2}$/.test(label)) {
      const hh = parseInt(label, 10);
      if (Number.isFinite(hh)) label = `${String(hh).padStart(2, '0')}:00`;
    }
    const i = idx[label];
    if (i == null) continue;

    const kind = toKind(r.truck_type);
    if (!kind) { console.debug('TruckType no mapeado (frontend):', r.truck_type); continue; }

    const val = Number(r.total) || 0;
    if (statusId === 12) series.finalizados[kind][i] += val;
    if (statusId === 2) series.recibidos[kind][i] += val;
  }

  return { labels, series, resumen, promedios };
}

// KPIs Recepción (si usas fetchRecepcionData)
function renderRecepcionKPIs(data) {
  const kpiTrans = document.getElementById("kpi-en-transito");
  const kpiParqueo = document.getElementById("kpi-en-parqueo");
  const kpiAut = document.getElementById("kpi-autorizados");
  const kpiWait = document.getElementById("kpi-tiempo-espera");
  const kpiAttend = document.getElementById("kpi-tiempo-atencion");

  const resumen = data?.resumen || {};
  const est = resumen?.Estatus || {};
  let enTransito = Number(est?.EnTransito ?? 0);
  let enParqueo = Number(est?.EnParqueo ?? 0);
  let autorizados = Number(est?.Autorizado ?? 0);

  if (!enTransito && resumen?.EnTransito?.Total != null) enTransito = Number(resumen.EnTransito.Total);
  if (!enParqueo && resumen?.Prechequeado?.Total != null) enParqueo = Number(resumen.Prechequeado.Total);
  if (!autorizados && resumen?.Autorizado?.Total != null) autorizados = Number(resumen.Autorizado.Total);

  if (kpiTrans) kpiTrans.textContent = String(enTransito);
  if (kpiParqueo) kpiParqueo.textContent = String(enParqueo);
  if (kpiAut) kpiAut.textContent = String(autorizados);

  const prom = data?.promedios || {};
  const esperaSeg = Number(prom?.TiempoEspera?.PromedioSeg ?? 0);
  const atencionSeg = Number(prom?.TiempoAtencion?.PromedioSeg ?? 0);

  if (kpiWait) kpiWait.textContent = secondsToHHMM(esperaSeg);
  if (kpiAttend) kpiAttend.textContent = secondsToHHMM(atencionSeg);
}

// Pintado de charts Recepción usando fetchRecepcionData (opcional)
function renderRecepcionCharts(data) {
  const L = data?.labels || [];
  lastLabels = L;
  ensureAllScrollableWidths(L);

  const selectedProduct = document.getElementById("f-producto")?.value || "";
  const kind = normalizeProductKind(selectedProduct);
  const VIS = (kind === 'melaza')
    ? { volteo: false, plana: false, pipa: true }
    : (kind === 'azucar')
      ? { volteo: true, plana: true, pipa: false }
      : { volteo: true, plana: true, pipa: true };

  const fin = data.series?.finalizados || { volteo: [], plana: [], pipa: [] };
  chFinalizados.data.datasets[0].hidden = !VIS.volteo;
  chFinalizados.data.datasets[1].hidden = !VIS.plana;
  chFinalizados.data.datasets[2].hidden = !VIS.pipa;
  setLine3(chFinalizados, L,
    VIS.volteo ? fin.volteo : new Array(L.length).fill(0),
    VIS.plana ? fin.plana : new Array(L.length).fill(0),
    VIS.pipa ? fin.pipa : new Array(L.length).fill(0),
    "Camiones Finalizados"
  );
  toggleLegendFor("chart-finalizados", VIS);
  refreshChartAfterResize("chart-finalizados");

  const rec = data.series?.recibidos || { volteo: [], plana: [], pipa: [] };
  chRecibidos.data.datasets[0].hidden = !VIS.volteo;
  chRecibidos.data.datasets[1].hidden = !VIS.plana;
  chRecibidos.data.datasets[2].hidden = !VIS.pipa;
  const set3 = USE_BAR_RECIBIDOS ? setBar3 : setLine3;
  set3(chRecibidos, L,
    VIS.volteo ? rec.volteo : new Array(L.length).fill(0),
    VIS.plana ? rec.plana : new Array(L.length).fill(0),
    VIS.pipa ? rec.pipa : new Array(L.length).fill(0),
    "Camiones Recibidos"
  );
  toggleLegendFor("chart-recibidos", VIS);
  refreshChartAfterResize("chart-recibidos");
}

// Inicializa Recepción (usa SIEMPRE summary; no toca histórico)
async function initRecepcion() {
  const hasRecepUI =
    document.getElementById("f-hour-start") &&
    document.getElementById("f-hour-end") &&
    document.getElementById("f-ingenio") &&
    document.getElementById("f-producto");

  if (!hasRecepUI) return;

  const rerun = () => fetchAndRender();

  // Carga inicial
  rerun();

  // Re-cargar al cambiar filtros de hora/ingenio/producto
  ["f-hour-start", "f-hour-end", "f-ingenio", "f-producto"].forEach(id => {
    document.getElementById(id)?.addEventListener("change", rerun);
  });
}
document.addEventListener("DOMContentLoaded", initRecepcion);


/* ============================================
   G R Á F I C O S   (por placa) — endpoint único
   Fuente: api/dashboard/tiempos-hoy-detalle?hStart=&hEnd=
   Filtros visibles: hora (hStart/hEnd), producto, ingenio (cliente)
   ============================================ */

/*****  GRÁFICOS POR PLACA (endpoint único)  *****/

/* ================== CONSTANTES ================== */
const ENDPOINT_TIEMPOS_DETALLE = "api/dashboard/tiempos-hoy-detalle";

const ID_CHART_TRANSITO = "chart-transito-placa";  // Azúcar/Melaza
const ID_CHART_DESCARGA = "chart-descarga-placa";  // Volteo/Plana/Pipa
const ID_CHART_ESPERA   = "chart-espera-placa";    // Volteo/Plana/Pipa

const KPI_G = {
  DESP_AZ: "kpi-cant-azucar",
  DESP_ME: "kpi-cant-melaza",
  TX_AZU: "kpi-transito-azucar",
  TX_MEL: "kpi-transito-melaza",
  ESP_PLANA: "kpi-espera-plana",
  ESP_VOLTEO: "kpi-espera-volteo",
  ESP_PIPA: "kpi-espera-pipa",
  DESC_PLANA: "kpi-descarga-plana",
  DESC_VOLTEO: "kpi-descarga-volteo",
  DESC_PIPA: "kpi-descarga-pipa",
};

let chTransitoPlaca = null;
let chDescargaPlaca = null;
let chEsperaPlaca = null;

/* ===== Compatibilidad con helpers de charts (muy importante) ===== */
if (typeof window.line3Series !== "function" && typeof window.line2Series === "function") {
  // En tu proyecto, line2Series soporta 2 o 3 series; lo aliamos para no romper
  window.line3Series = function(...args) { return window.line2Series(...args); };
}
if (typeof window.line2Series !== "function" && typeof window.line3Series !== "function") {
  console.error("[charts] No existe line2Series/line3Series en el scope. Carga tu helper antes de este archivo.");
}

/* ================== HELPERS NUMÉRICOS ================== */
function avg(xs) { if (!xs || !xs.length) return 0; return xs.reduce((a, b) => a + Number(b || 0), 0) / xs.length; }
function sum(xs) { if (!xs || !xs.length) return 0; return xs.reduce((a, b) => a + Number(b || 0), 0); }

// Estrictos (para gráficos): devuelven null si no hay dato válido
function avgOrNull(xs) {
  if (!xs || !xs.length) return null;
  const nums = xs.map(Number).filter(n => Number.isFinite(n));
  if (!nums.length) return null;
  return nums.reduce((a,b)=>a+b,0)/nums.length;
}
function anyTimeToMinutesStrict(val) {
  if (val == null || val === "") return null;
  if (typeof val === "number") {
    const n = Number(val);
    if (!Number.isFinite(n)) return null;
    return n >= 360 ? (n / 60) : n; // si viene en segundos grandes
  }
  const s = String(val).trim();
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(s)) { const [hh, mm, ss] = s.split(":").map(Number); return (hh * 60) + mm + (ss / 60); }
  if (/^\d{1,2}:\d{2}$/.test(s)) { const [mm, ss] = s.split(":").map(Number); return mm + (ss / 60); }
  const n = Number(s); return Number.isFinite(n) ? (n >= 360 ? (n / 60) : n) : null;
}

// Flexible (para KPI): 0 si no hay
function anyTimeToMinutes(val) {
  if (val == null || val === "") return 0;
  if (typeof val === "number") return val >= 360 ? (val / 60) : val;
  const s = String(val).trim();
  if (/^\d{1,2}:\d{2}:\d{2}$/.test(s)) { const [hh, mm, ss] = s.split(":").map(Number); return (hh * 60) + mm + (ss / 60); }
  if (/^\d{1,2}:\d{2}$/.test(s)) { const [mm, ss] = s.split(":").map(Number); return mm + (ss / 60); }
  const n = Number(s); return Number.isFinite(n) ? (n >= 360 ? (n / 60) : n) : 0;
}

/* ================== HELPERS DE NEGOCIO ================== */
function normProducto(v) { const u = String(v ?? "").toUpperCase(); if (u.includes("MEL")) return "melaza"; if (u.includes("AZ")) return "azucar"; return "otros"; }
function normTruck(v) {
  if (typeof normalizeTruckType === "function") return normalizeTruckType(v || "");
  const t = String(v || "").trim().toUpperCase();
  if (t === "V" || t === "VOLTEO" || t === "T") return "volteo";
  if (t === "R" || t === "PLANA" || t === "PLANAS") return "plana";
  if (t === "P" || t === "PIPA" || t === "PIPAS") return "pipa";
  return "otro";
}

function readPlaca(r) { return r.PlacaRemolque ?? r.placa ?? r.Plate ?? r.license ?? r.Placa ?? r.PLACA ?? ""; }
function readProducto(r) { return r.producto ?? r.Producto ?? r.product ?? r.Product ?? r.OperationType ?? r.operation_type ?? ""; }
function readIngenioId(r) { return r.ingenioId ?? r.IngenioId ?? r.ingenio_id ?? r.Ingenio ?? r.plantaId ?? ""; }
function readTruck(r) { return r.truckType ?? r.truck_type ?? r.Tipo ?? r.tipo ?? r.TipoDescarga ?? r.TruckType ?? ""; }

/* ================== HTTP & FORMATO ================== */
function http(url) { return fetch(url, { headers: { Accept: "application/json", "Cache-Control": "no-cache" }, cache: "no-store" }).then(r => r.ok ? r.json() : null); }

function fmtMMSS(totalSec) {
  const s = Math.max(0, Math.round(Number(totalSec || 0)));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${mm} min ${String(ss).padStart(2, '0')} seg`;
}
function fmtHHMM(mins) {
  const m = Math.max(0, Math.round(Number(mins || 0)));
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  return `${hh} h ${String(mm).padStart(2, '0')} min`;
}

/* ================== FALLBACKS UI ================== */
function setProductColorsIfNeeded(chart) {
  try {
    const ds = chart?.data?.datasets || [];
    ds.forEach(d => {
      if (/az[uú]car/i.test(d.label || "")) {
        d.borderColor = d.borderColor || "#3B82F6";
        d.backgroundColor = d.backgroundColor || "rgba(59,130,246,0.2)";
      } else if (/melaza/i.test(d.label || "")) {
        d.borderColor = d.borderColor || "#F59E0B";
        d.backgroundColor = d.backgroundColor || "rgba(245,158,11,0.2)";
      }
    });
    chart.update();
  } catch {}
}

if (typeof ensureScrollableWidth !== "function") {
  window.ensureScrollableWidth = function(containerId, labels) {
    try {
      const el = document.getElementById(containerId);
      if (!el) return;
      const minPxPerLabel = 60;
      const base = 400;
      const w = Math.max(base, (labels?.length || 0) * minPxPerLabel);
      el.style.width = `${w}px`;
    } catch {}
  };
}
if (typeof setLine2 !== "function") {
  window.setLine2 = function(chart, labels, serie1, serie2, yLabel = "Minutos") {
    if (!chart) return;
    chart.data.labels = labels || [];
    chart.data.datasets[0].data = (serie1 || []).map(v => v == null ? null : v);
    chart.data.datasets[1].data = (serie2 || []).map(v => v == null ? null : v);
    chart.options.scales.y.title = { display: true, text: yLabel };
    chart.update();
  };
}
if (typeof setLine3 !== "function") {
  window.setLine3 = function(chart, labels, s1, s2, s3, yLabel = "Minutos") {
    if (!chart) return;
    chart.data.labels = labels || [];
    chart.data.datasets[0].data = (s1 || []).map(v => v == null ? null : v);
    chart.data.datasets[1].data = (s2 || []).map(v => v == null ? null : v);
    chart.data.datasets[2].data = (s3 || []).map(v => v == null ? null : v);
    chart.options.scales.y.title = { display: true, text: yLabel };
    chart.update();
  };
}

/* ================== INIT CHARTS ================== */
function initGraficosChartsIfNeeded() {
  const hasT = document.getElementById(ID_CHART_TRANSITO);
  const hasD = document.getElementById(ID_CHART_DESCARGA);
  const hasE = document.getElementById(ID_CHART_ESPERA);

  if (hasT && !chTransitoPlaca) {
    chTransitoPlaca = line2Series(ID_CHART_TRANSITO, "Azúcar", "Melaza", "");
    chTransitoPlaca.options.plugins.tooltip = {
      callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtMMSS(Math.round(Number(ctx.parsed.y) * 60))}` }
    };
    setProductColorsIfNeeded(chTransitoPlaca);
  }
  if (hasD && !chDescargaPlaca) {
    chDescargaPlaca = line2Series(ID_CHART_DESCARGA, "Volteo", "Plana", "Pipa");
    chDescargaPlaca.options.plugins.tooltip = {
      callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtMMSS(Math.round(Number(ctx.parsed.y) * 60))}` }
    };
  }
  if (hasE && !chEsperaPlaca) {
    chEsperaPlaca = line2Series(ID_CHART_ESPERA, "Volteo", "Plana", "Pipa");
    chEsperaPlaca.options.plugins.tooltip = {
      callbacks: { label: (ctx) => `${ctx.dataset.label}: ${fmtMMSS(Math.round(Number(ctx.parsed.y) * 60))}` }
    };
  }
}

/* ================== FILTROS UI ================== */
function getFilters() {
  const prod = document.getElementById("f-producto")?.value || "";
  const ing = document.getElementById("f-ingenio")?.value || "";
  const hs = document.getElementById("f-hour-start")?.value || "00:00";
  const he = document.getElementById("f-hour-end")?.value || "23:59";
  const hf = Math.max(0, Math.min(23, Number(hs.split(":")[0]) || 0));
  const ht = Math.max(0, Math.min(23, Number(he.split(":")[0]) || 23));
  return { product: prod, ingenioId: ing, hStart: hf, hEnd: ht };
}

/* ================== KPI HELPERS ================== */
function putText(id, txt) { const el = document.getElementById(id); if (el) el.textContent = txt; }
(function warnMissingKPIsOnce(){ try {
  const missing = Object.values(KPI_G).filter(id => !document.getElementById(id));
  if (missing.length) console.warn("[KPIs faltantes en esta vista]:", missing);
} catch {} })();

/* ================== RENDER KPIs ================== */
function renderKPIs(raw, filters) {
  const _avg = (xs) => (!xs || !xs.length) ? 0 : xs.reduce((a,b)=>a+Number(b||0),0)/xs.length;
  const _prodOf = (v) => { const s = String(v ?? "").toUpperCase(); if (s.includes("MEL")) return "melaza"; if (s.includes("AZ")) return "azucar"; return "otros"; };

  // 1) Cantidades por producto
  let despAz = 0, despMe = 0;
  const uds   = raw?.UnidadesDespachadasPorHora ?? {};
  const horas = Array.isArray(uds?.Horas) ? uds.Horas : [];
  if (Number.isFinite(Number(uds?.TotalRegistrosAzucar)) || Number.isFinite(Number(uds?.TotalRegistrosMelaza))) {
    despAz = Number(uds?.TotalRegistrosAzucar) || 0;
    despMe = Number(uds?.TotalRegistrosMelaza) || 0;
  } else {
    for (const r of horas) {
      const k = _prodOf(r?.Product ?? r?.OperationType);
      if (k === "azucar")  despAz++;
      else if (k === "melaza") despMe++;
    }
  }
  putText(KPI_G.DESP_AZ, String(despAz));
  putText(KPI_G.DESP_ME, String(despMe));

  // 2) Tránsito
  const tra = raw?.TransitoAPlanta ?? {};
  let txAzMin = 0, txMeMin = 0;
  if (tra.PromedioAzucar || tra.PromedioMelaza) {
    txAzMin = anyTimeToMinutes(tra.PromedioAzucar) || 0;
    txMeMin = anyTimeToMinutes(tra.PromedioMelaza) || 0;
  } else {
    const filasT = Array.isArray(tra?.Filas) ? tra.Filas : [];
    const az = [], me = [];
    for (const r of filasT) {
      const m = anyTimeToMinutes(r?.Tiempo);
      const p = _prodOf(r?.Product ?? r?.OperationType);
      if (m > 0) { if (p === "azucar") az.push(m); if (p === "melaza") me.push(m); }
    }
    txAzMin = az.length ? _avg(az) : 0;
    txMeMin = me.length ? _avg(me) : 0;
  }
  putText(KPI_G.TX_AZU, fmtHHMM(txAzMin));
  putText(KPI_G.TX_MEL, fmtHHMM(txMeMin));

  // 3) Espera
  const cola = raw?.TiempoEnCola ?? {};
  let espPlaSec = 0, espVolSec = 0, espPipSec = 0;
  if (cola.PromedioPlana || cola.PromedioVolteo || cola.PromedioPipa) {
    espPlaSec = Math.round(anyTimeToMinutes(cola.PromedioPlana) * 60);
    espVolSec = Math.round(anyTimeToMinutes(cola.PromedioVolteo) * 60);
    espPipSec = Math.round(anyTimeToMinutes(cola.PromedioPipa) * 60);
  } else {
    const filasC = Array.isArray(cola?.Filas) ? cola.Filas : [];
    const b = { plana: [], volteo: [], pipa: [] };
    for (const r of filasC) {
      const tk = normTruck(r?.TruckType);
      const m  = anyTimeToMinutes(r?.Tiempo);
      if (m > 0 && b[tk]) b[tk].push(m);
    }
    espPlaSec = Math.round(avg(b.plana)  * 60);
    espVolSec = Math.round(avg(b.volteo) * 60);
    espPipSec = Math.round(avg(b.pipa)   * 60);
  }
  putText(KPI_G.ESP_PLANA,  fmtMMSS(espPlaSec));
  putText(KPI_G.ESP_VOLTEO, fmtMMSS(espVolSec));
  putText(KPI_G.ESP_PIPA,   fmtMMSS(espPipSec));

  // 4) Descarga
  const des = raw?.Descarga ?? {};
  let desPlaSec = 0, desVolSec = 0, desPipSec = 0;
  if (des.PromedioPlana || des.PromedioVolteo || des.PromedioPipa) {
    desPlaSec = Math.round(anyTimeToMinutes(des.PromedioPlana) * 60);
    desVolSec = Math.round(anyTimeToMinutes(des.PromedioVolteo) * 60);
    desPipSec = Math.round(anyTimeToMinutes(des.PromedioPipa) * 60);
  } else {
    const filasD = Array.isArray(des?.Filas) ? des.Filas : [];
    const b = { plana: [], volteo: [], pipa: [] };
    for (const r of filasD) {
      const tk = normTruck(r?.TruckType);
      const m  = anyTimeToMinutes(r?.Tiempo);
      if (m > 0 && b[tk]) b[tk].push(m);
    }
    desPlaSec = Math.round(avg(b.plana)  * 60);
    desVolSec = Math.round(avg(b.volteo) * 60);
    desPipSec = Math.round(avg(b.pipa)   * 60);
  }
  putText(KPI_G.DESC_PLANA,  fmtMMSS(desPlaSec));
  putText(KPI_G.DESC_VOLTEO, fmtMMSS(desVolSec));
  putText(KPI_G.DESC_PIPA,   fmtMMSS(desPipSec));
}

/* ================== RENDER PRINCIPAL ================== */
async function fetchAndRenderPlacas() {
  try {
    if (!document.getElementById(ID_CHART_TRANSITO)
      && !document.getElementById(ID_CHART_DESCARGA)
      && !document.getElementById(ID_CHART_ESPERA)) return;

    initGraficosChartsIfNeeded();

    const f = getFilters();
    const qs = new URLSearchParams({ hStart: String(f.hStart), hEnd: String(f.hEnd), _ts: String(Date.now()) });
    if (f.product) qs.set("product", f.product);
    if (f.ingenioId) qs.set("ingenioId", f.ingenioId);

    const url = `${ENDPOINT_TIEMPOS_DETALLE}?${qs.toString()}`;
    const raw = await http(url);
    console.log("[FETCH] TiemposDetalle URL:", url);
    if (!raw) return;

    // KPIs
    renderKPIs(raw, f);

    // Aplanar filas para gráficos
    const rows = [];
    const pick = (obj) => (obj?.Filas ?? obj?.Horas ?? []);

    // Transito
    for (const r of pick(raw.TransitoAPlanta)) {
      rows.push({
        placa: r.PlacaRemolque ?? r.placa ?? "",
        Product: r.Product ?? r.product ?? "MEL-001",
        TruckType: r.TruckType ?? r.truck_type ?? "P",
        TransitoHHMMSS: r.Tiempo ?? r.tiempo ?? "",
        Fecha: r.Fecha ?? r.fecha ?? null,
        Hora: r.Hora ?? r.hora ?? null,
        IngenioId: r.IngenioId ?? r.ingenioId ?? r.ingenio_id ?? ""
      });
    }
    // Espera
    for (const r of pick(raw.TiempoEnCola)) {
      rows.push({
        placa: r.PlacaRemolque ?? r.placa ?? "",
        Product: r.Product ?? r.product ?? "MEL-001",
        TruckType: r.TruckType ?? r.truck_type ?? "P",
        EsperaHHMMSS: r.Tiempo ?? r.tiempo ?? "",
        Fecha: r.Fecha ?? r.fecha ?? null,
        Hora: r.Hora ?? r.hora ?? null,
        IngenioId: r.IngenioId ?? r.ingenioId ?? r.ingenio_id ?? ""
      });
    }
    // Descarga
    for (const r of pick(raw.Descarga)) {
      rows.push({
        placa: r.PlacaRemolque ?? r.placa ?? "",
        Product: r.Product ?? r.product ?? r.OperationType ?? "MEL-001",
        TruckType: r.TruckType ?? r.truck_type ?? "P",
        DescargaHHMMSS: r.Tiempo ?? r.tiempo ?? "",
        Fecha: r.Fecha ?? r.fecha ?? null,
        Hora: r.Hora ?? r.hora ?? null,
        IngenioId: r.IngenioId ?? r.ingenioId ?? r.ingenio_id ?? ""
      });
    }

    // Filtro tolerante
    const dataRows = rows.filter(r => {
      const prodRow = r.Product ?? "";
      const ingRow = r.IngenioId ?? "";
      const okProd = !f.product || !prodRow || normProducto(prodRow) === normProducto(f.product);
      const okIng = !f.ingenioId || !ingRow || String(ingRow).trim() === String(f.ingenioId).trim();
      return okProd && okIng;
    });

    if (!dataRows.length) {
      if (chTransitoPlaca) setLine2(chTransitoPlaca, [], [], [], "Minutos");
      if (chDescargaPlaca) setLine3(chDescargaPlaca, [], [], [], "Minutos");
      if (chEsperaPlaca)   setLine3(chEsperaPlaca,   [], [], [], "Minutos");
      console.warn("[charts] No hay filas para pintar.");
      return;
    }

    // Buckets por placa (minutos)
    const placasSet = new Set();
    const transitoByPlaca = {}; // { placa: { azucar:[], melaza:[] } }
    const descargaByPlaca = {}; // { placa: { volteo:[], plana:[], pipa:[] } }
    const esperaByPlaca   = {}; // { placa: { volteo:[], plana:[], pipa:[] } }

    for (const r of dataRows) {
      const placa = String(readPlaca(r) || r.placa || "").trim();
      if (!placa) continue;
      placasSet.add(placa);

      const prodKind = normProducto(readProducto(r) || r.Product || "");
      const tk = normTruck(readTruck(r) || r.TruckType || "P");

      const tTrans = anyTimeToMinutesStrict(r.TransitoHHMMSS);
      const tDesc  = anyTimeToMinutesStrict(r.DescargaHHMMSS);
      const tEsp   = anyTimeToMinutesStrict(r.EsperaHHMMSS);

      transitoByPlaca[placa] ??= { azucar: [], melaza: [] };
      if (tTrans != null) {
        if (prodKind === "azucar") transitoByPlaca[placa].azucar.push(tTrans);
        else if (prodKind === "melaza") transitoByPlaca[placa].melaza.push(tTrans);
        else { transitoByPlaca[placa].azucar.push(tTrans); transitoByPlaca[placa].melaza.push(tTrans); }
      }

      descargaByPlaca[placa] ??= { volteo: [], plana: [], pipa: [] };
      esperaByPlaca[placa]   ??= { volteo: [], plana: [], pipa: [] };
      if (["volteo", "plana", "pipa"].includes(tk)) {
        if (tDesc != null) descargaByPlaca[placa][tk].push(tDesc);
        if (tEsp  != null) esperaByPlaca[placa][tk].push(tEsp);
      }
    }

    const placasAll = Array.from(placasSet);

    // Series (pueden tener null)
    const serieAzAll = placasAll.map(p => avgOrNull(transitoByPlaca[p]?.azucar));
    const serieMeAll = placasAll.map(p => avgOrNull(transitoByPlaca[p]?.melaza));

    const dVolAll = placasAll.map(p => avgOrNull(descargaByPlaca[p]?.volteo));
    const dPlaAll = placasAll.map(p => avgOrNull(descargaByPlaca[p]?.plana));
    const dPipAll = placasAll.map(p => avgOrNull(descargaByPlaca[p]?.pipa));

    const eVolAll = placasAll.map(p => avgOrNull(esperaByPlaca[p]?.volteo));
    const ePlaAll = placasAll.map(p => avgOrNull(esperaByPlaca[p]?.plana));
    const ePipAll = placasAll.map(p => avgOrNull(esperaByPlaca[p]?.pipa));

    // Filtra posiciones donde al menos una serie tenga número
    function filterChart(labels, ...series) {
      const keepIdx = labels.map((_, i) => series.some(s => Number.isFinite(s[i])));
      return {
        labels: labels.filter((_, i) => keepIdx[i]),
        series: series.map(s => s.filter((_, i) => keepIdx[i])),
      };
    }

    // Logs de depuración ligeros
    console.log("[series counts]", {
      placas: placasAll.length,
      trans: [serieAzAll, serieMeAll].map(s => s.filter(Number.isFinite).length),
      desc:  [dVolAll, dPlaAll, dPipAll].map(s => s.filter(Number.isFinite).length),
      espera:[eVolAll, ePlaAll, ePipAll].map(s => s.filter(Number.isFinite).length)
    });

    // TRANSITO
    const transF = filterChart(placasAll, serieAzAll, serieMeAll);
    if (chTransitoPlaca) {
      ensureScrollableWidth(ID_CHART_TRANSITO, transF.labels);
      setLine2(chTransitoPlaca, transF.labels, transF.series[0], transF.series[1], "Minutos");
      setProductColorsIfNeeded(chTransitoPlaca);
    }

    // DESCARGA
    const descF = filterChart(placasAll, dVolAll, dPlaAll, dPipAll);
    if (chDescargaPlaca) {
      ensureScrollableWidth(ID_CHART_DESCARGA, descF.labels);
      setLine3(chDescargaPlaca, descF.labels, descF.series[0], descF.series[1], descF.series[2], "Minutos");
    }

    // ESPERA
    const esperaF = filterChart(placasAll, eVolAll, ePlaAll, ePipAll);
    if (chEsperaPlaca) {
      ensureScrollableWidth(ID_CHART_ESPERA, esperaF.labels);
      setLine3(chEsperaPlaca, esperaF.labels, esperaF.series[0], esperaF.series[1], esperaF.series[2], "Minutos");
    }
  } catch (err) {
    console.error("[fetchAndRenderPlacas] error:", err);
  }
}

/* ================== EVENTOS ================== */
["f-ingenio", "f-producto", "f-hour-start", "f-hour-end"].forEach(id => {
  document.getElementById(id)?.addEventListener("change", fetchAndRenderPlacas);
});
document.getElementById("f-apply")?.addEventListener("click", fetchAndRenderPlacas);

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById(ID_CHART_TRANSITO)
    || document.getElementById(ID_CHART_DESCARGA)
    || document.getElementById(ID_CHART_ESPERA)) {
    initGraficosChartsIfNeeded();
    fetchAndRenderPlacas();
  }
});

