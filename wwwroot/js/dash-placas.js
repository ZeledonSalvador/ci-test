// ===================================
// dash-placas.js  (versión core-aware)
// ===================================
;(() => {
  const Core = window.DashCore;
  if (!Core) { console.error("Cargue dash-core.js antes de dash-placas.js"); return; }

  // ⚠️ Debe ser un endpoint que retorne JSON
  const ENDPOINT_TIEMPOS_DETALLE = "api/dashboard/tiempos-hoy-detalle";

  // Canvas esperados en el DOM
  const ID_CHART_TRANSITO = "chart-transito-placa";
  const ID_CHART_DESCARGA = "chart-descarga-placa";
  const ID_CHART_ESPERA   = "chart-espera-placa";

  // KPIs (ajusta a tus IDs reales si difieren)
  const KPI_G = {
    DESP_AZ: "kpi-cant-azucar",
    DESP_ME: "kpi-cant-melaza",
    TX_AZU:  "kpi-transito-azucar",
    TX_MEL:  "kpi-transito-melaza",
    ESP_PLANA:   "kpi-espera-plana",
    ESP_VOLTEO:  "kpi-espera-volteo",
    ESP_PIPA:    "kpi-espera-pipa",
    DESC_PLANA:  "kpi-descarga-plana",
    DESC_VOLTEO: "kpi-descarga-volteo",
    DESC_PIPA:   "kpi-descarga-pipa",
  };

  let chTransitoPlaca = null;
  let chDescargaPlaca = null;
  let chEsperaPlaca   = null;

  // -----------------------
  // HTTP helper (strict JSON)
  // -----------------------
  const http = async (url) => {
    const r = await fetch(url, {
      headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      cache: "no-store",
    });
    if (!r.ok) { console.warn("[placas] HTTP", r.status, url); return null; }
    try { return await r.json(); }
    catch(e){ console.error("[placas] Respuesta no JSON:", url, e); return null; }
  };

  // -----------------------
  // Helpers
  // -----------------------
  const pickArray = (obj) => (obj?.Filas ?? obj?.Horas ?? obj?.rows ?? obj?.data ?? []);
  const avg = (xs)=> !xs?.length ? 0 : xs.reduce((a,b)=>a+Number(b||0),0)/xs.length;
  const avgOrNull = (xs)=> {
    if (!xs || !xs.length) return null;
    const ns = xs.map(Number).filter(Number.isFinite);
    return ns.length ? ns.reduce((a,b)=>a+b,0)/ns.length : null;
  };

  const anyTimeToMinutesStrict = (val) => {
    if (val == null || val === "") return null;
    if (typeof val === "number") return val >= 360 ? (val / 60) : val; // si parecen segundos, convierte a minutos
    const s = String(val).trim();
    if (/^\d{1,2}:\d{2}:\d{2}$/.test(s)) { const [hh,mm,ss]=s.split(":").map(Number); return (hh*60)+mm+(ss/60); }
    if (/^\d{1,2}:\d{2}$/.test(s))      { const [mm,ss]=s.split(":").map(Number); return mm + (ss/60); }
    const n = Number(s); return Number.isFinite(n) ? (n >= 360 ? (n/60) : n) : null;
  };
  const anyTimeToMinutes = (v)=> {
    const x = anyTimeToMinutesStrict(v);
    return x == null ? 0 : x;
  };

  const normProducto = (v)=> Core.normalizeProductKind(v); // melaza | azucar | otros
  const normTruck    = (t)=> Core.normalizeTruckType(t);   // volteo | plana | pipa | otro

  const readPlaca     = (r)=> r.PlacaRemolque ?? r.placa ?? r.Plate ?? r.license ?? r.Placa ?? r.PLACA ?? "";
  const readProducto  = (r)=> r.producto ?? r.Producto ?? r.product ?? r.Product ?? r.OperationType ?? r.operation_type ?? "";
  const readIngenioId = (r)=> r.ingenioId ?? r.IngenioId ?? r.ingenio_id ?? r.Ingenio ?? r.plantaId ?? "";
  const readTruck     = (r)=> r.truckType ?? r.truck_type ?? r.Tipo ?? r.tipo ?? r.TipoDescarga ?? r.TruckType ?? "";

  function putText(id, txt) { const el = Core.$(id); if (el) el.textContent = txt; }

  // -----------------------
  // Inicializar Charts (usar line2Series del core: ya trae 3 datasets)
  // -----------------------
  function initChartsIfNeeded() {
    const hasT = Core.$(ID_CHART_TRANSITO);
    const hasD = Core.$(ID_CHART_DESCARGA);
    const hasE = Core.$(ID_CHART_ESPERA);

    if (hasT && !chTransitoPlaca) {
      chTransitoPlaca = Core.line2Series(ID_CHART_TRANSITO, "Melaza", "Azúcar", "");
      chTransitoPlaca.options.plugins.tooltip.callbacks = {
        label: (ctx)=> `${ctx.dataset.label}: ${Core.fmtMMSS(Math.round(Number(ctx.parsed.y)*60))}`
      };
    }
    if (hasD && !chDescargaPlaca) {
      // queremos 3 series (Volteo, Plana, Pipa) => usamos line2Series del core (tiene 3 datasets)
      chDescargaPlaca = Core.line2Series(ID_CHART_DESCARGA, "Volteo", "Plana", "Pipa");
      chDescargaPlaca.options.plugins.tooltip.callbacks = {
        label: (ctx)=> `${ctx.dataset.label}: ${Core.fmtMMSS(Math.round(Number(ctx.parsed.y)*60))}`
      };
    }
    if (hasE && !chEsperaPlaca) {
      chEsperaPlaca = Core.line2Series(ID_CHART_ESPERA, "Volteo", "Plana", "Pipa");
      chEsperaPlaca.options.plugins.tooltip.callbacks = {
        label: (ctx)=> `${ctx.dataset.label}: ${Core.fmtMMSS(Math.round(Number(ctx.parsed.y)*60))}`
      };
    }
  }

  // -----------------------
  // Filtros (por ids estándar)
  // -----------------------
  function getFilters() {
    const prod = Core.$("f-producto")?.value || "";
    const ing  = Core.$("f-ingenio")?.value || "";
    const hs   = Core.$("f-hour-start")?.value || "00:00";
    const he   = Core.$("f-hour-end")?.value || "23:59";
    const hf   = Math.max(0, Math.min(23, Number(hs.split(":")[0]) || 0));
    const ht   = Math.max(0, Math.min(23, Number(he.split(":")[0]) || 23));
    return { product: prod, ingenioId: ing, hStart: hf, hEnd: ht };
  }

  // -----------------------
  // KPIs
  // -----------------------
  function renderKPIs(raw) {
    // 1) Cantidad despachada por día (conteo aproximado por producto)
    let despAz = Number(raw?.UnidadesDespachadasPorHora?.TotalRegistrosAzucar) || 0;
    let despMe = Number(raw?.UnidadesDespachadasPorHora?.TotalRegistrosMelaza) || 0;
    if (!despAz && !despMe) {
      const horas = Array.isArray(raw?.UnidadesDespachadasPorHora?.Horas) ? raw.UnidadesDespachadasPorHora.Horas : [];
      for (const r of horas) {
        const k = normProducto(r?.Product ?? r?.OperationType);
        if (k === "azucar") despAz++;
        else if (k === "melaza") despMe++;
      }
    }
    putText(KPI_G.DESP_AZ, String(despAz));
    putText(KPI_G.DESP_ME, String(despMe));

    // 2) Tránsito (minutos promedio por producto)
    const tra = raw?.TransitoAPlanta ?? {};
    let txAzMin = 0, txMeMin = 0;
    if (tra.PromedioAzucar || tra.PromedioMelaza) {
      txAzMin = anyTimeToMinutes(tra.PromedioAzucar) || 0;
      txMeMin = anyTimeToMinutes(tra.PromedioMelaza) || 0;
    } else {
      const filas = pickArray(tra);
      const az=[], me=[];
      for (const r of filas) {
        const m = anyTimeToMinutes(r?.Tiempo);
        const p = normProducto(r?.Product ?? r?.OperationType);
        if (m > 0) { if (p==="azucar") az.push(m); if (p==="melaza") me.push(m); }
      }
      txAzMin = az.length ? avg(az) : 0;
      txMeMin = me.length ? avg(me) : 0;
    }
    putText(KPI_G.TX_AZU, Core.fmtHHMM(txAzMin));
    putText(KPI_G.TX_MEL, Core.fmtHHMM(txMeMin));

    // 3) Espera (segundos formateados mm:ss por tipo de camión)
    const cola = raw?.TiempoEnCola ?? {};
    let espPla = 0, espVol = 0, espPip = 0;
    if (cola.PromedioPlana || cola.PromedioVolteo || cola.PromedioPipa) {
      espPla = Math.round(anyTimeToMinutes(cola.PromedioPlana)  * 60);
      espVol = Math.round(anyTimeToMinutes(cola.PromedioVolteo) * 60);
      espPip = Math.round(anyTimeToMinutes(cola.PromedioPipa)   * 60);
    } else {
      const filas = pickArray(cola);
      const b = { plana:[], volteo:[], pipa:[] };
      for (const r of filas) {
        const tk = normTruck(r?.TruckType);
        const m  = anyTimeToMinutes(r?.Tiempo);
        if (m>0 && b[tk]) b[tk].push(m);
      }
      espPla = Math.round(avg(b.plana)*60);
      espVol = Math.round(avg(b.volteo)*60);
      espPip = Math.round(avg(b.pipa)*60);
    }
    putText(KPI_G.ESP_PLANA,  Core.fmtMMSS(espPla));
    putText(KPI_G.ESP_VOLTEO, Core.fmtMMSS(espVol));
    putText(KPI_G.ESP_PIPA,   Core.fmtMMSS(espPip));

    // 4) Descarga (segundos formateados mm:ss por tipo de camión)
    const des = raw?.Descarga ?? {};
    let dPla = 0, dVol = 0, dPip = 0;
    if (des.PromedioPlana || des.PromedioVolteo || des.PromedioPipa) {
      dPla = Math.round(anyTimeToMinutes(des.PromedioPlana)  * 60);
      dVol = Math.round(anyTimeToMinutes(des.PromedioVolteo) * 60);
      dPip = Math.round(anyTimeToMinutes(des.PromedioPipa)   * 60);
    } else {
      const filas = pickArray(des);
      const b = { plana:[], volteo:[], pipa:[] };
      for (const r of filas) {
        const tk = normTruck(r?.TruckType);
        const m  = anyTimeToMinutes(r?.Tiempo);
        if (m>0 && b[tk]) b[tk].push(m);
      }
      dPla = Math.round(avg(b.plana)*60);
      dVol = Math.round(avg(b.volteo)*60);
      dPip = Math.round(avg(b.pipa)*60);
    }
    putText(KPI_G.DESC_PLANA,  Core.fmtMMSS(dPla));
    putText(KPI_G.DESC_VOLTEO, Core.fmtMMSS(dVol));
    putText(KPI_G.DESC_PIPA,   Core.fmtMMSS(dPip));
  }

  // -----------------------
  // Fetch + Render (gráficos por placa)
  // -----------------------
  async function fetchAndRenderPlacas() {
    if (!Core.$(ID_CHART_TRANSITO) && !Core.$(ID_CHART_DESCARGA) && !Core.$(ID_CHART_ESPERA)) return;

    initChartsIfNeeded();

    const f  = getFilters();
    const qs = new URLSearchParams({ hStart:String(f.hStart), hEnd:String(f.hEnd), _ts:String(Date.now()) });
    if (f.product)   qs.set("product",   f.product);
    if (f.ingenioId) qs.set("ingenioId", f.ingenioId);

    const url = `${ENDPOINT_TIEMPOS_DETALLE}?${qs.toString()}`;
    const raw = await http(url);
    if (!raw) return;

    // KPIs
    renderKPIs(raw);

    // Recolectar filas unificadas
    const rows = [];
    for (const r of pickArray(raw.TransitoAPlanta)) {
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
    for (const r of pickArray(raw.TiempoEnCola)) {
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
    for (const r of pickArray(raw.Descarga)) {
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

    // Filtros tolerantes (si la fila no trae el campo, no la descartamos)
    const dataRows = rows.filter(r => {
      const okProd = !f.product   || !r.Product   || normProducto(r.Product) === normProducto(f.product);
      const okIng  = !f.ingenioId || !r.IngenioId || String(r.IngenioId).trim() === String(f.ingenioId).trim();
      return okProd && okIng;
    });

    // Limpiar si no hay nada
    if (!dataRows.length) {
      if (chTransitoPlaca) Core.setLine3(chTransitoPlaca, [], [], [], "Minutos");
      if (chDescargaPlaca) Core.setLine3(chDescargaPlaca, [], [], [], "Minutos");
      if (chEsperaPlaca)   Core.setLine3(chEsperaPlaca,   [], [], [], "Minutos");
      console.warn("[placas] No hay filas para pintar.");
      return;
    }

    // Agrupar por placa
    const placasSet = new Set();
    const transitoByPlaca = {}; // { placa: { azucar:[], melaza:[] } }
    const descargaByPlaca = {}; // { placa: { volteo:[], plana:[], pipa:[] } }
    const esperaByPlaca   = {}; // { placa: { volteo:[], plana:[], pipa:[] } }

    for (const r of dataRows) {
      const placa = String(readPlaca(r) || r.placa || "").trim();
      if (!placa) continue;
      placasSet.add(placa);

      const prodKind = normProducto(readProducto(r) || r.Product || "");
      const tk       = normTruck(readTruck(r) || r.TruckType || "P");

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
      if (["volteo","plana","pipa"].includes(tk)) {
        if (tDesc != null) descargaByPlaca[placa][tk].push(tDesc);
        if (tEsp  != null) esperaByPlaca[placa][tk].push(tEsp);
      }
    }

    const placasAll = Array.from(placasSet);

    // Series (promedios por placa, null donde no hay)
    const serieAzAll = placasAll.map(p => avgOrNull(transitoByPlaca[p]?.azucar));
    const serieMeAll = placasAll.map(p => avgOrNull(transitoByPlaca[p]?.melaza));
    const dVolAll    = placasAll.map(p => avgOrNull(descargaByPlaca[p]?.volteo));
    const dPlaAll    = placasAll.map(p => avgOrNull(descargaByPlaca[p]?.plana));
    const dPipAll    = placasAll.map(p => avgOrNull(descargaByPlaca[p]?.pipa));
    const eVolAll    = placasAll.map(p => avgOrNull(esperaByPlaca[p]?.volteo));
    const ePlaAll    = placasAll.map(p => avgOrNull(esperaByPlaca[p]?.plana));
    const ePipAll    = placasAll.map(p => avgOrNull(esperaByPlaca[p]?.pipa));

    // Filtrar labels sin datos
    const filterChart = (labels, ...series) => {
      const keepIdx = labels.map((_, i) => series.some(s => Number.isFinite(s[i])));
      return { labels: labels.filter((_, i) => keepIdx[i]), series: series.map(s => s.filter((_, i) => keepIdx[i])) };
    };

    // TRANSITO: 2 series (Azúcar/Melaza)
    const transF = filterChart(placasAll, serieAzAll, serieMeAll);
    if (chTransitoPlaca) {
      Core.ensureScrollableWidth(ID_CHART_TRANSITO, transF.labels);
      //Core.setLine3(chTransitoPlaca, transF.labels, transF.series[0], transF.series[1], [], "Minutos");
      Core.setLine3(chTransitoPlaca, transF.labels, serieMeAll, serieAzAll, [], "Minutos");
    }

    // DESCARGA: 3 series (Volteo/Plana/Pipa)
    const descF = filterChart(placasAll, dVolAll, dPlaAll, dPipAll);
    if (chDescargaPlaca) {
      Core.ensureScrollableWidth(ID_CHART_DESCARGA, descF.labels);
      Core.setLine3(chDescargaPlaca, descF.labels, descF.series[0], descF.series[1], descF.series[2], "Minutos");
    }

    // ESPERA: 3 series (Volteo/Plana/Pipa)
    const esperaF = filterChart(placasAll, eVolAll, ePlaAll, ePipAll);
    if (chEsperaPlaca) {
      Core.ensureScrollableWidth(ID_CHART_ESPERA, esperaF.labels);
      Core.setLine3(chEsperaPlaca, esperaF.labels, esperaF.series[0], esperaF.series[1], esperaF.series[2], "Minutos");
    }
  }

  // -----------------------
  // Listeners de filtros
  // -----------------------
  ["f-ingenio","f-producto","f-hour-start","f-hour-end"].forEach(id => {
    Core.$(id)?.addEventListener("change", fetchAndRenderPlacas);
  });
  Core.$("f-apply")?.addEventListener("click", fetchAndRenderPlacas);

  // -----------------------
  // Init + Auto-Refresh (del core)
  // -----------------------
  document.addEventListener("DOMContentLoaded", () => {
    if (Core.$(ID_CHART_TRANSITO) || Core.$(ID_CHART_DESCARGA) || Core.$(ID_CHART_ESPERA)) {
      initChartsIfNeeded();
      fetchAndRenderPlacas();
      // registra tarea de auto-refresh usando el core (cada 10s por defecto)
      Core.registerAutoRefresh("placas", fetchAndRenderPlacas);
      Core.startAutoRefresh(10000);
    }
  });

  // Exponer función por si quieres dispararla manualmente
  window.DashPlacas = { fetchAndRenderPlacas };
})();
