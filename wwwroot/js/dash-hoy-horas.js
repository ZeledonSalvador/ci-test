(function (DC) {
  // ===== Namespace & shims ===================================================
  if (!DC) console.error("DashCore no encontrado (usando window como fallback)");
  DC = DC || window;

  // DOM helpers
  DC.$    = DC.$    || ((id) => document.getElementById(id));
  DC.byId = DC.byId || DC.$;

  // Producto
  DC.normalizeProductKind = DC.normalizeProductKind || ((v)=>{
    const s = String(v ?? "").toUpperCase();
    if (s.includes("MEL")) return "melaza";
    if (s.includes("AZ"))  return "azucar";
    return "otros";
  });

  // Scroll width
  DC.ensureScrollableWidth = DC.ensureScrollableWidth || function(id, labels){
    try {
      const canvas = document.getElementById(id);
      if (!canvas) return;
      const scroll = canvas.closest(".chart-scroll");
      const inner  = scroll?.querySelector(".chart-inner");
      const minPxPerLabel = 28, base = 300;
      const w = Math.max(base, (labels?.length||0)*minPxPerLabel);
      (inner || canvas).style.width = w+"px";
    } catch {}
  };

  // Resize
  DC.refreshChartAfterResize = DC.refreshChartAfterResize || function(id){
    try { window.Chart?.getChart?.(id)?.resize(); } catch {}
  };

  // Stable stringify + hash
  DC.stableStringify = DC.stableStringify || (obj=>{
    const seen = new WeakSet();
    return JSON.stringify(obj, function(k,v){
      if (v && typeof v === "object") {
        if (seen.has(v)) return;
        seen.add(v);
        const out={}; for (const key of Object.keys(v).sort()) out[key]=v[key];
        return out;
      }
      return v;
    });
  });
  DC.simpleHash = DC.simpleHash || (str=>{
    let h=0; for (let i=0;i<str.length;i++){ h=((h<<5)-h)+str.charCodeAt(i); h|=0; }
    return h;
  });

  // ----- Chart helpers --------------------------------------------------------
  function baseOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { ticks: { autoSkip: false, maxRotation: 90, minRotation: 90 } },
        y: { beginAtZero: true }
      },
      plugins: {
        legend: { display: false },
        zoom: {
          pan: { enabled: true, mode: "x" },
          zoom: { wheel: { enabled: true }, drag: { enabled: false }, pinch: { enabled: false }, mode: "x" }
        }
      }
    };
  }

  DC.setLine3 = DC.setLine3 || function(chart, labels, a, b, c, yTitle="") {
    if (!chart) return;
    chart.data.labels = labels || [];
    chart.data.datasets = chart.data.datasets || [
      { label:"A", data:[], borderWidth:2, pointRadius:2 },
      { label:"B", data:[], borderWidth:2, pointRadius:2 },
      { label:"C", data:[], borderWidth:2, pointRadius:2 },
    ];
    chart.data.datasets[0].data = (a||[]).map(v => v==null?null:v);
    chart.data.datasets[1].data = (b||[]).map(v => v==null?null:v);
    chart.data.datasets[2].data = (c||[]).map(v => v==null?null:v);
    chart.options = chart.options || baseOptions();
    chart.options.scales = chart.options.scales || {};
    chart.options.scales.y = chart.options.scales.y || {};
    chart.options.scales.y.title = { display: !!yTitle, text: yTitle };
    chart.update();
  };
  DC.setBar3 = DC.setBar3 || DC.setLine3;

  DC.line2Series = DC.line2Series || function(canvasId, lab1, lab2, lab3){
    const ctx = DC.$(canvasId);
    if (!ctx || !window.Chart) return null;
    const opts = baseOptions();
    const labels=[]; const datasets = [
      { label: lab1, data: [], borderWidth:2, pointRadius:2 },
      { label: lab2, data: [], borderWidth:2, pointRadius:2 },
      { label: lab3, data: [], borderWidth:2, pointRadius:2 }
    ];
    return new Chart(ctx, { type:"line", data:{ labels, datasets }, options: opts });
  };
  DC.bar2Series = DC.bar2Series || function(canvasId, lab1, lab2, lab3){
    const ctx = DC.$(canvasId);
    if (!ctx || !window.Chart) return null;
    const opts = baseOptions();
    return new Chart(ctx, {
      type:"bar",
      data:{ labels:[], datasets:[
        { label:lab1, data:[], borderRadius:6 },
        { label:lab2, data:[], borderRadius:6 },
        { label:lab3, data:[], borderRadius:6 },
      ]},
      options: opts
    });
  };
  DC.toggleLegendFor = DC.toggleLegendFor || function () {};
  DC.USE_BAR_RECIBIDOS = (typeof DC.USE_BAR_RECIBIDOS !== "undefined") ? DC.USE_BAR_RECIBIDOS : false;

  // ===== Estado del módulo ====================================================
  let chFinalizados, chRecibidos, chAzucar, chPromedio;
  let lastLabels = [];
  let lastDataHash = null;
  let lastFiltersSig = "";

  // ===== Helpers ==============================================================
  function pad2(n) { return String(n).padStart(2, "0"); }
  function secondsToHHMM(secs) {
    const s = Math.max(0, Math.floor(Number(secs || 0)));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h} h ${pad2(m)} min`;
  }
  function secondsToMinSeg(secs) {
    const s = Math.max(0, Math.floor(Number(secs || 0)));
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return `${m} min ${String(ss).padStart(2, "0")} seg`;
  }
  function hhmmssToSeconds(v) {
    if (v == null || v === "") return 0;
    if (typeof v === "number") return Math.max(0, Math.floor(v));
    const s = String(v).trim();
    if (!/^\d{1,2}:\d{2}:\d{2}$/.test(s)) return 0;
    const [hh, mm, ss] = s.split(":").map(Number);
    return (hh * 3600) + (mm * 60) + ss;
  }
  function timeInputToHour(t) {
    if (!t || typeof t !== "string") return 0;
    const [hh] = t.split(":"); const n = Number(hh);
    return Number.isFinite(n) ? Math.min(Math.max(n, 0), 23) : 0;
  }
  function readFilters() {
    const hourFrom  = timeInputToHour(DC.$("f-hour-start")?.value || "00:00");
    const hourTo    = timeInputToHour(DC.$("f-hour-end")?.value   || "23:59");
    const ingenioId = (DC.$("f-ingenio")?.value || "").trim();
    const product   = (DC.$("f-producto")?.value || "").trim();
    return { hourFrom, hourTo, ingenioId, product };
  }

  function anyTimeToMinutes(val) {
    if (val == null || val === "") return null;
    if (typeof val === "number") return val >= 360 ? (val / 60) : val;
    const s = String(val).trim();
    if (/^\d{1,2}:\d{2}:\d{2}$/.test(s)) { const [hh,mm,ss]=s.split(":").map(Number); return (hh*60)+mm+(ss/60); }
    if (/^\d{1,2}:\d{2}$/.test(s))       { const [mm,ss]=s.split(":").map(Number); return mm+(ss/60); }
    const n = Number(s); return Number.isFinite(n) ? (n >= 360 ? (n/60) : n) : null;
  }

  // ====== Promedios: helpers para KPIs (espera/atención) =====================
  function pickGlobalAvgSeconds(json, key /* 'PromedioEspera' | 'PromedioAtencion' */) {
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
      const c   = Number(h?.cantidad ?? h?.Cantidad ?? 0);
      if (seg > 0 && c > 0) { num += seg*c; den += c; }
    }
    if (den > 0) return Math.round(num/den);
    return 0;
  }

  // URLs absolutas para evitar 404 relativos
  function absUrl(path, params){
    const u = new URL(path, window.location.origin);
    if (params) {
      if (params instanceof URLSearchParams) {
        for (const [k,v] of params) u.searchParams.set(k,v);
      } else {
        for (const [k,v] of Object.entries(params)) u.searchParams.set(k,v);
      }
    }
    return u.toString();
  }

  // ======= Mapeadores para el JSON NUEVO (TotalDB + Horas + TruckType) =======
  function pad2s(n){return String(n).padStart(2,"0");}
  function buildHourLabels(hourFrom, hourTo) {
    const labels = [];
    for (let h = hourFrom; h <= hourTo; h++) labels.push(`${pad2s(h)}:00`);
    return labels;
  }

  function seriesFromHorasV2(block, labels) {
    const idx = Object.fromEntries(labels.map((l,i)=>[l,i]));
    const out = {
      volteo: new Array(labels.length).fill(0),
      plana:  new Array(labels.length).fill(0),
      pipa:   new Array(labels.length).fill(0),
      total:  new Array(labels.length).fill(0)
    };
    const horas = Array.isArray(block?.Horas) ? block.Horas : [];
    for (const h of horas) {
      const label = String(h?.Hora || "").trim();
      const i = idx[label]; if (i == null) continue;
      const tt = h?.TruckType || {};
      const v  = Number(tt.Volteo || 0);
      const p  = Number(tt.Planas || 0);
      const pi = Number(tt.Pipa   || 0);
      const t  = Number(h.Total   || (v+p+pi) || 0);
      out.volteo[i] += v;
      out.plana[i]  += p;
      out.pipa[i]   += pi;
      out.total[i]  += t;
    }
    return out;
  }

  function mapResumenHoyJSON(resumen, labels) {
    const isNew = !!(resumen?.TotalDB || resumen?.Finalizado?.Horas || resumen?.Prechequeado?.Horas);
    if (!isNew) return null;
    const finalizadosBlock = resumen?.Finalizado || {};
    const precheqBlock     = resumen?.Prechequeado || {};
    const finalizados = seriesFromHorasV2(finalizadosBlock, labels);
    const recibidos   = seriesFromHorasV2(precheqBlock, labels);
    return { finalizados, recibidos };
  }

  // ===== Fetch base (finalizados/recibidos + prom-espera/atención) ===========
  async function fetchRecepcionData({ hourFrom, hourTo, ingenioId, product }) {
    const qs = new URLSearchParams({ hourFrom: String(hourFrom), hourTo: String(hourTo) });
    if (ingenioId) qs.set("ingenioId", ingenioId);
    if (product)   qs.set("product", product);

    const [rResumen, rProm] = await Promise.all([
      fetch(absUrl("/dashboard/resumen-hoy", qs), { headers: { "Accept": "application/json" }, cache: "no-store" }),
      fetch(absUrl("/dashboard/promedios-atencion-hoy", new URLSearchParams({hourFrom:String(hourFrom),hourTo:String(hourTo)})), { headers: { "Accept": "application/json" }, cache: "no-store" })
    ]);

    const resumen   = rResumen.ok ? await rResumen.json() : null;
    const promedios = rProm.ok    ? await rProm.json()    : null;

    const labels = buildHourLabels(hourFrom, hourTo);
    let series = mapResumenHoyJSON(resumen, labels);

    // LEGADO
    if (!series && Array.isArray(resumen?.Rows)) {
      const empty = () => Array(labels.length).fill(0);
      const out = { finalizados:{volteo:empty(),plana:empty(),pipa:empty()}, recibidos:{volteo:empty(),plana:empty(),pipa:empty()} };
      const idx = Object.fromEntries(labels.map((l,i)=>[l,i]));
      const toKind = (t)=>{ const u=String(t||'').toUpperCase().trim().replace(/\s+/g,'');
        if (u==='V'||u==='VOLTEO'||u==='VOLTEOS'||u==='T') return 'volteo';
        if (u==='R'||u==='PLANA'||u==='PLANAS'||u==='PLANO'||u==='PLANOS') return 'plana';
        if (u==='P'||u==='PI'||u==='PIPA'||u==='PIPAS') return 'pipa';
        return null;
      };
      for (const r of resumen.Rows) {
        const statusId = Number(r.predefined_status_id ?? r.current_status ?? 0);
        let label = String(r.hora || '').trim();
        if (!label) { const d = new Date(r.fecha); label = `${pad2s(d.getHours())}:00`; }
        else if (!/^\d{2}:\d{2}$/.test(label)) { const hh=parseInt(label,10); if (Number.isFinite(hh)) label=`${pad2s(hh)}:00`; }
        const i = idx[label]; if (i==null) continue;
        const k = toKind(r.truck_type); if (!k) continue;
        const val = Number(r.total)||0;
        if (statusId===12) out.finalizados[k][i]+=val;
        if (statusId===2)  out.recibidos[k][i]+=val;
      }
      series = out;
    }

    return { labels, series, resumen, promedios };
  }

  // ===== Fetch adicionales (PESOS + PROMEDIO DESCARGA) =======================
  async function fetchPesosPorStatusHoy({ hourFrom, hourTo, ingenioId, product }) {
    const qs = new URLSearchParams({ hourFrom: String(hourFrom), hourTo: String(hourTo), _ts: String(Date.now()) });
    if (ingenioId) qs.set("ingenioId", ingenioId);
    if (product)   qs.set("product",   product);
    const r = await fetch(`/dashboard/pesos-por-status-hoy?${qs.toString()}`, {
      headers: { "Accept": "application/json" },
      cache: "no-store"
    });
    return r.ok ? r.json() : null;
  }

  async function fetchPromedioDescargaHoy({ hourFrom = 0, hourTo = 23, ingenioId = "", product = "" } = {}) {
    const qs = new URLSearchParams({ hourFrom: String(hourFrom), hourTo: String(hourTo) });
    if (ingenioId) qs.set("ingenioId", ingenioId);
    if (product)   qs.set("product", product);
    const r = await fetch(`/dashboard/promedio-descarga-hoy?${qs.toString()}`, {
      headers: { "Accept": "application/json" },
      cache: "no-store"
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  // ===== Builders de series ===================================================
  // (1) Cantidad recibida por hora en TON para chart-azucar
  function buildAzucarSeries(pesos, labels) {
    const idx = Object.fromEntries(labels.map((l, i) => [l, i]));
    const A = Array(labels.length).fill(0); // azúcar
    const M = Array(labels.length).fill(0); // melaza
    const O = Array(labels.length).fill(0); // otros

    const list =
      (pesos?.PesosPorStatus?.Horas && Array.isArray(pesos.PesosPorStatus.Horas)) ? pesos.PesosPorStatus.Horas :
      (pesos?.Horas && Array.isArray(pesos.Horas))                                 ? pesos.Horas :
      (pesos?.Filas && Array.isArray(pesos.Filas))                                 ? pesos.Filas :
      [];

    for (const r of list) {
      const rawH = r.Hora ?? r.hora;
      if (rawH == null || rawH === "") continue;

      const hLabel = /^\d{2}:\d{2}$/.test(String(rawH))
        ? String(rawH)
        : `${String(Number(rawH)).padStart(2,"0")}:00`;
      const i = idx[hLabel]; if (i == null) continue;

      const k = (()=>{
        const s = String(r.Product ?? r.product ?? r.OperationType ?? "").toUpperCase();
        if (s.includes("MEL")) return "melaza";
        if (s.includes("AZ"))  return "azucar";
        return "otros";
      })();

      let ton = null;
      if (r.TotalKg != null) ton = Number(r.TotalKg) / 1000;   // NUEVO JSON
      else if (r.Toneladas != null) ton = Number(r.Toneladas); // legado
      else if (r.Peso != null) ton = Number(r.Peso) / 1000;
      else if (r.peso != null) ton = Number(r.peso) / 1000;
      if (!Number.isFinite(ton)) ton = 0;

      if (k === "azucar")      A[i] += ton;
      else if (k === "melaza") M[i] += ton;
      else                     O[i] += ton;
    }

    return { azucar: A, melaza: M, otros: O };
  }

  // (2) Promedio de descarga (min) por hora para chart-promedio
  function buildPromedioDescargaSeries(promJSON, labels) {
    const idx = Object.fromEntries(labels.map((l, i) => [l, i]));
    const VOL = Array(labels.length).fill(null);
    const PLA = Array(labels.length).fill(null);
    const PIP = Array(labels.length).fill(null);

    const horas = Array.isArray(promJSON?.PromedioDescarga?.Horas)
      ? promJSON.PromedioDescarga.Horas
      : [];

    for (const h of horas) {
      const L = typeof h.Hora === "string" && /^\d{2}:\d{2}$/.test(h.Hora) ? h.Hora : null;
      if (!L) continue;
      const i = idx[L]; if (i == null) continue;

      const sVol = hhmmssToSeconds(h?.TruckType?.Volteo);
      const sPla = hhmmssToSeconds(h?.TruckType?.Planas);
      const sPip = hhmmssToSeconds(h?.TruckType?.Pipa);

      VOL[i] = sVol > 0 ? +(sVol / 60).toFixed(2) : null; // minutos
      PLA[i] = sPla > 0 ? +(sPla / 60).toFixed(2) : null;
      PIP[i] = sPip > 0 ? +(sPip / 60).toFixed(2) : null;
    }

    return { volteo: VOL, plana: PLA, pipa: PIP };
  }

  // ===== KPIs ================================================================
  function renderKPIs(base) {
    // Totales de estado
    const resumen = base?.resumen || {};
    const tdb = resumen?.TotalDB || {};
    let enTransito  = Number(tdb.EnTransito   ?? 0);
    let enParqueo   = Number(tdb.Prechequeado ?? 0);
    let autorizados = Number(tdb.Autorizado   ?? 0);

    // Fallbacks (legado)
    if (!enTransito && resumen?.EnTransito?.Total   != null) enTransito  = Number(resumen.EnTransito.Total);
    if (!enParqueo  && resumen?.Prechequeado?.Total != null) enParqueo   = Number(resumen.Prechequeado.Total);
    if (!autorizados&& resumen?.Autorizado?.Total   != null) autorizados = Number(resumen.Autorizado.Total);

    DC.byId("kpi-en-transito")  && (DC.byId("kpi-en-transito").textContent  = String(enTransito));
    DC.byId("kpi-en-parqueo")   && (DC.byId("kpi-en-parqueo").textContent   = String(enParqueo));
    DC.byId("kpi-autorizados")  && (DC.byId("kpi-autorizados").textContent  = String(autorizados));

    // KPIs de tiempo (espera/atención) desde base.promedios
    const promJson = base?.promedios || {};
    const esperaSeg   = pickGlobalAvgSeconds(promJson, "PromedioEspera");
    const atencionSeg = pickGlobalAvgSeconds(promJson, "PromedioAtencion");

    DC.byId("kpi-tiempo-espera")   && (DC.byId("kpi-tiempo-espera").textContent   = secondsToHHMM(esperaSeg));
    DC.byId("kpi-tiempo-atencion") && (DC.byId("kpi-tiempo-atencion").textContent = secondsToHHMM(atencionSeg));
  }

  // KPI: Flujo por día (Ton) desde PesosPorStatus.TotalKg
  function updateKPIFlujoDiaFrom(pesosJson) {
    const totalKg  = Number(pesosJson?.PesosPorStatus?.TotalKg ?? 0);
    const totalTon = totalKg / 1000;
    const el = DC.byId("kpi-flujo-dia");
    if (el) el.textContent = `${totalTon.toLocaleString("es-SV", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Ton`;
  }

  // ===== KPIs de Promedio de Descarga (desde promDesc ya obtenido) ===========
  function pickPromDescTipoSeg(json, tipo /* 'Planas' | 'Volteo' | 'Pipa' */) {
    const direct     = json?.PromedioDescarga?.PromedioActual?.[tipo];
    const directSeg  = hhmmssToSeconds(direct);
    if (directSeg > 0) return directSeg;
    const horas = Array.isArray(json?.PromedioDescarga?.Horas) ? json.PromedioDescarga.Horas : [];
    const vals  = [];
    for (const h of horas) {
      const seg = hhmmssToSeconds(h?.TruckType?.[tipo]);
      if (seg > 0) vals.push(seg);
    }
    if (vals.length) return Math.round(vals.reduce((a,b)=>a+b,0)/vals.length);
    return 0;
  }

  function updateKPIsDescargaFrom(promDescJson) {
    const segPlanas = pickPromDescTipoSeg(promDescJson, "Planas");
    const segVolteo = pickPromDescTipoSeg(promDescJson, "Volteo");
    const segPipa   = pickPromDescTipoSeg(promDescJson, "Pipa");

    const elPl = DC.byId("kpi-prom-planas");
    const elVo = DC.byId("kpi-prom-volteo");
    const elPi = DC.byId("kpi-prom-pipa");

    if (elPl) elPl.textContent = secondsToMinSeg(segPlanas);
    if (elVo) elVo.textContent = secondsToMinSeg(segVolteo);
    if (elPi) elPi.textContent = secondsToMinSeg(segPipa);
  }

  // ===== Render de gráficos ===================================================
  function renderChartsGenerales(base) {
    const L = base?.labels || [];
    lastLabels = L;
    DC.ensureScrollableWidth("chart-finalizados", L);
    DC.ensureScrollableWidth("chart-recibidos",  L);

    const kind = DC.normalizeProductKind(DC.$("f-producto")?.value || "");
    const VIS = (kind === 'melaza') ? { volteo:false, plana:false, pipa:true }
      : (kind === 'azucar') ? { volteo:true,  plana:true,  pipa:false }
                            : { volteo:true,  plana:true,  pipa:true };

    const fin = base.series?.finalizados || { volteo: [], plana: [], pipa: [] };
    const rec = base.series?.recibidos   || { volteo: [], plana: [], pipa: [] };

    // Finalizados
    if (chFinalizados) {
      chFinalizados.data.datasets[0].hidden = !VIS.volteo;
      chFinalizados.data.datasets[1].hidden = !VIS.plana;
      chFinalizados.data.datasets[2].hidden = !VIS.pipa;
      DC.setLine3(chFinalizados, L,
        VIS.volteo ? fin.volteo : new Array(L.length).fill(0),
        VIS.plana  ? fin.plana  : new Array(L.length).fill(0),
        VIS.pipa   ? fin.pipa   : new Array(L.length).fill(0),
        "Camiones Finalizados"
      );
      DC.toggleLegendFor("chart-finalizados", VIS);
      DC.refreshChartAfterResize("chart-finalizados");
    }

    // Recibidos
    if (chRecibidos) {
      chRecibidos.data.datasets[0].hidden = !VIS.volteo;
      chRecibidos.data.datasets[1].hidden = !VIS.plana;
      chRecibidos.data.datasets[2].hidden = !VIS.pipa;
      const set3 = DC.USE_BAR_RECIBIDOS ? DC.setBar3 : DC.setLine3;
      set3(chRecibidos, L,
        VIS.volteo ? rec.volteo : new Array(L.length).fill(0),
        VIS.plana  ? rec.plana  : new Array(L.length).fill(0),
        VIS.pipa   ? rec.pipa   : new Array(L.length).fill(0),
        "Camiones Recibidos"
      );
      DC.toggleLegendFor("chart-recibidos", VIS);
      DC.refreshChartAfterResize("chart-recibidos");
    }
  }

  function renderChartAzucar(labels, serie) {
    if (!chAzucar || !labels?.length) return;
    DC.ensureScrollableWidth("chart-azucar", labels);

    const kind = DC.normalizeProductKind(DC.$("f-producto")?.value || "");
    const showMe = (kind !== 'melaza');
    const showAz = (kind !== 'azucar');
    const showOt = (kind === 'todos' || kind === 'otros');

    chAzucar.data.datasets[0].hidden = !showAz;
    chAzucar.data.datasets[1].hidden = !showMe;
    chAzucar.data.datasets[2].hidden = !showOt;

    const zeros = new Array(labels.length).fill(0);
    DC.setLine3(chAzucar, labels,
      showMe ? serie.melaza : zeros,
      showAz ? serie.azucar : zeros,
      showOt ? serie.otros  : zeros,
      "Toneladas"
    );
    DC.refreshChartAfterResize("chart-azucar");
  }

  function renderChartPromedio(labels, serie) {
    if (!chPromedio || !labels?.length) return;
    DC.ensureScrollableWidth("chart-promedio", labels);

    const kind = DC.normalizeProductKind(DC.$("f-producto")?.value || "");
    const VIS = (kind === 'melaza') ? { volteo:false, plana:false, pipa:true }
              : (kind === 'azucar') ? { volteo:true,  plana:true,  pipa:false }
                                    : { volteo:true,  plana:true,  pipa:true };

    chPromedio.data.datasets[0].hidden = !VIS.volteo;
    chPromedio.data.datasets[1].hidden = !VIS.plana;
    chPromedio.data.datasets[2].hidden = !VIS.pipa;

    const z = new Array(labels.length).fill(null);
    DC.setLine3(chPromedio, labels,
      VIS.volteo ? serie.volteo : z,
      VIS.plana  ? serie.plana  : z,
      VIS.pipa   ? serie.pipa   : z,
      "Promedio Descarga (min)"
    );
    DC.refreshChartAfterResize("chart-promedio");
  }

  // ===== Firma & ciclo principal =============================================
  function buildSignature(payload, extra) {
    const L = payload?.labels || [];
    const fin = payload?.series?.finalizados || {};
    const rec = payload?.series?.recibidos   || {};
    const az  = extra?.azucar || {};
    const pr  = extra?.prom   || {};
    const sig = {
      L,
      fin: { v: fin.volteo || [], p: fin.plana || [], pi: fin.pipa || [] },
      rec: { v: rec.volteo || [], p: rec.plana || [], pi: rec.pipa || [] },
      azu: { a: az.azucar || [], m: az.melaza || [], o: az.otros || [] },
      pro: { v: pr.volteo || [], p: pr.plana  || [], i: pr.pipa  || [] },
    };
    return DC.simpleHash(DC.stableStringify(sig));
  }

  async function fetchAndRender() {
    try {
      const filters = readFilters();
      const filtersSig = DC.stableStringify(filters);

      const [base, pesos, promDesc] = await Promise.all([
        fetchRecepcionData(filters),
        fetchPesosPorStatusHoy(filters),
        fetchPromedioDescargaHoy(filters)
      ]);
      if (!base) return;

      const serieAz = buildAzucarSeries(pesos, base.labels);
      const seriePr = buildPromedioDescargaSeries(promDesc, base.labels);

      const newHash = buildSignature(base, { azucar: serieAz, prom: seriePr });
      const skip = (lastDataHash !== null && newHash === lastDataHash && lastFiltersSig === filtersSig);

      lastDataHash = newHash; lastFiltersSig = filtersSig;
      if (skip) { console.log("[recepcion-hoy] sin cambios, skip render"); return; }

      // KPIs
      renderKPIs(base);                    // espera/atención + totales
      updateKPIFlujoDiaFrom(pesos);        // 💡 Flujo por día (Ton) desde PesosPorStatus.TotalKg
      updateKPIsDescargaFrom(promDesc);    // prom. descarga por tipo (min/seg)

      // Gráficas
      renderChartsGenerales(base);
      renderChartAzucar(base.labels, serieAz);
      renderChartPromedio(base.labels, seriePr);
    } catch (err) {
      console.error("[recepcion-hoy] error:", err);
    }
  }

  // ===== Init =================================================================
  document.addEventListener("DOMContentLoaded", () => {
    if (DC.$("chart-finalizados")) chFinalizados = DC.line2Series("chart-finalizados","Volteo","Plana","Pipa");
    if (DC.$("chart-recibidos"))   chRecibidos   = DC.USE_BAR_RECIBIDOS
      ? DC.bar2Series("chart-recibidos","Volteo","Plana","Pipa")
      : DC.line2Series("chart-recibidos","Volteo","Plana","Pipa");
    if (DC.$("chart-azucar"))   chAzucar   = DC.line2Series("chart-azucar","Melaza","Azúcar","Otros");
    if (DC.$("chart-promedio")) chPromedio = DC.line2Series("chart-promedio","Volteo","Plana","Pipa");

    ["f-hour-start","f-hour-end","f-ingenio","f-producto"].forEach(id =>
      DC.$(id)?.addEventListener("change", fetchAndRender)
    );
    DC.$("f-apply")?.addEventListener("click", fetchAndRender);

    window.addEventListener('resize', () => {
      if (lastLabels?.length) {
        ["chart-finalizados","chart-recibidos","chart-azucar","chart-promedio"].forEach(id => DC.ensureScrollableWidth(id, lastLabels));
        ["chart-finalizados","chart-recibidos","chart-azucar","chart-promedio"].forEach(DC.refreshChartAfterResize);
      }
    });

    // Primera carga + auto-refresh
    fetchAndRender();

    if (typeof DC.registerAutoRefresh === "function") {
      DC.registerAutoRefresh("recepcion-hoy", fetchAndRender);
      if (typeof DC.startAutoRefresh === "function") DC.startAutoRefresh();
    } else {
      const REFRESH_MS = 10000;
      window.__hoyTimer && clearInterval(window.__hoyTimer);
      window.__hoyTimer = setInterval(()=>{ fetchAndRender(); }, REFRESH_MS);
    }
  });

})(window.DashCore || window);
