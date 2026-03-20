(function (DC) {
  if (!DC) return console.error("DashCore no encontrado (usando window como fallback)");
  DC = DC || window;

  DC.$ = DC.$ || ((id) => document.getElementById(id));
  DC.byId = DC.byId || DC.$;
  
  let chFinalizados, chRecibidos, chAzucar, chPromedio;
  let lastLabels = [];
  let lastDataHash = null;
  let lastFiltersHash = null;
  let inFlight = false;
  let pendingRun = false;
  let pendingSilent = false;

  // ========= LOADER (spinner overlay) =========
  let __histLoaderCount = 0;
  let __histLoaderTimer = null;

  function showLoaderHistorico() {
    __histLoaderCount++;
    if (__histLoaderTimer) clearTimeout(__histLoaderTimer);
    __histLoaderTimer = setTimeout(() => {
      const el = document.getElementById("spinner-overlay");
      if (el) { el.classList.add("show"); el.style.display = "flex"; }
    }, 120);
  }

  function hideLoaderHistorico(force = false) {
    if (force) __histLoaderCount = 0;
    else __histLoaderCount = Math.max(0, __histLoaderCount - 1);
    if (__histLoaderCount > 0) return;
    if (__histLoaderTimer) { clearTimeout(__histLoaderTimer); __histLoaderTimer = null; }
    const el = document.getElementById("spinner-overlay");
    if (el) { el.classList.remove("show"); el.style.display = "none"; }
  }

  // ========= AXIS X: FECHAS VERTICALES (SIN ROMPER EL CHART) =========
  // Mantiene 1 punto por dia (sin agrupar). Solo cambia como se ven los ticks.
  function applyVerticalDateTicks(chart) {
    try {
      if (!chart || !chart.options) return;
      const x = chart.options.scales && chart.options.scales.x;
      if (!x) return;

      const labels = (chart.data && chart.data.labels) ? chart.data.labels : [];
      const n = Array.isArray(labels) ? labels.length : 0;
      if (n <= 0) return;

      x.ticks = x.ticks || {};

      // Auto skip para no saturar
      x.ticks.autoSkip = false;     
      x.ticks.maxTicksLimit = n;

      // Limite dinamico segun el ancho disponible
      const w = Number(chart.width || 0);
    
      // Vertical 90deg
      x.ticks.minRotation = 90;
      x.ticks.maxRotation = 90;

      // Menos espacio abajo
      x.ticks.padding = 2;
      x.ticks.font = Object.assign({}, x.ticks.font || {}, { size: 10 });

      // Si vinieran labels largas tipo YYYY-MM-DD, las acorta a DD-MM
      x.ticks.callback = function (value) {
        try {
          const raw = (this && typeof this.getLabelForValue === "function")
            ? this.getLabelForValue(value)
            : (labels && labels[value] != null ? labels[value] : value);
          const s = String(raw);
          if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s.slice(8, 10) + "-" + s.slice(5, 7);
          if (/^\d{2}-\d{2}-\d{4}$/.test(s)) return s.slice(0, 5);
          if (/^\d{2}-\d{2}-\d{2}$/.test(s)) return s.slice(0, 5);
          return s;
        } catch (_) {
          return String(value);
        }
      };
    } catch (_) { }
  }

  
  
  function safeResizeChart(chart) {
    try { if (chart && typeof chart.resize === "function") chart.resize(); } catch (_) { }
    try { if (chart && typeof chart.update === "function") chart.update("none"); } catch (_) { }
  }

  // chartjs-plugin-zoom v2: evita warnings/errores por configs viejas
  function sanitizeZoom(chart) {
    try {
      const z = chart?.options?.plugins?.zoom;
      if (!z) return;
      // Quita opciones obsoletas
      if (typeof z.enabled !== "undefined") delete z.enabled;
      if (z.zoom && typeof z.zoom.enabled !== "undefined") delete z.zoom.enabled;
      // Fuerza TODO deshabilitado (no usamos zoom aqui)
      z.wheel = Object.assign({}, z.wheel || {}, { enabled: false });
      z.drag = Object.assign({}, z.drag || {}, { enabled: false });
      z.pinch = Object.assign({}, z.pinch || {}, { enabled: false });
    } catch (_) { }
  }

  // ========= FECHAS (ISO como llave, pretty solo para UI) =========
  function isoDateKey(v) {
    if (v == null) return null;
    if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);

    const s = String(v);

    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

    if (/^\d{2}-\d{2}-\d{2}$/.test(s)) {
      const [dd, mm, yy] = s.split("-").map(Number);
      const yyyy = 2000 + yy;
      return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }

    if (/^\d{2}-\d{2}-\d{4}$/.test(s)) {
      const [dd, mm, yyyy] = s.split("-").map(Number);
      return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
    }

    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);

    return null;
  }

  function prettyLabel(iso) {
    const [y, m, d] = String(iso).split("-");
    if (!y || !m || !d) return String(iso);
    return `${d}-${m}-${y.slice(-2)}`;
  }

  // ========= Compress labels duplicados (mismo día) y suma series =========
  // Útil cuando el backend manda fechas repetidas (ej: 21-12-25,22-12-25,21-12-25,22-12-25)
  function compressByDay(labels, ...series) {
    const outIso = [];
    const outPretty = [];
    const outSeries = series.map(() => []);
    const idx = new Map(); // isoKey -> index

    for (let i = 0; i < (labels || []).length; i++) {
      const raw = labels[i];
      const iso = isoDateKey(raw) || String(raw ?? "");
      if (!iso) continue;

      let j = idx.get(iso);
      if (j == null) {
        j = outIso.length;
        idx.set(iso, j);
        outIso.push(iso);
        outPretty.push(isoDateKey(iso) ? prettyLabel(iso) : String(raw ?? iso));
        for (let s = 0; s < outSeries.length; s++) outSeries[s][j] = 0;
      }
      for (let s = 0; s < outSeries.length; s++) {
        const v = Number(series[s]?.[i] ?? 0);
        outSeries[s][j] += (isNaN(v) ? 0 : v);
      }
    }

    return { labelsIso: outIso, labels: outPretty, series: outSeries };
  }

  // ========= Rows -> labelsIso + series por status =========
  function buildLabelsFromRows(rows) {
    const set = new Set();
    for (const r of rows || []) {
      const id = Number(r.predefined_status_id);
      if (id !== 2 && id !== 12) continue;
      const k = isoDateKey(r.fecha);
      if (k) set.add(k);
    }
    return Array.from(set).sort();
  }

  function buildSeriesByStatus(rows, labelsIso, statusId) {
    const idx = Object.fromEntries(labelsIso.map((l, i) => [l, i]));
    const serie = {
      volteo: Array(labelsIso.length).fill(0),
      plana: Array(labelsIso.length).fill(0),
      pipa: Array(labelsIso.length).fill(0),
      total: Array(labelsIso.length).fill(0)
    };

    for (const r of rows || []) {
      if (Number(r.predefined_status_id) !== Number(statusId)) continue;

      const k = isoDateKey(r.fecha);
      if (!k) continue;

      const i = idx[k];
      if (i == null) continue;

      const cat = DC.normalizeTruckType(r.truck_type);
      const n = Number(r.total) || 0;

      if (cat === "volteo") serie.volteo[i] += n;
      else if (cat === "plana") serie.plana[i] += n;
      else if (cat === "pipa") serie.pipa[i] += n;

      serie.total[i] += n;
    }

    return serie;
  }

  // ========= Mappers =========
  function mapResumenFromDto(dto) {
    const base = {
      kpi: dto.kpi || {},
      charts: dto.charts || {}
    };

    // si ya viene dto completo
    if (dto?.charts?.fechas) return base;

    return null;
  }

  function mapResumenFromLegacyBlocks(resp) {
    const rows = resp?.Rows || resp?.rows || [];
    const labelsIso = buildLabelsFromRows(rows);
    const labels = labelsIso.map(prettyLabel);

    const fin = buildSeriesByStatus(rows, labelsIso, 12);
    const rec = buildSeriesByStatus(rows, labelsIso, 2);

    const ton = resp?.ToneladasPorProducto || resp?.toneladasPorProducto || {};
    const charts = {
      fechas: labels,
      finalizados: { volteo: fin.volteo, plana: fin.plana, pipa: fin.pipa },
      recibidos: { volteo: rec.volteo, plana: rec.plana, pipa: rec.pipa },
      toneladasPorProducto: {
        azucar: ton.azucar || [],
        melaza: ton.melaza || [],
        otros: ton.otros || []
      },
      promedioDescarga: resp?.PromedioDescarga || resp?.promedioDescarga || {}
    };

    return { kpi: resp?.Kpi || resp?.kpi || {}, charts };
  }

  function mapResumenResponse(resp) {
    const dto = mapResumenFromDto(resp);
    if (dto) {
      const base = dto;

      // compat: si backend manda toneladas en kg, convertir si hiciera falta (dejar como viene si ya son ton)
      const ton = base?.charts?.toneladasPorProducto;
      if (ton && typeof ton === "object") {
        // No forzamos conversion aquí: tu backend ya manda Ton.
      }

      return base;
    }

    return mapResumenFromLegacyBlocks(resp);
  }

  function buildDataSignatureDto(dto) {
    try {
      const L = dto?.charts?.fechas || [];
      const f = dto?.charts?.finalizados || {};
      const r = dto?.charts?.recibidos || {};
      const t = dto?.charts?.toneladasPorProducto || {};
      const k = dto?.kpi || {};
      return {
        fechas: L,
        fin: { v: f.volteo || [], p: f.plana || [], pi: f.pipa || [] },
        rec: { v: r.volteo || [], p: r.plana || [], pi: r.pipa || [] },
        ton: { a: t.azucar || [], m: t.melaza || [], o: t.otros || [] },
        kpi: { t: k.enTransito || 0, p: k.enParqueo || 0, a: k.autorizados || 0 }
      };
    } catch {
      return null;
    }
  }

  // ========= Fetch =========
  async function fetchDataOnly() {
    const selectedProduct = DC.$("f-producto")?.value || "";
    const q = new URLSearchParams({
      from: DC.$("f-desde")?.value,
      to: DC.$("f-hasta")?.value,
      ingenio: ((DC.$("f-ingenio") && DC.$("f-ingenio").value) || DC.$("f-ingenio-hidden")?.value || ""),
      product: selectedProduct,
      _ts: Date.now().toString()
    });

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

    if (!res.ok) return null;
    const raw = await res.json();
    const data = mapResumenResponse(raw);
    return { raw, data };
  }

  // ========= Render =========

  // ========= Validación de rango (con SweetAlert2) =========
  let __histAlertOpen = false;

  function _addDaysIso(isoDate, days) {
    // isoDate: YYYY-MM-DD
    const [y, m, d] = String(isoDate || "").split("-").map(n => parseInt(n, 10));
    if (!y || !m || !d) return isoDate;
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + (Number(days) || 0));
    return dt.toISOString().slice(0, 10);
  }

  async function validateHistoricoDateRangeAndFix() {
    const d1 = DC.$("f-desde");
    const d2 = DC.$("f-hasta");
    if (!d1 || !d2) return true;

    const ds = String(d1.value || "").trim(); // esperado YYYY-MM-DD (input type=date)
    const de = String(d2.value || "").trim();
    if (!ds || !de) { d1.classList.remove("is-invalid"); d2.classList.remove("is-invalid"); __histAlertOpen = false; return true; }

    if (de < ds) {
      d1.classList.add("is-invalid");
      d2.classList.add("is-invalid");

      // ✅ Auto-fix: poner HASTA = DESDE + 1 día
      const fixed = _addDaysIso(ds, 1);
      d2.value = fixed;

      // SweetAlert2 (si está cargado)
      if (!__histAlertOpen && window.Swal && typeof window.Swal.fire === "function") {
        __histAlertOpen = true;
        try {
          await Swal.fire({
            icon: "error",
            title: "Error en las fechas seleccionadas",
            text: "El rango de fechas ingresado no es válido.",
            confirmButtonText: "Entendido"
          });
        } finally {
          __histAlertOpen = false;
        }
      } else {
        console.warn("[historico] Rango de fechas inválido: 'Hasta' < 'Desde' (auto-fix aplicado)");
      }

      // disparar refresh con el valor corregido (sin recursión inmediata)
      setTimeout(() => {
        try { d1.classList.remove("is-invalid"); d2.classList.remove("is-invalid"); } catch { }
        try { fetchAndRender(); } catch { }
      }, 0);

      return false;
    }

    d1.classList.remove("is-invalid");
    d2.classList.remove("is-invalid");
    __histAlertOpen = false;
    return true;
  }


  async function fetchAndRender(opts = {}) {
    const silent = !!opts.silent; // true = NO loader (auto refresh)

    if (inFlight) {
      pendingRun = true;

      const silentNow = !!opts.silent;
      // si alguna llamada fue NO-silent, que NO se pierda el loader en el rerun
      if (!silentNow) pendingSilent = false;
      else pendingSilent = pendingSilent && silentNow;

      return;
    }

    if (DC.state?.modalsOpen > 0) return;


    if (!(await validateHistoricoDateRangeAndFix())) return;

    inFlight = true;
    if (!silent) showLoaderHistorico();

    let pack = null;
    try {
      pack = await fetchDataOnly();
    } catch (e) {
      console.error("[historico] fetch error:", e);
    } finally {
      inFlight = false;
      if (!silent) hideLoaderHistorico(true);

      if (pendingRun) {
        const runSilent = pendingSilent;
        pendingRun = false;
        pendingSilent = false;
        fetchAndRender({ silent: runSilent });
      }
    }

    if (!pack || !pack.data) {
      ["chart-finalizados", "chart-recibidos", "chart-azucar", "chart-promedio"].forEach(id => {
        const card = DC.$(id)?.closest?.(".chart-card");
        if (card) card.classList.add("is-empty");
        const ch = window.Chart?.getChart?.(document.getElementById(id));
        if (ch) {
          ch.data.labels = [];
          ch.data.datasets.forEach(ds => { ds.data = []; ds.hidden = true; });
          ch.update("none");
        }
      });
      return;
    }

    const fHashObj = {
      from: DC.$("f-desde")?.value || "",
      to: DC.$("f-hasta")?.value || "",
      ingenio: ((DC.$("f-ingenio") && DC.$("f-ingenio").value) || DC.$("f-ingenio-hidden")?.value || ""),
      product: DC.$("f-producto")?.value || ""
    };

    const filtersHash = DC.stableStringStringify
      ? DC.stableStringify(fHashObj)
      : DC.stableStringify(fHashObj);

    const sig = buildDataSignatureDto(pack.data);
    const newHash = DC.simpleHash(DC.stableStringify(sig));
    const filtersChanged = (lastFiltersHash !== filtersHash);

    if (lastDataHash !== null && newHash === lastDataHash && !filtersChanged) {
      return;
    }
    lastDataHash = newHash;
    lastFiltersHash = filtersHash;

    const data = pack.data;

    const setText = (id, v) => {
      const el = DC.byId(id);
      if (el) el.innerText = v;
    };

    // KPIs base
    setText("kpi-en-transito", DC.num(data.kpi.enTransito));
    setText("kpi-en-parqueo", DC.num(data.kpi.enParqueo));
    setText("kpi-autorizados", DC.num(data.kpi.autorizados));
    setText("kpi-tiempo-espera", DC.fmtHHMM(data.kpi.tiempoEsperaMin));
    setText("kpi-tiempo-atencion", DC.fmtHHMM(data.kpi.tiempoAtencionMin));
    setText("kpi-prom-planas", DC.fmtMMSS(data.kpi.promDescargaPlanasSeg));
    setText("kpi-prom-volteo", DC.fmtMMSS(data.kpi.promDescargaVolteoSeg));
    setText("kpi-prom-pipa", DC.fmtMMSS(data.kpi.promDescargaPipaSeg));

    const kind = DC.normalizeProductKind(fHashObj.product);

    // Labels: el backend a veces manda días repetidos; aquí los normalizamos por día
    const Lraw = data.charts.fechas || [];
    const base = compressByDay(Lraw); // sin series, solo labels únicas por día
    const L = base.labels;            // labels "pretty" (DD-MM-YY)

    lastLabels = L;

    // ✅ IMPORTANTE: primero ajusta ancho del contenedor scrollable.
    ["chart-finalizados", "chart-recibidos", "chart-azucar", "chart-promedio"].forEach(id => {
      try { DC.ensureScrollableWidth(id, L); DC.refreshChartAfterResize(id); } catch { }
    });

    const VIS = (kind === "melaza")
      ? { volteo: false, plana: false, pipa: true }
      : { volteo: true, plana: true, pipa: true };

    const setEmpty = (id, empty) => {
      const card = DC.$(id)?.closest(".chart-card");
      if (card) card.classList.toggle("is-empty", !!empty);
      if (empty) {
        const ch = window.Chart?.getChart?.(document.getElementById(id));
        if (ch) {
          ch.data.datasets.forEach(ds => { ds.hidden = true; });
          ch.update("none");
        }
      }
    };

    const _visSum = (...arrs) => arrs.reduce((sum, arr) => sum + (arr || []).reduce((a, b) => a + Number(b || 0), 0), 0);

    // ===== Finalizados =====
    const finVol = data.charts.finalizados?.volteo || [];
    const finPla = data.charts.finalizados?.plana || [];
    const finPip = data.charts.finalizados?.pipa || [];

    chFinalizados.data.datasets[0].hidden = !VIS.volteo;
    chFinalizados.data.datasets[1].hidden = !VIS.plana;
    chFinalizados.data.datasets[2].hidden = !VIS.pipa;

    // Comprime días duplicados y suma series
    const finC = compressByDay(Lraw, finVol, finPla, finPip);
    // Pre-aplica ticks ANTES del update para que la animación los incluya
    chFinalizados.data.labels = finC.labels;
    try { applyVerticalDateTicks(chFinalizados); } catch { }
    DC.setLine3(
      chFinalizados,
      finC.labels,
      VIS.volteo ? finC.series[0] : new Array(finC.labels.length).fill(0),
      VIS.plana ? finC.series[1] : new Array(finC.labels.length).fill(0),
      VIS.pipa ? finC.series[2] : new Array(finC.labels.length).fill(0),
      "Camiones Finalizados"
    );
    try { DC.toggleLegendFor("chart-finalizados", VIS); } catch { }
    setEmpty("chart-finalizados", _visSum(finC.series[0], finC.series[1], finC.series[2]) === 0);

    // ===== Recibidos =====
    const recVol = data.charts.recibidos?.volteo || [];
    const recPla = data.charts.recibidos?.plana || [];
    const recPip = data.charts.recibidos?.pipa || [];

    chRecibidos.data.datasets[0].hidden = !VIS.volteo;
    chRecibidos.data.datasets[1].hidden = !VIS.plana;
    chRecibidos.data.datasets[2].hidden = !VIS.pipa;

    const setter3 = DC.USE_BAR_RECIBIDOS ? DC.setBar3 : DC.setLine3;

    // Comprime días duplicados y suma series
    const recC = compressByDay(Lraw, recVol, recPla, recPip);
    chRecibidos.data.labels = recC.labels;
    try { applyVerticalDateTicks(chRecibidos); } catch { }
    setter3(
      chRecibidos,
      recC.labels,
      VIS.volteo ? recC.series[0] : new Array(recC.labels.length).fill(0),
      VIS.plana ? recC.series[1] : new Array(recC.labels.length).fill(0),
      VIS.pipa ? recC.series[2] : new Array(recC.labels.length).fill(0),
      "Camiones Recibidos"
    );
    try { DC.toggleLegendFor("chart-recibidos", VIS); } catch { }
    setEmpty("chart-recibidos", _visSum(recC.series[0], recC.series[1], recC.series[2]) === 0);

    // ===== Toneladas por producto =====
    const tA = data.charts?.toneladasPorProducto?.azucar || [];
    const tM = data.charts?.toneladasPorProducto?.melaza || [];
    const tO = data.charts?.toneladasPorProducto?.otros || [];

    // KPI Flujo por día por producto (promedio diario, incluye días 0)
    const days = Array.isArray(L) && L.length ? L.length : 0;
    const sum = (arr) => (arr || []).reduce((a, b) => a + (Number(b) || 0), 0);
    const avg = (arr) => (days > 0 ? sum(arr) / days : 0);

    setText("kpi-flujo-dia_Az", `${avg(tA).toFixed(2)} t`);
    setText("kpi-flujo-dia_Mel", `${avg(tM).toFixed(2)} t`);

    // Tu chart está creado como: dataset0=Melaza, dataset1=Azúcar, dataset2=Otros
    const showAz = (kind === "todos" || kind === "azucar");
    const showMe = (kind === "todos" || kind === "melaza");
    const showOt = (kind === "todos" || kind === "otros");

    chAzucar.data.datasets[0].hidden = !showMe;
    chAzucar.data.datasets[1].hidden = !showAz;
    chAzucar.data.datasets[2].hidden = !showOt;

    // Comprime días duplicados y suma series
    const tonC = compressByDay(Lraw, tM, tA, tO);
    chAzucar.data.labels = tonC.labels;
    try { applyVerticalDateTicks(chAzucar); } catch { }
    DC.setLine3(
      chAzucar,
      tonC.labels,
      showMe ? tonC.series[0] : new Array(tonC.labels.length).fill(0), // Melaza
      showAz ? tonC.series[1] : new Array(tonC.labels.length).fill(0), // Azúcar
      showOt ? tonC.series[2] : new Array(tonC.labels.length).fill(0), // Otros
      "Toneladas"
    );
    setEmpty("chart-azucar", _visSum(tonC.series[0], tonC.series[1], tonC.series[2]) === 0);

    // ===== Promedios =====
    const pVol = data.charts?.promedioDescarga?.volteo || [];
    const pPla = data.charts?.promedioDescarga?.plana || [];
    const pPip = data.charts?.promedioDescarga?.pipa || [];

    chPromedio.data.datasets[0].hidden = !VIS.volteo;
    chPromedio.data.datasets[1].hidden = !VIS.plana;
    chPromedio.data.datasets[2].hidden = !VIS.pipa;

    // Comprime días duplicados y suma series
    const promC = compressByDay(Lraw, pVol, pPla, pPip);
    chPromedio.data.labels = promC.labels;
    try { applyVerticalDateTicks(chPromedio); } catch { }
    DC.setLine3(
      chPromedio,
      promC.labels,
      VIS.volteo ? promC.series[0] : new Array(promC.labels.length).fill(0),
      VIS.plana ? promC.series[1] : new Array(promC.labels.length).fill(0),
      VIS.pipa ? promC.series[2] : new Array(promC.labels.length).fill(0),
      "Promedio Descarga (min)"
    );

    if (chPromedio?.options?.plugins?.tooltip) {
      const txt = data.charts?.promedioDescargaTxt || {};
      chPromedio.options.plugins.tooltip.callbacks = {
        label: (ctx) => {
          const i = ctx.dataIndex;
          const arr = ctx.datasetIndex === 0 ? txt.volteo : ctx.datasetIndex === 1 ? txt.plana : txt.pipa;
          const pretty =
            (arr && arr[i])
              ? arr[i]
              : `${Math.floor(ctx.parsed.y)}:${String(Math.round((ctx.parsed.y % 1) * 60)).padStart(2, "0")}`;
          return `${ctx.dataset.label}: ${pretty}`;
        }
      };
      chPromedio.update();
    }
    setEmpty("chart-promedio", _visSum(promC.series[0], promC.series[1], promC.series[2]) === 0);
  }

  // ========= Init =========
  function localYMD(d) {
    return d.getFullYear() + "-"
      + String(d.getMonth() + 1).padStart(2, "0") + "-"
      + String(d.getDate()).padStart(2, "0");
  }

  document.addEventListener("DOMContentLoaded", () => {
    const hasta = new Date();
    const desde = new Date(hasta);
    desde.setDate(hasta.getDate() - 30);

    if (DC.$("f-desde")) DC.$("f-desde").value = localYMD(desde);
    if (DC.$("f-hasta")) DC.$("f-hasta").value = localYMD(hasta);

    DC.$("f-apply")?.addEventListener("click", fetchAndRender);

    chFinalizados = DC.line2Series("chart-finalizados", "Volteo", "Plana", "Pipa");
    chRecibidos = DC.USE_BAR_RECIBIDOS
      ? DC.bar2Series("chart-recibidos", "Volteo", "Plana", "Pipa")
      : DC.line2Series("chart-recibidos", "Volteo", "Plana", "Pipa");

    // dataset0=Melaza, dataset1=Azúcar, dataset2=Otros
    chAzucar = DC.line2Series("chart-azucar", "Melaza", "Azúcar", "Otros");
    chPromedio = DC.line2Series("chart-promedio", "Volteo", "Plana", "Pipa");

    // Limpia configuracion de zoom vieja (plugin-zoom v2)
    try { sanitizeZoom(chFinalizados); } catch { }
    try { sanitizeZoom(chRecibidos); } catch { }
    try { sanitizeZoom(chAzucar); } catch { }
    try { sanitizeZoom(chPromedio); } catch { }

    // Resize (con debounce): recalcula scroll + resize charts sin loops
    let __rzT = null;
    window.addEventListener("resize", () => {
      if (__rzT) clearTimeout(__rzT);
      __rzT = setTimeout(() => {
        if (lastLabels?.length) {
          ["chart-finalizados", "chart-recibidos", "chart-azucar", "chart-promedio"].forEach((id) => {
            try { DC.ensureScrollableWidth(id, lastLabels); } catch { }
          });
        }

        try { applyVerticalDateTicks(chFinalizados); safeResizeChart(chFinalizados); } catch { }
        try { applyVerticalDateTicks(chRecibidos); safeResizeChart(chRecibidos); } catch { }
        try { applyVerticalDateTicks(chAzucar); safeResizeChart(chAzucar); } catch { }
        try { applyVerticalDateTicks(chPromedio); safeResizeChart(chPromedio); } catch { }
      }, 150);
    });

    fetchAndRender();
    DC.registerAutoRefresh("historico", () => fetchAndRender({ silent: true }));
    DC.startAutoRefresh();
  });

})(window.DashCore);
