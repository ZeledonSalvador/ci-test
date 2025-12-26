(function (DC) {
  if (!DC) return console.error("DashCore no encontrado");

  // ====== Estado local (no global) ======
  let chFinalizados, chRecibidos, chAzucar, chPromedio;
  let lastLabels = [];
  let lastLabelsSig = "";
  let lastDataHash = null;
  let lastFiltersHash = null;
  let inFlight = false;

  // ====== Helpers específicos del summary ======
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
      if (id !== 2 && id !== 12) continue;
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
    const serie = { volteo: Array(labels.length).fill(0), plana: Array(labels.length).fill(0), pipa: Array(labels.length).fill(0), total: Array(labels.length).fill(0) };
    for (const r of rows || []) {
      if (Number(r.predefined_status_id) !== Number(statusId)) continue;
      const d = new Date(r.fecha); d.setHours(0, 0, 0, 0);
      const key = fmtDDMMYY(d);
      const i = idx[key]; if (i == null) continue;
      const cat = DC.normalizeTruckType(r.truck_type);
      const val = Number(r.total) || 0;
      if (cat === 'volteo') serie.volteo[i] += val;
      else if (cat === 'plana') serie.plana[i] += val;
      else if (cat === 'pipa') serie.pipa[i] += val;
      serie.total[i] += val;
    }
    return serie;
  }
  function mapResumenFromLegacyBlocks(resp) {
    const kpi = {
      enTransito: Number(resp?.EnTransito?.Total || 0),
      enParqueo: Number(resp?.Prechequeado?.Total || 0),
      autorizados: Number(resp?.Autorizado?.Total || 0),
      tiempoEsperaMin: 0, tiempoAtencionMin: 0, flujoPorDiaTon: 0,
      promDescargaPlanasSeg: 0, promDescargaVolteoSeg: 0, promDescargaPipaSeg: 0
    };
    const fechasSet = new Set();
    const pushFechas = (dias) => (dias || []).forEach(d => fechasSet.add(String(d.Fecha)));
    pushFechas(resp?.Finalizado?.Dias); pushFechas(resp?.Prechequeado?.Dias);
    const etiquetas = Array.from(fechasSet).sort((a, b) => {
      const [da, ma, ya] = a.split('-').map(Number);
      const [db, mb, yb] = b.split('-').map(Number);
      return new Date(2000 + ya, ma - 1, da) - new Date(2000 + yb, mb - 1, db);
    });
    function serieFromDias(dias) {
      const idx = Object.fromEntries(etiquetas.map((l, i) => [l, i]));
      const empty = { total: new Array(etiquetas.length).fill(0), volteo: new Array(etiquetas.length).fill(0), plana: new Array(etiquetas.length).fill(0), pipa: new Array(etiquetas.length).fill(0) };
      for (const d of (dias || [])) {
        const i = idx[String(d.Fecha)]; if (i == null) continue;
        const tt = d.TruckType || {};
        empty.total[i] += Number(d.Total || 0);
        empty.volteo[i] += Number(tt.Volteo || 0);
        empty.plana[i]  += Number(tt.Planas  || 0);
        empty.pipa[i]   += Number(tt.Pipa   || 0);
      }
      return empty;
    }
    const finalizados = serieFromDias(resp?.Finalizado?.Dias);
    const recibidos = serieFromDias(resp?.Prechequeado?.Dias);
    return { kpi, charts: { fechas: etiquetas, finalizados, recibidos } };
  }
  function mapResumenResponse(resp) {
    if (!resp) return null;
    const maybeDto = resp?.dto || resp;
    if (maybeDto?.kpi && maybeDto?.charts) return maybeDto;
    if (resp?.Rows && Array.isArray(resp.Rows)) {
      const etiquetas = buildLabelsFromRows(resp.Rows);
      const finalizados = buildSeriesByStatus(resp.Rows, etiquetas, 12);
      const recibidos  = buildSeriesByStatus(resp.Rows, etiquetas, 2);
      const kpi = {
        enTransito: Number(resp?.Estatus?.EnTransito || 0),
        enParqueo: Number(resp?.Estatus?.EnParqueo || resp?.Prechequeado?.Total || 0),
        autorizados: Number(resp?.Estatus?.Autorizado || resp?.Autorizado?.Total || 0),
        tiempoEsperaMin: 0, tiempoAtencionMin: 0, flujoPorDiaTon: 0,
        promDescargaPlanasSeg: 0, promDescargaVolteoSeg: 0, promDescargaPipaSeg: 0
      };
      return { kpi, charts: { fechas: etiquetas, finalizados, recibidos } };
    }
    return mapResumenFromLegacyBlocks(resp);
  }
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
        kpi: { t: k.enTransito || 0, p: k.enParqueo || 0, a: k.autorizados || 0, te: k.tiempoEsperaMin || 0, ta: k.tiempoAtencionMin || 0, fl: k.flujoPorDiaTon || 0 }
      };
    } catch { return null; }
  }

  // ====== Fetch ======
  async function fetchDataOnly() {
    const selectedProduct = DC.$("f-producto")?.value || "";
    const q = new URLSearchParams({
      from: DC.$("f-desde")?.value, to: DC.$("f-hasta")?.value,
      ingenio: DC.$("f-ingenio")?.value || "", product: selectedProduct,
      _ts: Date.now().toString()
    });
    const res = await fetch(`/dashboard/summary?${q.toString()}`, {
      method: "GET", cache: "reload",
      headers: { "Accept": "application/json", "X-Requested-With": "XMLHttpRequest", "Cache-Control": "no-cache, no-store, must-revalidate", "Pragma": "no-cache", "Expires": "0" },
      credentials: "same-origin"
    });
    if (!res.ok) return null;
    const raw = await res.json();
    const data = mapResumenResponse(raw);
    return { raw, data };
  }

  // ====== Render ======
  async function fetchAndRender() {
    if (inFlight) return; if (DC.state.modalsOpen > 0) return;
    inFlight = true; let pack = null;
    try { pack = await fetchDataOnly(); } catch (e) { console.error("[historico] fetch error:", e); } finally { inFlight = false; }
    if (!pack || !pack.data) return;

    const fHashObj = {
      from: DC.$("f-desde")?.value || "", to: DC.$("f-hasta")?.value || "",
      ingenio: DC.$("f-ingenio")?.value || "", product: DC.$("f-producto")?.value || ""
    };
    const filtersHash = DC.stableStringify(fHashObj);

    const sig = buildDataSignatureDto(pack.data);
    const newHash = DC.simpleHash(DC.stableStringify(sig));
    const filtersChanged = (lastFiltersHash !== filtersHash);

    if (lastDataHash !== null && newHash === lastDataHash && !filtersChanged) {
      console.log("[historico] sin cambios");
      return;
    }
    lastDataHash = newHash; lastFiltersHash = filtersHash;

    const data = pack.data;

    // KPIs
    DC.byId("kpi-en-transito").innerText = DC.num(data.kpi.enTransito);
    DC.byId("kpi-en-parqueo").innerText  = DC.num(data.kpi.enParqueo);
    DC.byId("kpi-autorizados").innerText = DC.num(data.kpi.autorizados);
    DC.byId("kpi-tiempo-espera").innerText   = DC.fmtHHMM(data.kpi.tiempoEsperaMin);
    DC.byId("kpi-tiempo-atencion").innerText = DC.fmtHHMM(data.kpi.tiempoAtencionMin);
    DC.byId("kpi-flujo-dia").innerText = `${Number(data.kpi.flujoPorDiaTon || 0).toFixed(2)} Ton`;
    DC.byId("kpi-prom-planas").innerText = DC.fmtMMSS(data.kpi.promDescargaPlanasSeg);
    DC.byId("kpi-prom-volteo").innerText = DC.fmtMMSS(data.kpi.promDescargaVolteoSeg);
    DC.byId("kpi-prom-pipa").innerText   = DC.fmtMMSS(data.kpi.promDescargaPipaSeg);

    // Visibilidad por producto
    const kind = DC.normalizeProductKind(DC.$("f-producto")?.value || "");
    const kPlanas = DC.byId("kpi-prom-planas")?.closest(".kpi");
    const kVolteo = DC.byId("kpi-prom-volteo")?.closest(".kpi");
    const kPipa   = DC.byId("kpi-prom-pipa")?.closest(".kpi");
    if (kPlanas) kPlanas.style.display = (kind !== 'melaza') ? "" : "none";
    if (kVolteo) kVolteo.style.display = (kind !== 'melaza') ? "" : "none";
    if (kPipa)   kPipa.style.display   = (kind === 'melaza' || kind === 'todos') ? "" : "none";

    // Series
    const finVol = data.charts.finalizados?.volteo || [];
    const finPla = data.charts.finalizados?.plana  || [];
    const finPip = data.charts.finalizados?.pipa   || [];
    const recVol = data.charts.recibidos?.volteo   || [];
    const recPla = data.charts.recibidos?.plana    || [];
    const recPip = data.charts.recibidos?.pipa     || [];
    const L = data.charts.fechas || [];
    lastLabels = L;
    const labelsSig = DC.stableStringify(L);
    if (labelsSig !== lastLabelsSig) {
      try { if (chFinalizados) { chFinalizados.data.labels = []; chFinalizados.data.datasets.forEach(d=>d.data=[]); chFinalizados.update(); } } catch {}
      try { if (chRecibidos)   { chRecibidos.data.labels   = []; chRecibidos.data.datasets.forEach(d=>d.data=[]);   chRecibidos.update(); } } catch {}
      try { if (chAzucar)      { chAzucar.data.labels      = []; chAzucar.data.datasets.forEach(d=>d.data=[]);      chAzucar.update(); } } catch {}
      try { if (chPromedio)    { chPromedio.data.labels    = []; chPromedio.data.datasets.forEach(d=>d.data=[]);    chPromedio.update(); } } catch {}
      lastLabelsSig = labelsSig;
    }

    ["chart-finalizados","chart-recibidos","chart-azucar","chart-promedio"].forEach(id => DC.ensureScrollableWidth(id, L));

    const VIS = (kind === 'melaza') ? { volteo:false, plana:false, pipa:true } : { volteo:true, plana:true, pipa:true };
    const mkZeros = () => new Array(L.length).fill(0);

    // Finalizados
    chFinalizados.data.datasets[0].hidden = !VIS.volteo;
    chFinalizados.data.datasets[1].hidden = !VIS.plana;
    chFinalizados.data.datasets[2].hidden = !VIS.pipa;
    DC.setLine3(chFinalizados, L,
      VIS.volteo ? finVol : mkZeros(),
      VIS.plana  ? finPla : mkZeros(),
      VIS.pipa   ? finPip : mkZeros(),
      "Camiones Finalizados"
    );
    DC.toggleLegendFor("chart-finalizados", VIS);
    DC.refreshChartAfterResize("chart-finalizados");

    // Recibidos
    chRecibidos.data.datasets[0].hidden = !VIS.volteo;
    chRecibidos.data.datasets[1].hidden = !VIS.plana;
    chRecibidos.data.datasets[2].hidden = !VIS.pipa;
    const setter3 = DC.USE_BAR_RECIBIDOS ? DC.setBar3 : DC.setLine3;
    setter3(chRecibidos, L,
      VIS.volteo ? recVol : mkZeros(),
      VIS.plana  ? recPla : mkZeros(),
      VIS.pipa   ? recPip : mkZeros(),
      "Camiones Recibidos"
    );
    DC.toggleLegendFor("chart-recibidos", VIS);
    DC.refreshChartAfterResize("chart-recibidos");

    // Toneladas por producto
    const tA = data.charts?.toneladasPorProducto?.azucar || [];
    const tM = data.charts?.toneladasPorProducto?.melaza || [];
    const tO = data.charts?.toneladasPorProducto?.otros  || [];
    const showMe = (kind !== 'melaza');
    const showAz = (kind !== 'azucar');
    const showOt = (kind === 'todos' || kind === 'otros');
    chAzucar.data.datasets[0].hidden = !showAz;
    chAzucar.data.datasets[1].hidden = !showMe;
    chAzucar.data.datasets[2].hidden = !showOt;
    const zeros = () => new Array(L.length).fill(0);
    DC.setLine3(chAzucar, L, showAz ? tA : zeros(), showMe ? tM : zeros(), showOt ? tO : zeros(), "Toneladas");
    DC.refreshChartAfterResize("chart-azucar");

    // Promedios
    const pVol = data.charts?.promedioDescarga?.volteo || [];
    const pPla = data.charts?.promedioDescarga?.plana  || [];
    const pPip = data.charts?.promedioDescarga?.pipa   || [];
    chPromedio.data.datasets[0].hidden = !VIS.volteo;
    chPromedio.data.datasets[1].hidden = !VIS.plana;
    chPromedio.data.datasets[2].hidden = !VIS.pipa;
    const zeros3 = () => new Array(L.length).fill(0);
    DC.setLine3(chPromedio, L,
      VIS.volteo ? pVol : zeros3(),
      VIS.plana  ? pPla : zeros3(),
      VIS.pipa   ? pPip : zeros3(),
      "Promedio Descarga (min)"
    );
    if (chPromedio?.options?.plugins?.tooltip) {
      const txt = data.charts?.promedioDescargaTxt || {};
      chPromedio.options.plugins.tooltip.callbacks = {
        label: (ctx) => {
          const i = ctx.dataIndex;
          const arr = ctx.datasetIndex === 0 ? txt.volteo : ctx.datasetIndex === 1 ? txt.plana : txt.pipa;
          const pretty = (arr && arr[i]) ? arr[i]
            : `${Math.floor(ctx.parsed.y)}:${String(Math.round((ctx.parsed.y % 1) * 60)).padStart(2, "0")}`;
          return `${ctx.dataset.label}: ${pretty}`;
        }
      };
      chPromedio.update();
    }
    DC.refreshChartAfterResize("chart-promedio");
  }

  // ====== Init ======
  document.addEventListener("DOMContentLoaded", () => {
    // Rango por defecto: últimos 30 días
    const hasta = new Date();
    const desde = new Date(hasta); desde.setDate(hasta.getDate() - 30);
    DC.$("f-desde") && (DC.$("f-desde").value = desde.toISOString().slice(0, 10));
    DC.$("f-hasta") && (DC.$("f-hasta").value = hasta.toISOString().slice(0, 10));

    // Listeners filtros
    ["f-desde", "f-hasta", "f-ingenio", "f-producto"].forEach(id => DC.$(id)?.addEventListener("change", fetchAndRender));
    DC.$("f-apply")?.addEventListener("click", fetchAndRender);

    // Charts
    chFinalizados = DC.line2Series("chart-finalizados", "Volteo", "Plana", "Pipa");
    chRecibidos   = DC.USE_BAR_RECIBIDOS ? DC.bar2Series("chart-recibidos", "Volteo", "Plana", "Pipa") : DC.line2Series("chart-recibidos", "Volteo", "Plana", "Pipa");
    chAzucar      = DC.line2Series("chart-azucar", "Melaza", "Azúcar", "Otros");
    chPromedio    = DC.line2Series("chart-promedio", "Volteo", "Plana", "Pipa");

    // Resize
    window.addEventListener('resize', () => {
      if (lastLabels?.length) {
        ["chart-finalizados","chart-recibidos","chart-azucar","chart-promedio"].forEach(id => DC.ensureScrollableWidth(id, lastLabels));
        ["chart-finalizados","chart-recibidos","chart-azucar","chart-promedio"].forEach(DC.refreshChartAfterResize);
      }
    });

    // Primer render y auto-refresh
    fetchAndRender();
    DC.registerAutoRefresh("historico", fetchAndRender);
    DC.startAutoRefresh();
  });
})(window.DashCore);
