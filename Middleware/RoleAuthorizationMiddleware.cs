using Microsoft.AspNetCore.Http;
using FrontendQuickpass.Services;
using FrontendQuickpass.Helpers;
using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Extensions.DependencyInjection;

namespace FrontendQuickpass.Middleware
{
    public class RoleAuthorizationMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly IServiceProvider _serviceProvider;
        private readonly HashSet<string> _exactPublicPaths;
        private readonly HashSet<string> _publicBaseRoutes;
        private readonly HashSet<string> _staticFilePrefixes;
        private readonly HashSet<string> _authenticatedOnlyRoutes;

        public RoleAuthorizationMiddleware(RequestDelegate next, IServiceProvider serviceProvider)
        {
            _next = next;
            _serviceProvider = serviceProvider;

            // RUTAS PÚBLICAS EXACTAS (sin autenticación)
            _exactPublicPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "/", "/Login", "/Logout"
            };

            // RUTAS BASE PÚBLICAS (ej. /Prechequeo, /Prechequeo/...)
            _publicBaseRoutes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "/Prechequeo"
            };

            // ARCHIVOS ESTÁTICOS Y RUTAS DE DESCUBRIMIENTO
            _staticFilePrefixes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "/css/", "/js/", "/images/", "/lib/", "/favicon.ico", "/assets/", "/.well-known/"
            };

            // RUTAS QUE SOLO REQUIEREN TOKEN (validación interna en controlador)
            _authenticatedOnlyRoutes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "/api/session"  // Cubre: /api/session/info, /api/session/user, etc.
            };
        }

        public async Task InvokeAsync(HttpContext context)
        {
            var currentPath = context.Request.Path.Value ?? "";

            // Console.WriteLine($"Middleware - Procesando ruta: '{currentPath}'");

            // 1. RUTAS PÚBLICAS (sin autenticación)
            if (IsPublicPath(currentPath))
            {
                // Console.WriteLine($"RUTA PÚBLICA - Acceso permitido: {currentPath}");
                await _next(context);
                return;
            }

            // 2. RUTAS AUTENTICADAS-ONLY (validación interna en controlador)
            if (IsAuthenticatedOnlyRoute(currentPath))
            {
                // Console.WriteLine($"RUTA AUTENTICADA-ONLY - Pasando al controlador: {currentPath}");
                await _next(context);
                return;
            }

            // 3. RUTAS PRIVADAS: requieren token + permisos
            // Console.WriteLine($"RUTA PRIVADA - Verificando autorización: {currentPath}");

            using var scope = _serviceProvider.CreateScope();
            var loginService = scope.ServiceProvider.GetRequiredService<LoginService>();

            var tokenSesion = context.Request.Cookies[CookieHelper.AUTH_COOKIE_NAME];

            // Token no presente
            if (string.IsNullOrEmpty(tokenSesion))
            {
                Console.WriteLine("Token de sesión no encontrado");
                await HandleUnauthorized(context, "Sesión expirada. Por favor, inicie sesión nuevamente.");
                return;
            }

            // Validar token JWT
            Services.SessionTokenInfo tokenInfo = loginService.ValidarToken(tokenSesion);

            if (!tokenInfo.EsValido)
            {
                Console.WriteLine($"Token inválido: {tokenInfo.MensajeError}");
                await LimpiarCookiesInvalidas(context);
                await HandleUnauthorized(context, "Token de sesión inválido. Por favor, inicie sesión nuevamente.");
                return;
            }

            // Extraer ruta base para permisos (ej. /TiemposMelaza → "TiemposMelaza", /TimerSync/start → "TimerSync")
            var routeBase = GetRouteBaseFromPath(currentPath);
            if (!string.IsNullOrWhiteSpace(routeBase))
            {
                // Verificar si tiene permiso al módulo base O a cualquier subruta del mismo
                // Ejemplo: permiso "TimerSync" da acceso a "TimerSync", "TimerSync/start", "TimerSync/stop", etc.
                bool tienePermiso = tokenInfo.Permisos != null &&
                                   tokenInfo.Permisos.Any(p =>
                                   {
                                       // Caso 1: Coincidencia exacta con la ruta base
                                       // Permiso "TimerSync" permite acceso a "/TimerSync"
                                       if (string.Equals(p, routeBase, StringComparison.OrdinalIgnoreCase))
                                           return true;

                                       // Caso 2: El currentPath empieza con el permiso
                                       // Permiso "TimerSync" permite acceso a "/TimerSync/start"
                                       var cleanPath = currentPath.TrimStart('/');
                                       if (cleanPath.StartsWith(p + "/", StringComparison.OrdinalIgnoreCase) ||
                                           string.Equals(cleanPath, p, StringComparison.OrdinalIgnoreCase))
                                           return true;

                                       return false;
                                   });

                if (!tienePermiso)
                {
                    Console.WriteLine($"ACCESO DENEGADO: {tokenInfo.Username} no tiene permiso para '{routeBase}' (ruta: {currentPath})");
                    Console.WriteLine($"Permisos del usuario: {string.Join(", ", tokenInfo.Permisos ?? new List<string>())}");
                    await HandleForbidden(context,
                        "No tienes permiso para realizar la acción",
                        tokenInfo.Permisos);
                    return;
                }

                Console.WriteLine($"ACCESO AUTORIZADO: {tokenInfo.Username} → '{routeBase}' (ruta: {currentPath})");
            }

            // Agregar información de usuario al contexto
            context.Items["UserInfo"] = new
            {
                CodUsuario = tokenInfo.CodUsuario,
                CodRol = tokenInfo.CodRol,
                Username = tokenInfo.Username,
                NombreRol = tokenInfo.NombreRol,
                CodBascula = tokenInfo.CodBascula,
                CodTurno = tokenInfo.CodTurno,
                TiempoRestanteHoras = tokenInfo.TiempoRestanteHoras,
                FechaExpiracion = tokenInfo.FechaExpiracion,
                Permisos = tokenInfo.Permisos
            };

            // Console.WriteLine($"Información de usuario agregada al contexto");

            await _next(context);
        }

        // ===================================================================
        // MÉTODOS AUXILIARES
        // ===================================================================

        private bool IsPublicPath(string path)
        {
            if (_exactPublicPaths.Contains(path))
                return true;

            foreach (var baseRoute in _publicBaseRoutes)
                if (path.StartsWith(baseRoute, StringComparison.OrdinalIgnoreCase))
                    return true;

            foreach (var prefix in _staticFilePrefixes)
                if (path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
                    return true;

            return false;
        }

        private bool IsAuthenticatedOnlyRoute(string path)
        {
            foreach (var route in _authenticatedOnlyRoutes)
                if (path.StartsWith(route, StringComparison.OrdinalIgnoreCase))
                    return true;

            return false;
        }

        private string? GetRouteBaseFromPath(string path)
        {
            if (string.IsNullOrEmpty(path) || path == "/")
                return null;

            var cleanPath = path.Split('?')[0].Split('#')[0];
            var segments = cleanPath.Split('/', StringSplitOptions.RemoveEmptyEntries);
            return segments.Length > 0 ? segments[0] : null;
        }

        private Task LimpiarCookiesInvalidas(HttpContext context)
        {
            CookieHelper.ClearAllSessionCookies(context);
            Console.WriteLine("Cookies inválidas eliminadas");
            return Task.CompletedTask;
        }

        private async Task HandleUnauthorized(HttpContext context, string message)
        {
            if (IsAjaxRequest(context.Request))
            {
                await ReturnUnauthorizedJson(context, message);
            }
            else
            {
                context.Response.Redirect("/Login");
            }
        }

        private async Task HandleForbidden(HttpContext context, string message, List<string>? permisosDelToken)
        {
            if (IsAjaxRequest(context.Request))
            {
                await ReturnForbiddenJson(context, message);
            }
            else
            {
                var paginaPermitida = permisosDelToken?.FirstOrDefault();
                var redirectTo = !string.IsNullOrEmpty(paginaPermitida) 
                    ? $"/{paginaPermitida}" 
                    : "/Login";

                Console.WriteLine($"Redirigiendo a: {redirectTo}");
                context.Response.Redirect(redirectTo);
            }
        }

        private bool IsAjaxRequest(HttpRequest request)
        {
            return request.Headers["X-Requested-With"] == "XMLHttpRequest" ||
                   request.Headers["Content-Type"].ToString().Contains("application/json") ||
                   request.Path.Value?.Contains("/api/", StringComparison.OrdinalIgnoreCase) == true;
        }

        private async Task ReturnUnauthorizedJson(HttpContext context, string message)
        {
            context.Response.StatusCode = 401;
            context.Response.ContentType = "application/json";

            var response = System.Text.Json.JsonSerializer.Serialize(new
            {
                success = false,
                message = message,
                requiresLogin = true
            });

            await context.Response.WriteAsync(response);
        }

        private async Task ReturnForbiddenJson(HttpContext context, string message)
        {
            context.Response.StatusCode = 403;
            context.Response.ContentType = "application/json";

            var response = System.Text.Json.JsonSerializer.Serialize(new
            {
                success = false,
                message = message,
                requiresPermission = true
            });

            await context.Response.WriteAsync(response);
        }
    }
}