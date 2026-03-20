using Microsoft.AspNetCore.Mvc;
using FrontendQuickpass.Services;
using FrontendQuickpass.Helpers;
using System.Text.Json;

namespace FrontendQuickpass.Controllers
{
    public class LoginController : Controller
    {
        private readonly LoginService _loginService;

        public LoginController(LoginService loginService)
        {
            _loginService = loginService;
        }

        [HttpGet]
        public IActionResult Index()
        {
            // Verificar si ya está logueado con token JWT válido
            var tokenSesion = Request.Cookies[CookieHelper.AUTH_COOKIE_NAME];
            
            if (!string.IsNullOrEmpty(tokenSesion))
            {
                var tokenInfo = _loginService.ValidarToken(tokenSesion);
                
                if (tokenInfo.EsValido)
                {
                    // Verificar que tenga permiso a Dashboard
                    if (HasDashboardPermission(tokenInfo.Permisos))
                    {
                        Console.WriteLine($"Usuario ya logueado con token válido (Rol: {tokenInfo.CodRol}, Usuario: {tokenInfo.Username})");
                        Console.WriteLine($"Redirigiendo a Dashboard Diario");
                        return Redirect("/Dashboard");
                    }
                    else
                    {
                        // Token válido pero sin permiso a Dashboard - limpiar sesión
                        Console.WriteLine($"Usuario {tokenInfo.Username} sin permiso a Dashboard - limpiando sesión");
                        CookieHelper.ClearAllSessionCookies(Response);
                        TempData["MensajeError"] = "Usuario o contraseña incorrectos.";
                    }
                }
                else
                {
                    // Token inválido o expirado, limpiar cookie
                    Response.Cookies.Delete(CookieHelper.AUTH_COOKIE_NAME);
                    Console.WriteLine($"Token inválido encontrado y eliminado: {tokenInfo.MensajeError}");
                    
                    if (!string.IsNullOrEmpty(tokenInfo.MensajeError))
                    {
                        TempData["MensajeWarning"] = $"Su sesión ha expirado: {tokenInfo.MensajeError}. Por favor, inicie sesión nuevamente.";
                    }
                }
            }
            
            Console.WriteLine("Mostrando página de login");
            return View("Login");
        }

        [HttpPost]
        public async Task<IActionResult> Index(string Usuario, string Clave)
        {
            Console.WriteLine($"Intento de login - Usuario: {Usuario}");

            // Validar campos obligatorios
            if (string.IsNullOrEmpty(Usuario) || string.IsNullOrEmpty(Clave))
            {
                Console.WriteLine("Usuario o contraseña vacíos");
                TempData["MensajeError"] = "Debe ingresar usuario y contraseña.";
                return RedirectToAction("Index");
            }

            // =====================================================
            // AUTENTICACIÓN VIA API (ÚNICO MÉTODO)
            // =====================================================
            var internalUserSession = await _loginService.AuthenticateInternalUserAsync(Usuario, Clave);

            if (internalUserSession.IsValid)
            {
                // CREAR TOKEN JWT LOCAL con los datos del API
                var tokenLocal = _loginService.CrearTokenSesion(
                    internalUserSession.UserId,
                    internalUserSession.RoleId,
                    internalUserSession.Username,
                    internalUserSession.PermissionsRoutes,
                    internalUserSession.RoleName,
                    internalUserSession.FullName,
                    internalUserSession.ClientCode
                );

                if (!tokenLocal.EsValido)
                {
                    TempData["MensajeError"] = "Error al crear sesión local";
                    return RedirectToAction("Index");
                }

                return await ProcessInternalUserLogin(internalUserSession, tokenLocal);
            }

            // =====================================================
            // ERROR DE AUTENTICACIÓN
            // =====================================================
            TempData["MensajeError"] = internalUserSession.ErrorMessage;
            return RedirectToAction("Index");
        }

        /// <summary>
        /// Procesar login de usuario y crear cookies
        /// </summary>
        private Task<IActionResult> ProcessInternalUserLogin(InternalUserSessionInfo session, SessionTokenInfo tokenLocal)
        {
            // Validar que el usuario tenga permiso a Dashboard
            if (!HasDashboardPermission(tokenLocal.Permisos))
            {
                Console.WriteLine($"ACCESO DENEGADO: {session.Username} no tiene permiso a Dashboard");
                TempData["MensajeError"] = "Usuario o contraseña incorrectos.";
                return Task.FromResult<IActionResult>(RedirectToAction("Index"));
            }

            // Limpiar cookies anteriores usando CookieHelper centralizado
            CookieHelper.ClearAllSessionCookies(Response);

            // Configurar opciones de cookies usando CookieHelper
            var cookieOptions = CookieHelper.GetSecureCookieOptions(tokenLocal.FechaExpiracion);
            var cookieOptionsReadable = CookieHelper.GetReadableCookieOptions(tokenLocal.FechaExpiracion);

            // Token JWT (principal cookie de sesión) - nombre ofuscado para seguridad
            Response.Cookies.Append(CookieHelper.AUTH_COOKIE_NAME, tokenLocal.Token, cookieOptions);

            // FASE 4: Cookies redundantes comentadas - Todos estos datos están disponibles en el JWT via SessionHelper
            // Lectura centralizada en SessionHelper: HttpContext.GetSessionHelper(_loginService)
            // Response.Cookies.Append("cod_bascula", basculaSeleccionada, cookieOptions);
            // Response.Cookies.Append("cod_usuario", session.UserId.ToString(), cookieOptions);
            // Response.Cookies.Append("full_name", session.FullName, cookieOptionsReadable);
            // Response.Cookies.Append("username", session.Username, cookieOptionsReadable);

            // Redirigir al Dashboard Diario
            Console.WriteLine($"ACCESO AUTORIZADO: {session.Username} → Dashboard Diario");
            return Task.FromResult<IActionResult>(Redirect("/Dashboard"));
        }

        /// <summary>
        /// Verifica si el usuario tiene permiso a Dashboard
        /// </summary>
        private bool HasDashboardPermission(List<string> permisos)
        {
            return permisos != null && 
                   permisos.Any(p => p.Equals("Dashboard", StringComparison.OrdinalIgnoreCase));
        }

        [Route("/Logout")]
        public IActionResult Logout()
        {
            Console.WriteLine("Iniciando proceso de logout...");

            // Obtener información del usuario desde el token JWT (antes de eliminar cookies)
            var tokenSesion = Request.Cookies[CookieHelper.AUTH_COOKIE_NAME];
            string fullName = "Usuario";

            // Obtener datos del token JWT (incluye full_name desde Fase 2)
            if (!string.IsNullOrEmpty(tokenSesion))
            {
                try
                {
                    var tokenInfo = _loginService.ValidarToken(tokenSesion);
                    if (tokenInfo.EsValido)
                    {
                        fullName = !string.IsNullOrEmpty(tokenInfo.FullName)
                            ? tokenInfo.FullName
                            : tokenInfo.Username;
                    }
                }
                catch
                {
                    // Si hay error al validar el token, usar valor por defecto
                    fullName = "Usuario";
                }
            }

            Console.WriteLine($"Cerrando sesión del usuario: {fullName}");

            // Limpiar datos de sesión del servidor y todas las cookies de autenticación
            HttpContext.Session.Clear();
            CookieHelper.ClearAllSessionCookies(Response);
            Console.WriteLine($"Logout completado - Sesión y cookies eliminadas");
            TempData["MensajeInfo"] = $"¡Hasta pronto, {fullName}!";

            return RedirectToAction("Index");
        }
    }
}