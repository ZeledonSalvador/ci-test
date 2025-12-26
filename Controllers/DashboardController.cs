using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Newtonsoft.Json;
using FrontendQuickpass.Models.Configurations;

namespace FrontendQuickpass.Controllers
{
    public class DashboardController : Controller
    {
        private readonly IHttpClientFactory _httpFactory;
        private readonly ApiSettings _api;
        private readonly ILogger<DashboardController> _logger;

        public DashboardController(
            IHttpClientFactory httpFactory,
            IOptions<ApiSettings> apiOptions,
            ILogger<DashboardController> logger
        )
        {
            _httpFactory = httpFactory;
            _api = apiOptions.Value;
            _logger = logger;
        }

        // Vista
        [HttpGet("/Dashboard")]
        public IActionResult Recepcion() => View();

        [HttpGet("/Dashboard/Recepcion")]
        public IActionResult Index() => View();

        [HttpGet("/Dashboard/tiempos-hoy-detalle")]
        public IActionResult Descarga() => View();

        // --- API ROUTES centralizadas ---
        private static class ApiRoutes
        {
            // Index (por fechas)
            public const string ResumenEstatus = "/dashboard/resumen-estatus";
            public const string PromediosAtencion = "/dashboard/promedios-atencion";
            public const string PromedioDescargaHist = "/dashboard/promedio-descarga-historico";
            public const string PesosPorStatus = "/dashboard/pesos-por-status";

            // Recepción (día actual por horas)
            public const string ResumenHoy = "/dashboard/resumen-hoy";
            public const string PromediosAtencionHoy = "/dashboard/promedios-atencion-hoy";
            public const string PromedioDescargaHoy = "/dashboard/promedio-descarga-hoy";
            public const string PesosPorStatusHoy = "/dashboard/pesos-por-status-hoy";
        }

        // ============================
        //  /dashboard/summary
        // ============================
        [HttpGet("/dashboard/summary")]
        public async Task<IActionResult> Summary(
            [FromQuery] string from,
            [FromQuery] string to,
            [FromQuery] string ingenio,
            [FromQuery] string product,
            [FromQuery] int? hourFrom,   // 0..23
            [FromQuery] int? hourTo,     // 0..23 (>= hourFrom)
            [FromQuery] string horaDesde,   // "HH:mm" (opcional)
            [FromQuery] string horaHasta,   // "HH:mm" (opcional)
            [FromQuery] int debug = 0
        )

