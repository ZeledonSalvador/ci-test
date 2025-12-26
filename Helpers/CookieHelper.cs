namespace FrontendQuickpass.Helpers
{
    /// <summary>
    /// Helper centralizado para gestión de cookies de sesión
    /// </summary>
    public static class CookieHelper
    {
        // SEGURIDAD: Nombre de cookie ofuscado para dificultar ataques
        // Nota: __Host- requiere Secure=true (HTTPS). Usar nombre simple hasta habilitar HTTPS
        public const string AUTH_COOKIE_NAME = ".QPS.QPS";

        /// <summary>
        /// Lista completa de cookies de sesión que deben limpiarse al cerrar sesión
        /// </summary>
        public static readonly string[] SessionCookies = new[]
        {
            // Cookie principal de autenticación
            AUTH_COOKIE_NAME,          // Token JWT principal (ÚNICO necesario para autenticación)
            "sesion_activa",           // Legacy - mantener para migración

            // Cookies de datos de usuario (Ya se leen desde JWT en Fase 2)
            "cod_usuario",             // Se lee desde JWT via SessionHelper
            "username",                // Se lee desde JWT via SessionHelper
            "cod_bascula",             // Se lee desde JWT via SessionHelper
            "full_name",               // Se lee desde JWT via SessionHelper

            // Cookies de contexto (legacy - mantener para compatibilidad temporal)
            "cod_turno",               // Nunca se crea como cookie, solo en JWT

            // Cookies de token
            "token_info"
        };

        /// <summary>
        /// Limpia todas las cookies de sesión del usuario
        /// </summary>
        /// <param name="context">HttpContext actual</param>
        public static void ClearAllSessionCookies(HttpContext context)
        {
            foreach (var cookieName in SessionCookies)
            {
                context.Response.Cookies.Delete(cookieName);
            }
        }

        /// <summary>
        /// Limpia todas las cookies de sesión del usuario (versión Response)
        /// </summary>
        /// <param name="response">HttpResponse actual</param>
        public static void ClearAllSessionCookies(HttpResponse response)
        {
            foreach (var cookieName in SessionCookies)
            {
                response.Cookies.Delete(cookieName);
            }
        }

        /// <summary>
        /// Verifica si una cookie específica existe y tiene valor
        /// </summary>
        public static bool HasCookie(HttpContext context, string cookieName)
        {
            return !string.IsNullOrEmpty(context.Request.Cookies[cookieName]);
        }

        /// <summary>
        /// Obtiene el valor de una cookie de forma segura
        /// </summary>
        public static string? GetCookie(HttpContext context, string cookieName)
        {
            return context.Request.Cookies[cookieName];
        }

        /// <summary>
        /// Configuración estándar para cookies HttpOnly (seguras)
        /// SEGURIDAD MEJORADA:
        /// - HttpOnly: JavaScript no puede leer la cookie (previene XSS)
        /// - Secure: Solo se envía por HTTPS (previene man-in-the-middle)
        /// - SameSite=Lax: Permite redirects POST pero previene CSRF de otros sitios
        /// </summary>
        public static CookieOptions GetSecureCookieOptions(DateTime expirationDate)
        {
            return new CookieOptions
            {
                Expires = expirationDate,
                HttpOnly = true,                    // ✅ No accesible desde JavaScript (previene XSS)
                Secure = false,                     // ⚠️ Cambiar a true cuando se habilite HTTPS en producción
                SameSite = SameSiteMode.Lax,        // ✅ Balance: permite POST redirects, previene CSRF
                Path = "/"
            };
        }

        /// <summary>
        /// Configuración para cookies legibles por JavaScript (menos seguras)
        /// USO: Solo para cookies que requieren ser leídas por JavaScript en frontend
        /// </summary>
        public static CookieOptions GetReadableCookieOptions(DateTime expirationDate)
        {
            return new CookieOptions
            {
                Expires = expirationDate,
                HttpOnly = false,                   // ⚠️ JavaScript puede leerla
                Secure = false,                     // ⚠️ Cambiar a true cuando se habilite HTTPS en producción
                SameSite = SameSiteMode.Lax,        // ✅ Balance: permite POST redirects, previene CSRF
                Path = "/"
            };
        }
    }
}
