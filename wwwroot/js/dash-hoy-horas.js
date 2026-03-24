(function (DC) {
  if (!DC) return console.error("DashCore no encontrado (usando window como fallback)");
  DC = DC || window;

  // =================== Helpers base ===================
  DC.$ = DC.$ || ((id) => document.getElementById(id));
  DC.byId = DC.byId || DC.$;

  DC.normalizeProductKind = DC.normalizeProductKind || ((v) => {
    const s = String(v ?? "").toUpperCase();
    if (s.includes("MEL")) return "melaza";
    if (s.includes("AZ")) return "azucar";
    return "todos";
  });

  DC.normalizeTruckType = DC.normalizeTruckType || function (t) {
    const u = String(t || "").toUpperCase().trim().replace(/\s+/g, "");
    if (u === "V" || u === "VOLTEO" || u === "VOLTEOS" || u === "T") return "volteo";
    if (u === "R" || u === "PLANA" || u === "PLANAS" || u === "PLANO" || u === "PLANOS") return "plana";
    if (u === "P" || u === "PI" || u === "PIPA" || u === "PIPAS") return "pipa";
    return null;
  };

  DC.ensureScrollableWidth = DC.ensureScrollableWidth || function (id, labels) {
    try {
      const canvas = document.getElementById(id);
      if (!canvas) return;
      const scroll = canvas.closest(".chart-scroll");
      const inner = scroll?.querySelector(".chart-inner");
      const minPxPerLabel = 28, base = 300;
      const w = Math.max(base, (labels?.length || 0) * minPxPerLabel);
      (inner || canvas).style.width = w + "px";
    } catch { }
  };

  DC.refreshChartAfterResize = DC.refreshChartAfterResize || function (id) {
    try {
      const ch = window.Chart?.getChart?.(id);
      if (!ch) return;
      if (ch.__resizing) return;
      ch.__resizing = true;
      setTimeout(() => {
        try { ch.resize(); } finally { ch.__resizing = false; }
      }, 80);
    } catch { }
  };

  DC.stableStringify = DC.stableStringify || (obj => {
    const seen = new WeakSet();
    return JSON.stringify(obj, function (k, v) {
      if (v && typeof v === "object") {
        if (seen.has(v)) return;
        seen.add(v);
        const out = {};
        for (const key of Object.keys(v).sort()) out[key] = v[key];
        return out;
      }
      return v;
    });
  });

  DC.simpleHash = DC.simpleHash || (str => {
    let h = 0;
    for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
    return h;
  });

  // =================== DEBUG ===================
  const DEBUG = false;
  const log = (...a) => DEBUG && console.log(...a);


  // ===================== Loader global (spinner-overlay) =====================
  const loader = (() => {
    const el = () => document.getElementById("spinner-overlay");

    const show = () => {
      const x = el();
      if (!x) return;

      x.classList.add("show");

      // ✅ IMPORTANTÍSIMO: el inline style display:none bloquea todo
      x.style.display = "flex";           // o "block" si no usas flex
    };

    const hide = () => {
      const x = el();
      if (!x) return;

      x.classList.remove("show");
      x.style.display = "none";
    };

    return { show, hide };
  })();


  async function readJsonSafe(resp, label) {
    try {
      const text = await resp.text();
      if (!resp.ok) {
        console.warn(`[${label}] HTTP ${resp.status} => body:`, text);
        return null;
      }
      if (!text) return null;
      try { return JSON.parse(text); } catch {
        console.warn(`[${label}] No es JSON. Body:`, text);
        return null;
      }
    } catch (e) {
      console.warn(`[${label}] readJsonSafe error:`, e);
      return null;
    }
  }

  const secToMinSegLabel = (sec) => {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    const totalMin = Math.floor(sec / 60);
    const ss = sec % 60;
    const mmStr = String(totalMin).padStart(2, "0");
    const ssStr = String(ss).padStart(2, "0");
    return `${mmStr} min ${ssStr} s`;
  };


  // =================== Chart options ===================
  function baseOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "nearest",
        intersect: true
      },
      scales: {
        x: { ticks: { autoSkip: false, maxRotation: 90, minRotation: 90 } },
        y: { beginAtZero: true, title: { display: false, text: "" } }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: "nearest",
          intersect: true
        }
      }
    };
  }

  // No reasignar chart.options completo (evita recursion)
  DC.setLine3 = DC.setLine3 || function (chart, labels, a, b, c, yTitle = "") {
    if (!chart) return;

    chart.data.labels = labels || [];
    if (!chart.data.datasets || chart.data.datasets.length < 3) {
      chart.data.datasets = [
        { label: "A", data: [], borderWidth: 2, pointRadius: 2 },
        { label: "B", data: [], borderWidth: 2, pointRadius: 2 },
        { label: "C", data: [], borderWidth: 2, pointRadius: 2 },
      ];
    }

    chart.data.datasets[0].data = (a || []).map(v => (v == null ? null : v));
    chart.data.datasets[1].data = (b || []).map(v => (v == null ? null : v));
    chart.data.datasets[2].data = (c || []).map(v => (v == null ? null : v));

    if (chart.options?.scales?.y?.title) {
      chart.options.scales.y.title.display = !!yTitle;
      chart.options.scales.y.title.text = yTitle || "";
    }

    chart.update();
  };

  DC.line2Series = DC.line2Series || function (canvasId, lab1, lab2, lab3) {
    const el = DC.$(canvasId);
    if (!el || !window.Chart) return null;

    const ch = new Chart(el, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          { label: lab1, data: [], borderWidth: 2, pointRadius: 2 },
          { label: lab2, data: [], borderWidth: 2, pointRadius: 2 },
          { label: lab3, data: [], borderWidth: 2, pointRadius: 2 },
        ]
      },
      options: baseOptions()
    });

    ch.__txt = { d0: [], d1: [], d2: [] };
    return ch;
  };



  DC.toggleLegendFor = DC.toggleLegendFor || function () { };

  // ✅ Fuerza que “Recibidos” sea igual a los demás (línea)
  DC.USE_BAR_RECIBIDOS = false;

  // =================== Estado local ===================
  let chFinalizados, chRecibidos, chAzucar, chPromedio;
  let lastLabels = [];
  let lastDataHash = null;
  let lastFiltersSig = "";
  let inFlight = false;
  let pendingRun = false;
  let pendingSilent = false;


  // =================== Helpers KPI ===================
  function pad2(n) { return String(n).padStart(2, "0"); }

  function secondsToHHMM(secs) {
    const s = Math.max(0, Math.floor(Number(secs || 0)));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h} h ${pad2(m)} min`;
  }

  function hhmmssToSecondsLoose(v) {
    if (v == null || v === "") return 0;
    if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, v);

    const s = String(v).trim();
    const m = s.match(/^(\d{1,3}):([0-5]\d):([0-5]\d)$/);
    if (!m) return 0;

    const hh = Number(m[1]), mm = Number(m[2]), ss = Number(m[3]);
    return (hh * 3600) + (mm * 60) + ss;
  }

  function secondsToMinSeg(sec) {
    const s = Math.max(0, Math.floor(Number(sec || 0)));
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return `${m} min ${String(ss).padStart(2, "0")} s`;
  }

  function formatDescargaKPI(v) {
    if (v == null || v === "") return "0 min 00 s";
    if (typeof v === "string" && v.includes(":")) return secondsToMinSeg(hhmmssToSecondsLoose(v));
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return "0 min 00 s";
    return secondsToMinSeg(n);
  }

  function pickGlobalAvgSeconds(json, key) {
    const glob = Number(json?.[key]?.Global?.promedio_seg ?? 0);
    if (glob > 0) return glob;

    const alt = (key === "PromedioEspera")
      ? Number(json?.PromedioActual?.Espera?.promedio_seg ?? 0)
      : Number(json?.PromedioActual?.Atencion?.promedio_seg ?? 0);
    if (alt > 0) return alt;

    const horas = Array.isArray(json?.[key]?.Horas) ? json[key].Horas : [];
    let num = 0, den = 0;
    for (const h of horas) {
      const seg = Number(h?.promedio_seg ?? 0);
      const c = Number(h?.cantidad ?? h?.Cantidad ?? 0);
      if (seg > 0 && c > 0) { num += seg * c; den += c; }
    }
    if (den > 0) return Math.round(num / den);
    return 0;
  }

  function renderKPIsFromResumenYPromedios(resumenJson, promediosJson) {
    const resumen = resumenJson || {};
    const tdb = resumen?.TotalDB || {};
    const hasNum = (v) => v !== null && v !== undefined && Number.isFinite(Number(v));

    let enTransito = hasNum(tdb.EnTransito) ? Number(tdb.EnTransito) : NaN;
    let enParqueo = hasNum(tdb.Prechequeado) ? Number(tdb.Prechequeado) : NaN;
    let autorizados = hasNum(tdb.Autorizado) ? Number(tdb.Autorizado) : NaN;

    if (!hasNum(enTransito) && hasNum(resumen?.EnTransito?.Total)) enTransito = Number(resumen.EnTransito.Total);
    if (!hasNum(enParqueo) && hasNum(resumen?.Prechequeado?.Total)) enParqueo = Number(resumen.Prechequeado.Total);
    if (!hasNum(autorizados) && hasNum(resumen?.Autorizado?.Total)) autorizados = Number(resumen.Autorizado.Total);

    if (!hasNum(enTransito)) enTransito = 0;
    if (!hasNum(enParqueo)) enParqueo = 0;
    if (!hasNum(autorizados)) autorizados = 0;

    const elT = DC.byId("kpi-en-transito");
    if (elT) elT.textContent = String(enTransito);

    const elP = DC.byId("kpi-en-parqueo");
    if (elP) elP.textContent = String(enParqueo);

    const elA = DC.byId("kpi-autorizados");
    if (elA) elA.textContent = String(autorizados);

    const esperaSeg = pickGlobalAvgSeconds(promediosJson || {}, "PromedioEspera");
    const atencionSeg = pickGlobalAvgSeconds(promediosJson || {}, "PromedioAtencion");

    const elE = DC.byId("kpi-tiempo-espera");
    if (elE) elE.textContent = secondsToHHMM(esperaSeg);

    const elAt = DC.byId("kpi-tiempo-atencion");
    if (elAt) elAt.textContent = secondsToHHMM(atencionSeg);
  }

  function updateKPIFlujoDiaFrom(pesosJson) {
    const norm = (s) => String(s ?? "").trim().toUpperCase();
    const pps = pesosJson?.PesosPorStatus ?? {};

    const prods = Array.isArray(pps?.PromediosPorProducto) ? pps.PromediosPorProducto : [];
    const horas = Array.isArray(pps?.Horas) ? pps.Horas : [];

    let kgAZ = 0, kgMEL = 0;
    let hasAZ = false, hasMEL = false;

    for (const row of prods) {
      const p = norm(row?.Product ?? row?.product);
      const kg = Number(row?.TotalKg ?? 0);
      if (!Number.isFinite(kg) || kg <= 0) continue;

      if (p.includes("AZ-001") || p === "AZ-001") { kgAZ += kg; hasAZ = true; }
      if (p.includes("MEL-001") || p === "MEL-001") { kgMEL += kg; hasMEL = true; }
    }

    if (!hasMEL || !hasAZ) {
      let hAZ = 0, hMEL = 0;
      for (const h of horas) {
        const kg = Number(h?.TotalKg ?? 0);
        if (!Number.isFinite(kg) || kg <= 0) continue;

        const p = norm(h?.Product ?? h?.product);
        if (!hasAZ && (p.includes("AZ-001") || p === "AZ-001")) hAZ += kg;
        if (!hasMEL && (p.includes("MEL-001") || p === "MEL-001")) hMEL += kg;
      }
      if (!hasAZ) kgAZ = hAZ;
      if (!hasMEL) kgMEL = hMEL;
    }

    const elAz = DC.byId("kpi-flujo-dia_Az");
    const elMel = DC.byId("kpi-flujo-dia_Mel");

    const fmtTon = (kg) => {
      const ton = (Number.isFinite(kg) ? kg : 0) / 1000;
      return `${ton.toLocaleString("es-SV", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} t`;
    };

    if (elAz) elAz.textContent = fmtTon(kgAZ);
    if (elMel) elMel.textContent = fmtTon(kgMEL);
  }

  function updateKPIsDescargaFrom(promDescJson) {
    const pa = promDescJson?.PromedioDescarga?.PromedioActual || {};

    const elPl = DC.byId("kpi-prom-planas");
    const elVo = DC.byId("kpi-prom-volteo");
    const elPi = DC.byId("kpi-prom-pipa");

    if (elPl) elPl.textContent = formatDescargaKPI(pa.Planas);
    if (elVo) elVo.textContent = formatDescargaKPI(pa.Volteo);
    if (elPi) elPi.textContent = formatDescargaKPI(pa.Pipa);

  }

  // =================== Filtros ===================
  function timeInputToHour(t) {
    if (!t || typeof t !== "string") return 0;
    const [hh] = t.split(":"); const n = Number(hh);
    return Number.isFinite(n) ? Math.min(Math.max(n, 0), 23) : 0;
  }

  function readFilters() {
    const hourFrom = timeInputToHour(DC.$("f-hour-start")?.value || "00:00");
    const hourTo = timeInputToHour(DC.$("f-hour-end")?.value || "23:59");
    const ingenioId = (DC.$("f-ingenio")?.value || "").trim();
    const product = (DC.$("f-producto")?.value || "").trim(); // "" cuando es Todos
    return { hourFrom, hourTo, ingenioId, product };
  }

  function setIfNotEmpty(qs, key, val) {
    const s = String(val ?? "").trim();
    if (s.length > 0) qs.set(key, s);
  }

  function absUrl(path, params) {
    const u = new URL(path, window.location.origin);
    if (params) {
      if (params instanceof URLSearchParams) {
        for (const [k, v] of params) u.searchParams.set(k, v);
      } else {
        for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
      }
    }
    return u.toString();
  }

  function buildHourLabels(hStart, hEnd) {
    const L = [];
    for (let h = hStart; h <= hEnd; h++) L.push(`${pad2(h)}:00`);
    return L;
  }

  // =================== Fetch endpoints (hoy) ===================
  async function fetchResumenHoy(filters) {
    const qs = new URLSearchParams({ hStart: String(filters.hourFrom), hEnd: String(filters.hourTo) });
    setIfNotEmpty(qs, "ingenioId", filters.ingenioId);
    if (String(filters.product || "").trim()) setIfNotEmpty(qs, "product", filters.product);

    const url = absUrl("/dashboard/resumen-hoy", qs);
    const r = await fetch(url, { headers: { "Accept": "application/json" }, cache: "no-store" });
    const json = await readJsonSafe(r, "resumen-hoy");
    log("URL resumen-hoy:", url, json);
    return json;
  }

  async function fetchPromediosAtencionHoy(filters) {
    const qs = new URLSearchParams({ hStart: String(filters.hourFrom), hEnd: String(filters.hourTo) });
    setIfNotEmpty(qs, "ingenioId", filters.ingenioId);
    if (String(filters.product || "").trim()) setIfNotEmpty(qs, "product", filters.product);

    const url = absUrl("/dashboard/promedios-atencion-hoy", qs);
    const r = await fetch(url, { headers: { "Accept": "application/json" }, cache: "no-store" });
    const json = await readJsonSafe(r, "promedios-atencion-hoy");
    log("URL promedios-atencion-hoy:", url, json);
    return json;
  }

  async function fetchPesosPorStatusHoy(filters) {
    const qs = new URLSearchParams({
      hStart: String(filters.hourFrom),
      hEnd: String(filters.hourTo),
      _ts: String(Date.now())
    });
    if ((filters.ingenioId || "").trim()) qs.set("ingenioId", filters.ingenioId.trim());
    if ((filters.product || "").trim()) qs.set("product", filters.product.trim());

    const url = `/dashboard/pesos-por-status-hoy?${qs.toString()}`;
    const r = await fetch(url, { headers: { "Accept": "application/json" }, cache: "no-store" });
    const json = await readJsonSafe(r, "pesos-por-status-hoy");
    log("URL pesos-por-status-hoy:", url, json);
    return json;
  }

  async function fetchPesosPorStatusHoy_BothProducts(filters) {
    const [az, me] = await Promise.all([
      fetchPesosPorStatusHoy({ ...filters, product: "AZ-001" }),
      fetchPesosPorStatusHoy({ ...filters, product: "MEL-001" }),
    ]);

    const horasAz = Array.isArray(az?.PesosPorStatus?.Horas) ? az.PesosPorStatus.Horas : [];
    const horasMe = Array.isArray(me?.PesosPorStatus?.Horas) ? me.PesosPorStatus.Horas : [];
    
    const prodsAz = Array.isArray(az?.PesosPorStatus?.PromediosPorProducto) ? az.PesosPorStatus.PromediosPorProducto : [];
    const prodsMel = Array.isArray(me?.PesosPorStatus?.PromediosPorProducto) ? me.PesosPorStatus.PromediosPorProducto : [];

    const fix = (arr, prod) => arr.map(x => ({ ...x, Product: x?.Product ?? x?.product ?? prod }));

    return {
      PesosPorStatus: {
        ...(az?.PesosPorStatus || me?.PesosPorStatus || {}),
        PromediosPorProducto: [...prodsAz, ...prodsMel],
        Horas: [...fix(horasAz, "AZ-001"), ...fix(horasMe, "MEL-001")]
      }
    };
  }

  async function fetchPromedioDescargaHoy(filters) {
    const qs = new URLSearchParams({
      hStart: String(filters.hourFrom),
      hEnd: String(filters.hourTo),
      _ts: String(Date.now())
    });
    if ((filters.ingenioId || "").trim()) qs.set("ingenioId", filters.ingenioId.trim());
    if ((filters.product || "").trim()) qs.set("product", filters.product.trim());

    const url = `/dashboard/promedio-descarga-hoy?${qs.toString()}`;
    const r = await fetch(url, { headers: { "Accept": "application/json" }, cache: "no-store" });
    const json = await readJsonSafe(r, "promedio-descarga-hoy");
    log("URL promedio-descarga-hoy:", url, json);
    return json;
  }

  // =================== Mapeos (resumen) ===================
  function seriesFromHorasV2(block, labels) {
    const idx = Object.fromEntries(labels.map((l, i) => [l, i]));
    const out = {
      volteo: new Array(labels.length).fill(0),
      plana: new Array(labels.length).fill(0),
      pipa: new Array(labels.length).fill(0)
    };

    const horas = Array.isArray(block?.Horas) ? block.Horas : [];
    for (const h of horas) {
      const key = String(h?.Hora || "").trim();
      const i = idx[key]; if (i == null) continue;
      const tt = h?.TruckType || {};
      out.volteo[i] += Number(tt.Volteo || 0);
      out.plana[i] += Number(tt.Planas || 0);
      out.pipa[i] += Number(tt.Pipa || 0);
    }
    return out;
  }

  function mapResumenHoyResponse(resumen, labels) {
    if (!resumen) return { finalizados: { volteo: [], plana: [], pipa: [] }, recibidos: { volteo: [], plana: [], pipa: [] } };

    if (resumen?.Finalizado?.Horas || resumen?.Prechequeado?.Horas) {
      return {
        finalizados: seriesFromHorasV2(resumen.Finalizado, labels),
        recibidos: seriesFromHorasV2(resumen.Prechequeado, labels)
      };
    }

    if (Array.isArray(resumen?.Rows)) {
      const idx = Object.fromEntries(labels.map((l, i) => [l, i]));
      const empty = () => Array(labels.length).fill(0);
      const fin = { volteo: empty(), plana: empty(), pipa: empty() };
      const rec = { volteo: empty(), plana: empty(), pipa: empty() };

      for (const r of resumen.Rows) {
        const statusId = Number(r.predefined_status_id ?? r.current_status ?? 0);
        let label = String(r.hora || "").trim();
        if (!label) { const d = new Date(r.fecha); label = `${pad2(d.getHours())}:00`; }
        const i = idx[label]; if (i == null) continue;

        const cat = DC.normalizeTruckType(r.truck_type);
        const val = Number(r.total) || 0;
        if (!cat) continue;

        if (statusId === 12) fin[cat][i] += val;
        if (statusId === 2) rec[cat][i] += val;
      }
      return { finalizados: fin, recibidos: rec };
    }

    return { finalizados: { volteo: [], plana: [], pipa: [] }, recibidos: { volteo: [], plana: [], pipa: [] } };
  }

  // =================== Cantidad recibida: 1 punto por registro (SIN CAMBIAR LA GRÁFICA) ===================
  function hhmmToMinutes(hhmm) {
    const s = String(hhmm || "").trim();
    const m = s.match(/^(\d{1,2}):([0-5]\d)$/);
    if (!m) return null;
    const hh = Number(m[1]), mm = Number(m[2]);
    if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
    return hh * 60 + mm;
  }

  function addBasePointForSeries(points) {
    const arr = Array.isArray(points) ? points.slice() : [];
    if (!arr.length) return arr;

    // Asegura orden por X
    arr.sort((a, b) => Number(a?.x) - Number(b?.x));

    const firstX = Number(arr[0]?.x);
    if (!Number.isFinite(firstX)) return arr;

    // Evita duplicar si ya existe base
    if (arr[0]?.meta?.base === true) return arr;

    // Punto base "ligeramente antes" del primer X para evitar línea vertical
    const baseX = Math.max(0, firstX - 0.01);

    arr.unshift({ x: baseX, y: 0, meta: { base: true } });
    return arr;
  }

  function filterResumenByHour(resumen, hFrom, hTo) {
    if (!resumen) return resumen;
    const filterHoras = (block) => {
      if (!block?.Horas) return block;
      return {
        ...block,
        Horas: block.Horas.filter(r => {
          const mins = hhmmToMinutes(String(r?.HoraStatus || ""));
          if (mins == null) return false;
          const h = Math.floor(mins / 60);
          return h >= hFrom && h <= hTo;
        })
      };
    };
    return { ...resumen, Finalizado: filterHoras(resumen.Finalizado), Prechequeado: filterHoras(resumen.Prechequeado) };
  }

  function buildEventosAcumuladosPoints(block) {
    const rows = Array.isArray(block?.Horas) ? block.Horas : [];

    // parse x = minutos del día y hour = 0..23
    const ordered = rows
      .map(r => {
        const x = hhmmToMinutes(r.HoraStatus);
        if (x == null) return null;
        return { ...r, _x: x, _h: Math.floor(x / 60) };
      })
      .filter(Boolean)
      .sort((a, b) => a._x - b._x);

    // contadores separados por (hora + tipo)
    // key ejemplo: "00|V", "01|P", etc.
    const counters = Object.create(null);

    const pts = { volteo: [], plana: [], pipa: [] };
    let maxY = 0;

    for (const r of ordered) {
      const tt = r.TruckType;          // "V" | "R" | "P"
      const h2 = String(r._h).padStart(2, "0");
      const key = `${h2}|${tt}`;

      counters[key] = (counters[key] || 0) + 1;
      const y = counters[key];
      if (y > maxY) maxY = y;

      const p = {
        x: r._x,
        y,
        meta: {
          hora: r.HoraStatus,
          placa: r.TrailerPlate,
          id: r.IdShipment,
          ingenio: r.IngenioCode
        }
      };

      if (tt === "V") pts.volteo.push(p);
      else if (tt === "R") pts.plana.push(p);
      else if (tt === "P") pts.pipa.push(p);
    }

    return { pts, maxY };
  }

  // Devuelve puntos scatter por producto:
  // [{x: 663, y: 26.42, meta:{hora:"11:03", plate:"RE5947", id:123}}]
  function buildAzucarScatterPoints(pesosJson) {
    let list = Array.isArray(pesosJson?.PesosPorStatus?.Horas)
      ? pesosJson.PesosPorStatus.Horas
      : [];

    // Orden cronológico
    list = list.slice().sort((a, b) => {
      const da = Date.parse(String(a?.FechaHoraDescarga || "")) || 0;
      const db = Date.parse(String(b?.FechaHoraDescarga || "")) || 0;
      return da - db;
    });

    // ✅ acumulado + contador por HoraBucket + Product
    const accByHourProd = new Map(); // "HH:00||AZ-001" => kg acumulado
    const idxByHourProd = new Map(); // "HH:00||AZ-001" => 1..N (reinicia por hora+producto)

    const az = [];
    const mel = [];
    const otros = [];

    for (const r of list) {
      const product = String(r?.Product ?? "").trim().toUpperCase();
      if (!product) continue;

      const horaReal = String(r?.HoraDescarga ?? "").trim(); // "HH:mm"
      const x = hhmmToMinutes(horaReal);
      if (x == null) continue;

      const bucket = String(r?.HoraBucket ?? "").trim(); // "HH:00"
      if (!bucket) continue;

      const kgRaw = Number(r?.TotalKgRaw ?? r?.TotalKg ?? 0);
      if (!Number.isFinite(kgRaw) || kgRaw <= 0) continue;

      const key = `${bucket}||${product}`;

      const prevN = idxByHourProd.get(key) ?? 0;
      const n = prevN + 1;
      idxByHourProd.set(key, n);

      const prevKg = accByHourProd.get(key) ?? 0;
      const kgAcum = prevKg + kgRaw;
      accByHourProd.set(key, kgAcum);

      const tonRaw = kgRaw / 1000;
      const tonAcum = kgAcum / 1000;

      const point = {
        x,
        y: tonAcum,
        meta: {
          n,
          hora: horaReal,
          bucket,
          product,
          plate: r?.trailer_plate ?? null,
          id: r?.id_shipment ?? null,
          tonRaw,   // ✅ recibido
          tonAcum   // ✅ acumulado
        }
      };

      if (product.includes("AZ")) az.push(point);
      else if (product.includes("MEL")) mel.push(point);
      else otros.push(point);
    }

    az.sort((a, b) => a.x - b.x);
    mel.sort((a, b) => a.x - b.x);
    otros.sort((a, b) => a.x - b.x);

    return { azucar: az, melaza: mel, otros };
  }


  function buildPromedioDescargaScatter(promJson) {
    const horasRaw = Array.isArray(promJson?.PromedioDescarga?.Horas)
      ? promJson.PromedioDescarga.Horas
      : [];

    // Detectar si es el formato NUEVO (bucket por hora)
    const isNewBucketFormat = !!(horasRaw[0] && typeof horasRaw[0].Hora === "string" && horasRaw[0].Promedio);

    // Helpers
    const truckCat = (truckType) => {
      const t = String(truckType || "").trim().toUpperCase();
      if (["R", "PLANA", "PLANAS"].includes(t)) return "Planas";
      if (["T", "V", "VOLTEO", "VOLTEOS"].includes(t)) return "Volteo";
      if (["P", "PIPA", "PIPAS"].includes(t)) return "Pipa";
      return "Otro";
    };

    const hhmmssToSec = (hhmmss) => {
      const m = String(hhmmss || "").match(/^(\d+):(\d{2}):(\d{2})$/);
      if (!m) return 0;
      const hh = Number(m[1]), mm = Number(m[2]), ss = Number(m[3]);
      if (![hh, mm, ss].every(Number.isFinite)) return 0;
      return hh * 3600 + mm * 60 + ss;
    };

    const secToHHMMSS_local = (sec) => {
      sec = Math.max(0, Math.floor(Number(sec) || 0));
      const hh = String(Math.floor(sec / 3600)).padStart(2, "0");
      const mm = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
      const ss = String(sec % 60).padStart(2, "0");
      return `${hh}:${mm}:${ss}`;
    };

    // y = horas decimales (0.1, 0.2...) => (seg / 3600)
    const secToMinutesFloat = (sec) => (Number(sec) || 0) / 60;


    // x = minutos del día (HH*60) para que el eje muestre 00:00, 01:00...
    const hourToX = (h) => (Number(h) || 0) * 60;

    const pts = { volteo: [], plana: [], pipa: [] };

    // =========================
    // 1) FORMATO NUEVO (Buckets)
    // =========================
    if (isNewBucketFormat) {
      for (const h of horasRaw) {
        const horaStr = String(h?.Hora || "").trim(); // "HH:00"
        const m = horaStr.match(/^(\d{1,2}):[0-5]\d$/);
        if (!m) continue;

        const HH = Number(m[1]);
        if (!Number.isFinite(HH)) continue;

        const prom = h?.Promedio || {};
        const tPlanas = String(prom?.Planas ?? "00:00:00");
        const tVolteo = String(prom?.Volteo ?? "00:00:00");
        const tPipa = String(prom?.Pipa ?? "00:00:00");

        const sPlanas = hhmmssToSec(tPlanas);
        const sVolteo = hhmmssToSec(tVolteo);
        const sPipa = hhmmssToSec(tPipa);

        const x = hourToX(HH);

        if (sPlanas > 0) pts.plana.push({
          x,
          y: secToMinutesFloat(sPlanas),
          meta: { hora: horaStr, tiempo: secToMinSegLabel(sPlanas), placa: "" }
        });
        if (sVolteo > 0) pts.volteo.push({
          x,
          y: secToMinutesFloat(sVolteo),
          meta: { hora: horaStr, tiempo: secToMinSegLabel(sVolteo), placa: "" }
        });
        if (sPipa > 0) pts.pipa.push({
          x,
          y: secToMinutesFloat(sPipa),
          meta: { hora: horaStr, tiempo: secToMinSegLabel(sPipa), placa: "" }
        });
      }

      pts.volteo.sort((a, b) => a.x - b.x);
      pts.plana.sort((a, b) => a.x - b.x);
      pts.pipa.sort((a, b) => a.x - b.x);

      return pts;
    }

    // =========================
    // 2) FORMATO VIEJO (Detalle)
    // => Agregamos en JS por hora y categoría
    // =========================
    const acc = {
      Planas: Array.from({ length: 24 }, () => ({ sum: 0, cnt: 0 })),
      Volteo: Array.from({ length: 24 }, () => ({ sum: 0, cnt: 0 })),
      Pipa: Array.from({ length: 24 }, () => ({ sum: 0, cnt: 0 })),
      Otro: Array.from({ length: 24 }, () => ({ sum: 0, cnt: 0 }))
    };

    for (const r of horasRaw) {
      // hora: usa r.H si existe, si no deriva de Fecha
      let HH = Number.isFinite(r?.H) ? Number(r.H) : null;
      if (HH == null) {
        const d = new Date(r?.Fecha);
        HH = Number.isFinite(d.getTime()) ? d.getHours() : null;
      }
      if (HH == null || HH < 0 || HH > 23) continue;

      const cat = truckCat(r?.TruckType);
      const sec = Number(r?.DiffSec) || 0;

      acc[cat].sum += sec;
      acc[cat].cnt += 1;
    }

    // construimos 24 puntos por serie
    for (let h = 0; h < 24; h++) {
      const horaStr = String(h).padStart(2, "0") + ":00";
      const x = hourToX(h);

      const avgSecPlanas = acc.Planas[h].cnt ? acc.Planas[h].sum / acc.Planas[h].cnt : 0;
      const avgSecVolteo = acc.Volteo[h].cnt ? acc.Volteo[h].sum / acc.Volteo[h].cnt : 0;
      const avgSecPipa = acc.Pipa[h].cnt ? acc.Pipa[h].sum / acc.Pipa[h].cnt : 0;

      if (avgSecPlanas > 0) pts.plana.push({
        x,
        y: secToHoursFloat(avgSecPlanas), // eslint-disable-line no-undef
        meta: { hora: horaStr, tiempo: secToMinSegLabel(avgSecPlanas), placa: "" }
      });
      if (avgSecVolteo > 0) pts.volteo.push({
        x,
        y: secToHoursFloat(avgSecVolteo), // eslint-disable-line no-undef
        meta: { hora: horaStr, tiempo: secToHHMMSS_local(avgSecVolteo), placa: "" }
      });
      if (avgSecPipa > 0) pts.pipa.push({
        x,
        y: secToHoursFloat(avgSecPipa), // eslint-disable-line no-undef
        meta: { hora: horaStr, tiempo: secToHHMMSS_local(avgSecPipa), placa: "" }
      });
    }

    return pts;
  }


  // =================== Promedio descarga ===================
  function hhmmssToMinutesFloat(v) {
    const s = String(v || "").trim();
    const m = s.match(/^(\d{1,3}):([0-5]\d):([0-5]\d)$/);
    if (!m) return 0;
    const hh = Number(m[1]), mm = Number(m[2]), ss = Number(m[3]);
    const totalSec = (hh * 3600) + (mm * 60) + ss;
    return totalSec / 60;
  }

  function buildPromedioDescarga_FromJsonRaw(promJson, labels) {
    const idx = Object.fromEntries(labels.map((l, i) => [l, i]));

    const yVol = Array(labels.length).fill(0);
    const yPla = Array(labels.length).fill(0);
    const yPip = Array(labels.length).fill(0);

    const tVol = Array(labels.length).fill("0");
    const tPla = Array(labels.length).fill("0");
    const tPip = Array(labels.length).fill("0");

    const horas = Array.isArray(promJson?.PromedioDescarga?.Horas) ? promJson.PromedioDescarga.Horas : [];
    for (const h of horas) {
      const hora = String(h?.Hora || "").trim();
      const i = idx[hora]; if (i == null) continue;

      const tt = h?.TruckType || {};
      const rv = tt.Volteo;
      const rp = tt.Planas;
      const rpi = tt.Pipa;

      tVol[i] = (rv == null ? "0" : String(rv));
      tPla[i] = (rp == null ? "0" : String(rp));
      tPip[i] = (rpi == null ? "0" : String(rpi));

      const toY = (raw) => {
        if (raw == null) return 0;
        if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
        const s = String(raw).trim();
        if (/^\d+(\.\d+)?$/.test(s)) return Number(s) || 0;
        if (/^\d{1,3}:\d{2}:\d{2}$/.test(s)) return hhmmssToMinutesFloat(s);
        return 0;
      };

      yVol[i] = toY(rv);
      yPla[i] = toY(rp);
      yPip[i] = toY(rpi);
    }

    return {
      y: { volteo: yVol, plana: yPla, pipa: yPip },
      txt: { volteo: tVol, plana: tPla, pipa: tPip }
    };
  }

  function prependBasePoint(points, xMin) {
    const arr = Array.isArray(points) ? points.slice() : [];
    if (!arr.length) return arr;
    // evita duplicar
    if (arr[0] && Number(arr[0].x) === xMin && Number(arr[0].y) === 0 && arr[0]?.meta?.base) return arr;

    arr.unshift({ x: xMin, y: 0, meta: { base: true } });
    return arr;
  }


  // =================== Render ===================
  function renderCharts(labels, baseSeries, azPack, promPack, resumenJson, productFilter) {
    lastLabels = labels;
    ["chart-finalizados", "chart-azucar", "chart-promedio"].forEach(id => DC.ensureScrollableWidth(id, labels));
    // chart-recibidos usa eje X numérico (minutos) → su ancho lo gestiona widenRecibidosIfNeeded dentro de renderRecibidos

    const kind = DC.normalizeProductKind(productFilter !== undefined ? productFilter : (DC.$("f-producto")?.value || ""));
    const VIS = (kind === "melaza") ? { volteo: false, plana: false, pipa: true }
      : (kind === "azucar") ? { volteo: true, plana: true, pipa: false }
        : { volteo: true, plana: true, pipa: true };

    const zeros = () => new Array(labels.length).fill(0);

    // Finalizados
    if (chFinalizados) {
      chFinalizados.resetZoom?.('none'); // limpia estado de pan/zoom del plugin antes de reconfigurar escalas
      chFinalizados.data.datasets[0].hidden = !VIS.volteo;
      chFinalizados.data.datasets[1].hidden = !VIS.plana;
      chFinalizados.data.datasets[2].hidden = !VIS.pipa;

      const pack = buildEventosAcumuladosPoints(resumenJson?.Finalizado);
      const pts = pack.pts;

      // ✅ contar SOLO series visibles
      const realCount =
        (VIS.volteo ? (pts.volteo?.length || 0) : 0) +
        (VIS.plana ? (pts.plana?.length || 0) : 0) +
        (VIS.pipa ? (pts.pipa?.length || 0) : 0);

      // Escala Y (siempre estable)
      const y = chFinalizados.options.scales.y;
      y.min = 0;
      y.max = realCount ? Math.max(5, pack.maxY + 1) : 5;
      y.ticks.stepSize = 1;

      // Título eje Y
      if (chFinalizados.options?.scales?.y?.title) {
        chFinalizados.options.scales.y.title.display = true;
        chFinalizados.options.scales.y.title.text = "Camiones Finalizados";
      }

      // Tooltip (igual que ya tenías)
      chFinalizados.options.plugins.tooltip = {
        mode: "nearest",
        intersect: true,
        filter: (ctx) => !(ctx?.raw?.meta?.base === true || Number(ctx?.raw?.y) === 0),
        callbacks: {
          title: (items) => items?.[0]?.raw?.meta?.hora || "",
          label: (ctx) => {
            const m = ctx.raw?.meta || {};
            return `${m.placa || ""} (${m.ingenio || ""})`;
          }
        }
      };

      // ==========================
      // ✅ CASO: NO HAY DATOS
      // ==========================
      if (!realCount) {
        chFinalizados.data.datasets[0].data = [];
        chFinalizados.data.datasets[1].data = [];
        chFinalizados.data.datasets[2].data = [];

        if (chFinalizados.options.scales?.x) chFinalizados.options.scales.x.display = true;
        if (chFinalizados.options.scales?.y) chFinalizados.options.scales.y.display = true;

        const canvas = document.getElementById("chart-finalizados");
        if (canvas) {
          const scroll = canvas.closest(".chart-scroll");
          const inner = scroll?.querySelector(".chart-inner");
          if (scroll && inner) {
            inner.style.width = (scroll.clientWidth || 0) + "px";
            scroll.scrollLeft = 0;
          }
        }

        DC.toggleLegendFor("chart-finalizados", VIS);
        chFinalizados.update();
      } else {

      // ==========================
      // ✅ CASO: SÍ HAY DATOS
      // ==========================
      if (chFinalizados.options.scales?.x) chFinalizados.options.scales.x.display = true;
      if (chFinalizados.options.scales?.y) chFinalizados.options.scales.y.display = true;

      // Para autoZoom usar solo series visibles
      const allX = []
        .concat(
          VIS.volteo ? pts.volteo : [],
          VIS.plana ? pts.plana : [],
          VIS.pipa ? pts.pipa : []
        )
        .map(p => Number(p?.x))
        .filter(Number.isFinite);

      const xMin = allX.length ? Math.min(...allX) : 0;

      // Base points SOLO si hay datos
      const v0 = addBasePointForSeries(pts.volteo);
      const r0 = addBasePointForSeries(pts.plana);
      const p0 = addBasePointForSeries(pts.pipa);

      chFinalizados.data.datasets[0].data = VIS.volteo ? v0 : [];
      chFinalizados.data.datasets[1].data = VIS.plana ? r0 : [];
      chFinalizados.data.datasets[2].data = VIS.pipa ? p0 : [];

      DC.toggleLegendFor("chart-finalizados", VIS);

      (function autoZoomFinalizados() {
        const xScale = chFinalizados.options.scales?.x;
        if (!xScale) return;

        if (!allX.length) {
          xScale.min = 0;
          xScale.max = 23 * 60 + 59;
          return;
        }

        let minX = Math.max(0, Math.min(...allX) - 60);
        let maxX = Math.min(23 * 60 + 59, Math.max(...allX) + 60);

        const minHour = Math.floor(minX / 60);
        const maxHour = Math.ceil(maxX / 60);

        xScale.min = minHour * 60;
        xScale.max = Math.min(23 * 60 + 59, maxHour * 60);

        xScale.afterBuildTicks = (scale) => {
          const ticks = [];
          for (let h = minHour; h <= maxHour; h++) ticks.push({ value: h * 60 });
          scale.ticks = ticks;
        };
      })();

      (function widenFinalizadosIfNeeded() {
        const canvas = document.getElementById("chart-finalizados");
        if (!canvas) return;
        const scroll = canvas.closest(".chart-scroll");
        const inner = scroll?.querySelector(".chart-inner");
        if (!scroll || !inner) return;

        const xScale = chFinalizados.options.scales?.x;
        if (!xScale) return;

        const minHour = Math.floor(Number(xScale.min || 0) / 60);
        const maxHour = Math.floor(Number(xScale.max || (23 * 60)) / 60);
        const hoursShown = Math.max(1, (maxHour - minHour + 1));

        const required = hoursShown * 140;
        const contW = scroll.clientWidth || 0;
        inner.style.width = Math.max(contW, required) + "px";
      })();

      chFinalizados.resize(); chFinalizados.update();
      } // end: has data

      document.getElementById("chart-finalizados")?.closest(".chart-card")?.classList.toggle("is-empty", !realCount);
    }

    // Recibidos (LINE SIEMPRE, pero SIN "estado raro" cuando no hay datos)
    if (chRecibidos) {
      chRecibidos.resetZoom?.('none'); // limpia estado de pan/zoom del plugin antes de reconfigurar escalas
      chRecibidos.data.datasets[0].hidden = !VIS.volteo;
      chRecibidos.data.datasets[1].hidden = !VIS.plana;
      chRecibidos.data.datasets[2].hidden = !VIS.pipa;

      const recSrc = resumenJson?.Prechequeado; // fallback
      const pack = buildEventosAcumuladosPoints(recSrc);
      const pts = pack.pts;

      // ✅ contar SOLO series visibles
      const realCount =
        (VIS.volteo ? (pts.volteo?.length || 0) : 0) +
        (VIS.plana ? (pts.plana?.length || 0) : 0) +
        (VIS.pipa ? (pts.pipa?.length || 0) : 0);

      // Escala Y estable siempre
      const y = chRecibidos.options.scales.y;
      y.min = 0;
      y.max = realCount ? Math.max(5, pack.maxY + 1) : 5;
      y.ticks.stepSize = 1;

      // Título eje Y
      if (chRecibidos.options?.scales?.y?.title) {
        chRecibidos.options.scales.y.title.display = true;
        chRecibidos.options.scales.y.title.text = "Camiones Recibidos";
      }

      // Tooltip
      chRecibidos.options.plugins.tooltip = {
        mode: "nearest",
        intersect: true,
        filter: (ctx) => !(ctx?.raw?.meta?.base === true || Number(ctx?.raw?.y) === 0),
        callbacks: {
          title: (items) => items?.[0]?.raw?.meta?.hora || "",
          label: (ctx) => {
            const m = ctx.raw?.meta || {};
            return `${m.placa || ""} (${m.ingenio || ""})`;
          }
        }
      };

      // ==========================
      // ✅ CASO: NO HAY DATOS
      // ==========================
      if (!realCount) {
        chRecibidos.data.datasets[0].data = [];
        chRecibidos.data.datasets[1].data = [];
        chRecibidos.data.datasets[2].data = [];

        if (chRecibidos.options.scales?.x) chRecibidos.options.scales.x.display = true;
        if (chRecibidos.options.scales?.y) chRecibidos.options.scales.y.display = true;

        const canvas = document.getElementById("chart-recibidos");
        if (canvas) {
          const scroll = canvas.closest(".chart-scroll");
          const inner = scroll?.querySelector(".chart-inner");
          if (scroll && inner) {
            inner.style.width = (scroll.clientWidth || 0) + "px";
            scroll.scrollLeft = 0;
          }
        }

        DC.toggleLegendFor("chart-recibidos", VIS);
        chRecibidos.update();
      } else {

      // ==========================
      // ✅ CASO: SÍ HAY DATOS
      // ==========================
      if (chRecibidos.options.scales?.x) chRecibidos.options.scales.x.display = true;
      if (chRecibidos.options.scales?.y) chRecibidos.options.scales.y.display = true;

      // Base points SOLO si hay datos
      const v0 = addBasePointForSeries(pts.volteo);
      const r0 = addBasePointForSeries(pts.plana);
      const p0 = addBasePointForSeries(pts.pipa);

      chRecibidos.data.datasets[0].data = VIS.volteo ? v0 : [];
      chRecibidos.data.datasets[1].data = VIS.plana ? r0 : [];
      chRecibidos.data.datasets[2].data = VIS.pipa ? p0 : [];

      DC.toggleLegendFor("chart-recibidos", VIS);

      // ===== Rango fijo del filtro (garantiza scroll en cualquier pantalla) =====
      (function fixRecibidosRange() {
        const xScale = chRecibidos.options?.scales?.x;
        if (!xScale) return;
        const hFrom = Number(String(labels?.[0] ?? "00:00").split(":")[0]) || 0;
        const hTo = Number(String(labels?.[labels.length - 1] ?? "23:00").split(":")[0]) || 23;
        xScale.min = hFrom * 60;
        xScale.max = Math.min(23 * 60 + 59, hTo * 60 + 59);
        xScale.afterBuildTicks = (scale) => {
          const ticks = [];
          for (let h = hFrom; h <= hTo; h++) ticks.push({ value: h * 60 });
          scale.ticks = ticks;
        };
      })();

      (function widenRecibidosIfNeeded() {
        const canvas = document.getElementById("chart-recibidos");
        if (!canvas) return;
        const scroll = canvas.closest(".chart-scroll");
        const inner = scroll?.querySelector(".chart-inner");
        if (!scroll || !inner) return;

        const xScale = chRecibidos.options?.scales?.x;
        if (!xScale) return;

        const minHour = Math.floor(Number(xScale.min || 0) / 60);
        const maxHour = Math.floor(Number(xScale.max || (23 * 60)) / 60);
        const hoursShown = Math.max(1, (maxHour - minHour + 1));

        const required = hoursShown * 140;
        const contW = scroll.clientWidth || 0;

        inner.style.width = Math.max(contW, required) + "px";
      })();

      chRecibidos.resize(); chRecibidos.update();
      } // end: has data

      document.getElementById("chart-recibidos")?.closest(".chart-card")?.classList.toggle("is-empty", !realCount);
    }

    // Cantidad Recibida (SCATTER)
    if (chAzucar) {
      const prodSel = String(productFilter !== undefined ? productFilter : (DC.$("f-producto")?.value || "")).trim(); // "" => Todos
      const wantsAll = !prodSel;

      const pts = azPack || { azucar: [], melaza: [], otros: [] };

      // Qué mostrar
      const kind = DC.normalizeProductKind(prodSel);
      const showAz = wantsAll || kind === "azucar";
      const showMe = wantsAll || kind === "melaza";

      // Visibilidad explícita de datasets (igual que chFinalizados/chRecibidos)
      chAzucar.data.datasets[0].hidden = !showMe; // Melaza
      chAzucar.data.datasets[1].hidden = !showAz; // Azúcar
      chAzucar.data.datasets[2].hidden = true;    // Otros (nunca se muestra)

      // Solo puntos visibles
      const melVis = showMe ? (pts.melaza || []) : [];
      const azVis = showAz ? (pts.azucar || []) : [];

      // ✅ Si no hay puntos visibles => “modo vacío” (sin base, sin autoZoom/widen raro)
      const visibleCount = (melVis.length || 0) + (azVis.length || 0);

      // Título eje Y (Toneladas)
      if (chAzucar.options?.scales?.y?.title) {
        chAzucar.options.scales.y.title.display = true;
        chAzucar.options.scales.y.title.text = "Toneladas (t)";
      }

      // Tooltip y interaction (los dejamos listos)
      chAzucar.options.interaction = { mode: "nearest", intersect: true };
      chAzucar.options.plugins.tooltip = {
        mode: "nearest",
        intersect: true,
        filter: (ctx) => !(ctx?.raw?.meta?.base === true || Number(ctx?.raw?.y) === 0),
        callbacks: {
          title: (items) => items?.[0]?.raw?.meta?.hora || "",
          label: (ctx) => {
            const raw = ctx.raw || {};
            const m = raw.meta || {};

            const fmt = (n) => Number(n || 0).toLocaleString("es-SV", { maximumFractionDigits: 2 });

            // Recibido = tonRaw (si no viene, 0)
            const recibido = Number(m.tonRaw ?? 0) || 0;

            // Acumulado = tonAcum (si no viene, usa y)
            const acumulado = Number(m.tonAcum ?? raw.y ?? 0) || 0;

            return `Recibido: ${fmt(acumulado)} t`;
          }
        }
      };

      if (!visibleCount) {
        // 1) datasets vacíos (SIN base point)
        chAzucar.data.datasets[0].data = [];
        chAzucar.data.datasets[1].data = [];
        chAzucar.data.datasets[2].data = [];

        // 2) X = todo el día + ticks por hora
        const xScale = chAzucar.options?.scales?.x;
        if (xScale) {
          xScale.min = 0;
          xScale.max = 23 * 60 + 59;
          xScale.afterBuildTicks = (scale) => {
            const ticks = [];
            for (let h = 0; h <= 23; h++) ticks.push({ value: h * 60 });
            scale.ticks = ticks;
          };
        }

        const yScale = chAzucar.options?.scales?.y;
        if (yScale) yScale.max = undefined;
        
        // 3) reset ancho del contenedor (evita scroll raro)
        (function resetCantidadRecibidaWidth() {
          const canvas = document.getElementById("chart-azucar");
          if (!canvas) return;
          const scroll = canvas.closest(".chart-scroll");
          const inner = scroll?.querySelector(".chart-inner");
          if (!scroll || !inner) return;

          inner.style.width = (scroll.clientWidth || 0) + "px";
          scroll.scrollLeft = 0;
        })();

        chAzucar.resize(); chAzucar.update();
      } else {

      // ✅ xMin basado en lo visible
      const allX = []
        .concat(melVis, azVis)
        .map(p => Number(p?.x))
        .filter(Number.isFinite);

      const xMin = allX.length ? Math.min(...allX) : 0;

      // ✅ Datos con punto base (0)
      chAzucar.data.datasets[0].data = showMe ? addBasePointForSeries(melVis) : [];
      chAzucar.data.datasets[1].data = showAz ? addBasePointForSeries(azVis) : [];
      chAzucar.data.datasets[2].data = []; // otros off (como lo tienes)

      // ===== Auto-zoom X según puntos visibles =====
      (function autoZoomCantidadRecibida() {
        const ds = chAzucar.data.datasets || [];
        const allPts = [];
        for (const d of ds) {
          if (d.hidden) continue;
          const arr = Array.isArray(d.data) ? d.data : [];
          for (const p of arr) {
            const x = Number(p?.x);
            const y = Number(p?.y);
            if (Number.isFinite(x) && Number.isFinite(y)) allPts.push(x);
          }
        }

        const xScale = chAzucar.options.scales.x;
        if (!allPts.length) {
          xScale.min = 0;
          xScale.max = 23 * 60 + 59;
          return;
        }

        let minX = Math.min(...allPts);
        let maxX = Math.max(...allPts);

        const pad = 60;
        minX = Math.max(0, minX - pad);
        maxX = Math.min(23 * 60 + 59, maxX + pad);

        const minHour = Math.floor(minX / 60);
        const maxHour = Math.ceil(maxX / 60);

        xScale.min = minHour * 60;
        xScale.max = Math.min(23 * 60 + 59, maxHour * 60);

        xScale.afterBuildTicks = (scale) => {
          const ticks = [];
          for (let h = minHour; h <= maxHour; h++) ticks.push({ value: h * 60 });
          scale.ticks = ticks;
        };
      })();

      (function widenCantidadRecibidaIfNeeded() {
        const canvas = document.getElementById("chart-azucar");
        if (!canvas) return;
        const scroll = canvas.closest(".chart-scroll");
        const inner = scroll?.querySelector(".chart-inner");
        if (!scroll || !inner) return;

        const xScale = chAzucar.options.scales.x;
        const minHour = Math.floor(Number(xScale.min || 0) / 60);
        const maxHour = Math.floor(Number(xScale.max || (23 * 60)) / 60);
        const hoursShown = Math.max(1, (maxHour - minHour + 1));

        const required = hoursShown * 140;
        const contW = scroll.clientWidth || 0;

        inner.style.width = Math.max(contW, required) + "px";
      })();

      chAzucar.resize(); chAzucar.update();
      } // end: has data

      document.getElementById("chart-azucar")?.closest(".chart-card")?.classList.toggle("is-empty", !visibleCount);
    }


    // Promedio Descarga (SCATTER igual que chart-azucar)
    if (chPromedio) {
      const pts = promPack || { volteo: [], plana: [], pipa: [] };

      // datasets: 0 Volteo, 1 Plana, 2 Pipa
      const vv = VIS.volteo ? (pts.volteo || []) : [];
      const rr = VIS.plana ? (pts.plana || []) : [];
      const pp = VIS.pipa ? (pts.pipa || []) : [];

      const allX = [].concat(vv, rr, pp).map(p => Number(p?.x)).filter(Number.isFinite);
      const xMin = allX.length ? Math.min(...allX) : 0;

      chPromedio.data.datasets[0].data = vv;
      chPromedio.data.datasets[1].data = rr;
      chPromedio.data.datasets[2].data = pp;

      // ====== Zoom automático por rango de puntos (igual que azucar) ======
      (function fitXRangeToPoints() {
        const allPts = [];
        for (const ds of chPromedio.data.datasets) {
          const arr = ds.data || [];
          for (const p of arr) {
            const x = (p && typeof p === "object") ? Number(p.x) : NaN;
            if (Number.isFinite(x)) allPts.push(x);
          }
        }

        const xScale = chPromedio.options.scales.x;

        // Si no hay puntos: vuelve al día completo
        if (!allPts.length) {
          xScale.min = 0;
          xScale.max = 23 * 60 + 59;
          return;
        }

        let minX = Math.min(...allPts);
        let maxX = Math.max(...allPts);

        // Margen: 1 hora a cada lado
        const pad = 60;
        minX = Math.max(0, minX - pad);
        maxX = Math.min(23 * 60 + 59, maxX + pad);

        // “Redondear” a horas exactas
        const minHour = Math.floor(minX / 60);
        const maxHour = Math.ceil(maxX / 60);

        xScale.min = minHour * 60;
        xScale.max = Math.min(23 * 60 + 59, maxHour * 60);

        // Forzar ticks HH:00 SOLO en el rango visible (evita 03:20, 06:40, etc.)
        xScale.afterBuildTicks = (scale) => {
          const ticks = [];
          for (let h = minHour; h <= maxHour; h++) ticks.push({ value: h * 60 });
          scale.ticks = ticks;
        };
      })();

      // ====== Ancho dinámico del contenedor (igual que azucar) ======
      (function widenPromedioIfNeeded() {
        const canvas = document.getElementById("chart-promedio");
        if (!canvas) return;
        const scroll = canvas.closest(".chart-scroll");
        const inner = scroll?.querySelector(".chart-inner");
        if (!scroll || !inner) return;

        const xScale = chPromedio.options.scales.x;
        const minHour = Math.floor(Number(xScale.min || 0) / 60);
        const maxHour = Math.floor(Number(xScale.max || (23 * 60)) / 60);
        const hoursShown = Math.max(1, (maxHour - minHour + 1));

        // 140px por hora visible (igual que azucar)
        const required = hoursShown * 140;
        const contW = scroll.clientWidth || 0;

        inner.style.width = Math.max(contW, required) + "px";
      })();

      // ====== Tooltip: 1 punto + hora real (igual que azucar) ======
      chPromedio.options.interaction = { mode: "nearest", intersect: true };
      chPromedio.options.plugins.tooltip = {
        mode: "nearest",
        intersect: true,
        callbacks: {
          title: (items) => {
            const raw = items?.[0]?.raw;
            return raw?.meta?.hora || "";
          },
          label: (ctx) => {
            const raw = ctx.raw || {};
            const tiempo = raw?.meta?.tiempo || "00:00:00";
            const plate = raw?.meta?.placa ? ` - ${raw.meta.placa}` : "";
            return `${ctx.dataset.label}: ${tiempo}${plate}`;
          }
        }
      };

      // Título eje Y (Minutos)
      if (chPromedio.options?.scales?.y?.title) {
        chPromedio.options.scales.y.title.display = true;
        chPromedio.options.scales.y.title.text = "Tiempo promedio (min)";
      }

      document.getElementById("chart-promedio")?.closest(".chart-card")?.classList.toggle("is-empty", allX.length === 0);
      chPromedio.resize(); chPromedio.update();
    }
  }

  // =================== Firma (skip inteligente) ===================
  function buildSignature(labels, baseSeries, azPack, promPack, finPack, recPack, filtersSig) {
    // Solo firmamos lo que realmente dibujas: x/y (y un poquito de meta opcional)
    const mapPts = (arr) =>
      (Array.isArray(arr) ? arr : []).map(p => [Number(p?.x), Number(p?.y)]);

    const sig = {
      f: filtersSig,
      L: labels,

      // lo que ya tenías
      finAgg: baseSeries?.finalizados,
      recAgg: baseSeries?.recibidos,

      // chart-azucar (puntos)
      az: {
        a: mapPts(azPack?.azucar),
        m: mapPts(azPack?.melaza),
        o: mapPts(azPack?.otros),
      },

      // chart-promedio (puntos por tipo)
      pr: {
        v: mapPts(promPack?.volteo),
        r: mapPts(promPack?.plana),
        p: mapPts(promPack?.pipa),
      },

      // ✅ NUEVO: finalizados/recibidos como chart-azucar (puntos por tipo)
      ev: {
        fin: {
          v: mapPts(finPack?.volteo),
          r: mapPts(finPack?.plana),
          p: mapPts(finPack?.pipa),
        },
        rec: {
          v: mapPts(recPack?.volteo),
          r: mapPts(recPack?.plana),
          p: mapPts(recPack?.pipa),
        }
      }
    };

    return DC.simpleHash(DC.stableStringify(sig));
  }



  // =================== Main ===================
  let firstLoadDone = false;

  async function fetchAndRender(opts = {}) {
    const { silent = false } = opts;

    if (inFlight) {
      pendingRun = true;
      // si en algún momento pidieron no-silent, que NO se pierda el loader
      if (!silent) pendingSilent = false;
      else pendingSilent = pendingSilent && silent;
      return;
    }
    inFlight = true;

    // 🔑 Solo mostrar loader si NO es silent (o si es el primer load)
    const shouldShowLoader = !silent;

    try {
      if (shouldShowLoader) loader.show();

      const filters = readFilters();
      const filtersSig = DC.stableStringify(filters);
      const wantsAll = !String(filters.product || "").trim();

      const [resumen, promediosAtencion, promDesc, pesos] = await Promise.all([
        fetchResumenHoy(filters),
        fetchPromediosAtencionHoy(filters),
        fetchPromedioDescargaHoy(filters),
        wantsAll ? fetchPesosPorStatusHoy_BothProducts(filters) : fetchPesosPorStatusHoy(filters),
      ]);

      const labels = buildHourLabels(filters.hourFrom, filters.hourTo);

      const baseSeries = mapResumenHoyResponse(resumen, labels);
      const azPack = buildAzucarScatterPoints(pesos);
      const promPack = buildPromedioDescargaScatter(promDesc);
      const finPack = buildEventosAcumuladosPoints(resumen?.Finalizado).pts;
      const recPack = buildEventosAcumuladosPoints(resumen?.Prechequeado).pts;

      const newHash = buildSignature(labels, baseSeries, azPack, promPack, finPack, recPack, filtersSig);

      const skip = (lastDataHash !== null && newHash === lastDataHash && lastFiltersSig === filtersSig);
      lastDataHash = newHash;
      lastFiltersSig = filtersSig;

      if (skip) return;

      renderKPIsFromResumenYPromedios(resumen, promediosAtencion);
      updateKPIFlujoDiaFrom(pesos);
      updateKPIsDescargaFrom(promDesc, filters.product);
      const resumenFiltered = filterResumenByHour(resumen, filters.hourFrom, filters.hourTo);
      // Marcar graficos como empty se hara individualmente si no tienen datos
      // ["chart-finalizados", "chart-recibidos", "chart-azucar", "chart-promedio"].forEach(id => {
      //   document.getElementById(id)?.closest(".chart-card")?.classList.add("is-empty");
      // });
      renderCharts(labels, baseSeries, azPack, promPack, resumenFiltered, filters.product);

    } catch (e) {
      console.error("[recepcion-hoy] error:", e);
      // ["chart-finalizados", "chart-recibidos", "chart-azucar", "chart-promedio"].forEach(id => {
      //   document.getElementById(id)?.closest(".chart-card")?.classList.add("is-empty");
      // });
    } finally {
      if (shouldShowLoader) {
        setTimeout(() => loader.hide(), 800);
      }
      firstLoadDone = true;
      inFlight = false;
      if (pendingRun) {
        const runSilent = pendingSilent;
        pendingRun = false;
        pendingSilent = false;
        fetchAndRender({ silent: runSilent });
      }
    }
  }


  // =================== Init ===================
  document.addEventListener("DOMContentLoaded", () => {
    chFinalizados = DC.$("chart-finalizados")
      ? DC.lineTimeSeries("chart-finalizados", "Volteo", "Plana", "Pipa")
      : null;

    chRecibidos = DC.$("chart-recibidos")
      ? DC.lineTimeSeries("chart-recibidos", "Volteo", "Plana", "Pipa")
      : null;

    console.log('lineTimeSeries:', typeof DashCore.lineTimeSeries);
    console.log('finalizados x scale:', Chart.getChart('chart-finalizados')?.options?.scales?.x);

    // (opcional) si quieres que dibuje línea conectando puntos
    [chFinalizados, chRecibidos].forEach(ch => {
      if (!ch) return;
      ch.data.datasets.forEach(ds => {
        ds.showLine = true;   // ponlo false si quieres SOLO puntos
        ds.tension = 0.25;
        ds.fill = false;
      });
    });

    // ✅ misma gráfica que tenías: line
    chAzucar = DC.$("chart-azucar") ? DC.lineTimeSeries("chart-azucar", "Melaza", "Azúcar", "Otros") : null;
    chPromedio = DC.$("chart-promedio") ? DC.scatter2Series("chart-promedio", "Volteo", "Plana", "Pipa") : null;

    if (chPromedio) {
      chPromedio.data.datasets.forEach(ds => {
        ds.showLine = true;    // ✅ dibuja línea
        ds.tension = 0.25;     // (opcional) curvita suave
        ds.fill = false;       // sin relleno
      });
    }

    const applyFilters = () => fetchAndRender({ silent: false });

    DC.$("f-apply")?.addEventListener("click", applyFilters);

    window.addEventListener("resize", () => {
      if (lastLabels?.length) {
        ["chart-finalizados", "chart-azucar", "chart-promedio"]
          .forEach(id => DC.ensureScrollableWidth(id, lastLabels));

        // chart-recibidos: eje X numérico → calcular ancho desde el rango horario real
        (function () {
          const canvas = document.getElementById("chart-recibidos");
          if (!canvas || !chRecibidos) return;
          const scroll = canvas.closest(".chart-scroll");
          const inner = scroll?.querySelector(".chart-inner");
          if (!scroll || !inner) return;
          const xScale = chRecibidos.options?.scales?.x;
          const minHour = Math.floor(Number(xScale?.min || 0) / 60);
          const maxHour = Math.floor(Number(xScale?.max || (23 * 60)) / 60);
          const hoursShown = Math.max(1, maxHour - minHour + 1);
          inner.style.width = Math.max(scroll.clientWidth, hoursShown * 140) + "px";
        })();

        ["chart-finalizados", "chart-recibidos", "chart-azucar", "chart-promedio"]
          .forEach(DC.refreshChartAfterResize);
      }
    });

    const vv = window.visualViewport;
    const forceChartsResize = () => {
      ["chart-finalizados", "chart-recibidos", "chart-azucar", "chart-promedio"]
        .forEach(DC.refreshChartAfterResize);
    };
    if (vv) {
      vv.addEventListener("resize", forceChartsResize);
      vv.addEventListener("scroll", forceChartsResize);
    }
    window.addEventListener("orientationchange", forceChartsResize);

    // ✅ Primer render (con loader)
    fetchAndRender({ silent: false });

    // ✅ Auto refresh (SIN loader)
    const silentRefresh = () => fetchAndRender({ silent: true });

    if (typeof DC.registerAutoRefresh === "function") {
      DC.registerAutoRefresh("recepcion-hoy", silentRefresh);
      if (typeof DC.startAutoRefresh === "function") DC.startAutoRefresh();
    } else {
      const REFRESH_MS = 10000;
      window.__hoyTimer && clearInterval(window.__hoyTimer);
      window.__hoyTimer = setInterval(silentRefresh, REFRESH_MS);
    }

  });

})(window.DashCore || window);

