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

    //   /CorrelativoMarchamo/ListaMarchamos
    [Route("CorrelativoMarchamo/ListaMarchamos")]
    public class ListaMarchamosController : Controller
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ILogger<ListaMarchamosController> _logger;
        private readonly ApiSettings _apiSettings;

        public ListaMarchamosController(
            IHttpClientFactory httpClientFactory,
            IOptions<ApiSettings> apiSettings,
            ILogger<ListaMarchamosController> logger)
        {
            _httpClientFactory = httpClientFactory;
            _logger = logger;
            _apiSettings = apiSettings.Value;
        }


        // Ruta con correlativoId en la URL:  /CorrelativoMarchamo/ListaMarchamos/16
        [HttpGet("{correlativoId:int}")]
        [HttpGet("")]
        [Route("Index")]
        public async Task<IActionResult> Index(
            int correlativoId,
            int page = 1,
            int size = 10,
            string search = "",
            int returnPage = 1,
            int returnSize = 10,
            string returnSearch = ""
        )
        {
            // Si no nos mandan un correlativo válido, redirigir a CorrelativoMarchamo
            if (correlativoId <= 0)
            {
                _logger.LogWarning(
                    "Se intentó acceder a ListaMarchamo sin un correlativoId válido ({CorrelativoId}). Redirigiendo a CorrelativoMarchamo.",
                    correlativoId);

                return RedirectToAction("Index", "CorrelativoMarchamo");
            }

            if (page <= 0) page = 1;
            if (size <= 0) size = 10;

            var items = new List<ListaMarchamoItem>();
            string? apiMessage = null;

            // Valores por defecto de paginación
            int currentPage = page;
            int currentSize = size;
            int totalItems = 0;
            int totalPages = 1;

            try
            {
                var client = _httpClientFactory.CreateClient();

                if (!string.IsNullOrWhiteSpace(_apiSettings.Token))
                {
                    client.DefaultRequestHeaders.Authorization =
                        new AuthenticationHeaderValue("Bearer", _apiSettings.Token);
                }

                var baseUrl = (_apiSettings.BaseUrl ?? string.Empty).TrimEnd('/');

                // GET correlatives/seal-ranges/{correlativoId}/detail?page={page}&limit={size}
                var url = $"{baseUrl}/correlatives/seal-ranges/{correlativoId}/detail?page={page}&limit={size}";

                // Agregar parámetro search si no está vacío
                if (!string.IsNullOrWhiteSpace(search))
                {
                    url += $"&search={Uri.EscapeDataString(search)}";
                }

                var response = await client.GetAsync(url);

                if (!response.IsSuccessStatusCode)
                {
                    var rawError = await response.Content.ReadAsStringAsync();

                    _logger.LogWarning(
                        "Error al obtener la lista de marchamos para correlativo {CorrelativoId}. " +
                        "Status {StatusCode} - Body: {Body}",
                        correlativoId,
                        response.StatusCode,
                        rawError
                    );

                    ViewBag.ApiMessage = "No se pudieron cargar los marchamos para el correlativo seleccionado.";

                    var pagerError = new Pager
                    {
                        Page = currentPage,
                        Size = currentSize,
                        TotalItems = 0,
                        TotalPages = 1
                    };

                    ViewBag.Pager = pagerError;
                    ViewBag.Filters = new
                    {
                        Page = pagerError.Page,
                        Size = pagerError.Size,
                        Search = search ?? string.Empty
                    };

                    // NUEVO: Pasar parámetros de retorno al ViewBag incluso en error
                    ViewBag.ReturnPage = returnPage;
                    ViewBag.ReturnSize = returnSize;
                    ViewBag.ReturnSearch = returnSearch ?? string.Empty;

                    var errorModel = new ListaMarchamosViewModel
                    {
                        Items = items,
                        Page = pagerError.Page,
                        Size = pagerError.Size,
                        Search = search ?? string.Empty,
                        CorrelativoId = correlativoId
                    };

                    return View(errorModel);
                }

                var raw = await response.Content.ReadAsStringAsync();

                var options = new JsonSerializerOptions
                {
                    PropertyNameCaseInsensitive = true
                };

                ListaMarchamosApiResponse? apiResponse = null;

                try
                {
                    apiResponse = JsonSerializer.Deserialize<ListaMarchamosApiResponse>(raw, options);
                }
                catch (JsonException jsonEx)
                {
                    _logger.LogError(jsonEx,
                        "Error al deserializar JSON de ListaMarchamos para correlativo {CorrelativoId}. " +
                        "Verifique el formato de campos como 'noEnvio'. JSON parcial: {JsonPreview}",
                        correlativoId,
                        raw.Length > 500 ? raw.Substring(0, 500) + "..." : raw
                    );

                    ViewBag.ApiMessage = "Error al procesar respuesta del servidor. Verifique el formato de datos (ej: noEnvio).";
                    apiResponse = null;
                }

                if (apiResponse != null)
                {
                    items = apiResponse.Data ?? new List<ListaMarchamoItem>();
                    apiMessage = apiResponse.Message;

                    var pagination = apiResponse.Pagination;

                    if (pagination != null)
                    {
                        currentPage = pagination.CurrentPage > 0
                            ? pagination.CurrentPage
                            : page;

                        currentSize = pagination.PageSize > 0
                            ? pagination.PageSize
                            : size;

                        totalItems = pagination.TotalRecords;

                        totalPages = pagination.TotalPages > 0
                            ? pagination.TotalPages
                            : (int)Math.Ceiling(totalItems / (double)currentSize);

                        if (totalPages == 0)
                        {
                            totalPages = 1;
                        }
                    }
                    else
                    {
                        // Si el backend no enviara paginación, la construimos nosotros
                        totalItems = items.Count;
                        totalPages = (int)Math.Ceiling(totalItems / (double)currentSize);
                        if (totalPages == 0)
                        {
                            totalPages = 1;
                        }
                    }
                }
                else
                {
                    _logger.LogWarning(
                        "No se pudo deserializar la respuesta de ListaMarchamos para correlativo {CorrelativoId}.",
                        correlativoId
                    );
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex,
                    "Error inesperado al obtener ListaMarchamos para correlativo {CorrelativoId}.",
                    correlativoId);

                ViewBag.ApiMessage = "Ocurrió un error inesperado al cargar los marchamos.";
            }

            if (!string.IsNullOrWhiteSpace(apiMessage))
            {
                ViewBag.ApiMessage = apiMessage;
            }

            // Armar el Pager que la vista espera (usa FrontendQuickpass.Models.Pager)
            var pager = new Pager
            {
                Page = currentPage,
                Size = currentSize,
                TotalItems = totalItems,
                TotalPages = totalPages
            };

            ViewBag.Pager = pager;

            ViewBag.Filters = new
            {
                Page = currentPage,
                Size = currentSize,
                Search = search ?? string.Empty
            };

           
            ViewBag.ReturnPage = returnPage;
            ViewBag.ReturnSize = returnSize;
            ViewBag.ReturnSearch = returnSearch ?? string.Empty;

            var model = new ListaMarchamosViewModel
            {
                Items = items,
                Page = currentPage,
                Size = currentSize,
                Search = search ?? string.Empty,
                CorrelativoId = correlativoId
            };

            return View(model);
        }
    }
}