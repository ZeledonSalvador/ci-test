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
                    Console.WriteLine($"Usuario ya logueado con token válido (Rol: {tokenInfo.CodRol}, Usuario: {tokenInfo.Username})");
                    Console.WriteLine($"Permisos del token: {string.Join(", ", tokenInfo.Permisos)}");

                    // REDIRIGIR A LA PRIMERA PÁGINA PERMITIDA SEGÚN PERMISOS DEL USUARIO
                    if (tokenInfo.Permisos != null && tokenInfo.Permisos.Any())
                    {
                        var primerPermiso = tokenInfo.Permisos.First();
                        Console.WriteLine($"Redirigiendo a primera página permitida: {primerPermiso}");
                        return RedirectToAction("Index", primerPermiso);
                    }
                    else
                    {
                        Console.WriteLine("⚠️ No hay permisos en el token, redirigiendo a Dashboard por defecto");
                        return RedirectToAction("Index", "Dashboard");
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
        public async Task<IActionResult> Index(string Usuario, string Clave, string Bascula, string Turno)
        {
            Console.WriteLine($"Intento de login - Usuario: {Usuario}, Báscula: {Bascula}, Turno: {Turno}");

            // Validar campos obligatorios
            if (string.IsNullOrEmpty(Usuario) || string.IsNullOrEmpty(Clave))
            {
                Console.WriteLine("Usuario o contraseña vacíos");
                TempData["MensajeError"] = "Debe ingresar usuario y contraseña.";
                return RedirectToAction("Index");
            }

            if (string.IsNullOrEmpty(Bascula) || Bascula == "0")
            {
                Console.WriteLine("Báscula no seleccionada");
                TempData["MensajeError"] = "Debe seleccionar una báscula.";
                return RedirectToAction("Index");
            }

            // =====================================================
            // AUTENTICACIÓN VIA API (ÚNICO MÉTODO)
            // =====================================================
            // Console.WriteLine("🔍 Autenticando usuario via API...");

            // El API valida credenciales, báscula y turno internamente
            var internalUserSession = await _loginService.AuthenticateInternalUserAsync(Usuario, Clave, Bascula, Turno ?? "1");

            if (internalUserSession.IsValid)
            {
                // Console.WriteLine($"✅ Usuario autenticado: {internalUserSession.FullName}");
                // Console.WriteLine($"✅ Acceso a báscula {Bascula} validado por el API");

                // CREAR TOKEN JWT LOCAL con los datos del API
                var tokenLocal = _loginService.CrearTokenSesion(
                    internalUserSession.UserId,
                    internalUserSession.RoleId,
                    internalUserSession.Username,
                    Bascula,
                    Turno ?? "1",
                    internalUserSession.PermissionsRoutes, // Permisos del API
                    internalUserSession.RoleName, // Nombre del rol del API
                    internalUserSession.FullName // Nombre completo del usuario
                );

                if (!tokenLocal.EsValido)
                {
                    TempData["MensajeError"] = "Error al crear sesión local";
                    return RedirectToAction("Index");
                }

                return await ProcessInternalUserLogin(internalUserSession, Bascula, tokenLocal);
            }

            // =====================================================
            // ERROR DE AUTENTICACIÓN
            // =====================================================
            // Console.WriteLine($"❌ Error de autenticación: {internalUserSession.ErrorMessage}");
            TempData["MensajeError"] = internalUserSession.ErrorMessage;
            return RedirectToAction("Index");
        }

        /// <summary>
        /// Procesar login de usuario y crear cookies
        /// </summary>
        private Task<IActionResult> ProcessInternalUserLogin(InternalUserSessionInfo session, string _, SessionTokenInfo tokenLocal)
        {
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

            // Resto del código existente...
            var firstPermission = session.Permissions.FirstOrDefault(p => p.IsVisible);
            if (firstPermission != null)
            {
                return Task.FromResult<IActionResult>(RedirectToAction("Index", firstPermission.Route));
            }
            else
            {
                return Task.FromResult<IActionResult>(RedirectToAction("Index", "Dashboard"));
            }
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

            // Eliminar todas las cookies relacionadas con la autenticación usando CookieHelper
            CookieHelper.ClearAllSessionCookies(Response);
            Console.WriteLine($"✅ Logout completado - Cookies de sesión eliminadas");
            TempData["MensajeInfo"] = $"¡Hasta pronto, {fullName}!";

            return RedirectToAction("Index");
        }
    }
}