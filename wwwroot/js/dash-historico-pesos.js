/* =========================================================================
   dash-historico-pesos.js (FULL - FIXED)
   - BOOT: espera a DashCore
   - Loader: se crea si no existe y se centra con estilos inline
   - Humedad: eje Y 0..1 con step 0.1
   - Evita "Maximum call stack size exceeded" por re-entradas (guards + debounce)
   ========================================================================= */

(function bootHistoricoPesos() {
    const NEED = ["line2Series", "setLine3", "ensureScrollableWidth", "refreshChartAfterResize", "stableStringify", "simpleHash"];

    function getCore() {
        return window.DashCore || window.DC || null;
    }

    function isReady(core) {
        return core && NEED.every(k => typeof core[k] === "function");
    }

    function start() {
        const DashCore = getCore();
        if (!isReady(DashCore)) {
            setTimeout(start, 50);
            return;
        }

        (function (DashCore) {
            const $ = (id) => document.getElementById(id);

            // ===================== Loader global (#spinner-overlay) =====================
            // ✅ Si no existe, lo crea y lo centra SIEMPRE
            const Loader = (() => {
                const ID = "spinner-overlay";
                let counter = 0;

                function ensure() {
                    let x = document.getElementById(ID);
                    if (x) return x;

                    x = document.createElement("div");
                    x.id = ID;
                    x.innerHTML = `
            <div class="animation-container">
              <i class="fa fa-cloud cloud-icon cloud1" aria-hidden="true"></i>
              <i class="fa fa-cloud cloud-icon cloud2" aria-hidden="true"></i>
              <div class="truck-container">
                <img src="/assets/Quickpass.png" alt="Camión" class="truck-icon">
              </div>
            </div>
          `;
                    document.body.appendChild(x);
                    return x;
                }

                function style(x) {
                    x.style.position = "fixed";
                    x.style.inset = "0";
                    x.style.zIndex = "99999";
                    x.classList.add("show"); x.style.display = "flex";
                    x.style.alignItems = "center";
                    x.style.justifyContent = "center";
                    x.style.background = "rgba(0,0,0,.25)";
                    x.style.visibility = "visible";
                    x.style.opacity = "1";
                    x.style.pointerEvents = "all";
                }

                function show() {
                    const x = ensure();
                    style(x);
                    counter++;
                    x.classList.add("show"); x.style.display = "flex";
                }

                function hide(force = false) {
                    const x = document.getElementById(ID);
                    counter = force ? 0 : Math.max(0, counter - 1);
                    if (x && counter === 0) { x.classList.remove("show"); x.style.display = "none"; }
                }

                // removed load listener

                return { show, hide, forceHide: () => hide(true) };
            })();

            function showLoaderDelayed() { Loader.show(); }
            function hideLoader() { setTimeout(() => { Loader.hide(); }, 1600); }

            // ---------------- Charts ----------------
            let ch1_AzMel = null;        // chart-total-kg
            let ch2_Truck = null;        // chart-kg-por-tipo
            let ch3_BrixTemp = null;     // chart-prom-brix
            let ch4_Humedad = null;      // chart-prom-humedad

            // ---------------- State ----------------
            let inFlight = false;
            let pendingRun = false;
            let pendingSilent = false; // (aquí no usas silent, pero lo dejamos por consistencia)
            let lastDataHash = null;
            let lastFiltersHash = null;
            let lastLabels = [];

            let tResize = null;
            let inResize = false;
            let __scrollResizeLock = false;


            // ---------------- Utils ----------------
            const num = (v) => {
                const n = Number(v);
                return Number.isFinite(n) ? n : 0;
            };

            const fmt2 = (v) =>
                num(v).toLocaleString("es-SV", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            const ymd = (d) => {
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, "0");
                const dd = String(d.getDate()).padStart(2, "0");
                return `${yyyy}-${mm}-${dd}`;
            };

            const isoKey = (v) => {
                if (v == null) return null;
                const s = String(v).trim();
                if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
                const d = new Date(s);
                if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
                return null;
            };

            const prettyLabel = (iso) => {
                const [y, m, d] = String(iso).split("-");
                if (!y || !m || !d) return String(iso);
                return `${d}-${m}-${y.slice(-2)}`; // DD-MM-YY
            };

            const stableStringify = (obj) =>
                DashCore.stableStringify ? DashCore.stableStringify(obj) : JSON.stringify(obj);

            const simpleHash = (s) => (DashCore.simpleHash ? DashCore.simpleHash(s) : s);

            function setText(id, txt) {
                const el = $(id);
                if (el) el.textContent = txt;
            }

            function hasDuplicateDays(labelsRaw) {
                const seen = new Set();
                for (const x of labelsRaw) {
                    const k = isoKey(x);
                    if (!k) continue;
                    if (seen.has(k)) return true;
                    seen.add(k);
                }
                return false;
            }

            function compressByDaySum(labelsRaw, ...series) {
                const outIso = [];
                const outLabels = [];
                const outSeries = series.map(() => []);
                const idx = new Map();

                for (let i = 0; i < (labelsRaw || []).length; i++) {
                    const k = isoKey(labelsRaw[i]) || String(labelsRaw[i] ?? "");
                    if (!k) continue;

                    let j = idx.get(k);
                    if (j == null) {
                        j = outIso.length;
                        idx.set(k, j);
                        outIso.push(k);
                        outLabels.push(prettyLabel(k));
                        for (let s = 0; s < outSeries.length; s++) outSeries[s][j] = 0;
                    }

                    for (let s = 0; s < outSeries.length; s++) {
                        outSeries[s][j] += num(series[s]?.[i]);
                    }
                }

                return { labelsIso: outIso, labels: outLabels, series: outSeries };
            }

            function compressByDayAvg(labelsRaw, ...series) {
                const outIso = [];
                const outLabels = [];
                const outSum = series.map(() => []);
                const outCount = [];
                const idx = new Map();

                for (let i = 0; i < (labelsRaw || []).length; i++) {
                    const k = isoKey(labelsRaw[i]) || String(labelsRaw[i] ?? "");
                    if (!k) continue;

                    let j = idx.get(k);
                    if (j == null) {
                        j = outIso.length;
                        idx.set(k, j);
                        outIso.push(k);
                        outLabels.push(prettyLabel(k));
                        outCount[j] = 0;
                        for (let s = 0; s < outSum.length; s++) outSum[s][j] = 0;
                    }

                    outCount[j] += 1;
                    for (let s = 0; s < outSum.length; s++) {
                        outSum[s][j] += num(series[s]?.[i]);
                    }
                }

                const outSeries = outSum.map(arr => arr.map((v, j) => (outCount[j] ? (v / outCount[j]) : 0)));
                return { labelsIso: outIso, labels: outLabels, series: outSeries };
            }

            // ---------------- Filters ----------------
            function ensureDefaultDates() {
                const desde = $("f-desde");
                const hasta = $("f-hasta");
                if (!desde || !hasta) return;

                if (!String(desde.value || "").trim() || !String(hasta.value || "").trim()) {
                    const end = new Date(); end.setHours(0, 0, 0, 0);
                    const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000);
                    desde.value = ymd(start);
                    hasta.value = ymd(end);
                }
            }

            let __pesosAlertOpen = false;

            function _addDaysIso(isoDate, days) {
                const [y, m, d] = String(isoDate || "").split("-").map(n => parseInt(n, 10));
                if (!y || !m || !d) return isoDate;
                const dt = new Date(Date.UTC(y, m - 1, d));
                dt.setUTCDate(dt.getUTCDate() + (Number(days) || 0));
                return dt.toISOString().slice(0, 10);
            }

            async function validateRangeAndFix() {
                const desde = $("f-desde");
                const hasta = $("f-hasta");
                if (!desde || !hasta) return true;

                const s = String(desde.value || "").trim();
                const e = String(hasta.value || "").trim();
                if (!s || !e) {
                    desde.classList.remove("is-invalid");
                    hasta.classList.remove("is-invalid");
                    __pesosAlertOpen = false;
                    return true;
                }

                if (e < s) {
                    desde.classList.add("is-invalid");
                    hasta.classList.add("is-invalid");

                    hasta.value = _addDaysIso(s, 1);

                    if (!__pesosAlertOpen && window.Swal && typeof window.Swal.fire === "function") {
                        __pesosAlertOpen = true;
                        try {
                            await Swal.fire({
                                icon: "error",
                                title: "Error en las fechas seleccionadas",
                                text: "El rango de fechas ingresado no es válido.",
                                confirmButtonText: "Entendido"
                            });
                        } finally {
                            __pesosAlertOpen = false;
                        }
                    } else {
                        console.warn("[pesos] Rango de fechas inválido: 'Hasta' < 'Desde' (auto-fix aplicado)");
                    }

                    setTimeout(() => {
                        try { desde.classList.remove("is-invalid"); hasta.classList.remove("is-invalid"); } catch { }
                        try { fetchAndRender(); } catch { }
                    }, 0);

                    return false;
                }

                desde.classList.remove("is-invalid");
                hasta.classList.remove("is-invalid");
                __pesosAlertOpen = false;
                return true;
            }

            function readFilters() {
                return {
                    start: String($("f-desde")?.value || "").trim(),
                    end: String($("f-hasta")?.value || "").trim(),
                    ingenioId: String($("f-ingenio")?.value || "").trim(),
                    product: String($("f-producto")?.value || "").trim(),
                };
            }

            // ---------------- Fetch ----------------
            async function fetchDiario(filters) {
                const q = new URLSearchParams({
                    start: filters.start,
                    end: filters.end,
                    _ts: Date.now().toString(),
                });

                if (filters.ingenioId) q.set("ingenioId", filters.ingenioId);
                if (filters.product) q.set("product", filters.product);

                const res = await fetch(`/dashboard/diario/cantidades-promedios?${q.toString()}`, {
                    method: "GET",
                    cache: "no-store",
                    headers: {
                        "Accept": "application/json",
                        "X-Requested-With": "XMLHttpRequest",
                        "Cache-Control": "no-cache, no-store, must-revalidate",
                        "Pragma": "no-cache",
                        "Expires": "0",
                    },
                    credentials: "same-origin",
                });

                const json = await res.json().catch(() => null);

                if (!res.ok) {
                    const msg =
                        (json && (json.message || json.error)) ? (json.message || json.error) :
                            `${res.status} ${res.statusText}`;
                    throw new Error(`Dashboard diario: ${msg}`);
                }

                return json;
            }

            function buildSignature(payload) {
                try {
                    const d = payload?.daily || [];
                    const k = payload?.kpis || {};
                    return {
                        k: { tons: k?.tons || {}, averages: k?.averages || {} },
                        d: d.map(r => ([
                            isoKey(r?.date) || String(r?.date ?? ""),
                            num(r?.tons?.azucar),
                            num(r?.tons?.melaza),
                            num(r?.tonsByTruck?.volteo),
                            num(r?.tonsByTruck?.plana),
                            num(r?.tonsByTruck?.pipa),
                            num(r?.averages?.brixMelaza),
                            num(r?.averages?.tempMelaza),
                            num(r?.averages?.humedadAzucar),
                        ])),
                    };
                } catch {
                    return null;
                }
            }

            // ---------------- KPIs ----------------
            function renderKpis(payload) {
                const k = payload?.kpis || {};
                const tons = k?.tons || {};
                const avgs = k?.averages || {};

                setText("kpi-cant-az", `${fmt2(tons.azucar)} t`);
                setText("kpi-cant-mel", `${fmt2(tons.melaza)} t`);
                setText("kpi-cant-volteo", `${fmt2(tons.volteo)} t`);
                setText("kpi-cant-planas", `${fmt2(tons.plana)} t`);

                setText("kpi-prom-humedad", `${fmt2(avgs.humedadAzucar)} %`);
                setText("kpi-prom-brix", `${fmt2(avgs.brixMelaza)} °Bx`);
                setText("kpi-prom-temperatura", `${fmt2(avgs.tempMelaza)} °C`);
            }

            // ---------------- Charts helpers ----------------
            function safeLine2Series(canvasId, a, b, c) {
                const el = document.getElementById(canvasId);
                if (!el) {
                    console.warn(`[historico-pesos] No existe #${canvasId} (canvas).`);
                    return null;
                }
                if (String(el.tagName).toUpperCase() !== "CANVAS") {
                    console.warn(`[historico-pesos] #${canvasId} no es <canvas> (es ${el.tagName}).`);
                    return null;
                }
                return DashCore.line2Series(canvasId, a, b, c);
            }


            // ✅ Humedad eje Y 0..1 step 0.1 (sin romper Chart v2/v3)
            function applyHumedadAxis01(ch) {
                if (!ch || !ch.options || !ch.options.scales) return;

                const scales = ch.options.scales;

                function fmtTick(v) {
                    const n = Number(v);
                    if (!Number.isFinite(n)) return "";
                    if (n === 0) return "0";
                    if (n === 1) return "1";
                    return n.toFixed(1); // 0.1 ... 0.9
                }

                // v2
                if (Array.isArray(scales.yAxes) && scales.yAxes[0] && typeof scales.yAxes[0] === "object") {
                    const y = scales.yAxes[0];
                    if (!y.ticks || typeof y.ticks !== "object" || Array.isArray(y.ticks)) return;

                    y.ticks.min = 0;
                    y.ticks.max = 1;
                    y.ticks.stepSize = 0.1;
                    y.ticks.callback = function (v) { return fmtTick(v); };
                    return;
                }

                // v3/v4
                if (scales.y && typeof scales.y === "object") {
                    const y = scales.y;
                    if (!y.ticks || typeof y.ticks !== "object" || Array.isArray(y.ticks)) return;

                    y.min = 0;
                    y.max = 1;
                    y.ticks.stepSize = 0.1;
                    y.ticks.callback = (v) => fmtTick(v);
                    return;
                }
            }

            // ✅ Evita que el eje X se sature cuando hay rangos largos
            // - Muestra solo una parte de labels (autoSkip)
            // - Limita el número máximo de ticks visible
            // - Oculta labels intermedias con callback
            function applySmartXTicks(ch, labels) {
                if (!ch || !ch.options || !labels || !labels.length) return;

                const n = labels.length;
                const maxTicks = n > 180 ? 10 : n > 120 ? 12 : n > 60 ? 14 : n > 30 ? 16 : 20;

                const scales = ch.options.scales;

                // -------- Chart.js v2 --------
                if (scales && Array.isArray(scales.xAxes) && scales.xAxes[0]) {
                    const x = scales.xAxes[0];
                    x.type = "category";

                    const t = x.ticks || (x.ticks = {});
                    t.autoSkip = true;
                    t.maxTicksLimit = maxTicks;

                    // vertical SIEMPRE
                    t.maxRotation = 90;
                    t.minRotation = 90;

                    // IMPORTANTE: no callback (evita duplicaciones raras)
                    delete t.callback;

                    return;
                }

                // -------- Chart.js v3/v4 --------
                if (scales && scales.x) {
                    scales.x.type = "category";

                    const t = scales.x.ticks || (scales.x.ticks = {});
                    t.autoSkip = true;
                    t.maxTicksLimit = maxTicks;

                    t.maxRotation = 90;
                    t.minRotation = 90;

                    delete t.callback;

                    return;
                }
            }


            function finalizeScrollAndResize(labels) {
                if (__scrollResizeLock) return;
                __scrollResizeLock = true;

                const ids = [
                    "chart-total-kg",
                    "chart-kg-por-tipo",
                    "chart-prom-brix",
                    "chart-prom-humedad",
                ];

                // 60px por etiqueta de fecha (default 28 es insuficiente para rangos cortos)
                const PESOS_CFG = { pxPerLabel: 60, overshoot: 1.08, maxWide: 5000 };

                try {
                    for (const id of ids) {
                        try { DashCore.ensureScrollableWidth(id, labels, PESOS_CFG); } catch { }
                    }
                } finally {
                    // libera el lock en el siguiente tick para evitar re-entradas
                    setTimeout(() => { __scrollResizeLock = false; }, 0);
                }
            }


            function renderCharts(payload) {
                const rows = Array.isArray(payload?.daily) ? payload.daily : [];
                const Lraw = rows.map(r => r?.date);

                const azRaw = rows.map(r => num(r?.tons?.azucar));
                const melRaw = rows.map(r => num(r?.tons?.melaza));

                const volRaw = rows.map(r => num(r?.tonsByTruck?.volteo));
                const plaRaw = rows.map(r => num(r?.tonsByTruck?.plana));
                const pipRaw = rows.map(r => num(r?.tonsByTruck?.pipa));

                const brixRaw = rows.map(r => num(r?.averages?.brixMelaza));
                const tempRaw = rows.map(r => num(r?.averages?.tempMelaza));

                const humRaw = rows.map(r => num(r?.averages?.humedadAzucar));

                const dup = hasDuplicateDays(Lraw);

                const labels = dup
                    ? compressByDaySum(Lraw, azRaw).labels
                    : Lraw.map(d => prettyLabel(isoKey(d) || d));

                lastLabels = labels;
                finalizeScrollAndResize(labels);
                try { ch1_AzMel?.resize(); ch2_Truck?.resize(); ch3_BrixTemp?.resize(); ch4_Humedad?.resize(); } catch {}

                const g1 = dup ? compressByDaySum(Lraw, azRaw, melRaw) : { labels, series: [azRaw, melRaw] };
                const g2 = dup ? compressByDaySum(Lraw, volRaw, plaRaw, pipRaw) : { labels, series: [volRaw, plaRaw, pipRaw] };
                const g3 = dup ? compressByDayAvg(Lraw, brixRaw, tempRaw) : { labels, series: [brixRaw, tempRaw] };
                const g4 = dup ? compressByDayAvg(Lraw, humRaw) : { labels, series: [humRaw] };

                if (ch1_AzMel) {
                    try {
                        ch1_AzMel.data.datasets[1].hidden = false;
                        ch1_AzMel.data.datasets[0].hidden = false;
                        if (ch1_AzMel.data.datasets[2]) ch1_AzMel.data.datasets[2].hidden = true;
                    } catch { }

                    DashCore.setLine3(
                        ch1_AzMel,
                        g1.labels,
                        g1.series[1],
                        g1.series[0],
                        new Array(g1.labels.length).fill(0),
                        "Toneladas"
                    );

                    applySmartXTicks(ch1_AzMel, g1.labels);
                }

                if (ch2_Truck) {
                    try {
                        ch2_Truck.data.datasets[0].hidden = false;
                        ch2_Truck.data.datasets[1].hidden = false;
                        if (ch2_Truck.data.datasets[2]) ch2_Truck.data.datasets[2].hidden = false;
                    } catch { }

                    DashCore.setLine3(
                        ch2_Truck,
                        g2.labels,
                        g2.series[0],
                        g2.series[1],
                        g2.series[2],
                        "Toneladas"
                    );

                    applySmartXTicks(ch2_Truck, g2.labels);
                }

                if (ch3_BrixTemp) {
                    try {
                        ch3_BrixTemp.data.datasets[0].hidden = false;
                        ch3_BrixTemp.data.datasets[1].hidden = false;
                        if (ch3_BrixTemp.data.datasets[2]) ch3_BrixTemp.data.datasets[2].hidden = true;
                    } catch { }

                    DashCore.setLine3(
                        ch3_BrixTemp,
                        g3.labels,
                        g3.series[0],
                        g3.series[1],
                        new Array(g3.labels.length).fill(0),
                        "Promedio"
                    );

                    applySmartXTicks(ch3_BrixTemp, g3.labels);
                }

                if (ch4_Humedad) {
                    try {
                        ch4_Humedad.data.datasets[0].hidden = false;
                        if (ch4_Humedad.data.datasets[1]) ch4_Humedad.data.datasets[1].hidden = true;
                        if (ch4_Humedad.data.datasets[2]) ch4_Humedad.data.datasets[2].hidden = true;
                    } catch { }

                    DashCore.setLine3(
                        ch4_Humedad,
                        g4.labels,
                        g4.series[0],
                        new Array(g4.labels.length).fill(0),
                        new Array(g4.labels.length).fill(0),
                        "Humedad"
                    );

                    applySmartXTicks(ch4_Humedad, g4.labels);

                    // ✅ aplica eje Y 0..1 step 0.1 (sin update recursivo)
                    //applyHumedadAxis01(ch4_Humedad);
                }

                const _pSumArr = (arr) => (arr || []).reduce((a, b) => a + (Number(b) || 0), 0);
                const _pSum = (...arrs) => arrs.reduce((t, a) => t + _pSumArr(a), 0);

                const kg1Empty  = !labels.length || _pSum(g1.series[0], g1.series[1]) === 0;
                const kg2Empty  = !labels.length || _pSum(g2.series[0], g2.series[1], g2.series[2]) === 0;
                const brixEmpty = !labels.length || _pSum(g3.series[0], g3.series[1]) === 0;
                const humEmpty  = !labels.length || _pSum(g4.series[0]) === 0;

                // Si vacío: limpiar datasets para no renderizar puntos en y=0
                if (kg1Empty  && ch1_AzMel)    { ch1_AzMel.data.labels    = []; ch1_AzMel.data.datasets.forEach(d => d.data = []);    try { ch1_AzMel.update("none");    } catch { } }
                if (kg2Empty  && ch2_Truck)     { ch2_Truck.data.labels    = []; ch2_Truck.data.datasets.forEach(d => d.data = []);    try { ch2_Truck.update("none");    } catch { } }
                if (brixEmpty && ch3_BrixTemp)  { ch3_BrixTemp.data.labels = []; ch3_BrixTemp.data.datasets.forEach(d => d.data = []); try { ch3_BrixTemp.update("none"); } catch { } }
                if (humEmpty  && ch4_Humedad)   { ch4_Humedad.data.labels  = []; ch4_Humedad.data.datasets.forEach(d => d.data = []);  try { ch4_Humedad.update("none");  } catch { } }

                document.getElementById("chart-total-kg")?.closest(".chart-card")?.classList.toggle("is-empty", kg1Empty);
                document.getElementById("chart-kg-por-tipo")?.closest(".chart-card")?.classList.toggle("is-empty", kg2Empty);
                document.getElementById("chart-prom-brix")?.closest(".chart-card")?.classList.toggle("is-empty", brixEmpty);
                document.getElementById("chart-prom-humedad")?.closest(".chart-card")?.classList.toggle("is-empty", humEmpty);

            }

            // ---------------- Main refresh ----------------
            async function fetchAndRender() {
                if (inFlight) {
                    pendingRun = true;
                    pendingSilent = false;
                    return;
                }
                if (!(await validateRangeAndFix())) return;

                const filters = readFilters();
                if (!filters.start || !filters.end) return;

                const filtersHash = stableStringify(filters);

                inFlight = true;
                showLoaderDelayed();

                try {
                    const payload = await fetchDiario(filters);
                    const sigObj = buildSignature(payload);
                    const dataHash = simpleHash(stableStringify(sigObj));

                    if (lastDataHash !== null && dataHash === lastDataHash && filtersHash === lastFiltersHash) return;

                    lastDataHash = dataHash;
                    lastFiltersHash = filtersHash;

                    renderKpis(payload);
                    renderCharts(payload);

                } catch (e) {
                    console.error("[historico-pesos] error:", e);
                } finally {
                    hideLoader();
                    inFlight = false;

                    if (pendingRun) {
                        pendingRun = false;
                        pendingSilent = false;
                        fetchAndRender(); // corre 1 vez más con los últimos filtros
                    }
                }
            }


            function wireEvents() {
                $("f-apply")?.addEventListener("click", fetchAndRender);

                // Resize debounced + guard (evita callstack)
                window.addEventListener("resize", () => {
                    if (__scrollResizeLock) return; // ✅ evita loop

                    clearTimeout(tResize);
                    tResize = setTimeout(() => {
                        if (lastLabels?.length) finalizeScrollAndResize(lastLabels);
                    }, 150);
                });
            }

            function init() {
                ensureDefaultDates();
                wireEvents();

                // Crear charts 1 vez (IDs de CANVAS)
                ch1_AzMel = safeLine2Series("chart-total-kg", "Melaza (t)", "Azúcar (t)", "");
                ch2_Truck = safeLine2Series("chart-kg-por-tipo", "Volteo (t)", "Plana (t)", "Pipa (t)");
                ch3_BrixTemp = safeLine2Series("chart-prom-brix", "Brix (Melaza)", "Temp (Melaza)", "");
                ch4_Humedad = safeLine2Series("chart-prom-humedad", "Humedad (Azúcar)", "", "");
                applyHumedadAxis01(ch4_Humedad); // ✅ SOLO para humedad


                // Ocultar datasets extras donde no aplican
                try { if (ch1_AzMel?.data?.datasets?.[2]) ch1_AzMel.data.datasets[2].hidden = true; } catch { }
                try { if (ch3_BrixTemp?.data?.datasets?.[2]) ch3_BrixTemp.data.datasets[2].hidden = true; } catch { }
                try {
                    if (ch4_Humedad?.data?.datasets?.[1]) ch4_Humedad.data.datasets[1].hidden = true;
                    if (ch4_Humedad?.data?.datasets?.[2]) ch4_Humedad.data.datasets[2].hidden = true;
                } catch { }

                // Aplica eje humedad desde ya (sin update)
                applyHumedadAxis01(ch4_Humedad);
                fetchAndRender();
            }

            if (document.readyState === "loading") {
                document.addEventListener("DOMContentLoaded", init);
            } else {
                init();
            }

        })(getCore());
    }

    start();
})();

