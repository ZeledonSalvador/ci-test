using Microsoft.AspNetCore.Mvc;
using FrontendQuickpass.Services;
using FrontendQuickpass.Helpers;
using System.Text.Json;

namespace FrontendQuickpass.Controllers
{
    /// <summary>
    /// Controlador para obtener datos de sesión del usuario (para JavaScript)
    /// </summary>
    [Route("api/[controller]")]
    [ApiController]
    public class SessionController : ControllerBase
    {
        private readonly LoginService _loginService;

        public SessionController(LoginService loginService)
        {
            _loginService = loginService;
        }

        /// <summary>
        /// Obtener información de sesión del usuario actual (validada por el servidor)
        /// GET /api/session/info
        /// </summary>
        [HttpGet("info")]
        public IActionResult GetSessionInfo()
        {
            // Obtener token de sesión (HttpOnly)
            var tokenSesion = Request.Cookies[CookieHelper.AUTH_COOKIE_NAME];

            if (string.IsNullOrEmpty(tokenSesion))
            {
                return Unauthorized(new { message = "No hay sesión activa" });
            }

            // Validar token
            var tokenInfo = _loginService.ValidarToken(tokenSesion);

            if (!tokenInfo.EsValido)
            {
                return Unauthorized(new { message = "Sesión inválida o expirada" });
            }

            // NOTA: Validación dual con full_name_hash eliminada (redundante con JWT)

            // Extraer permisos del token
            var permisos = tokenInfo.Permisos ?? new List<string>();

            // Obtener rol code desde el nombre del rol (del token)
            var roleName = tokenInfo.NombreRol;
            var roleCode = RoleMapper.GetRoleCodeByName(roleName);

            // Devolver solo información necesaria para el frontend (NO sensible)
            return Ok(new
            {
                username = tokenInfo.Username,
                roleCode = roleCode,
                roleName = roleName,
                permissions = permisos,
                isValid = true,
                expiresAt = tokenInfo.FechaExpiracion
            });
        }

        /// <summary>
        /// Obtener información del usuario para el header (solo datos de UI)
        /// GET /api/session/user
        /// </summary>
        [HttpGet("user")]
        public IActionResult GetUserInfo()
        {
            var tokenSesion = Request.Cookies[CookieHelper.AUTH_COOKIE_NAME];

            if (string.IsNullOrEmpty(tokenSesion))
            {
                return Unauthorized(new { message = "No hay sesión activa" });
            }

            var tokenInfo = _loginService.ValidarToken(tokenSesion);

            if (!tokenInfo.EsValido)
            {
                return Unauthorized(new { message = "Sesión inválida" });
            }

            // Obtener full_name desde JWT (disponible desde Fase 2)
            var fullName = !string.IsNullOrEmpty(tokenInfo.FullName)
                ? tokenInfo.FullName
                : tokenInfo.Username;

            return Ok(new
            {
                username = tokenInfo.Username,
                fullName = fullName,
                roleName = tokenInfo.NombreRol
            });
        }

    }
}