        {
            try
            {
                // ===== 1) Construir rango o decidir set de endpoints =====
                string productId = (product ?? "").Trim();
                string ingenioId = (ingenio ?? "").Trim();

                // ¿Recepción (por horas del día actual) o Index (por fechas)?
                bool useRecepcion = hourFrom.HasValue || hourTo.HasValue;

                // Si es Index (por fechas), calcula start/end por día completo como antes
                string startIso = null, endIso = null;
                if (!useRecepcion)
                {
                    DateTime dFrom = ParseDateOrToday(from);
                    DateTime dTo = string.IsNullOrWhiteSpace(to) ? dFrom : ParseDateOrToday(to);
                    if (dTo < dFrom) dTo = dFrom;

                    startIso = dFrom.ToString("yyyy-MM-dd'T'00:00:00", CultureInfo.InvariantCulture);
                    endIso = dTo.AddDays(1).ToString("yyyy-MM-dd'T'00:00:00", CultureInfo.InvariantCulture);
                }

                // Normaliza horas para Recepción
                int hf = Math.Max(0, Math.Min(23, hourFrom ?? 0));
                int ht = Math.Max(0, Math.Min(23, hourTo ?? 23));
                if (ht < hf) ht = hf;

                // ===== 2) Llamadas paralelas a los 4 endpoints, según modo =====
                Task<HttpResponseMessage> tResumen, tProm, tDesc, tPesos;

                if (useRecepcion)
                {
                    // --- RECEPCIÓN: usar endpoints *-hoy* ---
                    var qsResumenHoy = $"?hourFrom={hf}&hourTo={ht}"
                        + Opt(productId, "product")
                        + Opt(ingenioId, "ingenioId");

                    var qsPromHoy = $"?hourFrom={hf}&hourTo={ht}"
                        + Opt(productId, "product")
                        + Opt(ingenioId, "ingenioId");

                    var qsDescHoy = $"?hStart={hf}&hEnd={ht}"
                        + Opt(productId, "product")
                        + Opt(ingenioId, "ingenioId");

                    var qsPesosHoy = $"?hStart={hf}&hEnd={ht}"
                        + Opt(productId, "product")
                        + Opt(ingenioId, "ingenioId");

                    tResumen = ApiGet($"/dashboard/resumen-hoy{qsResumenHoy}");
                    tProm = ApiGet($"/dashboard/promedios-atencion-hoy{qsPromHoy}");
                    tDesc = ApiGet($"/dashboard/promedio-descarga-hoy{qsDescHoy}");
                    tPesos = ApiGet($"/dashboard/pesos-por-status-hoy{qsPesosHoy}");
                }
                else
                {
                    // --- INDEX: usar endpoints por fechas ---
                    tResumen = ApiGet($"/dashboard/resumen-estatus?start={Uri.EscapeDataString(startIso)}&end={Uri.EscapeDataString(endIso)}{Opt(productId, "product")}{Opt(ingenioId, "ingenioId")}");
                    tProm = ApiGet($"/dashboard/promedios-atencion?start={Uri.EscapeDataString(startIso)}&end={Uri.EscapeDataString(endIso)}{Opt(productId, "product")}{Opt(ingenioId, "ingenioId")}");
                    tDesc = ApiGet($"/dashboard/promedio-descarga-historico?start={Uri.EscapeDataString(startIso)}&end={Uri.EscapeDataString(endIso)}{Opt(productId, "product")}{Opt(ingenioId, "ingenioId")}");
                    tPesos = ApiGet($"/dashboard/pesos-por-status?start={Uri.EscapeDataString(startIso)}&end={Uri.EscapeDataString(endIso)}{Opt(productId, "product")}{Opt(ingenioId, "ingenioId")}&minStatus=9");
                }

                await Task.WhenAll(tResumen, tProm, tDesc, tPesos);

                // ===== 3) HTTP responses =====
                var rResumen = await tResumen;
                var rProm = await tProm;
                var rDesc = await tDesc;
                var rPesos = await tPesos;

                var rawResumen = rResumen.IsSuccessStatusCode ? await rResumen.Content.ReadAsStringAsync() : null;
                var rawProm = rProm.IsSuccessStatusCode ? await rProm.Content.ReadAsStringAsync() : null;
                var rawDesc = rDesc.IsSuccessStatusCode ? await rDesc.Content.ReadAsStringAsync() : null;
                var rawPesos = rPesos.IsSuccessStatusCode ? await rPesos.Content.ReadAsStringAsync() : null;

                // ===== 4) Deserialización (v1 y v2) =====
                var resumen = SafeDeserialize<ResumenEstatusApi>(rawResumen);   // LEGADO
                var resumenV2 = SafeDeserialize<ResumenEstatusV2>(rawResumen);    // NUEVO (Rows)
                var prom = SafeDeserialize<PromediosAtencionApi>(rawProm);   // LEGADO promedios
                var promV3 = SafeDeserialize<PromediosAtencionV3>(rawProm);    // NUEVO promedios
                var desc = SafeDeserialize<PromDescargaHistApi>(rawDesc);
                var pesos = SafeDeserialize<PesosPorStatusApi>(rawPesos);

                // ===== 5) Labels y series =====
                List<string> labels;
                Series2WithTotalDto finSeries;
                Series2WithTotalDto recSeries;

                if (resumenV2?.Rows?.Any() == true)
                {
                    if (useRecepcion)
                    {
                        // labels del rango (0..23 o el rango enviado)
                        labels = BuildHourLabelsFromRange(hourFrom, hourTo);

                        // series por HORA comparando contra el campo "hora" del JSON
                        finSeries = BuildSeriesFromRowsV2ByHora(resumenV2.Rows, labels, 12); // Finalizados
                        recSeries = BuildSeriesFromRowsV2ByHora(resumenV2.Rows, labels, 2);  // Recibidos
                    }
                    else
                    {
                        // flujo normal por FECHA para Index/Histórico
                        labels = BuildLabelsFromRowsV2(resumenV2.Rows);
                        finSeries = BuildSeriesFromRowsV2(resumenV2.Rows, labels, 12);
                        recSeries = BuildSeriesFromRowsV2(resumenV2.Rows, labels, 2);
                    }
                }
                else
                {
                    labels = BuildLabels(resumen, desc, pesos);

                    // === Finalizados (12) ===
                    var finVol = MapTruckType(resumen?.Finalizado?.Dias, labels, v => v.Volteo);
                    var finPla = MapTruckType(resumen?.Finalizado?.Dias, labels, v => v.Planas);
                    var finPip = MapTruckType(resumen?.Finalizado?.Dias, labels, v => v.Pipa);

                    // === Recibidos (2) ===  → usar PRECHEQUEADO como en V2
                    var recVol = MapTruckType(resumen?.Prechequeado?.Dias, labels, v => v.Volteo);
                    var recPla = MapTruckType(resumen?.Prechequeado?.Dias, labels, v => v.Planas);
                    var recPip = MapTruckType(resumen?.Prechequeado?.Dias, labels, v => v.Pipa);

                    finSeries = new Series2WithTotalDto
                    {
                        volteo = finVol,
                        plana = finPla,
                        pipa = finPip,
                        total = SumLists(finVol, finPla, finPip)
                    };

                    recSeries = new Series2WithTotalDto
                    {
                        volteo = recVol,
                        plana = recPla,
                        pipa = recPip,
                        total = SumLists(recVol, recPla, recPip)
                    };
                }

                // ===== 6) Azúcar y promedios (alineados a labels) =====
                List<decimal> azucarTon;
                SeriesTonProductoDto tonPorProd;

                if (useRecepcion)
                {
                    // Por horas
                    azucarTon = MapPesosTonHoras(pesos?.PesosPorStatus?.Horas, labels);
                    tonPorProd = new SeriesTonProductoDto
                    {
                        azucar = new List<decimal>(labels.Count), // 0 si no hay por-product en Horas
                        melaza = new List<decimal>(labels.Count)
                    };
                }
                else
                {
                    // Por fechas
                    azucarTon = MapPesosTon(pesos?.PesosPorStatus?.Dias, labels);
                    tonPorProd = MapPesosTonPorProducto(pesos?.PesosPorStatus?.Dias, labels);
                }

                // NUMÉRICO (segundos) para la gráfica
                var promVolMin = MapDescargaMinutes(desc?.PromedioDescarga?.Dias, labels, t => t.Volteo);
                var promPlaMin = MapDescargaMinutes(desc?.PromedioDescarga?.Dias, labels, t => t.Planas);
                var promPipaMin = MapDescargaMinutes(desc?.PromedioDescarga?.Dias, labels, t => t.Pipa);

                // TEXTO "HH:MM:SS"
                var promVolTxt = MapDescargaRaw(desc?.PromedioDescarga?.Dias, labels, t => t.Volteo);
                var promPlaTxt = MapDescargaRaw(desc?.PromedioDescarga?.Dias, labels, t => t.Planas);
                var promPipaTxt = MapDescargaRaw(desc?.PromedioDescarga?.Dias, labels, t => t.Pipa);

                // ===== 7) KPIs =====
                double esperaSeg = promV3?.PromedioEspera?.Global?.PromedioSeg ?? (prom?.PromedioEspera?.Global?.PromedioSeg ?? 0);
                double atencionSeg = promV3?.PromedioAtencion?.Global?.PromedioSeg ?? (prom?.PromedioAtencion?.Global?.PromedioSeg ?? 0);

                // NUEVO: promedio global de cantidad (kg) desde V3
                double cantPromEspera = promV3?.PromedioEspera?.Global?.CantidadPromedio ?? 0;
                double cantPromAtencion = promV3?.PromedioAtencion?.Global?.CantidadPromedio ?? 0;

                var kpi = new KpiDto
                {
                    enTransito = resumenV2?.Estatus?.EnTransito ?? (resumen?.EnTransito?.Total ?? 0),
                    enParqueo = resumenV2?.Estatus?.EnParqueo ?? (resumen?.Prechequeado?.Total ?? 0),
                    autorizados = resumenV2?.Estatus?.Autorizado ?? (resumen?.Autorizado?.Total ?? 0),

                    // KPI de tiempos en MINUTOS (redondeo estándar)
                    tiempoEsperaMin = SecondsToMinutes((int)Math.Round(esperaSeg)),
                    tiempoAtencionMin = SecondsToMinutes((int)Math.Round(atencionSeg)),

                    flujoPorDiaTon = CalcAvg(azucarTon),

                    // Promedios de descarga (para cards)
                    promDescargaPlanasSeg = AvgHHMMSSText(promPlaTxt),
                    promDescargaVolteoSeg = AvgHHMMSSText(promVolTxt),
                    promDescargaPipaSeg = AvgHHMMSSText(promPipaTxt),

                    cantPromEsperaKg = (decimal)Math.Round(cantPromEspera, 2),
                    cantPromAtencionKg = (decimal)Math.Round(cantPromAtencion, 2)
                };

                var dto = new DashboardSummaryDto
                {
                    kpi = kpi,
                    charts = new ChartsDto
                    {
                        fechas = labels,
                        finalizados = finSeries,
                        recibidos = recSeries,
                        azucarRecibidaTon = azucarTon,
                        toneladasPorProducto = tonPorProd,

                        // NUMÉRICO (minutos)
                        promedioDescarga = new Series2Dto
                        {
                            volteo = promVolMin,
                            plana = promPlaMin,
                            pipa = promPipaMin
                        },
                        // TEXTO "HH:MM:SS"
                        promedioDescargaTxt = new Series2TextDto
                        {
                            volteo = promVolTxt,
                            plana = promPlaTxt,
                            pipa = promPipaTxt
                        },

                        meta = new AxisMeta
                        {
                            xTitle = useRecepcion ? "Hora" : "Fecha",
                            yTitleFinalizados = "Cantidad",
                            yTitleRecibidos = "Cantidad",
                            yTitleAzucar = "Toneladas",
                            yTitlePromedioDescarga = "Minutos"
                        }
                    }
                };

                // ===== 8) DEBUG opcional =====
                if (debug > 0)
                {
                    var meta = new
                    {
                        mode = useRecepcion ? "recepcion-hoy" : "index-por-fechas",
                        called = new[]
                        {
                            new { name="resumen",           url = rResumen.RequestMessage?.RequestUri?.ToString(),           status = (int)rResumen.StatusCode },
                            new { name="promedios",         url = rProm.RequestMessage?.RequestUri?.ToString(),              status = (int)rProm.StatusCode },
                            new { name="promedio-descarga", url = rDesc.RequestMessage?.RequestUri?.ToString(),              status = (int)rDesc.StatusCode },
                            new { name="pesos-por-status",  url = rPesos.RequestMessage?.RequestUri?.ToString(),             status = (int)rPesos.StatusCode }
                        },
                        labelsCount = labels.Count,
                        usedRowsV2 = resumenV2?.Rows?.Any() == true,
                        rango = useRecepcion ? null : new { Start = startIso, End = endIso },
                        hourFrom = useRecepcion ? hf : (int?)null,
                        hourTo = useRecepcion ? ht : (int?)null
                    };

                    if (debug >= 2)
                    {
                        var responses = new
                        {
                            resumen_estatus = SafeDeserialize<object>(rawResumen),
                            promedios_atencion = SafeDeserialize<object>(rawProm),
                            promedio_descarga = SafeDeserialize<object>(rawDesc),
                            pesos_por_status = SafeDeserialize<object>(rawPesos)
                        };
                        return Json(new { ok = true, dto, debug = new { meta, responses } });
                    }
                    return Json(new { ok = true, dto, debug = new { meta } });
                }

                return Json(dto);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error en /dashboard/summary");
                return Json(DashboardSummaryDto.Empty());
            }
        }

