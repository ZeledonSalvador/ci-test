using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using System.Net.Http.Headers;
using Newtonsoft.Json;
using System.Text;
using FrontendQuickpass.Models.Configurations;

namespace FrontendQuickpass.Services
{
    public interface ITransactionLogService
    {
        void LogTransactionAsync(string codeGen, int predefinedStatusId, string json, string user);
        void LogActivityAsync(string codeGen, object jsonObject, string user, int status);
    }

    public class TransactionLogService : ITransactionLogService
    {
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly ApiSettings _apiSettings;
        private readonly ILogger<TransactionLogService> _logger;

        public TransactionLogService(
            IHttpClientFactory httpClientFactory, 
            IOptions<ApiSettings> apiSettings,
            ILogger<TransactionLogService> logger)
        {
            _httpClientFactory = httpClientFactory;
            _apiSettings = apiSettings.Value;
            _logger = logger;
        }

        public void LogTransactionAsync(string codeGen, int predefinedStatusId, string json, string user)
        {
            var payload = new
            {
                code_gen = codeGen,
                json_enviado = JsonConvert.DeserializeObject<object>(json),
                usuario = user,
                estatus = predefinedStatusId.ToString()
            };

            // Fire-and-Forget: No bloquea al usuario
            _ = Task.Run(async () => 
            {
                try
                {
                    await SendLogOnceOrFallback(payload, "TRANSACTION");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error en background logging - TRANSACTION");
                }
            });
        }

        public void LogActivityAsync(string codeGen, object jsonObject, string user, int status)
        {
            var payload = new
            {
                code_gen = codeGen,
                json_enviado = jsonObject,
                usuario = user,
                estatus = status.ToString()
            };

            // Fire-and-Forget: No bloquea al usuario
            _ = Task.Run(async () => 
            {
                try
                {
                    await SendLogOnceOrFallback(payload, "ACTIVITY");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Error en background logging - ACTIVITY");
                }
            });
        }

        private async Task SendLogOnceOrFallback(object payload, string logType)
        {
            try
            {
                var url = $"{_apiSettings.BaseUrl}logs/transaction-logs";
                
                var client = _httpClientFactory.CreateClient();
                client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", _apiSettings.Token);

                var jsonPayload = JsonConvert.SerializeObject(payload);
                var httpContent = new StringContent(jsonPayload, Encoding.UTF8, "application/json");

                var response = await client.PostAsync(url, httpContent);

                if (response.IsSuccessStatusCode)
                {
                    _logger.LogInformation("Log enviado correctamente a API - Type: {LogType}", logType);
                }
                else
                {
                    _logger.LogWarning("Error al enviar log a API. Status: {StatusCode} - Type: {LogType}", response.StatusCode, logType);
                    await SaveToLogFile(payload, logType, $"HTTP_ERROR_{response.StatusCode}");
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Excepción al enviar log a API - Type: {LogType}", logType);
                await SaveToLogFile(payload, logType, $"EXCEPTION: {ex.Message}");
            }
        }

        private async Task SaveToLogFile(object payload, string logType, string reason)
        {
            try
            {
                var logDirectory = Path.Combine(Directory.GetCurrentDirectory(), "Logs");
                
                if (!Directory.Exists(logDirectory))
                {
                    Directory.CreateDirectory(logDirectory);
                }

                var logFilePath = Path.Combine(logDirectory, "TransactionLogs.log");
                
                var logEntry = new
                {
                    timestamp = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff"),
                    type = logType,
                    reason = reason,
                    payload = payload
                };

                var logLine = JsonConvert.SerializeObject(logEntry) + Environment.NewLine;
                
                await File.AppendAllTextAsync(logFilePath, logLine);
                
                _logger.LogInformation("Log guardado en archivo .log: {LogType} - {Reason}", logType, reason);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error crítico: No se pudo guardar log en archivo .log");
            }
        }
    }
}