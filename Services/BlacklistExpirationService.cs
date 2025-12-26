// Services/BlacklistExpirationService.cs
using Microsoft.Extensions.Options;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text;
using FrontendQuickpass.Models;
using FrontendQuickpass.Models.Configurations;

namespace FrontendQuickpass.Services
{
    public class BlacklistExpirationService : BackgroundService
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ApiSettings _apiSettings;
        private readonly ILogger<BlacklistExpirationService> _logger;
        private readonly IServiceProvider _serviceProvider;

        // Configuración de tiempo - cambiar según necesidad
        private readonly TimeSpan _interval = TimeSpan.FromHours(12); // Cada 12 horas
        // private readonly TimeSpan _interval = TimeSpan.FromMinutes(1); // Para pruebas: cada 1 minuto

        public BlacklistExpirationService(
            IHttpClientFactory httpClientFactory,
            IOptions<ApiSettings> apiOptions,
            ILogger<BlacklistExpirationService> logger,
            IServiceProvider serviceProvider)
        {
            _httpClientFactory = httpClientFactory;
            _apiSettings = apiOptions.Value;
            _logger = logger;
            _serviceProvider = serviceProvider;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("BlacklistExpirationService iniciado - Intervalo: {Interval}", _interval);

            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await ProcessExpiredBlacklistRecords();
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error en BlacklistExpirationService");
                }

                // Esperar hasta la próxima ejecución
                await Task.Delay(_interval, stoppingToken);
            }
        }

        private async Task ProcessExpiredBlacklistRecords()
        {
            _logger.LogInformation("Iniciando verificación de registros expirados - {Time}", DateTime.Now);

            var client = _httpClientFactory.CreateClient();

            // Configurar headers
            client.DefaultRequestHeaders.Accept.Clear();
            client.DefaultRequestHeaders.Accept.Add(
                new MediaTypeWithQualityHeaderValue("application/json")
            );

            if (!string.IsNullOrWhiteSpace(_apiSettings.Token))
            {
                client.DefaultRequestHeaders.Authorization =
                    new AuthenticationHeaderValue("Bearer", _apiSettings.Token);
            }

            var baseUrl = (_apiSettings.BaseUrl ?? string.Empty).TrimEnd('/');
            var url = $"{baseUrl}/blacklist/reports/active?page=1&size=1000&includeAttachments=false";

            try
            {
                // Obtener todos los registros activos
                var response = await client.GetAsync(url);
                if (!response.IsSuccessStatusCode)
                {
                    _logger.LogError("Error al obtener registros de blacklist: {StatusCode}", response.StatusCode);
                    return;
                }

                var json = await response.Content.ReadAsStringAsync();
                var reports = new List<ActiveBlacklistDto>();

                // Deserializar respuesta
                try
                {
                    var opts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                    var paged = JsonSerializer.Deserialize<ApiPaginatedResponse<ActiveBlacklistDto>>(json, opts);
                    reports = paged?.Data ?? new List<ActiveBlacklistDto>();
                }
                catch
                {
                    var opts = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                    reports = JsonSerializer.Deserialize<List<ActiveBlacklistDto>>(json, opts) ?? new List<ActiveBlacklistDto>();
                }

                _logger.LogInformation("Registros obtenidos: {Count}", reports.Count);

                // Verificar y actualizar registros expirados
                await CheckAndUpdateExpiredRecords(client, baseUrl, reports);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al procesar registros expirados");
            }
        }

        private async Task CheckAndUpdateExpiredRecords(HttpClient client, string baseUrl, List<ActiveBlacklistDto> reports)
        {
            var currentDateTime = DateTime.Now;
            var expiredReports = reports.Where(r =>
                r.PenaltyApplied?.PenaltyEndDate.HasValue == true &&
                ConvertUtcToLocal(r.PenaltyApplied.PenaltyEndDate.Value) <= currentDateTime &&
                r.StatusBlacklist != 3 // No está ya finalizado
            ).ToList();

            if (!expiredReports.Any())
            {
                _logger.LogInformation("No se encontraron registros expirados");
                return;
            }

            _logger.LogInformation("Registros expirados encontrados: {Count}", expiredReports.Count);

            // Actualizar cada registro expirado
            var updateTasks = expiredReports.Select(report => UpdateExpiredRecord(client, baseUrl, report));
            await Task.WhenAll(updateTasks);

            _logger.LogInformation("Procesamiento completado - {Count} registros finalizados automáticamente", expiredReports.Count);
        }

        private async Task UpdateExpiredRecord(HttpClient client, string baseUrl, ActiveBlacklistDto expiredReport)
        {
            try
            {
                var updatePayload = new
                {
                    penaltyType = "Finalizado",
                    penaltyStartDate = expiredReport.PenaltyApplied?.PenaltyStartDate,
                    penaltyEndDate = expiredReport.PenaltyApplied?.PenaltyEndDate,
                    observation = expiredReport.PenaltyApplied?.Observation ?? "Finalización automática por expiración de fecha.",
                    modifiedBy = "Sistema"
                };

                var jsonContent = JsonSerializer.Serialize(updatePayload, new JsonSerializerOptions
                {
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                });
                var content = new StringContent(jsonContent, Encoding.UTF8, "application/json");

                var updateUrl = $"{baseUrl}/blacklist/reports/active/{expiredReport.Id}";
                var response = await client.PutAsync(updateUrl, content);

                if (response.IsSuccessStatusCode)
                {
                    _logger.LogInformation("Registro ID {Id} finalizado automáticamente por CronJob", expiredReport.Id);
                }
                else
                {
                    var responseContent = await response.Content.ReadAsStringAsync();
                    _logger.LogError("Error al actualizar registro ID {Id}: {StatusCode} - {Content}",
                        expiredReport.Id, response.StatusCode, responseContent);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error al actualizar registro ID {Id}", expiredReport.Id);
            }
        }

        private DateTime ConvertUtcToLocal(DateTime dateTime)
        {
            return dateTime.AddHours(-6);
        }
    }
}