        // ============================================================
        //  NUEVO: /api/dashboard/tiempos-hoy-detalle  (proxy directo)
        //  Ejemplo: /api/dashboard/tiempos-hoy-detalle?hStart=6&hEnd=18&product=AZ-001&ingenioId=123
        // ============================================================
        // Acepta ambas URLs para evitar 404 por rutas relativas
        [HttpGet("/api/dashboard/tiempos-hoy-detalle")]
        [HttpGet("/Dashboard/api/dashboard/tiempos-hoy-detalle")] // alias de compatibilidad
        public async Task<IActionResult> TiemposHoyDetalle(
            [FromQuery] int hStart = 0,
            [FromQuery] int hEnd = 23,
            [FromQuery] string? product = null,
            [FromQuery] string? ingenioId = null
        )
        {
            try
            {
                var hs = Math.Max(0, Math.Min(23, hStart));
                var he = Math.Max(0, Math.Min(23, hEnd));
                if (he < hs) he = hs;

                var qs = $"?hStart={hs}&hEnd={he}"
                       + Opt(product ?? string.Empty, "product")
                       + Opt(ingenioId ?? string.Empty, "ingenioId");

                var res = await ApiGet($"/dashboard/tiempos-hoy-detalle{qs}");

                if (!res.IsSuccessStatusCode)
                {
                    _logger.LogWarning("tiempos-hoy-detalle backend -> {Status}", res.StatusCode);
                    return Json(Array.Empty<object>()); // 200 OK con []
                }

                var json = await res.Content.ReadAsStringAsync();
                return Content(json, "application/json");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error en /api/dashboard/tiempos-hoy-detalle");
                return Json(Array.Empty<object>());
            }
        }

        public class TiempoDetalleRow
        {
            public string placa { get; set; } = "";
            public string producto { get; set; } = "";
            public string truckType { get; set; } = "";
            public decimal minutosTransito { get; set; }
            public decimal minutosEspera { get; set; }
            public decimal minutosDescarga { get; set; }
            public decimal totalKg { get; set; }
            public DateTime? fecha { get; set; }
        }

