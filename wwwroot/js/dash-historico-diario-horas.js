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
    function secToHoursFloat(sec) {
        const n = Number(sec);
        if (!Number.isFinite(n)) return 0;
        return n / 3600;
    }

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

        chart.update("none");
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

        // KPIs: Camiones
        const elFinal = DC.byId("kpi-camiones-finalizados");
        const elRec = DC.byId("kpi-camiones-recibidos");

        // "Finalizados" viene directo del resumen
        const totalFinal = Number(tdb?.Finalizado ?? resumen?.Finalizado?.Total ?? 0) || 0;

        // "Recibidos" en este dashboard lo tomamos como Prechequeado (ya recibido en planta)
        const totalRec = Number(tdb?.Prechequeado ?? resumen?.Prechequeado?.Total ?? 0) || 0;

        if (elFinal) elFinal.textContent = String(totalFinal);
        if (elRec) elRec.textContent = String(totalRec);

        // KPIs: Tiempos (vienen como HH:mm:ss desde /promedios-atencion-por-fecha)
        const elE = DC.byId("kpi-tiempo-promedio-espera");
        const elAt = DC.byId("kpi-tiempo-promedio-atencion");

        const prom = promediosJson || {};
        const esperaTxt =
            prom?.Promedios?.Espera_2_4?.promedio_espera ??
            prom?.PromedioEspera?.Global?.promedio_hhmmss ??
            prom?.PromedioEspera?.promedio_hhmmss ??
            "00:00:00";

        const atencionTxt =
            prom?.Promedios?.Atencion_5_12?.promedio_atencion ??
            prom?.PromedioAtencion?.Global?.promedio_hhmmss ??
            prom?.PromedioAtencion?.promedio_hhmmss ??
            "00:00:00";

        if (elE) elE.textContent = formatHhmmssToHMin(esperaTxt);
        if (elAt) elAt.textContent = formatHhmmssToHMin(atencionTxt);
    }

    function updateKPIFlujoDiaFrom(pesosJson, filters) {
        let azTons = 0, melTons = 0;
        let azFlow = 0, melFlow = 0;

        if (pesosJson?.kpis) {
            azTons = Number(pesosJson.kpis.totalsTons?.azucar ?? 0);
            melTons = Number(pesosJson.kpis.totalsTons?.melaza ?? 0);
            azFlow = Number(pesosJson.kpis.flow?.azucarTonsPerHour ?? 0);
            melFlow = Number(pesosJson.kpis.flow?.melazaTonsPerHour ?? 0);
        } else {
            const unitList = Array.isArray(pesosJson?.units)
                ? pesosJson.units
                : (Array.isArray(pesosJson?.PesosPorStatus?.Horas) ? pesosJson.PesosPorStatus.Horas : []);

            if (unitList.length > 0) {
                for (const u of unitList) {
                    const prod = String(u?.product ?? u?.Product ?? "").trim().toUpperCase();
                    // nuevo: "tons" ya viene en toneladas; antiguo: "TotalKgRaw" es el peso neto individual en kg
                    const ton = Number.isFinite(Number(u?.tons))
                        ? Number(u.tons)
                        : (Number(u?.TotalKgRaw ?? 0) / 1000);
                    if (!Number.isFinite(ton) || ton <= 0) continue;
                    if (prod.includes("AZ")) azTons += ton;
                    else if (prod.includes("MEL")) melTons += ton;
                }
            }

            // Fallback: PromediosPorProducto tiene el total real por producto cuando no hay unitList
            if (azTons === 0 && melTons === 0) {
                const promedios = Array.isArray(pesosJson?.PesosPorStatus?.PromediosPorProducto)
                    ? pesosJson.PesosPorStatus.PromediosPorProducto : [];
                for (const p of promedios) {
                    const prod = String(p?.Product ?? "").trim().toUpperCase();
                    const kg = Number(p?.TotalKg ?? 0);
                    if (prod.includes("AZ")) azTons = kg / 1000;
                    else if (prod.includes("MEL")) melTons = kg / 1000;
                }
            }

            const hFrom = filters?.hourFrom ?? 0;
            const hTo = filters?.hourTo ?? 23;
            const hours = Math.max(1, hTo - hFrom + 1);
            azFlow = azTons / hours;
            melFlow = melTons / hours;
        }

        // helpers de formato
        const fmtTon = (v) => {
            const n = Number(v ?? 0);
            const safe = Number.isFinite(n) ? n : 0;
            return `${safe.toLocaleString("es-SV", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} t`;
        };
        const fmtTonPerHour = (v) => {
            const n = Number(v ?? 0);
            const safe = Number.isFinite(n) ? n : 0;
            return `${safe.toLocaleString("es-SV", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} t/h`;
        };

        // AZ-001
        const elDayAz = DC.byId("kpi-cantidad-dia-Az");
        const elHourAz = DC.byId("kpi-flujo-dia-Az");
        if (elDayAz) elDayAz.textContent = fmtTon(azTons);
        if (elHourAz) elHourAz.textContent = fmtTonPerHour(azFlow);

        // MEL-001
        const elDayMel = DC.byId("kpi-cantidad-dia-Mel");
        const elHourMel = DC.byId("kpi-flujo-dia-Mel");
        if (elDayMel) elDayMel.textContent = fmtTon(melTons);
        if (elHourMel) elHourMel.textContent = fmtTonPerHour(melFlow);
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
        const date = (DC.$("f-fecha")?.value || "").trim();
        const hourFrom = timeInputToHour(DC.$("f-hour-start")?.value || "00:00");
        const hourTo = timeInputToHour(DC.$("f-hour-end")?.value || "23:59");
        const ingenioId = (DC.$("f-ingenio")?.value || "").trim();
        const product = (DC.$("f-producto")?.value || "").trim(); // "" cuando es Todos
        return { date, hourFrom, hourTo, ingenioId, product };
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

    // =================== Fetch endpoints (por fecha) ===================
    async function fetchStatusPorFecha(filters) {
        const qs = new URLSearchParams({ date: String(filters.date || ""), hourFrom: String(filters.hourFrom), hourTo: String(filters.hourTo) });
        setIfNotEmpty(qs, "ingenioId", filters.ingenioId);
        if (String(filters.product || "").trim()) setIfNotEmpty(qs, "product", filters.product);

        const url = absUrl("/dashboard/status-por-fecha", qs);
        const r = await fetch(url, { headers: { "Accept": "application/json" }, cache: "no-store" });
        const json = await readJsonSafe(r, "resumen-por-fecha");
        log("URL resumen-hoy:", url, json);
        return json;
    }

    async function fetchPromediosAtencionPorFecha(filters) {
        const qs = new URLSearchParams({ date: String(filters.date || ""), hourFrom: String(filters.hourFrom), hourTo: String(filters.hourTo) });
        setIfNotEmpty(qs, "ingenioId", filters.ingenioId);
        if (String(filters.product || "").trim()) setIfNotEmpty(qs, "product", filters.product);

        const url = absUrl("/dashboard/promedios-atencion-por-fecha", qs);
        const r = await fetch(url, { headers: { "Accept": "application/json" }, cache: "no-store" });
        const json = await readJsonSafe(r, "promedios-atencion-por-fecha");
        log("URL promedios-atencion-hoy:", url, json);
        return json;
    }

    async function fetchRecibidoPorHoraRaw(filters) {
        const qs = new URLSearchParams({
            date: String(filters.date || ""),
            hourFrom: String(filters.hourFrom),
            hourTo: String(filters.hourTo),
            _ts: String(Date.now())
        });
        if ((filters.ingenioId || "").trim()) qs.set("ingenioId", filters.ingenioId.trim());
        if ((filters.product || "").trim()) qs.set("product", filters.product.trim());

        const url = `/dashboard/recibido-por-hora?${qs.toString()}`;
        const r = await fetch(url, { headers: { "Accept": "application/json" }, cache: "no-store" });
        const json = await readJsonSafe(r, "recibido-por-hora");
        log("URL recibido-por-hora:", url, json);
        return json;
    }

    async function fetchRecibidoPorHora(filters) {
        // /dashboard/recibido-por-hora ya devuelve los KPIs calculados (kpis.*) y units[]
        // Para este dashboard lo consumimos 1 sola vez (sin forzar product), porque la respuesta ya trae AZ y MEL.
        const json = await fetchRecibidoPorHoraRaw({ ...filters, product: "" });
        return json;
    }

    // Normaliza respuesta de /dashboard/promedio-descarga-por-hora (formato nuevo) a la estructura histórica que ya usa el JS
    function normalizePromedioDescargaResponse(raw) {
        if (!raw) return raw;

        // Si ya viene en formato viejo (PromedioDescarga.Horas), no tocamos nada
        if (raw?.PromedioDescarga?.Horas) return raw;

        const horasNew = Array.isArray(raw?.PromedioDescargaPorHora) ? raw.PromedioDescargaPorHora : [];
        const gen = raw?.PromedioGeneralRango || raw?.PromedioGeneral || null;

        // Convertimos: [{ Hora:"06:00", Promedio:{Planas:"..", Volteo:"..", Pipa:".."} }, ...]
        const horas = horasNew.map(h => ({
            Hora: String(h?.Hora ?? h?.hora ?? "").trim(),
            Promedio: {
                Planas: String(h?.Planas ?? "00:00:00"),
                Volteo: String(h?.Volteo ?? "00:00:00"),
                Pipa: String(h?.Pipa ?? "00:00:00"),
            }
        })).filter(x => x.Hora);

        // KPI general en el rango (lo que tu vista muestra arriba)
        const promActual = gen ? {
            Planas: String(gen?.Planas ?? "00:00:00"),
            Volteo: String(gen?.Volteo ?? "00:00:00"),
            Pipa: String(gen?.Pipa ?? "00:00:00"),
        } : { Planas: "00:00:00", Volteo: "00:00:00", Pipa: "00:00:00" };


        return {
            ...raw,
            PromedioDescarga: {
                PromedioActual: promActual,
                Horas: horas
            }
        };
    }

    async function fetchPromedioDescargaPorHora(filters) {
        const qs = new URLSearchParams({
            date: String(filters.date || ""),
            hourFrom: String(filters.hourFrom),
            hourTo: String(filters.hourTo),
            _ts: String(Date.now())
        });
        if ((filters.ingenioId || "").trim()) qs.set("ingenioId", filters.ingenioId.trim());
        if ((filters.product || "").trim()) qs.set("product", filters.product.trim());

        const url = `/dashboard/promedio-descarga-por-hora?${qs.toString()}`;
        const r = await fetch(url, { headers: { "Accept": "application/json" }, cache: "no-store" });
        const json = await readJsonSafe(r, "promedio-descarga-por-fecha");
        log("URL promedio-descarga-hoy:", url, json);
        return normalizePromedioDescargaResponse(json);
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

    function mapResumenPorFechaResponse(resumen, labels) {
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
        const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
        if (!m) return null;
        const hh = Number(m[1]), mm = Number(m[2]);
        if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
        return hh * 60 + mm;
    }

    function formatHhmmssToHMin(hhmmss) {
        const s = String(hhmmss ?? "").trim();
        const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
        if (!m) return "0 h 0 min";

        const h = Number(m[1] ?? 0);
        const min = Number(m[2] ?? 0);

        const H = Number.isFinite(h) ? h : 0;
        const M = Number.isFinite(min) ? min : 0;

        // Siempre mostrar horas, aunque sea 0 (como pediste)
        return `${H} h ${M} min`;
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
        // ✅ nuevo: si viene del endpoint /recibido-por-hora
        let list = Array.isArray(pesosJson?.units)
            ? pesosJson.units
            : (Array.isArray(pesosJson?.PesosPorStatus?.Horas) ? pesosJson.PesosPorStatus.Horas : []);

        // Orden por tiempo (hour/ HoraDescarga)
        list = list.slice().sort((a, b) => {
            const ha = String(a?.hour ?? a?.HoraDescarga ?? "").trim();
            const hb = String(b?.hour ?? b?.HoraDescarga ?? "").trim();
            const xa = hhmmToMinutes(ha) ?? 0;
            const xb = hhmmToMinutes(hb) ?? 0;
            return xa - xb;
        });

        const accByHourProd = new Map(); // "HH:00||AZ-001" => ton acumuladas
        const idxByHourProd = new Map(); // "HH:00||AZ-001" => 1..N

        const az = [];
        const mel = [];
        const otros = [];

        for (const r of list) {
            const product = String(r?.product ?? r?.Product ?? "").trim().toUpperCase();
            if (!product) continue;

            const horaReal = String(r?.hour ?? r?.HoraDescarga ?? "").trim(); // "HH:mm"
            const x = hhmmToMinutes(horaReal);
            if (x == null) continue;

            const bucket = String(r?.hourBucket ?? r?.HoraBucket ?? "").trim(); // "HH:00"
            if (!bucket) continue;

            // ✅ nuevo: si viene tons, úsalo; si viene kg, conviértelo
            const tonRaw = Number.isFinite(Number(r?.tons))
                ? Number(r.tons)
                : (Number(r?.TotalKgRaw ?? r?.TotalKg ?? 0) / 1000);

            if (!Number.isFinite(tonRaw) || tonRaw <= 0) continue;

            const key = `${bucket}||${product}`;

            const n = (idxByHourProd.get(key) ?? 0) + 1;
            idxByHourProd.set(key, n);

            const tonAcum = (accByHourProd.get(key) ?? 0) + tonRaw;
            accByHourProd.set(key, tonAcum);

            const point = {
                x,
                y: tonAcum,
                meta: {
                    n,
                    hora: horaReal,
                    bucket,
                    product,
                    tonRaw,
                    tonAcum,
                    plate: r?.plate ?? r?.trailer_plate ?? null,
                    id: r?.id ?? r?.id_shipment ?? null
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
                y: secToHoursFloat(avgSecPlanas),
                meta: { hora: horaStr, tiempo: secToMinSegLabel(avgSecPlanas), placa: "" }
            });
            if (avgSecVolteo > 0) pts.volteo.push({
                x,
                y: secToHoursFloat(avgSecVolteo),
                meta: { hora: horaStr, tiempo: secToHHMMSS_local(avgSecVolteo), placa: "" }
            });
            if (avgSecPipa > 0) pts.pipa.push({
                x,
                y: secToHoursFloat(avgSecPipa),
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
    // productFilter: producto capturado ANTES del fetch (evita leer DOM obsoleto si el
    // usuario cambió el filtro mientras el request estaba en vuelo)
    function renderCharts(labels, baseSeries, azPack, promPack, resumenJson, productFilter) {
        lastLabels = labels;
        ["chart-finalizados", "chart-azucar", "chart-promedio"].forEach(id => DC.ensureScrollableWidth(id, labels));
        // chart-recibidos usa eje X numérico (minutos) → su ancho lo gestiona widenRecibidosIfNeeded dentro de renderRecibidos

        const kind = DC.normalizeProductKind(
            productFilter !== undefined ? productFilter : (DC.$("f-producto")?.value || "")
        );
        const VIS = (kind === "melaza") ? { volteo: false, plana: false, pipa: true }
            : (kind === "azucar") ? { volteo: true, plana: true, pipa: false }
                : { volteo: true, plana: true, pipa: true };

        const zeros = () => new Array(labels.length).fill(0);

        // ✅ Rango visible EXACTO según filtro (labels) y recorte de puntos para cortar la línea
        const _minHour = Number(String(labels?.[0] ?? "00:00").split(":")[0]) || 0;
        const _maxHour = Number(String(labels?.[labels.length - 1] ?? "23:00").split(":")[0]) || 23;
        const _minX = _minHour * 60;
        const _maxX = Math.min(23 * 60 + 59, _maxHour * 60 + 59);

        const clipPoints = (pts) => {
            const arr = Array.isArray(pts) ? pts : [];
            return arr.filter(p => {
                const x = Number(p?.x);
                return Number.isFinite(x) && x >= _minX && x <= _maxX;
            });
        };

        const applyFixedHourRange = (chart) => {
            const xScale = chart?.options?.scales?.x;
            if (!xScale) return;

            xScale.min = _minX;
            xScale.max = _maxX;

            // ticks solo en HH:00 dentro del rango visible
            xScale.afterBuildTicks = (scale) => {
                const ticks = [];
                for (let h = _minHour; h <= _maxHour; h++) ticks.push({ value: h * 60 });
                scale.ticks = ticks;
            };
        };


        // Finalizados
        if (chFinalizados) {
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
                document.getElementById("chart-finalizados")?.closest(".chart-card")?.classList.add("is-empty");
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
            document.getElementById("chart-finalizados")?.closest(".chart-card")?.classList.remove("is-empty");
            } // end else (has data)
        }

        // Recibidos (✅ igual que los demás: LINE SIEMPRE)
        // Recibidos (LINE SIEMPRE, pero SIN "estado raro" cuando no hay datos)
        if (chRecibidos) {
            chRecibidos.data.datasets[0].hidden = !VIS.volteo;
            chRecibidos.data.datasets[1].hidden = !VIS.plana;
            chRecibidos.data.datasets[2].hidden = !VIS.pipa;

            const recSrc = resumenJson?.Prechequeado ?? resumenJson?.EnTransito;
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
            // ✅ CASO: NO H hookup
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
                document.getElementById("chart-recibidos")?.closest(".chart-card")?.classList.add("is-empty");
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
            applyFixedHourRange(chRecibidos);

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
            document.getElementById("chart-recibidos")?.closest(".chart-card")?.classList.remove("is-empty");
            } // end else (has data)
        }

        // Cantidad Recibida (SCATTER)
        if (chAzucar) {
            // Usar el productFilter del fetch (no el DOM actual que puede estar desincronizado)
            const prodSel = productFilter !== undefined
                ? String(productFilter || "").trim()
                : String(DC.$("f-producto")?.value || "").trim();
            const wantsAll = !prodSel;

            const pts = azPack || { azucar: [], melaza: [], otros: [] };

            // Qué mostrar
            const kind = DC.normalizeProductKind(prodSel);
            const showAz = wantsAll || kind === "azucar";
            const showMe = wantsAll || kind === "melaza";

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
                chAzucar.data.datasets[0].data = [];
                chAzucar.data.datasets[1].data = [];
                chAzucar.data.datasets[2].data = [];
                
                if (chAzucar.options.scales?.x) chAzucar.options.scales.x.display = true;
                if (chAzucar.options.scales?.y) chAzucar.options.scales.y.display = true;

                const canvas = document.getElementById("chart-azucar");
                if (canvas) {
                    const scroll = canvas.closest(".chart-scroll");
                    const inner = scroll?.querySelector(".chart-inner");
                    if (scroll && inner) {
                        inner.style.width = (scroll.clientWidth || 0) + "px";
                        scroll.scrollLeft = 0;
                    }
                }

                chAzucar.update();
                document.getElementById("chart-azucar")?.closest(".chart-card")?.classList.add("is-empty");
            } else {

            if (chAzucar.options.scales?.x) chAzucar.options.scales.x.display = true;
            if (chAzucar.options.scales?.y) chAzucar.options.scales.y.display = true;

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
            document.getElementById("chart-azucar")?.closest(".chart-card")?.classList.remove("is-empty");
            } // end else (has data)
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
                const yScale = chPromedio.options.scales.y;

                // Si no hay puntos: oculta escalas y limpia canvas
                if (!allPts.length) {
                    if (xScale) xScale.display = true;
                    if (yScale) yScale.display = true;
                    chPromedio.update();
                    return;
                } else {
                    if (xScale) xScale.display = true;
                    if (yScale) yScale.display = true;
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
            pendingSilent = pendingSilent && silent; // si ya había uno no-silent, mantenelo no-silent
            if (!silent) pendingSilent = false;
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
                fetchStatusPorFecha(filters),
                fetchPromediosAtencionPorFecha(filters),
                fetchPromedioDescargaPorHora(filters),
                wantsAll ? fetchRecibidoPorHora(filters) : fetchRecibidoPorHora(filters),
            ]);

            const labels = buildHourLabels(filters.hourFrom, filters.hourTo);

            const baseSeries = mapResumenPorFechaResponse(resumen, labels);
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
            updateKPIFlujoDiaFrom(pesos, filters);
            updateKPIsDescargaFrom(promDesc);
            // Pasar el producto capturado ANTES del fetch para evitar leer DOM obsoleto
            renderCharts(labels, baseSeries, azPack, promPack, resumen, filters.product);

        } catch (e) {
            console.error("[recepcion-hoy] error:", e);
        } finally {
            if (shouldShowLoader) loader.hide();
            firstLoadDone = true;
            inFlight = false;
            // ✅ Si durante el request alguien cambió filtros, corremos una vez más con los últimos valores
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
        // ✅ Si no hay fecha, usar hoy (YYYY-MM-DD)
        const fFecha = DC.$("f-fecha");
        if (fFecha && !String(fFecha.value || '').trim()) {
            const d = new Date();
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const dd = String(d.getDate()).padStart(2, '0');
            fFecha.value = `${y}-${m}-${dd}`;
        }

        // ✅ Poblar selects de hora (00..23) si están vacíos y forzar 00→23 al cargar
        const s1 = DC.$("f-hour-start");
        const s2 = DC.$("f-hour-end");
        if (s1 && s2 && s1.tagName === "SELECT" && s2.tagName === "SELECT") {
            const mkOpt = (h) => {
                const hh = String(h).padStart(2, "0");
                const o = document.createElement("option");
                o.value = `${hh}:00`;
                o.textContent = hh;
                return o;
            };

            // Solo si no tienen opciones aún
            if (s1.options.length === 0 && s2.options.length === 0) {
                for (let h = 0; h <= 23; h++) {
                    s1.appendChild(mkOpt(h));
                    s2.appendChild(mkOpt(h));
                }
            }

            // ✅ SIEMPRE que cargue la página: 00 → 23
            s1.value = "00:00";
            s2.value = "23:00";

            // asegurar rango válido (por si el user cambia)
            const clamp = () => {
                const a = Number((s1.value || "00:00").split(":")[0]);
                const b = Number((s2.value || "23:00").split(":")[0]);
                if (a > b) s2.value = s1.value;
            };
            s1.addEventListener("change", clamp);
            s2.addEventListener("change", clamp);
        }

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

        fetchAndRender({ silent: false });

        const silentRefresh = () => fetchAndRender({ silent: true });

        if (typeof DC.registerAutoRefresh === "function") {
            DC.registerAutoRefresh("historico-diario-horas", silentRefresh);
            if (typeof DC.startAutoRefresh === "function") DC.startAutoRefresh();
        } else {
            const REFRESH_MS = 10000;
            window.__hoyTimer && clearInterval(window.__hoyTimer);
            window.__hoyTimer = setInterval(silentRefresh, REFRESH_MS);
        }

    });

})(window.DashCore || window);
