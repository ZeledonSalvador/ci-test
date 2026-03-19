using Microsoft.Extensions.Options;
using System.Net.Http.Headers;
using Newtonsoft.Json;
using System.Text;
using FrontendQuickpass.Models.Configurations;

namespace FrontendQuickpass.Services
{
    public interface IShipmentAuditService
    {
        void RegisterStatusChange(string codeGen, int predefinedStatusId, int? userId = null, string userType = "internal");
    }

    public class ShipmentAuditService : IShipmentAuditService
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ApiSettings _apiSettings;
        private readonly ILogger<ShipmentAuditService> _logger;

        public ShipmentAuditService(
            IHttpClientFactory httpClientFactory,
            IOptions<ApiSettings> apiSettings,
            ILogger<ShipmentAuditService> logger)
        {
            _httpClientFactory = httpClientFactory;
            _apiSettings = apiSettings.Value;
            _logger = logger;
        }

        public void RegisterStatusChange(string codeGen, int predefinedStatusId, int? userId = null, string userType = "internal")
        {
            // Fire-and-Forget: No bloquea al usuario
            _ = Task.Run(async () =>
            {
                try
                {
                    await SendAuditLog(codeGen, predefinedStatusId, userId, userType);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error en background audit logging para codeGen: {CodeGen}", codeGen);
                }
            });
        }

        private async Task SendAuditLog(string codeGen, int predefinedStatusId, int? userId, string userType)
        {
            try
            {
                var url = $"{_apiSettings.BaseUrl}shipment-audit/register/status-change";

                // Crear payload dinámico - solo incluir userId si tiene valor
                object payload;
                if (userId.HasValue)
                {
                    payload = new
                    {
                        codeGen = codeGen,
                        predefinedStatusId = predefinedStatusId,
                        userId = userId.Value,
                        userType = userType
                    };
                }
                else
                {
                    payload = new
                    {
                        codeGen = codeGen,
                        predefinedStatusId = predefinedStatusId,
                        userType = userType
                    };
                }

                var client = _httpClientFactory.CreateClient();
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _apiSettings.Token);

                var jsonPayload = JsonConvert.SerializeObject(payload);
                var httpContent = new StringContent(jsonPayload, Encoding.UTF8, "application/json");

                var response = await client.PostAsync(url, httpContent);

                if (response.IsSuccessStatusCode)
                {
                    _logger.LogInformation("Audit log enviado correctamente para codeGen: {CodeGen}, status: {Status}", codeGen, predefinedStatusId);
                }
                else
                {
                    var errorContent = await response.Content.ReadAsStringAsync();
                    _logger.LogWarning("Error al enviar audit log. Status: {StatusCode}, CodeGen: {CodeGen}, Error: {Error}",
                        response.StatusCode, codeGen, errorContent);
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Excepción al enviar audit log para codeGen: {CodeGen}", codeGen);
            }
        }
    }
}