        [HttpGet("api/dashboard/tiempos-hoy-detalle/normalizado")]
        public async Task<IActionResult> TiemposHoyDetalleNormalizado(
            [FromQuery] int hStart = 0,
            [FromQuery] int hEnd = 23,
            [FromQuery] string? product = null,
            [FromQuery] string? ingenioId = null
        )
        {
            try
            {
                var hs = Math.Max(0, Math.Min(23, hStart));
                var he = Math.Max(0, Math.Min(23, hEnd));
                if (he < hs) he = hs;

                var qs = $"?hStart={hs}&hEnd={he}"
                       + Opt(product ?? string.Empty, "product")
                       + Opt(ingenioId ?? string.Empty, "ingenioId");

                var res = await ApiGet($"/dashboard/tiempos-hoy-detalle{qs}");

                // NO PROPAGAR 401/403 AL CLIENTE
                if (!res.IsSuccessStatusCode)
                {
                    _logger.LogWarning("tiempos-hoy-detalle (norm) backend -> {Status}", res.StatusCode);
                    return Json(Array.Empty<TiempoDetalleRow>());
                }

                var raw = await res.Content.ReadAsStringAsync();
                var dyn = SafeDeserialize<List<Dictionary<string, object>>>(raw) ?? new();

                string S(object? o) => o?.ToString() ?? "";
                decimal D(object? o)
                {
                    if (o == null) return 0m;
                    if (o is decimal dm) return dm;
                    if (o is double db) return (decimal)db;
                    if (o is long lg) return lg;
                    if (o is int it) return it;
                    return decimal.TryParse(o.ToString(), out var z) ? z : 0m;
                }
                DateTime? DT(object? o)
                {
                    if (o == null) return null;
                    if (o is DateTime dt) return dt;
                    return DateTime.TryParse(o.ToString(), out var p) ? p : (DateTime?)null;
                }
                decimal ToMin(object? o)
                {
                    if (o == null) return 0m;
                    var s = o.ToString() ?? "";
                    if (TimeSpan.TryParse(s, out var ts)) return (decimal)ts.TotalMinutes;
                    if (decimal.TryParse(s, out var dec)) return dec >= 360 ? Math.Round(dec / 60m, 2) : dec;
                    return 0m;
                }

                string Find(Dictionary<string, object> r, params string[] keys)
                    => keys.Select(k => r.ContainsKey(k) ? S(r[k]) : null).FirstOrDefault(v => !string.IsNullOrWhiteSpace(v)) ?? "";
                object? FindObj(Dictionary<string, object> r, params string[] keys)
                    => keys.Select(k => r.ContainsKey(k) ? r[k] : null).FirstOrDefault(v => v != null);

                var list = new List<TiempoDetalleRow>();
                foreach (var r in dyn)
                {
                    var row = new TiempoDetalleRow
                    {
                        placa = Find(r, "placa", "Placa", "PLACA", "license", "Plate"),
                        producto = Find(r, "producto", "Producto", "product", "Product"),
                        truckType = Find(r, "truckType", "truck_type", "tipo", "Tipo", "TipoDescarga"),
                        minutosTransito = ToMin(FindObj(r, "minutosTransito", "TransitoMin", "transito", "Transito", "TransitoSeg", "TransitoHHMMSS")),
                        minutosEspera = ToMin(FindObj(r, "minutosEspera", "EsperaMin", "espera", "Espera", "EsperaSeg", "EsperaHHMMSS")),
                        minutosDescarga = ToMin(FindObj(r, "minutosDescarga", "DescargaMin", "descarga", "Descarga", "DescargaSeg", "DescargaHHMMSS")),
                        totalKg = D(FindObj(r, "totalKg", "TotalKg", "kg", "Kg", "cantidadKg", "CantidadKg", "pesoKg", "PesoKg")),
                        fecha = DT(FindObj(r, "fecha", "Fecha", "timestamp", "Timestamp"))
                    };
                    if (row.totalKg <= 0)
                    {
                        var ton = D(FindObj(r, "ton", "Ton", "toneladas", "Toneladas"));
                        if (ton > 0) row.totalKg = ton * 1000m;
                    }
                    list.Add(row);
                }

                return Json(list);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error normalizando /api/dashboard/tiempos-hoy-detalle");
                return Json(Array.Empty<TiempoDetalleRow>());
            }
        }
        // /dashboard/resumen-hoy?hourFrom=&hourTo=&product=&ingenioId=
        [HttpGet("/dashboard/resumen-hoy")]
        public Task<IActionResult> ResumenHoy(
            [FromQuery] int hourFrom = 0,
            [FromQuery] int hourTo = 23,
            [FromQuery] string? product = null,
            [FromQuery] string? ingenioId = null
        ) => ProxyGetRaw(ApiRoutes.ResumenHoy,
                ("hourFrom", hourFrom.ToString()),
                ("hourTo", hourTo.ToString()),
                ("product", product),
                ("ingenioId", ingenioId));

        // /dashboard/promedios-atencion-hoy?hourFrom=&hourTo=&product=&ingenioId=
        [HttpGet("/dashboard/promedios-atencion-hoy")]
        public Task<IActionResult> PromediosAtencionHoy(
            [FromQuery] int hourFrom = 0,
            [FromQuery] int hourTo = 23,
            [FromQuery] string? product = null,
            [FromQuery] string? ingenioId = null
        ) => ProxyGetRaw(ApiRoutes.PromediosAtencionHoy,
                ("hourFrom", hourFrom.ToString()),
                ("hourTo", hourTo.ToString()),
                ("product", product),
                ("ingenioId", ingenioId));

        // /dashboard/promedio-descarga-hoy?hStart=&hEnd=&product=&ingenioId=
        [HttpGet("/dashboard/promedio-descarga-hoy")]
        public Task<IActionResult> PromedioDescargaHoy(
            [FromQuery] int hStart = 0,
            [FromQuery] int hEnd = 23,
            [FromQuery] string? product = null,
            [FromQuery] string? ingenioId = null
        ) => ProxyGetRaw(ApiRoutes.PromedioDescargaHoy,
                ("hStart", hStart.ToString()),
                ("hEnd", hEnd.ToString()),
                ("product", product),
                ("ingenioId", ingenioId));

        // /dashboard/pesos-por-status-hoy?hStart=&hEnd=&product=&ingenioId=
        [HttpGet("/dashboard/pesos-por-status-hoy")]
        public Task<IActionResult> PesosPorStatusHoy(
            [FromQuery] int hStart = 0,
            [FromQuery] int hEnd = 23,
            [FromQuery] string? product = null,
            [FromQuery] string? ingenioId = null
        ) => ProxyGetRaw(ApiRoutes.PesosPorStatusHoy,
                ("hStart", hStart.ToString()),
                ("hEnd", hEnd.ToString()),
                ("product", product),
                ("ingenioId", ingenioId));


        // ============================
        // Helpers de deserialización
        // ============================
        private static T? SafeDeserialize<T>(string? json)
        {
            if (string.IsNullOrWhiteSpace(json)) return default;
            try { return JsonConvert.DeserializeObject<T>(json); }
            catch { return default; }
        }

        // ============================
        // Helpers HTTP
        // ============================
        private HttpClient CreateApiClient()
        {
            var client = _httpFactory.CreateClient();
            client.BaseAddress = new Uri(_api.BaseUrl!.TrimEnd('/') + "/");
            if (!string.IsNullOrWhiteSpace(_api.Token))
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _api.Token);
            return client;
        }

        private Task<HttpResponseMessage> ApiGet(string relative)
        {
            var http = CreateApiClient();

            var rel = (relative ?? "").Trim();
            if (rel.StartsWith("/")) rel = rel.Substring(1);
            if (rel.StartsWith("api/", StringComparison.OrdinalIgnoreCase))
                rel = rel.Substring(4);

            var baseHasApi = http.BaseAddress!.AbsolutePath.TrimEnd('/').EndsWith("/api", StringComparison.OrdinalIgnoreCase);
            var finalPath = (baseHasApi ? "" : "api/") + rel;

            _logger.LogInformation("→ GET {Base}{Rel}", http.BaseAddress, finalPath);
            return http.GetAsync(finalPath);
        }

