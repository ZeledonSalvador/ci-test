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

  // ====== Paleta dark mode ======
  const DARK_COLORS = {
    blue: "#3b82f6",   // Volteo — azul vivo
    orange: "#fb923c", // Plana — naranja vivo
    gray: "#94a3b8",   // Pipa — gris pizarra
    axis: "#94a3b8",
    grid: "rgba(255,255,255,0.08)"
  };

  // Devuelve la paleta activa según data-theme del HTML
  function activeColors() {
    return document.documentElement.getAttribute('data-theme') === 'dark'
      ? DARK_COLORS : COLORS;
  }

  // Actualiza colores de todas las instancias activas de Chart.js
  function updateChartsTheme() {
    if (!window.Chart || !Chart.instances) return;
    const c = activeColors();
    // Mapa de color antiguo → nuevo (cubre ambas paletas como origen)
    const remap = {
      [COLORS.blue]:       c.blue,
      [COLORS.orange]:     c.orange,
      [COLORS.gray]:       c.gray,
      [DARK_COLORS.blue]:  c.blue,
      [DARK_COLORS.orange]:c.orange,
      [DARK_COLORS.gray]:  c.gray,
    };

    Object.values(Chart.instances).forEach(chart => {
      chart.data.datasets.forEach((ds, i) => {
        const newBorder = remap[ds.borderColor] ?? ds.borderColor;
        const newBg     = remap[ds.backgroundColor] ?? ds.backgroundColor;
        ds.borderColor          = newBorder;
        ds.backgroundColor      = newBg;
        ds.pointBackgroundColor = newBg;
        ds.pointBorderColor     = newBorder;
        // Forzar colores en los elementos ya renderizados (evita caché de 'none')
        const meta = chart.getDatasetMeta(i);
        meta?.data?.forEach(el => {
          if (el.options) {
            el.options.backgroundColor = newBg;
            el.options.borderColor     = newBorder;
          }
        });
      });
      const xs = chart.options.scales?.x;
      const ys = chart.options.scales?.y;
      if (xs?.ticks)  xs.ticks.color  = c.axis;
      if (ys?.ticks)  ys.ticks.color  = c.axis;
      if (xs?.grid)   xs.grid.color   = c.grid;
      if (ys?.grid)   ys.grid.color   = c.grid;
      if (ys?.border) ys.border.color = c.axis;
      chart.update('none');
    });
  }

  // ====== Helpers de formato/num/hash (usados por histórico) ======
  function num(n) { return Number(n || 0).toLocaleString("es-SV"); }
  function fmtHHMM(mins) {
    if (mins == null || isNaN(mins)) return "00 h 00 min";
    const h = Math.floor(mins / 60), m = Math.round(mins % 60);
    return `${String(h).padStart(2, "0")} h ${String(m).padStart(2, "0")} min`;
  }
  function fmtMMSS(secs) {
    if (secs == null || isNaN(secs)) return "0 min 00 s";
    const m = Math.floor(secs / 60), s = Math.round(secs % 60);
    return `${m} min ${String(s).padStart(2, "0")} s`;
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
    if (typeof v === "number") return Math.abs(v) < 1e-9;
    const s = String(v).trim();
    if (!s) return true;
    if (/^[0]+([.,]0+)?$/.test(s)) return true;
    if (/^0{1,2}\s*:\s*0{2}(\s*:\s*0{2})?$/.test(s)) return true;
    if (/^0+\s*min(?:\s*0+\s*s(?:eg)?)?$/i.test(s)) return true;
    return false;
  }

  // ====== Date/Time Range helpers ======
  function _pad2(n) { return String(n).padStart(2, '0'); }
  function _todayISO() { const d = new Date(); return d.toISOString().slice(0, 10); }
  function _validDateStr(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
  function _validTimeStr(s) { return /^\d{2}:\d{2}$/.test(String(s || '')); }
  function _toMinutes(t) { const [h, m] = (t || '00:00').split(':').map(Number); return (h || 0) * 60 + (m || 0); }
  function _forceHourOnly(el, fallback) {
    if (!el) return;

    // fuerza step de 1 hora
    el.step = String(60 * 60);

    const v = String(el.value || fallback || '').trim();
    const hh = (v.includes(':') ? v.split(':')[0] : v) || '00';
    const h = Math.max(0, Math.min(23, parseInt(hh, 10) || 0));
    el.value = _pad2(h) + ':00';
  }
  // ====== Hora (solo horas) con reloj + salto a "hora fin" ======
  function _normalizeHour00(raw, fallbackHH) {
    const s = String(raw ?? "").trim();

    // "7" o "07"
    if (/^\d{1,2}$/.test(s)) {
      let h = Number(s);
      if (!Number.isFinite(h)) h = Number(fallbackHH);
      h = Math.max(0, Math.min(23, h));
      return _pad2(h) + ":00";
    }

    // "07:15" / "07:00"
    const m = s.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
    if (m) {
      let h = Number(m[1]);
      if (!Number.isFinite(h)) h = Number(fallbackHH);
      h = Math.max(0, Math.min(23, h));
      return _pad2(h) + ":00";
    }

    return _pad2(Number(fallbackHH) || 0) + ":00";
  }

  function _bindHourClockInput(el, fallbackHH, nextEl) {
    if (!el) return;

    // Evitar doble bind si useDateTimeRange se llama 2 veces
    if (el.dataset.hourClockBound === "1") return;
    el.dataset.hourClockBound = "1";

    el.step = String(60 * 60);
    el.value = _normalizeHour00(el.value, fallbackHH);

    el.addEventListener("focus", () => {
      try { el.setSelectionRange(0, 2); } catch { }
      try { el.showPicker && el.showPicker(); } catch { }
    });

    const normalize = () => { el.value = _normalizeHour00(el.value, fallbackHH); };

    el.addEventListener("change", () => {
      normalize();
      if (nextEl) {
        nextEl.focus();
        try { nextEl.showPicker && nextEl.showPicker(); } catch { }
      }
    });

    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        normalize();
        if (nextEl) {
          nextEl.focus();
          try { nextEl.showPicker && nextEl.showPicker(); } catch { }
        }
      }
    });

    el.addEventListener("blur", normalize);
  }

  function _fromMinutes(min) {
    const h = Math.max(0, Math.min(23, Math.floor(min / 60)));
    const m = Math.max(0, Math.min(59, Math.round(min % 60)));
    return _pad2(h) + ':' + _pad2(m);
  }
  function _mkLocalDate(dStr, tStr) {
    const [y, m, d] = dStr.split('-').map(Number);
    const [hh, mm] = (tStr || '00:00').split(':').map(Number);
    const dt = new Date();
    dt.setFullYear(y, m - 1, d);
    dt.setHours(hh || 0, mm || 0, 0, 0);
    return dt;
  }
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
  function getDateTimeRange({
    dateStartId = 'f-date-start', dateEndId = 'f-date-end',
    timeStartId = 'f-hour-start', timeEndId = 'f-hour-end'
  } = {}) {

    // Normaliza cualquier "HH:mm" o "H" a "HH:00"
    const toHour00 = (t, fallbackHH) => {
      const s = String(t ?? '').trim();
      const hhRaw = s.includes(':') ? s.split(':')[0] : s;
      const h = Math.max(0, Math.min(23, parseInt(hhRaw || fallbackHH, 10) || 0));
      return String(h).padStart(2, '0') + ':00';
    };

    const d1 = document.getElementById(dateStartId);
    const d2 = document.getElementById(dateEndId);
    const t1 = document.getElementById(timeStartId);
    const t2 = document.getElementById(timeEndId);

    const ds = d1?.value || _todayISO();
    const de = d2?.value || _todayISO();

    // Leemos lo que venga, pero lo forzamos a HH:00
    const ts = toHour00(t1?.value, '00');
    const te = toHour00(t2?.value, '23');

    // Opcional: forzar visualmente el input a HH:00 y que brinque por hora
    if (t1) { t1.step = String(60 * 60); t1.value = ts; }
    if (t2) { t2.step = String(60 * 60); t2.value = te; }

    return {
      dateStart: ds,
      dateEnd: de,
      timeStart: ts,   // <- SIEMPRE "HH:00"
      timeEnd: te,     // <- SIEMPRE "HH:00"
      start: _validDateStr(ds) ? _mkLocalDate(ds, ts) : null,
      end: _validDateStr(de) ? _mkLocalDate(de, te) : null
    };
  }

  function useDateTimeRange({
    dateStartId = 'f-date-start', dateEndId = 'f-date-end',
    timeStartId = 'f-hour-start', timeEndId = 'f-hour-end',
    autoInitToday = true, swapOnInvalid = true, onChange
  } = {}) {
    const d1 = document.getElementById(dateStartId);
    const d2 = document.getElementById(dateEndId);
    const t1 = document.getElementById(timeStartId);
    const t2 = document.getElementById(timeEndId);
    const showErr = (msg) => { if (msg) console.warn('[range]', msg); };

    if (!d1 || !d2) return;

    if (autoInitToday) {
      if (!d1.value || !_validDateStr(d1.value)) d1.value = _todayISO();
      if (!d2.value || !_validDateStr(d2.value)) d2.value = _todayISO();
      if (t1 && (!t1.value || !_validTimeStr(t1.value))) t1.value = '00:00';
      if (t2 && (!t2.value || !_validTimeStr(t2.value))) t2.value = '23:00';
    }
    // Hora con reloj: HH:00 + salto automático a hora fin
    if (t1 && t2) {
      _bindHourClockInput(t1, "00", t2);
      _bindHourClockInput(t2, "23", null);
    }


    d2.min = d1.value; d1.max = d2.value;
    _syncTimeMinMax(d1, d2, t1, t2);

    const validate = () => {
      const ts = t1?.value || '00:00';
      const te = t2?.value || '23:00';
      const ds = d1.value, de = d2.value;

      if (!t1 || !t2) return;

      if (d1.value) d2.min = d1.value; else d2.removeAttribute('min');
      if (d2.value) d1.max = d2.value; else d1.removeAttribute('max');

      const haveTimes = !!(t1 && t2);
      const start = _validDateStr(ds) ? _mkLocalDate(ds, haveTimes ? ts : '00:00') : null;
      const end = _validDateStr(de) ? _mkLocalDate(de, haveTimes ? te : '23:59') : null;

      if (start && end && start.getTime() > end.getTime()) {
        if (swapOnInvalid) {
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

      _syncTimeMinMax(d1, d2, t1, t2);

      try { if (typeof onChange === 'function') onChange(getDateTimeRange({ dateStartId, dateEndId, timeStartId, timeEndId })); }
      catch (e) { console.error('[useDateTimeRange:onChange]', e); }
    };

    ['change', 'input'].forEach(ev => {
      d1.addEventListener(ev, validate);
      d2.addEventListener(ev, validate);
      if (t1) t1.addEventListener(ev, validate);
      if (t2) t2.addEventListener(ev, validate);
    });

    validate();

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
    const chart = window.Chart?.getChart?.(canvas);
    if (chart) chart.resize();
  }

  function bindHourOnlyTimeInput(id, fallbackHH) {
    const el = document.getElementById(id);
    if (!el) return;

    el.step = "3600";

    const normalize = () => {
      const s = String(el.value || '').trim();
      const hh = s.includes(':') ? s.split(':')[0] : s;
      let h = parseInt(hh || fallbackHH, 10);
      if (Number.isNaN(h)) h = parseInt(fallbackHH, 10) || 0;
      h = Math.max(0, Math.min(23, h));
      el.value = String(h).padStart(2, '0') + ':00';
    };

    el.addEventListener('input', normalize);
    el.addEventListener('change', normalize);
    normalize();
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
    const c = activeColors();
    return {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 800,
      animation: { duration: 600, easing: "easeInOutQuart" },
      transitions: { active: { animation: { duration: 200 } } },
      interaction: { mode: "index", intersect: false },
      layout: { padding: { top: 0, right: 8, bottom: CHART_UI.padBottom, left: 8 } },
      elements: {
        point: { radius: CHART_UI.pointRadius, hitRadius: 6 },
        line: { borderWidth: CHART_UI.lineWidth }
      },
      scales: {
        x: {
          ticks: {
            color: c.axis,
            autoSkip: false,
            minRotation: CHART_UI.xRotation,
            maxRotation: CHART_UI.xRotation,
            padding: 6,
            font: { size: CHART_UI.fontSize }
          },
          grid: { display: true, color: c.grid, lineWidth: CHART_UI.gridWidth, drawBorder: false },
          border: { display: false }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: c.axis,
            padding: 6,
            font: { size: CHART_UI.fontSize },
            callback: (val) => Number(val).toLocaleString("es-SV")
          },
          grid: { display: true, color: c.grid, lineWidth: CHART_UI.gridWidth, drawBorder: false },
          border: { display: true, color: c.axis, width: 1 }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: "index",
          intersect: false,
          filter: (item) => {
            const val = item?.parsed?.y ?? item?.raw;
            return !isZeroLike(val);
          },
          titleFont: { size: CHART_UI.fontSize + 1 },
          bodyFont: { size: CHART_UI.fontSize }
        },
        zoom: (window['chartjs-plugin-zoom'] ? {
          pan: { enabled: false },
          zoom: { wheel: { enabled: false }, drag: { enabled: false }, pinch: { enabled: false } }
        } : undefined)
      }
    };
  }

  // ====== Constructores de charts ======
  function line2Series(canvasId, labA, labB, labC) {
    const ctx = $(canvasId);
    if (!ctx) return null;
    const opts = baseOptions();
    const c = activeColors();
    const mkDs = (label, col) => ({
      label, data: [], tension: .25, fill: false,
      borderColor: col, backgroundColor: col,
      pointBackgroundColor: col, pointBorderColor: col,
      pointRadius: CHART_UI.pointRadius, borderWidth: CHART_UI.lineWidth
    });
    return new Chart(ctx, {
      type: "line",
      data: { labels: [], datasets: [mkDs(labA, c.blue), mkDs(labB, c.orange), mkDs(labC, c.gray)] },
      options: opts
    });
  }
  function scatter2Series(canvasId, labA, labB, labC) {
    const ctx = $(canvasId);
    if (!ctx) return null;

    const opts = baseOptions();

    // Scatter: interacción por punto (NO por index)
    opts.interaction = { mode: "nearest", intersect: true };
    if (!opts.plugins) opts.plugins = {};
    if (!opts.plugins.tooltip) opts.plugins.tooltip = {};
    opts.plugins.tooltip.mode = "nearest";
    opts.plugins.tooltip.intersect = true;

    // X lineal en minutos del día (0..1439)
    opts.scales.x.type = "linear";
    opts.scales.x.min = 0;
    opts.scales.x.max = 23 * 60 + 59;

    // ✅ Fuerza ticks EXACTOS cada hora (0,60,120,...)
    opts.scales.x.ticks.stepSize = 60;
    opts.scales.x.bounds = "ticks";


    // ✅ Muestra solo HH:00
    opts.scales.x.ticks.callback = (val) => {
      const m = Number(val);
      if (!Number.isFinite(m)) return "";
      const hh = String(Math.floor(m / 60)).padStart(2, "0");
      return `${hh}:00`;
    };

    // (opcional pero recomendado) evita que te “salte” labels por espacio
    opts.scales.x.ticks.autoSkip = true;
    opts.scales.x.ticks.maxRotation = 0;
    opts.scales.x.ticks.minRotation = 0;
    // Mostrar ticks como HH:mm
    opts.scales.x.ticks.callback = (val) => {
      const m = Number(val);
      if (!Number.isFinite(m)) return "";
      const hh = String(Math.floor(m / 60)).padStart(2, "0");
      const mm = String(m % 60).padStart(2, "0");
      return `${hh}:${mm}`;
    };

    const c = activeColors();
    return new Chart(ctx, {
      type: "scatter",
      data: {
        datasets: [
          { label: labA, borderColor: c.blue, backgroundColor: c.blue, pointBackgroundColor: c.blue, pointBorderColor: c.blue, data: [] },
          { label: labB, borderColor: c.orange, backgroundColor: c.orange, pointBackgroundColor: c.orange, pointBorderColor: c.orange, data: [] },
          { label: labC, borderColor: c.gray, backgroundColor: c.gray, pointBackgroundColor: c.gray, pointBorderColor: c.gray, data: [] }
        ]
      },
      options: opts
    });
  }

  function lineTimeSeries(canvasId, labA, labB, labC) {
    const ctx = $(canvasId);
    if (!ctx) return null;

    const opts = baseOptions();

    // ✅ Tooltip 1 punto
    opts.interaction = { mode: "nearest", intersect: true };
    opts.plugins = opts.plugins || {};
    opts.plugins.tooltip = opts.plugins.tooltip || {};
    opts.plugins.tooltip.mode = "nearest";
    opts.plugins.tooltip.intersect = true;

    // ✅ X numérico (minutos del día)
    opts.scales.x.type = "linear";
    opts.scales.x.min = 0;
    opts.scales.x.max = 23 * 60 + 59;

    // ✅ Forzar ticks exactos por hora (evita 03:20 / 06:40)
    opts.scales.x.afterBuildTicks = (scale) => {
      const step = 60; // 60 = cada hora (usa 120 si quieres cada 2 horas)
      const ticks = [];
      for (let m = 0; m <= 23 * 60; m += step) ticks.push({ value: m });
      scale.ticks = ticks;
    };

    // ✅ Mostrar SIEMPRE HH:00 en el eje X
    opts.scales.x.ticks.autoSkip = false;
    opts.scales.x.ticks.maxRotation = 90;
    opts.scales.x.ticks.minRotation = 90;
    opts.scales.x.ticks.callback = (val) => {
      const m = Number(val);
      if (!Number.isFinite(m)) return "";
      const hh = String(Math.floor(m / 60)).padStart(2, "0");
      return `${hh}:00`;
    };

    // Mostrar HH:mm
    opts.scales.x.ticks.callback = (val) => {
      const m = Number(val);
      if (!Number.isFinite(m)) return "";
      const hh = String(Math.floor(m / 60)).padStart(2, "0");
      const mm = String(m % 60).padStart(2, "0");
      return `${hh}:${mm}`;
    };

    const c = activeColors();
    const mkDs = (label, col) => ({
      label, data: [], tension: .25, fill: false,
      borderColor: col, backgroundColor: col,
      pointBackgroundColor: col, pointBorderColor: col
    });
    return new Chart(ctx, {
      type: "line",
      data: { datasets: [mkDs(labA, c.blue), mkDs(labB, c.orange), mkDs(labC, c.gray)] },
      options: opts
    });
  }

  function bar2Series(canvasId, labA, labB, labC) {
    const ctx = $(canvasId);
    if (!ctx) return null;
    const opts = baseOptions();
    const c = activeColors();
    opts.scales.x.stacked = false;
    opts.scales.y.stacked = false;
    return new Chart(ctx, {
      type: "bar",
      data: {
        labels: [],
        datasets: [
          { label: labA, backgroundColor: c.blue, data: [], borderRadius: 6, barPercentage: 0.7, categoryPercentage: 0.7 },
          { label: labB, backgroundColor: c.orange, data: [], borderRadius: 6, barPercentage: 0.7, categoryPercentage: 0.7 },
          { label: labC, backgroundColor: c.gray, data: [], borderRadius: 6, barPercentage: 0.7, categoryPercentage: 0.7 }
        ]
      },
      options: opts
    });
  }

  // ====== Setters 3 series ======
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

  function toggleLegendFor(canvasId /*, vis — ignorado: leyendas siempre visibles */) {
    const card = byId(canvasId)?.closest('.chart-card');
    if (!card) return;
    upgradeLegendMarkup(card);
    card.querySelectorAll('.legend .legend-item').forEach(el => { el.style.display = ''; });
  }

  // ====== Utilidades varias ======
  // ✅ FIX: resize robusto cuando cambia el ancho del contenedor (evita “corrimiento”)
  function refreshChartAfterResize(idOrCanvas) {
    try {
      const canvas =
        (typeof idOrCanvas === 'string')
          ? document.getElementById(idOrCanvas)
          : idOrCanvas;

      if (!canvas || !window.Chart) return;

      const chart = Chart.getChart(canvas);
      if (!chart) return;

      // RAF doble = más estable cuando acabas de cambiar width del contenedor
      requestAnimationFrame(() => {
        chart.resize();
        requestAnimationFrame(() => {
          chart.resize();
          chart.update('none');
        });
      });
    } catch (e) {
      console.warn('[refreshChartAfterResize]', e);
    }
  }

  // ====== Estado global simple ======
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
      incModals();
    };
    const close = () => {
      root.setAttribute('aria-expanded', 'false');
      tab?.setAttribute('aria-expanded', 'false');
      if (backdrop) backdrop.hidden = true;
      decModals();
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
  function getTimeRange({ timeStartId = 'f-hour-start', timeEndId = 'f-hour-end' } = {}) {
    const t1 = document.getElementById(timeStartId)?.value || '00:00';
    const t2 = document.getElementById(timeEndId)?.value || '23:59';
    return { timeStart: t1, timeEnd: t2, startMin: _toMinutes(t1), endMin: _toMinutes(t2) };
  }
  function useTimeRange({
    timeStartId = 'f-hour-start',
    timeEndId = 'f-hour-end',
    stepMinutes,
    autoInit = true,
    swapOnInvalid = true,
    onChange
  } = {}) {

    const t1 = document.getElementById(timeStartId);
    const t2 = document.getElementById(timeEndId);
    if (!t1 || !t2) return;

    _forceHourOnly(t1, '00:00');
    _forceHourOnly(t2, '23:00');
// 1) Hora fin < hora inicio (solo si es el mismo día)
if (_validDateStr(ds) && _validDateStr(de) && ds === de) {
  const a = _toMinutes(ts);
  const b = _toMinutes(te);

  if (a > b) {
    if (swapOnInvalid) {
      const tmpT = t1.value; t1.value = t2.value; t2.value = tmpT;
    } else {
      t1.classList.add('is-invalid'); t2.classList.add('is-invalid');
      showErr('La hora de fin no puede ser menor que la hora de inicio.');
      return;
    }
  } else {
    t1.classList.remove('is-invalid'); t2.classList.remove('is-invalid');
  }
} else {
  t1.classList.remove('is-invalid'); t2.classList.remove('is-invalid');
}


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
        catch (e) { console.error('[useTimeRange:onChange]', e); }
      }
    }

    ['change', 'input'].forEach(ev => {
      t1.addEventListener(ev, () => validate(true));
      t2.addEventListener(ev, () => validate(true));
    });

    validate(false);

    return { validate, get: () => getTimeRange({ timeStartId, timeEndId }) };
  }

  // ====== Expose ======
  window.DashCore = {
    $, byId,

    normalizeProductKind, normalizeTruckType,

    num, fmtHHMM, fmtMMSS, stableStringify, simpleHash,

    useDateTimeRange,
    getDateTimeRange,
    useTimeRange,
    getTimeRange,

    ensureScrollableWidth,
    line2Series, bar2Series,
    setLine3, setBar3,
    refreshChartAfterResize,
    toggleLegendFor,
    bindHourOnlyTimeInput,
    state,
    setModalOpen, incModals, decModals,

    registerAutoRefresh,
    startAutoRefresh,
    setAutoRefreshEnabled,
    scatter2Series,
    lineTimeSeries,
    COLORS,
    DARK_COLORS,
    activeColors,
    updateChartsTheme,
    CHART_UI,

    USE_BAR_RECIBIDOS: false
  };

  if (window.Chart && window.ChartZoom) {
    Chart.register(window.ChartZoom);
  } else {
    console.warn("chartjs-plugin-zoom no cargado; el zoom estará deshabilitado");
  }
})(window);

