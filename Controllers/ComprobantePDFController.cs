using System;
using System.Linq;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Threading.Tasks;
using FrontendQuickpass.Models;
using FrontendQuickpass.Models.Configurations;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace FrontendQuickpass.Controllers
{
    public class ComprobantePDFController : Controller
    {
        private readonly ILogger<ComprobantePDFController> _logger;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ApiSettings _apiSettings;

        public ComprobantePDFController(
            ILogger<ComprobantePDFController> logger,
            IHttpClientFactory httpClientFactory,
            IOptions<ApiSettings> apiOptions)
        {
            _logger = logger;
            _httpClientFactory = httpClientFactory;
            _apiSettings = apiOptions.Value;
        }

        // GET: /ComprobantePDF/Index?codeGen=ABC123&numero=11
        public async Task<IActionResult> Index(string codeGen, int numero)
        {
            if (string.IsNullOrWhiteSpace(codeGen))
            {
                _logger.LogWarning("Se intentó generar ComprobantePDF sin código de generación.");
                ViewBag.Error = "No se encontró información del envío.";
                return View(new ListaComprobanteItem
                {
                    NumeroComprobante = numero,
                    CodeGen = null
                });
            }

            try
            {
                var client = _httpClientFactory.CreateClient();
                var baseUrl = _apiSettings.BaseUrl?.TrimEnd('/') ?? string.Empty;

                // Log para diagnosticar configuración
                var hasToken = !string.IsNullOrWhiteSpace(_apiSettings.Token);
                _logger.LogInformation("Configuración API - BaseUrl: {BaseUrl}, HasToken: {HasToken}", baseUrl, hasToken);

                if (hasToken)
                {
                    client.DefaultRequestHeaders.Authorization =
                        new AuthenticationHeaderValue("Bearer", _apiSettings.Token);
                
                }
                else
                {
                    _logger.LogWarning("⚠️ No se encontró token en ApiSettings. La petición será rechazada.");
                }

                var url = $"{baseUrl}/shipping/{codeGen}";
                _logger.LogInformation("Llamando endpoint de shipping: {Url}", url);

                var response = await client.GetAsync(url);
                _logger.LogInformation("Respuesta de shipping recibida. StatusCode: {StatusCode}", response.StatusCode);

                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogError("Error al obtener detalle de shipping. StatusCode: {StatusCode}", response.StatusCode);
                    ViewBag.Error = "No se pudo obtener la información para el comprobante.";
                    return View(new ListaComprobanteItem
                    {
                        NumeroComprobante = numero,
                        CodeGen = codeGen
                    });
                }

                var raw = await response.Content.ReadAsStringAsync();

                ShippingDetailResponse? shipping = null;
                try
                {
                    shipping = JsonSerializer.Deserialize<ShippingDetailResponse>(
                        raw,
                        new JsonSerializerOptions
                        {
                            PropertyNameCaseInsensitive = true
                        });
                }
                catch (JsonException jsonEx)
                {
                    _logger.LogError(jsonEx, "Error al deserializar JSON. Primeros 500 caracteres: {JsonPreview}",
                        raw.Length > 500 ? raw.Substring(0, 500) : raw);
                    throw; // Re-lanzar para que lo capture el catch exterior
                }

                if (shipping == null)
                {
                    _logger.LogError("Respuesta de shipping nula para código {CodeGen}", codeGen);
                    ViewBag.Error = "No se pudo procesar la información del comprobante.";
                    return View(new ListaComprobanteItem
                    {
                        NumeroComprobante = numero,
                        CodeGen = codeGen
                    });
                }

                // ====== MAPEO DE DATOS ======

                // Status 7: Pesaje Entrada pluma dos (tomar el PRIMERO - fecha más antigua)
                var statusEntrada = shipping.Statuses?
                    .Where(s => s.Id == 7)
                    .OrderBy(s => s.CreatedAt)
                    .FirstOrDefault();

                // Status 11: Pesaje salida pluma dos (tomar el ÚLTIMO - fecha más reciente)
                var statusSalida = shipping.Statuses?
                    .Where(s => s.Id == 11)
                    .OrderByDescending(s => s.CreatedAt)
                    .FirstOrDefault();

                // CreatedAt ya viene en hora local desde el API (sin sufijo Z), no requiere conversión
                DateTime? fechaEntradaLocal = statusEntrada?.CreatedAt;
                DateTime? fechaSalidaLocal = statusSalida?.CreatedAt;

                var nav = shipping.NavRecord ?? new ShippingNavRecord();

                // ====== SELECCIONAR PESAJES ======
                // Peso Bruto: del primer pesaje (numero == 1 o el menor)
                // Peso Tara: del último pesaje (el que tiene el número más grande)
                Pesaje? primerPesaje = null;
                Pesaje? ultimoPesaje = null;
                if (shipping.Pesajes != null && shipping.Pesajes.Count > 0)
                {
                    primerPesaje = shipping.Pesajes.FirstOrDefault(p => p.Numero == 1)
                                ?? shipping.Pesajes.OrderBy(p => p.Numero).FirstOrDefault();
                    ultimoPesaje = shipping.Pesajes.OrderByDescending(p => p.Numero).FirstOrDefault();
                }

                decimal pesoBruto = primerPesaje?.Bruto?.Valor ?? 0m;
                decimal pesoTara = ultimoPesaje?.Tara?.Valor ?? 0m;
                decimal pesoNeto = shipping.Consolidado?.Total ?? 0m;

                // Marchamos: usar shipping.marchamos (ordenar por posición y unir con /)
                string marchamos = string.Empty;
                if (shipping.Marchamos != null && shipping.Marchamos.Count > 0)
                {
                    var numeros = shipping.Marchamos
                        .OrderBy(m => m.Posicion)
                        .Select(m => m.Numero.ToString())
                        .Where(n => !string.IsNullOrWhiteSpace(n))
                        .ToList();

                    marchamos = string.Join("/", numeros);
                }

                // Formatear nombre del ingenio: mayúsculas y sin guiones bajos
                string clienteIngenio = shipping.Ingenio?.Name ?? string.Empty;
                clienteIngenio = clienteIngenio.Replace("_", " ").ToUpperInvariant();

                // REFACTOR: Obtener PesoEntrada del primer pesaje (Bruto)
                decimal pesoEntrada = primerPesaje?.Bruto?.Valor ?? 0m;

                var model = new ListaComprobanteItem
                {
                    NumeroComprobante = numero,
                    CodeGen = codeGen,

                    // Cliente (desde ingenio.name)
                    Cliente = clienteIngenio,

                    // Producto
                    Producto = shipping.NameProduct ?? string.Empty,

                    // ENTRADA
                    FechaEntrada = fechaEntradaLocal,
                    HoraEntrada = statusEntrada?.Time ?? string.Empty,
                    PesoEntrada = pesoEntrada, // Sourced from shipping.Pesajes[0].Bruto (or first pesaje's Bruto)

                    // TRANSPORTE
                    Transporte = shipping.Transporter ?? string.Empty,
                    Motorista = shipping.Driver?.Name ?? string.Empty,
                    Placa = shipping.Vehicle?.Plate ?? string.Empty,
                    PlacaRemolque = shipping.Vehicle?.TrailerPlate ?? string.Empty,

                    // SALIDA / PESOS (ahora desde pesajes y consolidado)
                    FechaSalida = fechaSalidaLocal,
                    HoraSalida = statusSalida?.Time ?? string.Empty,
                    PesoBruto = pesoBruto,
                    PesoTara = pesoTara,
                    PesoNeto = pesoNeto,

                    // TRANSACCIÓN QUICKPASS (id del shipping)
                    TransaccionNavId = shipping.Id,

                    // LICENCIA
                    Licencia = shipping.Driver?.License ?? string.Empty,

                    // MARCHAMOS
                    Marchamos = marchamos,

                    // HUMEDAD: 0.14 -> 14 (%)
                    PorcentajeHumedad = shipping.Humidity.HasValue
                        ? shipping.Humidity.Value * 100m
                        : (decimal?)null,

                    // OBSERVACIONES
                    Observaciones = shipping.Observations ?? string.Empty,

                    // PESADOR (userCode con fallback a fullName)
                    Pesador = shipping.Comprobante?.ImpresoPorCode ?? shipping.Comprobante?.ImpresoPor ?? string.Empty
                };

                return View(model);
            }
            catch (JsonException jex)
            {
                _logger.LogError(jex, "Error al deserializar detalle de shipping para código {CodeGen}", codeGen);
                ViewBag.Error = "Ocurrió un error al procesar la información del comprobante.";
                return View(new ListaComprobanteItem
                {
                    NumeroComprobante = numero,
                    CodeGen = codeGen
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inesperado al generar ComprobantePDF para código {CodeGen}", codeGen);
                ViewBag.Error = "Ocurrió un error al generar el comprobante.";
                return View(new ListaComprobanteItem
                {
                    NumeroComprobante = numero,
                    CodeGen = codeGen
                });
            }
        }
    }
}