        private static string Opt(string value, string key) => string.IsNullOrWhiteSpace(value) ? "" : $"&{key}={Uri.EscapeDataString(value)}";

        private static async Task<T?> ReadJsonOrNull<T>(HttpResponseMessage res)
        {
            if (res == null || !res.IsSuccessStatusCode) return default;
            var json = await res.Content.ReadAsStringAsync();
            try { return JsonConvert.DeserializeObject<T>(json); }
            catch { return default; }
        }

        private static DateTime ParseDateOrToday(string s) => DateTime.TryParse(s, out var d) ? d.Date : DateTime.Today;

        // ============================
        // Helpers 
        // ============================

        private static List<string> BuildLabels(ResumenEstatusApi? r, PromDescargaHistApi? d, PesosPorStatusApi? p)
        {
            var fmt = "dd-MM-yy";
            var all = new HashSet<string>(StringComparer.Ordinal);
            void add(IEnumerable<string>? xs)
            {
                if (xs == null) return;
                foreach (var s in xs) if (!string.IsNullOrWhiteSpace(s)) all.Add(s);
            }

            add(r?.Finalizado?.Dias?.Select(z => z.Fecha));
            add(r?.EnProceso?.Dias?.Select(z => z.Fecha));
            add(d?.PromedioDescarga?.Dias?.Select(z => z.Fecha));
            add(p?.PesosPorStatus?.Dias?.Select(z => z.Fecha));

            return all
                .Select(s => (s, dt: DateTime.TryParseExact(s, fmt, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dd) ? dd : (DateTime?)null))
                .OrderBy(x => x.dt ?? DateTime.MaxValue)
                .ThenBy(x => x.s, StringComparer.Ordinal)
                .Select(x => x.s)
                .ToList();
        }

        // === Helpers para proxy JSON crudo (reutiliza tu ApiGet) ===
        private async Task<IActionResult> ProxyGetRaw(string path, params (string key, string? value)[] qs)
        {
            var query = string.Join("", qs
                .Where(p => !string.IsNullOrWhiteSpace(p.value))
                .Select(p => $"&{p.key}={Uri.EscapeDataString(p.value!)}"));

            if (!string.IsNullOrEmpty(query))
                query = "?" + query.TrimStart('&');

            var res = await ApiGet($"{path}{query}");
            if (!res.IsSuccessStatusCode)
            {
                // Evita romper el frontend: responde JSON vacío compatible
                // Cambia a tu gusto si prefieres propagar el status code.
                return Content("{}", "application/json");
            }
            var json = await res.Content.ReadAsStringAsync();
            return Content(json, "application/json");
        }

        private static List<decimal> MapTruckType(List<ResDia>? dias, List<string> labels, Func<TruckTypeCounts, decimal> sel)
        {
            var map = new Dictionary<string, decimal>(StringComparer.Ordinal);
            if (dias != null)
            {
                foreach (var d in dias)
                {
                    var v = d?.TruckType != null ? sel(d.TruckType) : 0m;
                    map[d?.Fecha ?? ""] = v;
                }
            }
            return labels.Select(l => map.TryGetValue(l, out var v) ? v : 0m).ToList();
        }

        private static List<decimal> MapPesosTon(List<PesoDia>? dias, List<string> labels)
        {
            var map = new Dictionary<string, decimal>(StringComparer.Ordinal);
            if (dias != null)
            {
                foreach (var d in dias)
                {
                    var kg = Convert.ToDecimal(d.TotalKg);
                    if (map.TryGetValue(d.Fecha, out var cur)) map[d.Fecha] = cur + kg;
                    else map[d.Fecha] = kg;
                }
            }
            return labels.Select(l => map.TryGetValue(l, out var v) ? v : 0m).ToList();
        }

        // Alinea PesosPorStatus.Horas a las labels "HH:00" del eje X
        List<decimal> MapPesosTonHoras(List<PesoHora>? horas, List<string> labels)
        {
            var map = new Dictionary<string, decimal>(StringComparer.OrdinalIgnoreCase);

            if (horas != null)
            {
                foreach (var h in horas)
                {
                    var key = NormalizeHourLabel(h.Hora);
                    if (key == null) continue;
                    map[key] = Convert.ToDecimal(h.TotalKg);
                }
            }

            return labels.Select(l => map.TryGetValue(l, out var v) ? v : 0m).ToList();
        }

        private static List<decimal> MapDescargaMinutes(
            List<PromDescDia>? dias,
            List<string> labels,
            Func<TruckTypeTimes, string> sel)
        {
            var map = new Dictionary<string, decimal>(StringComparer.Ordinal);
            if (dias != null)
            {
                foreach (var d in dias)
                {
                    var s = sel(d.TruckType) ?? "0";
                    var secs = HHMMSSToSecondsSafe(s);
                    var mins = SecondsToMinutes(secs);
                    map[d.Fecha] = mins;
                }
            }
            return labels.Select(l => map.TryGetValue(l, out var v) ? v : 0m).ToList();
        }

        private static List<decimal> MapDescargaSeconds(List<PromDescDia>? dias, List<string> labels, Func<TruckTypeTimes, string> sel)
        {
            var map = new Dictionary<string, decimal>(StringComparer.Ordinal);
            if (dias != null)
            {
                foreach (var d in dias)
                {
                    var s = sel(d.TruckType) ?? "0";
                    var secs = HHMMSSToSecondsSafe(s);
                    map[d.Fecha] = secs;
                }
            }
            return labels.Select(l => map.TryGetValue(l, out var v) ? v : 0m).ToList();
        }

        private static List<string> MapDescargaRaw(List<PromDescDia>? dias, List<string> labels, Func<TruckTypeTimes, string> sel)
        {
            var map = new Dictionary<string, string>(StringComparer.Ordinal);
            if (dias != null)
            {
                foreach (var d in dias)
                {
                    var s = sel(d.TruckType);
                    var val = string.IsNullOrWhiteSpace(s) || s == "0" ? "00:00:00" : s;
                    map[d.Fecha] = val;
                }
            }
            return labels.Select(l => map.TryGetValue(l, out var v) ? v : "00:00:00").ToList();
        }

        private static string NormalizeProduct(string s)
        {
            var u = (s ?? "").Trim().ToUpperInvariant();
            if (u == "AZ-001" || u.Contains("AZUC")) return "azucar";
            if (u == "MEL-001" || u.Contains("MELAZ")) return "melaza";
            return "otros";
        }

