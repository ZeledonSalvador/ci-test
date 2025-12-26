using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using FrontendQuickpass.Data;
using Microsoft.EntityFrameworkCore;

namespace FrontendQuickpass.Services
{
    public class DatabaseInitializationService : IHostedService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<DatabaseInitializationService> _logger;

        public DatabaseInitializationService(IServiceProvider serviceProvider, ILogger<DatabaseInitializationService> logger)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
        }

        public async Task StartAsync(CancellationToken cancellationToken)
        {
            try
            {
                using var scope = _serviceProvider.CreateScope();
                var context = scope.ServiceProvider.GetRequiredService<PiletasDbContext>();

                // Asegurar que la base de datos esté creada
                await context.Database.EnsureCreatedAsync(cancellationToken);

                // Obtener la ruta real donde se creó la BD para logging
                var connection = context.Database.GetDbConnection();
                _logger.LogInformation("📁 Base de datos SQLite ubicada en: {DatabasePath}", connection.DataSource);

                // Verificar que las tablas principales existan
                await VerifyDatabaseTablesAsync(context);


                _logger.LogInformation("✅ Sistema de piletas inicializado correctamente");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ Error crítico inicializando sistema de piletas");
                throw; // Re-lanzar para que falle el startup si hay problemas críticos
            }
        }

        private async Task VerifyDatabaseTablesAsync(PiletasDbContext context)
        {
            try
            {
                // Verificar que TimerStates existe
                var timersCount = await context.TimerStates.CountAsync();
                _logger.LogInformation("📊 Tabla TimerStates verificada - Registros: {Count}", timersCount);

                _logger.LogInformation("✅ Todas las tablas verificadas correctamente");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "❌ Error verificando tablas de la base de datos");
                throw;
            }
        }

        public Task StopAsync(CancellationToken cancellationToken) => Task.CompletedTask;
    }
}