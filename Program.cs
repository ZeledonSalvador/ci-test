using FrontendQuickpass.Models.Configurations;
using FrontendQuickpass.Services;
using FrontendQuickpass.Middleware;
using Microsoft.AspNetCore.DataProtection;

var builder = WebApplication.CreateBuilder(args);

// Registrar configuración ApiSettings desde appsettings.json
builder.Services.Configure<ApiSettings>(
    builder.Configuration.GetSection("ApiSettings"));

// Persistir claves de Data Protection para que las cookies de sesión sobrevivan reinicios
var keysFolder = Path.Combine(builder.Environment.ContentRootPath, "App_Data", "DataProtection-Keys");
builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(keysFolder))
    .SetApplicationName("FrontendQuickpass");

// REGISTRAR SERVICIOS DE AUTENTICACIÓN Y SEGURIDAD
builder.Services.AddSingleton<LoginService>();

// REGISTRAR CACHÉ EN MEMORIA para optimizar validación de JWT
builder.Services.AddMemoryCache();

// Habilitar sesiones
builder.Services.AddSession();

// Agregar controladores y vistas
builder.Services.AddControllersWithViews();
builder.Services.AddHttpClient();

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
// Registrar MIME type para manifesto PWA (.webmanifest)
var contentTypeProvider = new Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider();
contentTypeProvider.Mappings[".webmanifest"] = "application/manifest+json";
app.UseStaticFiles(new StaticFileOptions { ContentTypeProvider = contentTypeProvider });
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
    name: "dashboard",
    pattern: "Dashboard/{action=Index}/{id?}",
    defaults: new { controller = "Dashboard" });

app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Login}/{action=Index}/{id?}");

app.Run();