        public class SeriesTonProductoDto
        {
            public List<decimal> azucar { get; set; } = new();
            public List<decimal> melaza { get; set; } = new();
        }

        private static SeriesTonProductoDto MapPesosTonPorProducto(List<PesoDia>? dias, List<string> labels)
        {
            var A = new Dictionary<string, decimal>(StringComparer.Ordinal);
            var M = new Dictionary<string, decimal>(StringComparer.Ordinal);
            var O = new Dictionary<string, decimal>(StringComparer.Ordinal);

            if (dias != null)
            {
                foreach (var d in dias)
                {
                    var key = d.Fecha ?? "";
                    var kg = Convert.ToDecimal(d.TotalKg);
                    var kind = NormalizeProduct(d.Product);
                    if (kind == "azucar") A[key] = (A.TryGetValue(key, out var v) ? v : 0m) + kg;
                    else if (kind == "melaza") M[key] = (M.TryGetValue(key, out var v2) ? v2 : 0m) + kg;
                    else O[key] = (O.TryGetValue(key, out var v3) ? v3 : 0m) + kg;
                }
            }

            return new SeriesTonProductoDto
            {
                azucar = labels.Select(l => A.TryGetValue(l, out var v) ? v : 0m).ToList(),
                melaza = labels.Select(l => M.TryGetValue(l, out var v) ? v : 0m).ToList(),
                //otros = labels.Select(l => O.TryGetValue(l, out var v) ? v : 0m).ToList(),
            };
        }

        private static int AvgHHMMSSText(List<string> xs)
        {
            var secs = xs.Select(HHMMSSToSecondsSafe).Where(v => v > 0).ToList();
            if (secs.Count == 0) return 0;
            return (int)Math.Round(secs.Average());
        }

        private static List<decimal> SumLists(params List<decimal>[] lists)
        {
            var max = lists.Any() ? lists.Max(x => x.Count) : 0;
            var res = Enumerable.Repeat(0m, max).ToList();
            foreach (var l in lists)
                for (int i = 0; i < max; i++)
                    res[i] += i < l.Count ? l[i] : 0m;
            return res;
        }

        private static int HHMMSSToSecondsSafe(string? hhmmss)
        {
            if (string.IsNullOrWhiteSpace(hhmmss) || hhmmss == "0") return 0;
            var parts = hhmmss.Split(':');
            if (parts.Length != 3) return 0;
            if (int.TryParse(parts[0], out var h) &&
                int.TryParse(parts[1], out var m) &&
                int.TryParse(parts[2], out var s))
                return Math.Max(0, h * 3600 + m * 60 + s);
            return 0;
        }

        private static int SecondsToMinutes(int s) => (int)Math.Round(Math.Max(0, s) / 60.0, MidpointRounding.AwayFromZero);
        private static decimal CalcAvg(List<decimal> xs) => xs.Count == 0 ? 0m : Math.Round(xs.Average(), 2);
        private static int AvgSeconds(List<decimal> xs)
        {
            if (xs == null || xs.Count == 0) return 0;
            var nonZero = xs.Where(v => v > 0).ToList();
            if (nonZero.Count == 0) return 0;
            return (int)Math.Round(nonZero.Average(v => (double)v));
        }

        // ============================
        // DTOs de entrada (API LEGADO)
        // ============================
        class ResumenEstatusApi
        {
            public SectionApi EnTransito { get; set; }
            public SectionApi Prechequeado { get; set; }
            public SectionApi Autorizado { get; set; }
            public SectionApi EnProceso { get; set; }
            public SectionApi Finalizado { get; set; }
            public SectionApi EnEnfriamiento { get; set; }
        }
        class SectionApi
        {
            public int? Total { get; set; }
            public List<ResDia> Dias { get; set; }
        }
        class ResDia
        {
            public string Fecha { get; set; }  // "dd-MM-yy"
            public int? Total { get; set; }
            public TruckTypeCounts TruckType { get; set; }
        }
        class TruckTypeCounts
        {
            public decimal Planas { get; set; }
            public decimal Volteo { get; set; }
            public decimal Pipa { get; set; }
            public decimal Otro { get; set; }
        }

        class PromediosAtencionApi
        {
            public PromoGroup PromedioEspera { get; set; }
            public PromoGroup PromedioAtencion { get; set; }
        }
        class PromoGroup
        {
            public PromoGlobal Global { get; set; }
            public List<PromoDia> Dias { get; set; }
        }
        class PromoGlobal
        {
            [JsonProperty("total_pares")] public int TotalPares { get; set; }
            [JsonProperty("promedio_seg")] public double PromedioSeg { get; set; }
            [JsonProperty("promedio_hhmmss")] public string PromedioHHMMSS { get; set; }
        }
        class PromoDia
        {
            public string fecha { get; set; }
            public int cantidad { get; set; }
            [JsonProperty("promedio_seg")] public double PromedioSeg { get; set; }
            [JsonProperty("promedio_hhmmss")] public string PromedioHHMMSS { get; set; }
        }

        class PromDescargaHistApi
        {
            public PromDescSection PromedioDescarga { get; set; }
        }
        class PromDescSection
        {
            public int Total { get; set; }
            public List<PromDescDia> Dias { get; set; }
        }
        class PromDescDia
        {
            public string Fecha { get; set; } // "dd-MM-yy"
            public int Total { get; set; }
            public TruckTypeTimes TruckType { get; set; }
        }
        class TruckTypeTimes
        {
            public string Planas { get; set; }
            public string Volteo { get; set; }
            public string Pipa { get; set; }
        }

        class PesosPorStatusApi
        {
            public PesosSection PesosPorStatus { get; set; }
        }

        class PesosSection
        {
            public int TotalRegistros { get; set; }
            public double TotalKg { get; set; }

            // Histórico por día
            public List<PesoDia> Dias { get; set; }

            // Día actual por hora
            public List<PesoHora> Horas { get; set; }
        }

        class PesoDia
        {
            public string Fecha { get; set; } // "dd-MM-yy"
            public int TotalRegistros { get; set; }
            public double TotalKg { get; set; }
            public string Product { get; set; }  // por producto
        }

        // Coincide con JSON ("Hora": "HH:00")
        class PesoHora
        {
            public string Hora { get; set; }           // "HH:00"
            public int TotalRegistros { get; set; }
            public double TotalKg { get; set; }
        }

