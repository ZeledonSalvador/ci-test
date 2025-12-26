using System;
using System.Collections.Generic;
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
    public class ListaComprobanteController : Controller
    {
        private readonly ILogger<ListaComprobanteController> _logger;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ApiSettings _apiSettings;

        public ListaComprobanteController(
            ILogger<ListaComprobanteController> logger,
            IHttpClientFactory httpClientFactory,
            IOptions<ApiSettings> apiOptions)
        {
            _logger = logger;
            _httpClientFactory = httpClientFactory;
            _apiSettings = apiOptions.Value;
        }

        // GET: /CorrelativoComprobante/ListaComprobante?correlativoId=1&page=1&size=10
        public async Task<IActionResult> Index(
            int correlativoId = 0,
            int page = 1,
            int size = 10,
            string search = "",
            int returnPage = 1,
            int returnSize = 10,
            string returnSearch = "")
        {

            if (correlativoId <= 0)
            {
                return RedirectToAction("Index", "CorrelativoComprobante");
            }
            // Valores mínimos razonables
            if (page < 1) page = 1;
            if (size < 1) size = 10;

            // Si no viene correlativoId, mostramos vista vacía con error
            if (correlativoId <= 0)
            {
                ViewBag.Error = "No se recibió un identificador de rango válido.";
                var vmVacio = new ListaComprobanteViewModel
                {
                    Items = new List<ListaComprobanteItem>(),
                    Page = page,
                    Size = size,
                    Search = search,
                    CorrelativoId = correlativoId
                };

                ViewBag.Pager = new Pager
                {
                    Page = page,
                    Size = size,
                    TotalItems = 0,
                    TotalPages = 0
                };

                ViewBag.Filters = new
                {
                    Page = page,
                    Size = size,
                    Search = search,
                    CorrelativoId = correlativoId
                };

                ViewBag.ReturnParams = new
                {
                    ReturnPage = returnPage,
                    ReturnSize = returnSize,
                    ReturnSearch = returnSearch
                };

                return View(vmVacio);
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

                var url = $"{baseUrl}/correlatives/voucher-ranges/{correlativoId}/detail?page={page}&limit={size}";

                // Agregar parámetro search si no está vacío
                if (!string.IsNullOrWhiteSpace(search))
                {
                    url += $"&search={Uri.EscapeDataString(search)}";
                }

                _logger.LogInformation("Obteniendo detalle de comprobantes desde: {Url}", url);

                var response = await client.GetAsync(url);
                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogError("Error al obtener lista de comprobantes. StatusCode: {StatusCode}", response.StatusCode);
                    ViewBag.Error = "No se pudo obtener la lista de comprobantes desde el servicio.";

                    var vmError = new ListaComprobanteViewModel
                    {
                        Items = new List<ListaComprobanteItem>(),
                        Page = page,
                        Size = size,
                        Search = search,
                        CorrelativoId = correlativoId
                    };

                    ViewBag.Pager = new Pager
                    {
                        Page = page,
                        Size = size,
                        TotalItems = 0,
                        TotalPages = 0
                    };

                    ViewBag.Filters = new
                    {
                        Page = page,
                        Size = size,
                        Search = search,
                        CorrelativoId = correlativoId
                    };

                    ViewBag.ReturnParams = new
                    {
                        ReturnPage = returnPage,
                        ReturnSize = returnSize,
                        ReturnSearch = returnSearch
                    };

                    return View(vmError);
                }

                var raw = await response.Content.ReadAsStringAsync();

                var apiResponse = JsonSerializer.Deserialize<ListaComprobanteApiResponse>(
                    raw,
                    new JsonSerializerOptions
                    {
                        PropertyNameCaseInsensitive = true
                    });

                var items = apiResponse?.Comprobantes ?? new List<ListaComprobanteItem>();
                var pagination = apiResponse?.Pagination ?? new PaginationInfoModel();



                // Usar paginación del backend si viene
                if (pagination.CurrentPage > 0) page = pagination.CurrentPage;
                if (pagination.PageSize > 0) size = pagination.PageSize;

                var totalItems = pagination.TotalRecords > 0
                    ? pagination.TotalRecords
                    : items.Count;

                var totalPages = pagination.TotalPages > 0
                    ? pagination.TotalPages
                    : (int)Math.Ceiling(totalItems / (double)size);

                var vm = new ListaComprobanteViewModel
                {
                    Items = items,
                    Page = page,
                    Size = size,
                    Search = search,
                    CorrelativoId = correlativoId
                };

                var pager = new Pager
                {
                    Page = page,
                    Size = size,
                    TotalItems = totalItems,
                    TotalPages = totalPages
                };

                ViewBag.Pager = pager;
                ViewBag.Filters = new
                {
                    Page = page,
                    Size = size,
                    Search = search,
                    CorrelativoId = correlativoId
                };

                ViewBag.ReturnParams = new
                {
                    ReturnPage = returnPage,
                    ReturnSize = returnSize,
                    ReturnSearch = returnSearch
                };

                return View(vm);
            }
            catch (JsonException jex)
            {
                _logger.LogError(jex, "Error al deserializar la respuesta de lista de comprobantes para correlativoId {Id}", correlativoId);
                ViewBag.Error = "Ocurrió un error al procesar la información de los comprobantes.";

                var vmError = new ListaComprobanteViewModel
                {
                    Items = new List<ListaComprobanteItem>(),
                    Page = page,
                    Size = size,
                    Search = search,
                    CorrelativoId = correlativoId
                };

                ViewBag.Pager = new Pager
                {
                    Page = page,
                    Size = size,
                    TotalItems = 0,
                    TotalPages = 0
                };

                ViewBag.Filters = new
                {
                    Page = page,
                    Size = size,
                    Search = search,
                    CorrelativoId = correlativoId
                };

                ViewBag.ReturnParams = new
                {
                    ReturnPage = returnPage,
                    ReturnSize = returnSize,
                    ReturnSearch = returnSearch
                };

                return View(vmError);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error inesperado al obtener la lista de comprobantes para correlativoId {Id}", correlativoId);
                ViewBag.Error = "Ocurrió un error inesperado al cargar la lista de comprobantes.";

                var vmError = new ListaComprobanteViewModel
                {
                    Items = new List<ListaComprobanteItem>(),
                    Page = page,
                    Size = size,
                    Search = search,
                    CorrelativoId = correlativoId
                };

                ViewBag.Pager = new Pager
                {
                    Page = page,
                    Size = size,
                    TotalItems = 0,
                    TotalPages = 0
                };

                ViewBag.Filters = new
                {
                    Page = page,
                    Size = size,
                    Search = search,
                    CorrelativoId = correlativoId
                };

                ViewBag.ReturnParams = new
                {
                    ReturnPage = returnPage,
                    ReturnSize = returnSize,
                    ReturnSearch = returnSearch
                };

                return View(vmError);
            }
        }
    }
}
