using FrontendQuickpass.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

namespace FrontendQuickpass.Helpers
{
    /// <summary>
    /// Helper global para validar permisos en vistas Razor y JavaScript
    /// 🔐 SEGURO: Lee permisos desde el token JWT firmado (no desde cookies editables)
    /// </summary>
    public static class PermissionHelper
    {
        /// <summary>
        /// Validar token y obtener información de sesión
        /// </summary>
        private static SessionTokenInfo? GetTokenInfo(HttpContext context)
        {
            var tokenSesion = context.Request.Cookies[CookieHelper.AUTH_COOKIE_NAME];
            if (string.IsNullOrEmpty(tokenSesion))
                return null;

            try
            {
                // Obtener LoginService desde el HttpContext
                var loginService = context.RequestServices.GetService<LoginService>();
                if (loginService == null)
                    return null;

                var tokenInfo = loginService.ValidarToken(tokenSesion);
                return tokenInfo?.EsValido == true ? tokenInfo : null;
            }
            catch
            {
                return null;
            }
        }

        /// <summary>
        /// Obtener el código del rol del usuario actual (desde RoleMapper)
        /// </summary>
        public static string GetRoleCode(HttpContext context)
        {
            var tokenInfo = GetTokenInfo(context);
            if (tokenInfo == null)
                return "";

            // Mapear roleId a roleCode usando RoleMapper
            var roleId = tokenInfo.CodRol;
            return RoleMapper.GetRoleCodeById(roleId);
        }

        /// <summary>
        /// Validar si el usuario tiene un rol específico
        /// </summary>
        public static bool HasRole(HttpContext context, string roleCode)
        {
            var userRoleCode = GetRoleCode(context);
            return string.Equals(userRoleCode, roleCode, StringComparison.OrdinalIgnoreCase);
        }

        /// <summary>
        /// Validar si el usuario tiene alguno de los roles especificados
        /// </summary>
        public static bool HasAnyRole(HttpContext context, params string[] roleCodes)
        {
            var userRoleCode = GetRoleCode(context);
            return roleCodes.Any(role => string.Equals(userRoleCode, role, StringComparison.OrdinalIgnoreCase));
        }

        /// <summary>
        /// Validar si el usuario puede realizar una acción en un módulo específico
        /// 🔐 Lee permisos desde el token JWT
        /// </summary>
        public static bool Can(HttpContext context, string module, string action)
        {
            var tokenInfo = GetTokenInfo(context);
            if (tokenInfo == null || tokenInfo.Permisos == null)
                return false;

            // Por ahora validamos solo si tiene el módulo
            // TODO: Implementar validación de acciones específicas cuando el token las incluya
            return tokenInfo.Permisos.Any(p =>
                string.Equals(p, module, StringComparison.OrdinalIgnoreCase));
        }

        /// <summary>
        /// Validar si el usuario tiene acceso a un módulo (sin importar las acciones)
        /// 🔐 Lee permisos desde el token JWT
        /// </summary>
        public static bool HasModule(HttpContext context, string module)
        {
            var tokenInfo = GetTokenInfo(context);
            if (tokenInfo == null || tokenInfo.Permisos == null)
                return false;

            return tokenInfo.Permisos.Any(p =>
                string.Equals(p, module, StringComparison.OrdinalIgnoreCase));
        }

        /// <summary>
        /// Obtener todas las acciones permitidas para un módulo
        /// 🔐 Lee permisos desde el token JWT
        /// </summary>
        public static List<string> GetModuleActions(HttpContext context, string module)
        {
            var tokenInfo = GetTokenInfo(context);
            if (tokenInfo == null || tokenInfo.Permisos == null)
                return new List<string>();

            // Si tiene acceso al módulo, por ahora retornamos todas las acciones
            // TODO: Implementar acciones específicas cuando el token las incluya
            var hasModule = tokenInfo.Permisos.Any(p =>
                string.Equals(p, module, StringComparison.OrdinalIgnoreCase));

            return hasModule
                ? new List<string> { "CREATE", "READ", "UPDATE", "DELETE" }
                : new List<string>();
        }

        /// <summary>
        /// Validar si es administrador (para accesos totales)
        /// </summary>
        public static bool IsAdmin(HttpContext context)
        {
            return HasRole(context, "ADMINISTRADOR");
        }
    }
}