        // ============================
        // DTOs de entrada (API NUEVO Rows)
        // ============================
        class ResumenEstatusV2
        {
            public string Producto { get; set; }
            public string Ingenio { get; set; }
            public RangoV2 Rango { get; set; }
            public EstatusV2 Estatus { get; set; }
            public List<RowV2> Rows { get; set; } = new();
        }
        class RangoV2
        {
            public DateTime Start { get; set; }
            public DateTime End { get; set; }
        }
        class EstatusV2
        {
            public int EnTransito { get; set; }
            public int Prechequeado { get; set; }
            public int Autorizado { get; set; }
            public int EnProceso { get; set; }
            public int Finalizado { get; set; }
            public int Pendiente { get; set; }
            public int Anulado { get; set; }
            public int EnEnfriamiento { get; set; }
            public int EnParqueo { get; set; }
        }
        class RowV2
        {
            [JsonProperty("fecha")] public DateTime Fecha { get; set; }
            [JsonProperty("hora")] public string Hora { get; set; }   // "HH:mm:ss" o "previos"
            [JsonProperty("ingenio_id")] public string IngenioId { get; set; }
            [JsonProperty("product")] public string Product { get; set; }
            [JsonProperty("truck_type")] public string TruckType { get; set; }    // "V"|"R"|"P"
            [JsonProperty("predefined_status_id")] public int PredefStatusId { get; set; } // 2 o 12
            [JsonProperty("current_status")] public int CurrentStatusId { get; set; } // fallback
            [JsonProperty("total")] public int Total { get; set; }
        }

        // ============================
        // Helpers NUEVOS para Rows v2
        // ============================
        private static string Label(DateTime dt) => dt.Date.ToString("dd-MM-yy", CultureInfo.InvariantCulture);

        private static string NormalizeTruckTypeV2(string t)
        {
            var u = (t ?? "").Trim().ToUpperInvariant();
            if (u == "V" || u == "VOLTEO" || u == "T") return "volteo";
            if (u == "R" || u == "PLANA" || u == "PLANAS") return "plana";
            if (u == "P" || u == "PIPA" || u == "PIPAS") return "pipa";
            return "otro";
        }

        private static List<string> BuildLabelsFromRowsV2(List<RowV2> rows)
        {
            return rows
                .Where(r => r.PredefStatusId == 2 || r.PredefStatusId == 12)
                .Select(r => r.Fecha.Date)
                .Distinct()
                .OrderBy(d => d)
                .Select(Label)
                .ToList();
        }

        private static Series2WithTotalDto BuildSeriesFromRowsV2(List<RowV2> rows, List<string> labels, int statusId)
        {
            var idx = labels.Select((l, i) => new { l, i }).ToDictionary(x => x.l, x => x.i, StringComparer.Ordinal);

            var serie = new Series2WithTotalDto
            {
                volteo = Enumerable.Repeat(0m, labels.Count).ToList(),
                plana = Enumerable.Repeat(0m, labels.Count).ToList(),
                pipa = Enumerable.Repeat(0m, labels.Count).ToList(),
                total = Enumerable.Repeat(0m, labels.Count).ToList()
            };

            foreach (var r in rows.Where(r => r.PredefStatusId == statusId))
            {
                var key = Label(r.Fecha);
                if (!idx.TryGetValue(key, out var i)) continue;

                var val = (decimal)r.Total;
                switch (NormalizeTruckTypeV2(r.TruckType))
                {
                    case "volteo": serie.volteo[i] += val; break;
                    case "plana": serie.plana[i] += val; break;
                    case "pipa": serie.pipa[i] += val; break;
                }
                serie.total[i] += val;
            }

            return serie;
        }

        // Labels de "HH:00" a partir del rango solicitado (si no mandas horas → 0..23)
        List<string> BuildHourLabelsFromRange(int? hourFrom, int? hourTo)
        {
            int hFrom = hourFrom ?? 0;
            int hTo = hourTo ?? 23;
            if (hTo < hFrom) hTo = hFrom;

            var labels = new List<string>(hTo - hFrom + 1);
            for (int h = hFrom; h <= hTo; h++) labels.Add($"{h:00}:00");
            return labels;
        }

        // Intenta leer HH de "HH:mm:ss" (o "HH:mm")
        int? TryParseHourFromHora(string hora)
        {
            if (string.IsNullOrWhiteSpace(hora)) return null;

            if (TimeSpan.TryParse(hora, out var ts)) return ts.Hours;

            var s = hora.Trim();
            var hh = s.Split(':')[0];
            if (int.TryParse(hh, out int h) && h >= 0 && h <= 23) return h;

            if (s.Equals("previos", StringComparison.OrdinalIgnoreCase)) return -1;

            return null;
        }

        // Serie por HORA desde "hora" (fallback a fecha si faltara)
        Series2WithTotalDto BuildSeriesFromRowsV2ByHora(List<RowV2> rows, List<string> labels, int statusId)
        {
            var idx = labels.Select((l, i) => new { l, i })
                            .ToDictionary(x => x.l, x => x.i, StringComparer.OrdinalIgnoreCase);

            var serie = new Series2WithTotalDto
            {
                volteo = Enumerable.Repeat(0m, labels.Count).ToList(),
                plana = Enumerable.Repeat(0m, labels.Count).ToList(),
                pipa = Enumerable.Repeat(0m, labels.Count).ToList(),
                total = Enumerable.Repeat(0m, labels.Count).ToList()
            };

            foreach (var r in rows ?? Enumerable.Empty<RowV2>())
            {
                var id = r.PredefStatusId != 0 ? r.PredefStatusId : r.CurrentStatusId;
                if (id != statusId) continue;

                int? h = TryParseHourFromHora(r.Hora);
                string key;

                if (h == -1)
                {
                    key = "previos";
                }
                else if (h is int hh)
                {
                    key = $"{hh:00}:00";
                }
                else
                {
                    var fUtc = (r.Fecha.Kind == DateTimeKind.Utc)
                        ? r.Fecha
                        : DateTime.SpecifyKind(r.Fecha, DateTimeKind.Utc);
                    var fLoc = fUtc.ToLocalTime();
                    key = $"{fLoc.Hour:00}:00";
                }

                if (!idx.TryGetValue(key, out int i)) continue;

                var val = (decimal)r.Total;
                switch (NormalizeTruckTypeV2(r.TruckType))
                {
                    case "volteo": serie.volteo[i] += val; break;
                    case "plana": serie.plana[i] += val; break;
                    case "pipa": serie.pipa[i] += val; break;
                }
                serie.total[i] += val;
            }

            return serie;
        }

