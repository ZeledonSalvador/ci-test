using FrontendQuickpass.Models.Configurations;
using FrontendQuickpass.Services;
using FrontendQuickpass.Middleware;
using FrontendQuickpass.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authentication.Cookies;



var builder = WebApplication.CreateBuilder(args);

// Registrar configuración ApiSettings desde appsettings.json
builder.Services.Configure<ApiSettings>(
    builder.Configuration.GetSection("ApiSettings"));

// 👉 REGISTRAR SERVICIOS DE AUTENTICACIÓN Y SEGURIDAD:
// Singleton porque no tiene estado por request y mejora performance
builder.Services.AddSingleton<LoginService>();

// 👉 REGISTRAR SERVICIO DE EXPIRACIÓN DE BLACKLIST
builder.Services.AddHostedService<BlacklistExpirationService>();

// 👉 REGISTRAR CACHÉ EN MEMORIA para optimizar validación de JWT
builder.Services.AddMemoryCache();

// Habilitar sesiones (opcional, si vas a usar HttpContext.Session)
builder.Services.AddSession();

// Agregar controladores y vistas
builder.Services.AddControllersWithViews();
builder.Services.AddHttpClient();

// CONFIGURAR SQLITE CON RUTA RELATIVA AL PROYECTO
builder.Services.AddDbContext<PiletasDbContext>(options =>
{
    // Obtener la ruta del proyecto (donde está el .dll)
    var contentRoot = builder.Environment.ContentRootPath;
    
    // Crear directorio App_Data si no existe
    var appDataPath = Path.Combine(contentRoot, "App_Data");
    Directory.CreateDirectory(appDataPath);
    
    // Ruta completa de la base de datos
    var dbPath = Path.Combine(appDataPath, "piletas.db");
    
    var connectionString = $"Data Source={dbPath}";
    
    Console.WriteLine($"📁 Base de datos SQLite: {dbPath}");
    
    options.UseSqlite(connectionString);
});

// Servicios estaciones de pileta
builder.Services.AddScoped<IPiletasService, PiletasService>();
builder.Services.AddHostedService<DatabaseInitializationService>();

// Servicio de cronometraje
builder.Services.AddScoped<ITimerSyncService, TimerSyncService>();

// Servicio de logging
builder.Services.AddSingleton<ITransactionLogService, TransactionLogService>();

var app = builder.Build();

// Configuración para IIS
if (app.Environment.IsDevelopment())
{
    app.UseDeveloperExceptionPage();
}
else
{
    app.UseExceptionHandler("/Error");
    app.UseHsts();
}
app.UseStaticFiles();
app.UseRouting();
app.UseSession();
app.UseAuthorization();

app.UseMiddleware<RoleAuthorizationMiddleware>();

app.MapControllerRoute(
    name: "logout",
    pattern: "Logout",
    defaults: new { controller = "Login", action = "Logout" });

app.MapControllerRoute(
    name: "login",
    pattern: "Login/{action=Index}",
    defaults: new { controller = "Login" });

app.MapControllerRoute(
    name: "autorizacion",
    pattern: "AutorizacionCamiones/{action=Index}/{id?}",
    defaults: new { controller = "AutorizacionCamiones" });

app.MapControllerRoute(
    name: "autorizacionmelaza",
    pattern: "AutorizacionCamionesMelaza/{action=Index}/{id?}",
    defaults: new { controller = "AutorizacionCamionesMelaza" });

app.MapControllerRoute(
    name: "tiemposazucar",
    pattern: "TiemposAzucar/{action=Index}/{id?}",
    defaults: new { controller = "TiemposAzucar" });

app.MapControllerRoute(
    name: "tiemposmelaza",
    pattern: "TiemposMelaza/{action=Index}/{id?}",
    defaults: new { controller = "TiemposMelaza" });

app.MapControllerRoute(
    name: "dashboard",
    pattern: "Dashboard/{action=Index}/{id?}",
    defaults: new { controller = "Dashboard" });

app.MapControllerRoute(
    name: "listatransacciones",
    pattern: "ListaTransacciones/{action=Index}/{id?}",
    defaults: new { controller = "ListaTransacciones" });

app.MapControllerRoute(
    name: "detalletransaccion",
    pattern: "DetalleTransaccion/{action=Index}/{id?}",
    defaults: new { controller = "DetalleTransaccion" });

//Aquí dejo las pantallas de auditor
app.MapControllerRoute(
    name: "correlativomarchamo",
    pattern: "CorrelativoMarchamo/{action=Index}/{id?}",
    defaults: new { controller = "CorrelativoMarchamo" });

app.MapControllerRoute(
    name: "correlativocomprobante",
    pattern: "CorrelativoComprobante/{action=Index}/{id?}",
    defaults: new { controller = "CorrelativoComprobante" });


app.MapControllerRoute(
    name: "listamarchamos",
    pattern: "CorrelativoMarchamo/ListaMarchamos/{action=Index}/{id?}",
    defaults: new { controller = "ListaMarchamos" });


app.MapControllerRoute(
    name: "listacomprobante",
    pattern: "CorrelativoComprobante/ListaComprobante/{action=Index}/{id?}",
    defaults: new { controller = "ListaComprobante" });

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Prechequeo}/{action=Index}/{id?}");

app.Run();