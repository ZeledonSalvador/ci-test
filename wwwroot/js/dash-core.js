/* dash-core.js
   Helpers de UI + Chart.js para los dashboards
   Requiere: Chart.js 3+ (y opcionalmente chartjs-plugin-zoom)
*/
(function (window) {
  if (window.DashCore) return; // evita doble carga

  // ====== DOM helpers ======
  const $ = (id) => document.getElementById(id);
  const byId = $;

  // ====== Paleta por defecto ======
  const COLORS = {
    blue: "#0000A3", // Volteo
    orange: "#FD6104", // Plana
    gray: "#82807F", // Pipa
    axis: "#9aa3b2",
    grid: "rgba(0,0,0,0.12)"
  };

  // ====== Helpers de formato/num/hash (usados por histórico) ======
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
  function stableStringify(obj) {
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
  function simpleHash(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
    return h;
  }
  // === helper robusto para "cero" ===
  function isZeroLike(v) {
    if (v == null) return true;
    if (typeof v === "number") return Math.abs(v) < 1e-9; // incluye 0.000...
    const s = String(v).trim();
    if (!s) return true;

    // 0, 0.0, 0,00
    if (/^[0]+([.,]0+)?$/.test(s)) return true;

    // HH:MM:SS o MM:SS con todo en cero (00:00 o 00:00:00)
    if (/^0{1,2}\s*:\s*0{2}(\s*:\s*0{2})?$/.test(s)) return true;

    // "0 min 00 seg" (o variantes)
    if (/^0+\s*min(?:\s*0+\s*seg)?$/i.test(s)) return true;

    return false;
  }

  // ====== Date/Time Range helpers ======
  function _pad2(n) { return String(n).padStart(2, '0'); }
  function _todayISO() { const d = new Date(); return d.toISOString().slice(0, 10); }
  function _validDateStr(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
  function _validTimeStr(s) { return /^\d{2}:\d{2}$/.test(String(s || '')); }
  function _toMinutes(t){ const [h,m]=(t||'00:00').split(':').map(Number); return (h||0)*60+(m||0); }
  
  function _fromMinutes(min){
    const h = Math.max(0, Math.min(23, Math.floor(min/60)));
    const m = Math.max(0, Math.min(59, Math.round(min%60)));
    return _pad2(h)+':'+_pad2(m);
  }

  // Construye Date local a partir de "YYYY-MM-DD" + "HH:MM"
  function _mkLocalDate(dStr, tStr) {
    const [y, m, d] = dStr.split('-').map(Number);
    const [hh, mm] = (tStr || '00:00').split(':').map(Number);
    const dt = new Date(); // local
    dt.setFullYear(y, m - 1, d);
    dt.setHours(hh || 0, mm || 0, 0, 0);
    return dt;
  }

  // Aplica min/max a horas solo si la fecha es igual
  function _syncTimeMinMax(dateStartEl, dateEndEl, timeStartEl, timeEndEl) {
    if (!timeStartEl || !timeEndEl) return;
    const ds = dateStartEl?.value, de = dateEndEl?.value;
    if (_validDateStr(ds) && _validDateStr(de) && ds === de) {
      if (timeStartEl.value) timeEndEl.min = timeStartEl.value; else timeEndEl.removeAttribute('min');
      if (timeEndEl.value) timeStartEl.max = timeEndEl.value; else timeStartEl.removeAttribute('max');
    } else {
      timeEndEl.removeAttribute('min');
      timeStartEl.removeAttribute('max');
    }
  }

  // API pública: devuelve rango actual (strings y Date)
  function getDateTimeRange({
    dateStartId = 'f-date-start', dateEndId = 'f-date-end',
    timeStartId = 'f-hour-start', timeEndId = 'f-hour-end'
  } = {}) {
    const ds = document.getElementById(dateStartId)?.value || _todayISO();
    const de = document.getElementById(dateEndId)?.value || _todayISO();
    const ts = document.getElementById(timeStartId)?.value || '00:00';
    const te = document.getElementById(timeEndId)?.value || '23:59';
    return {
      dateStart: ds, dateEnd: de, timeStart: ts, timeEnd: te,
      start: _validDateStr(ds) ? _mkLocalDate(ds, ts) : null,
      end: _validDateStr(de) ? _mkLocalDate(de, te) : null
    };
  }

  // API pública: inicializa controles y validación
  function useDateTimeRange({
    dateStartId = 'f-date-start', dateEndId = 'f-date-end',
    timeStartId = 'f-hour-start', timeEndId = 'f-hour-end',
    autoInitToday = true, swapOnInvalid = true, onChange
  } = {}) {
    const d1 = document.getElementById(dateStartId);
    const d2 = document.getElementById(dateEndId);
    const t1 = document.getElementById(timeStartId);
    const t2 = document.getElementById(timeEndId);
    const showErr = (msg) => { /* opcional: emite evento o log */ if (msg) console.warn('[range]', msg); };

    if (!d1 || !d2) return; // fechas son obligatorias

    // valores por defecto
    if (autoInitToday) {
      if (!d1.value || !_validDateStr(d1.value)) d1.value = _todayISO();
      if (!d2.value || !_validDateStr(d2.value)) d2.value = _todayISO();
      if (t1 && (!t1.value || !_validTimeStr(t1.value))) t1.value = '00:00';
      if (t2 && (!t2.value || !_validTimeStr(t2.value))) t2.value = '23:59';
    }

    // sincroniza min/max inicial
    d2.min = d1.value; d1.max = d2.value;
    _syncTimeMinMax(d1, d2, t1, t2);

    // validación + swap si es necesario
    const validate = () => {
      // normaliza tiempos vacíos
      const ts = t1?.value || '00:00';
      const te = t2?.value || '23:59';
      const ds = d1.value, de = d2.value;

      // corrige min/max de fechas
      if (d1.value) d2.min = d1.value; else d2.removeAttribute('min');
      if (d2.value) d1.max = d2.value; else d1.removeAttribute('max');

      // compara por Date (fecha+hora)
      const haveTimes = !!(t1 && t2);
      const start = _validDateStr(ds) ? _mkLocalDate(ds, haveTimes ? ts : '00:00') : null;
      const end = _validDateStr(de) ? _mkLocalDate(de, haveTimes ? te : '23:59') : null;

      if (start && end && start.getTime() > end.getTime()) {
        if (swapOnInvalid) {
          // swap valores visibles
          const tmpD = d1.value; d1.value = d2.value; d2.value = tmpD;
          if (t1 && t2) { const tmpT = t1.value; t1.value = t2.value; t2.value = tmpT; }
          showErr('Intercambié los valores de inicio/fin para mantener el rango válido.');
        } else {
          d1.classList.add('is-invalid'); d2.classList.add('is-invalid');
          if (t1 && t2) { t1.classList.add('is-invalid'); t2.classList.add('is-invalid'); }
          showErr('El inicio no puede ser mayor que el fin.');
          return;
        }
      } else {
        d1.classList.remove('is-invalid'); d2.classList.remove('is-invalid');
        if (t1 && t2) { t1.classList.remove('is-invalid'); t2.classList.remove('is-invalid'); }
      }

      // min/max de tiempo cuando la fecha coincide
      _syncTimeMinMax(d1, d2, t1, t2);

      // callback de la app
      try { if (typeof onChange === 'function') onChange(getDateTimeRange({ dateStartId: dateStartId, dateEndId: dateEndId, timeStartId: timeStartId, timeEndId: timeEndId })); }
      catch (e) { console.error('[useDateTimeRange:onChange]', e); }
    };

    // listeners
    ['change', 'input'].forEach(ev => {
      d1.addEventListener(ev, validate);
      d2.addEventListener(ev, validate);
      if (t1) t1.addEventListener(ev, validate);
      if (t2) t2.addEventListener(ev, validate);
    });

    // validación inicial
    validate();

    // devuelve una API simple
    return {
      validate,
      get: () => getDateTimeRange({ dateStartId, dateEndId, timeStartId, timeEndId })
    };
  }


  // ====== Producto / tipo helpers ======
  function normalizeProductKind(value) {
    const v = (value ?? '').toString().trim().toUpperCase();
    if (v === '' || v === 'TODOS' || v === 'ALL') return 'todos';
    if (v.includes('MEL')) return 'melaza';
    if (v.includes('AZ')) return 'azucar';
    return 'otros';
  }
  function normalizeTruckType(t) {
    const u = String(t || '').toUpperCase().trim().replace(/\s+/g, '');
    if (u === 'V' || u === 'VOLTEO' || u === 'VOLTEOS' || u === 'T') return 'volteo';
    if (u === 'R' || u === 'PLANA' || u === 'PLANAS' || u === 'PLANO' || u === 'PLANOS') return 'plana';
    if (u === 'P' || u === 'PI' || u === 'PIPA' || u === 'PIPAS') return 'pipa';
    return 'otro';
  }

  // ====== Scroll helpers (ancho dinámico) ======
  const SCROLL_CFG = { pxPerLabel: 28, overshoot: 1.08, maxWide: 3000 };
  function ensureScrollableWidth(canvasId, labels, cfg = SCROLL_CFG) {
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

  // ====== Escala Y agradable ======
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

  // ====== Opciones base de Chart.js ======
  const CHART_UI = { fontSize: 11, pointRadius: 2, lineWidth: 2, xRotation: 90, gridWidth: 1, padBottom: 28 };
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
          ticks: {
            color: COLORS.axis,
            autoSkip: false,
            minRotation: CHART_UI.xRotation,
            maxRotation: CHART_UI.xRotation,
            padding: 6,
            font: { size: CHART_UI.fontSize }
          },
          grid: { display: true, color: COLORS.grid, lineWidth: CHART_UI.gridWidth, drawBorder: false },
          border: { display: true, color: COLORS.axis, width: 1 }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: COLORS.axis,
            padding: 6,
            font: { size: CHART_UI.fontSize },
            callback: (val) => Number(val).toLocaleString("es-SV")
          },
          grid: { display: true, color: COLORS.grid, lineWidth: CHART_UI.gridWidth, drawBorder: false },
          border: { display: true, color: COLORS.axis, width: 1 }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: "index",
          intersect: false,
          filter: (item) => {
            // Chart.js nos da item.parsed.y como número; si no, usa raw.
            const val = item?.parsed?.y ?? item?.raw;
            return !isZeroLike(val);
          },
          titleFont: { size: CHART_UI.fontSize + 1 },
          bodyFont: { size: CHART_UI.fontSize }
        },
        zoom: (window.ChartZoom ? {
          pan: { enabled: true, mode: 'x' },
          zoom: { enabled: true, mode: 'x' }
        } : undefined)
      }
    };
  }

  // ====== Constructores de charts ======
  function line2Series(canvasId, labA, labB, labC) {
    const ctx = $(canvasId);
    if (!ctx) return null;
    const opts = baseOptions();
    return new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          { label: labA, borderColor: COLORS.blue, backgroundColor: COLORS.blue, data: [], tension: .25, pointRadius: CHART_UI.pointRadius, borderWidth: CHART_UI.lineWidth, fill: false },
          { label: labB, borderColor: COLORS.orange, backgroundColor: COLORS.orange, data: [], tension: .25, pointRadius: CHART_UI.pointRadius, borderWidth: CHART_UI.lineWidth, fill: false },
          { label: labC, borderColor: COLORS.gray, backgroundColor: COLORS.gray, data: [], tension: .25, pointRadius: CHART_UI.pointRadius, borderWidth: CHART_UI.lineWidth, fill: false }
        ]
      },
      options: opts
    });
  }
  function bar2Series(canvasId, labA, labB, labC) {
    const ctx = $(canvasId);
    if (!ctx) return null;
    const opts = baseOptions();
    opts.scales.x.stacked = false;
    opts.scales.y.stacked = false;
    return new Chart(ctx, {
      type: "bar",
      data: {
        labels: [],
        datasets: [
          { label: labA, backgroundColor: COLORS.blue, data: [], borderRadius: 6, barPercentage: 0.7, categoryPercentage: 0.7 },
          { label: labB, backgroundColor: COLORS.orange, data: [], borderRadius: 6, barPercentage: 0.7, categoryPercentage: 0.7 },
          { label: labC, backgroundColor: COLORS.gray, data: [], borderRadius: 6, barPercentage: 0.7, categoryPercentage: 0.7 }
        ]
      },
      options: opts
    });
  }

  // ====== Setters 3 series (Volteo, Plana, Pipa) ======
  function setLine3(chart, labels, a, b, c, yTitle = "", yOverride) {
    if (!chart) return;
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
    y.title = { display: !!yTitle, text: yTitle };
    chart.update();
  }
  function setBar3(chart, labels, a, b, c, yTitle = "", yOverride) {
    setLine3(chart, labels, a, b, c, yTitle, yOverride);
  }

  // ====== Leyenda (DOM fuera de Chart.js) ======
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

  // ====== Utilidades varias ======
  function refreshChartAfterResize(id) {
    const chart = Chart.getChart(id);
    if (chart) chart.resize();
  }

  // ====== Estado global simple (usado por histórico) ======
  const state = { modalsOpen: 0 };
  function setModalOpen(isOpen) {
    state.modalsOpen = Math.max(0, isOpen ? 1 : 0);
  }
  function incModals() { state.modalsOpen = Math.max(0, state.modalsOpen + 1); }
  function decModals() { state.modalsOpen = Math.max(0, state.modalsOpen - 1); }

  // ====== Auto-refresh simple ======
  const _auto = { tasks: {}, timer: null, everyMs: 10000, enabled: true };
  function registerAutoRefresh(name, fn) {
    if (typeof fn !== 'function') return;
    _auto.tasks[name] = fn;
  }
  function startAutoRefresh(ms) {
    _auto.everyMs = Number(ms) > 0 ? Number(ms) : _auto.everyMs;
    if (_auto.timer) clearInterval(_auto.timer);
    _auto.timer = setInterval(async () => {
      if (!_auto.enabled || state.modalsOpen > 0) return;
      for (const k of Object.keys(_auto.tasks)) {
        try { await _auto.tasks[k](); } catch (e) { console.error(`[autoRefresh:${k}]`, e); }
      }
    }, _auto.everyMs);
  }
  function setAutoRefreshEnabled(on) { _auto.enabled = !!on; }

  // ====== Switcher integrado (panel lateral) ======
  function initDashSwitcher() {
    const root = document.getElementById('dash-switcher');
    if (!root) return;

    const tab = document.getElementById('dash-switcher-tab');
    const panel = document.getElementById('dash-switcher-panel');
    const closeBtn = root.querySelector('.dash-switcher__close');
    const backdrop = document.getElementById('dash-switcher-backdrop');

    const open = () => {
      root.setAttribute('aria-expanded', 'true');
      tab?.setAttribute('aria-expanded', 'true');
      if (backdrop) backdrop.hidden = false;
      panel?.focus();
      incModals(); // pausa auto-refresh
    };
    const close = () => {
      root.setAttribute('aria-expanded', 'false');
      tab?.setAttribute('aria-expanded', 'false');
      if (backdrop) backdrop.hidden = true;
      decModals(); // reanuda auto-refresh
    };

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

  // ====== Time-only Range helpers ======
function _toMinutes(t){ const [h,m]=(t||'00:00').split(':').map(Number); return (h||0)*60+(m||0); }
function _fromMinutes(min){
  const h = Math.max(0, Math.min(23, Math.floor(min/60)));
  const m = Math.max(0, Math.min(59, Math.round(min%60)));
  return _pad2(h)+':'+_pad2(m);
}

/** Devuelve el rango de horas actual (sin fechas) */
function getTimeRange({ timeStartId='f-hour-start', timeEndId='f-hour-end' } = {}) {
  const t1 = document.getElementById(timeStartId)?.value || '00:00';
  const t2 = document.getElementById(timeEndId)?.value   || '23:59';
  return { timeStart: t1, timeEnd: t2, startMin: _toMinutes(t1), endMin: _toMinutes(t2) };
}

/** Inicializa validación y orden para inputs type="time" */
function useTimeRange({
  timeStartId='f-hour-start',
  timeEndId='f-hour-end',
  stepMinutes,            // p.ej. 60 (equivale a step="3600")
  autoInit=true,          // autollenar si vienen vacíos
  swapOnInvalid=true,     // si inicio > fin, intercambia
  onChange                // callback al cambiar
} = {}) {
  const t1 = document.getElementById(timeStartId);
  const t2 = document.getElementById(timeEndId);
  if (!t1 || !t2) return;

  if (stepMinutes && Number(stepMinutes) > 0) {
    t1.step = String(stepMinutes * 60);
    t2.step = String(stepMinutes * 60);
  }

  if (autoInit) {
    if (!t1.value || !_validTimeStr(t1.value)) t1.value = '00:00';
    if (!t2.value || !_validTimeStr(t2.value)) t2.value = '23:59';
  }

  function syncMinMax() {
    if (t1.value) t2.min = t1.value; else t2.removeAttribute('min');
    if (t2.value) t1.max = t2.value; else t1.removeAttribute('max');
  }

  function validate(fire = true) {
    if (!_validTimeStr(t1.value)) t1.value = '00:00';
    if (!_validTimeStr(t2.value)) t2.value = '23:59';

    const a = _toMinutes(t1.value);
    const b = _toMinutes(t2.value);

    if (a > b) {
      if (swapOnInvalid) {
        const tmp = t1.value; t1.value = t2.value; t2.value = tmp;
      } else {
        t1.classList.add('is-invalid'); t2.classList.add('is-invalid');
        return;
      }
    } else {
      t1.classList.remove('is-invalid'); t2.classList.remove('is-invalid');
    }

    syncMinMax();

    if (fire && typeof onChange === 'function') {
      try { onChange(getTimeRange({ timeStartId, timeEndId })); }
      catch(e){ console.error('[useTimeRange:onChange]', e); }
    }
  }

  ['change','input'].forEach(ev => {
    t1.addEventListener(ev, () => validate(true));
    t2.addEventListener(ev, () => validate(true));
  });

  validate(false);

  return { validate, get: () => getTimeRange({ timeStartId, timeEndId }) };
}

  // ====== Expose ======
  window.DashCore = {
    // DOM
    $, byId,

    // helpers negocio
    normalizeProductKind, normalizeTruckType,

    // formato/num/hash
    num, fmtHHMM, fmtMMSS, stableStringify, simpleHash,

    useDateTimeRange, 
    getDateTimeRange,
  useTimeRange,     
  getTimeRange,

    // scroll + charts
    ensureScrollableWidth,
    line2Series, bar2Series,
    setLine3, setBar3,
    refreshChartAfterResize,
    toggleLegendFor,

    // estado (modales)
    state,
    setModalOpen, incModals, decModals,

    // auto refresh
    registerAutoRefresh,
    startAutoRefresh,
    setAutoRefreshEnabled,

    // configuración pública
    COLORS,
    CHART_UI,

    // flag opcional para otros scripts
    USE_BAR_RECIBIDOS: false
  };

  // Registro seguro del plugin de zoom si existe
  if (window.Chart && window.ChartZoom) {
    Chart.register(window.ChartZoom);
  } else {
    console.warn("chartjs-plugin-zoom no cargado; el zoom estará deshabilitado");
  }
})(window);