        // "15:00" -> "15:00"; "8:00" -> "08:00"; si no parsea, null
        static string? NormalizeHourLabel(string s)
        {
            if (string.IsNullOrWhiteSpace(s)) return null;

            var hhPart = s.Trim().Split(':')[0]; // ← aquí va Split con S mayúscula

            if (int.TryParse(hhPart, out var h) && h >= 0 && h <= 23) return $"{h:00}:00";
            if (s.Trim().Equals("previos", StringComparison.OrdinalIgnoreCase)) return "previos";
            return null;
        }

        Series2WithTotalDto BuildSeriesFromRowsV2ByHour_UsingFecha(List<RowV2> rows, List<string> labels, int statusId)
        {
            var idx = labels.Select((l, i) => new { l, i })
                            .ToDictionary(x => x.l, x => x.i, StringComparer.OrdinalIgnoreCase);

            var serie = new Series2WithTotalDto
            {
                volteo = Enumerable.Repeat(0m, labels.Count).ToList(),
                plana = Enumerable.Repeat(0m, labels.Count).ToList(),
                pipa = Enumerable.Repeat(0m, labels.Count).ToList(),
                total = Enumerable.Repeat(0m, labels.Count).ToList()
            };

            foreach (var r in rows ?? Enumerable.Empty<RowV2>())
            {
                var id = r.PredefStatusId != 0 ? r.PredefStatusId : r.CurrentStatusId;
                if (id != statusId) continue;

                string key;
                if (!string.IsNullOrWhiteSpace(r.Hora) &&
                    r.Hora.Trim().Equals("previos", StringComparison.OrdinalIgnoreCase))
                {
                    key = "previos";
                }
                else
                {
                    var fUtc = (r.Fecha.Kind == DateTimeKind.Utc)
                        ? r.Fecha
                        : DateTime.SpecifyKind(r.Fecha, DateTimeKind.Utc);
                    var fLoc = fUtc.ToLocalTime();
                    key = $"{fLoc.Hour:00}:00";
                }

                if (!idx.TryGetValue(key, out var i)) continue;

                var val = (decimal)r.Total;
                switch (NormalizeTruckTypeV2(r.TruckType))
                {
                    case "volteo": serie.volteo[i] += val; break;
                    case "plana": serie.plana[i] += val; break;
                    case "pipa": serie.pipa[i] += val; break;
                }
                serie.total[i] += val;
            }

            return serie;
        }

        // ============================
        // DTO de salida (frontend)
        // ============================
        public class DashboardSummaryDto
        {
            public KpiDto kpi { get; set; }
            public ChartsDto charts { get; set; }

            public static DashboardSummaryDto Empty() => new DashboardSummaryDto
            {
                kpi = new KpiDto(),
                charts = new ChartsDto
                {
                    fechas = new List<string>(),
                    finalizados = new Series2WithTotalDto(),
                    recibidos = new Series2WithTotalDto(),
                    azucarRecibidaTon = new List<decimal>(),
                    promedioDescarga = new Series2Dto(),        // numérico
                    promedioDescargaTxt = new Series2TextDto(), // texto
                    meta = new AxisMeta()
                }
            };
        }

        public class KpiDto
        {
            public int enTransito { get; set; }
            public int enParqueo { get; set; }
            public int autorizados { get; set; }
            public int tiempoEsperaMin { get; set; }
            public int tiempoAtencionMin { get; set; }
            public decimal flujoPorDiaTon { get; set; }
            public int promDescargaPlanasSeg { get; set; }
            public int promDescargaVolteoSeg { get; set; }
            public int promDescargaPipaSeg { get; set; }
            public decimal cantPromEsperaKg { get; set; }  // nuevo
            public decimal cantPromAtencionKg { get; set; }  // nuevo
        }

        public class ChartsDto
        {
            public List<string> fechas { get; set; } = new();
            public Series2WithTotalDto finalizados { get; set; } = new();
            public Series2WithTotalDto recibidos { get; set; } = new();
            public List<decimal> azucarRecibidaTon { get; set; } = new(); // compat
            public SeriesTonProductoDto toneladasPorProducto { get; set; } = new(); // nuevo
            public Series2Dto promedioDescarga { get; set; } = new();
            public Series2TextDto promedioDescargaTxt { get; set; } = new();
            public AxisMeta meta { get; set; } = new();
        }

        public class Series2Dto
        {
            public List<decimal> volteo { get; set; } = new();
            public List<decimal> plana { get; set; } = new();
            public List<decimal> pipa { get; set; } = new();
        }

        public class Series2TextDto
        {
            public List<string> volteo { get; set; } = new();
            public List<string> plana { get; set; } = new();
            public List<string> pipa { get; set; } = new();
        }

        public class Series2WithTotalDto : Series2Dto
        {
            public List<decimal> total { get; set; } = new();
        }

        public class AxisMeta
        {
            public string xTitle { get; set; } = "Fecha";
            public string yTitleFinalizados { get; set; } = "Cantidad";
            public string yTitleRecibidos { get; set; } = "Cantidad";
            public string yTitleAzucar { get; set; } = "Toneladas";
            public string yTitlePromedioDescarga { get; set; } = "HH:MM:SS";
        }

        // ====== DTOs NUEVO formato de /dashboard/promedios-atencion ======
        class PromediosAtencionV3
        {
            public string Producto { get; set; }
            public string Ingenio { get; set; }
            public RangoV3 Rango { get; set; }

            [JsonProperty("PromedioEspera")]
            public PromoGroupV3 PromedioEspera { get; set; }

            [JsonProperty("PromedioAtencion")]
            public PromoGroupV3 PromedioAtencion { get; set; }
        }

        class RangoV3
        {
            public DateTime Start { get; set; }
            public DateTime End { get; set; }
        }

        class PromoGroupV3
        {
            public PromoGlobalV3 Global { get; set; } = new();
            public List<PromoDiaV3> Dias { get; set; } = new();
        }

        class PromoGlobalV3
        {
            [JsonProperty("total_pares")] public int TotalPares { get; set; }
            [JsonProperty("promedio_seg")] public double PromedioSeg { get; set; }
            [JsonProperty("promedio_hhmmss")] public string PromedioHHMMSS { get; set; }
            [JsonProperty("cantidad_promedio")] public double CantidadPromedio { get; set; } // promedio global de kg
        }

        class PromoDiaV3
        {
            public string fecha { get; set; }        // "YYYY-MM-DD"
            public string producto { get; set; }     // por día
            public double cantidad { get; set; }     // suma día+producto (kg)
            [JsonProperty("promedio_seg")] public double PromedioSeg { get; set; }
            [JsonProperty("promedio_hhmmss")] public string PromedioHHMMSS { get; set; }
        }
    }
}