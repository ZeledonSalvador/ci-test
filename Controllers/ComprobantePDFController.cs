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

        // GET: /ComprobantePDF/Index?envio=CF69...&numero=11
        public async Task<IActionResult> Index(string envio, int numero)
        {
            if (string.IsNullOrWhiteSpace(envio))
            {
                _logger.LogWarning("Se intentó generar ComprobantePDF sin número de envío.");
                ViewBag.Error = "No se encontró información del envío.";
                return View(new ListaComprobanteItem
                {
                    NumeroComprobante = numero,
                    NumeroEnvio = string.Empty
                });
            }

            try
            {
                var client = _httpClientFactory.CreateClient();
                var baseUrl = _apiSettings.BaseUrl?.TrimEnd('/') ?? string.Empty;

                if (!string.IsNullOrWhiteSpace(_apiSettings.Token))
                {
                    client.DefaultRequestHeaders.Authorization =
                        new AuthenticationHeaderValue("Bearer", _apiSettings.Token);
                }

                var url = $"{baseUrl}/shipping/{envio}";
                _logger.LogInformation("Llamando endpoint de shipping: {Url}", url);

                var response = await client.GetAsync(url);
                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogError("Error al obtener detalle de shipping. StatusCode: {StatusCode}", response.StatusCode);
                    ViewBag.Error = "No se pudo obtener la información para el comprobante.";
                    return View(new ListaComprobanteItem
                    {
                        NumeroComprobante = numero,
                        NumeroEnvio = envio
                    });
                }

                var raw = await response.Content.ReadAsStringAsync();

                var shipping = JsonSerializer.Deserialize<ShippingDetailResponse>(
                    raw,
                    new JsonSerializerOptions
                    {
                        PropertyNameCaseInsensitive = true
                    });

                if (shipping == null)
                {
                    _logger.LogError("Respuesta de shipping nula para envío {Envio}", envio);
                    ViewBag.Error = "No se pudo procesar la información del comprobante.";
                    return View(new ListaComprobanteItem
                    {
                        NumeroComprobante = numero,
                        NumeroEnvio = envio
                    });
                }

                // ====== MAPEO DE DATOS ======

                // Status 5: Chequeo de Entrada
                var statusEntrada = shipping.Statuses?
                    .FirstOrDefault(s => s.Id == 5);

                // Status 11: Pesaje salida pluma dos
                var statusSalida = shipping.Statuses?
                    .FirstOrDefault(s => s.Id == 11);

                var nav = shipping.NavRecord ?? new ShippingNavRecord();

                // ====== SELECCIONAR PRIMER PESAJE ======
                // Preferir pesaje.numero == 1, si no existe usar el de menor número
                Pesaje? primerPesaje = null;
                if (shipping.Pesajes != null && shipping.Pesajes.Count > 0)
                {
                    primerPesaje = shipping.Pesajes.FirstOrDefault(p => p.Numero == 1)
                                ?? shipping.Pesajes.OrderBy(p => p.Numero).FirstOrDefault();
                }

                decimal pesoBruto = primerPesaje?.Bruto?.Valor ?? 0m;
                decimal pesoTara = primerPesaje?.Tara?.Valor ?? 0m;
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

                var model = new ListaComprobanteItem
                {
                    NumeroComprobante = numero,
                    NumeroEnvio = envio,

                    // Cliente (Navision)
                    Cliente = nav.DescCliente ?? string.Empty,

                    // Producto
                    Producto = shipping.NameProduct ?? string.Empty,

                    // ENTRADA
                    FechaEntrada = statusEntrada?.CreatedAt,
                    HoraEntrada = statusEntrada?.Time ?? string.Empty,
                    PesoEntrada = nav.PesoIn,

                    // TRANSPORTE
                    Transporte = shipping.Transporter ?? string.Empty,
                    Motorista = shipping.Driver?.Name ?? string.Empty,
                    Placa = shipping.Vehicle?.Plate ?? string.Empty,
                    PlacaRemolque = shipping.Vehicle?.TrailerPlate ?? string.Empty,

                    // SALIDA / PESOS (ahora desde pesajes y consolidado)
                    FechaSalida = statusSalida?.CreatedAt,
                    HoraSalida = statusSalida?.Time ?? string.Empty,
                    PesoBruto = pesoBruto,
                    PesoTara = pesoTara,
                    PesoNeto = pesoNeto,

                    // TRANSACCIÓN NAV
                    TransaccionNavId = shipping.IdNavRecord,

                    // LICENCIA
                    Licencia = shipping.Driver?.License ?? string.Empty,

                    // MARCHAMOS
                    Marchamos = marchamos,

                    // HUMEDAD: 0.14 -> 14 (%)
                    PorcentajeHumedad = shipping.Humidity.HasValue
                        ? shipping.Humidity.Value * 100m
                        : (decimal?)null
                };

                return View(model);
            }
            catch (JsonException jex)
            {
                _logger.LogError(jex, "Error al deserializar detalle de shipping para envío {Envio}", envio);
                ViewBag.Error = "Ocurrió un error al procesar la información del comprobante.";
                return View(new ListaComprobanteItem
                {
                    NumeroComprobante = numero,
                    NumeroEnvio = envio
                });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inesperado al generar ComprobantePDF para envío {Envio}", envio);
                ViewBag.Error = "Ocurrió un error al generar el comprobante.";
                return View(new ListaComprobanteItem
                {
                    NumeroComprobante = numero,
                    NumeroEnvio = envio
                });
            }
        }
    }
}
