using FrontendQuickpass.Services;
using Microsoft.AspNetCore.Http;

namespace FrontendQuickpass.Helpers
{
    /// <summary>
    /// Helper para obtener información de sesión desde el JWT de forma centralizada
    /// Reemplaza la lectura directa de cookies individuales
    /// </summary>
    public class SessionHelper
    {
        private readonly LoginService _loginService;
        private readonly HttpContext _httpContext;
        private SessionTokenInfo? _cachedTokenInfo;

        public SessionHelper(LoginService loginService, HttpContext httpContext)
        {
            _loginService = loginService;
            _httpContext = httpContext;
        }

        /// <summary>
        /// Obtiene y cachea la información del token JWT de la sesión actual
        /// </summary>
        private SessionTokenInfo GetTokenInfo()
        {
            if (_cachedTokenInfo != null)
                return _cachedTokenInfo;

            var tokenSesion = _httpContext.Request.Cookies[CookieHelper.AUTH_COOKIE_NAME];
            if (string.IsNullOrEmpty(tokenSesion))
            {
                return new SessionTokenInfo { EsValido = false, MensajeError = "No hay sesión activa" };
            }

            _cachedTokenInfo = _loginService.ValidarToken(tokenSesion);
            return _cachedTokenInfo;
        }

        /// <summary>
        /// Obtiene el código de usuario desde el JWT
        /// </summary>
        public string CodUsuario
        {
            get
            {
                var tokenInfo = GetTokenInfo();
                return tokenInfo.EsValido ? tokenInfo.CodUsuario.ToString() : "";
            }
        }

        /// <summary>
        /// Obtiene el username desde el JWT
        /// </summary>
        public string Username
        {
            get
            {
                var tokenInfo = GetTokenInfo();
                return tokenInfo.EsValido ? tokenInfo.Username : "";
            }
        }

        /// <summary>
        /// Obtiene el nombre completo desde el JWT
        /// </summary>
        public string FullName
        {
            get
            {
                var tokenInfo = GetTokenInfo();
                return tokenInfo.EsValido ? tokenInfo.FullName : "";
            }
        }

        /// <summary>
        /// Obtiene el código de báscula desde el JWT
        /// </summary>
        public string CodBascula
        {
            get
            {
                var tokenInfo = GetTokenInfo();
                return tokenInfo.EsValido ? tokenInfo.CodBascula : "";
            }
        }

        /// <summary>
        /// Obtiene el código de turno desde el JWT
        /// </summary>
        public string CodTurno
        {
            get
            {
                var tokenInfo = GetTokenInfo();
                return tokenInfo.EsValido ? tokenInfo.CodTurno : "";
            }
        }

        /// <summary>
        /// Obtiene el código de rol desde el JWT
        /// </summary>
        public int CodRol
        {
            get
            {
                var tokenInfo = GetTokenInfo();
                return tokenInfo.EsValido ? tokenInfo.CodRol : 0;
            }
        }

        /// <summary>
        /// Obtiene el nombre del rol desde el JWT
        /// </summary>
        public string NombreRol
        {
            get
            {
                var tokenInfo = GetTokenInfo();
                return tokenInfo.EsValido ? tokenInfo.NombreRol : "";
            }
        }

        /// <summary>
        /// Verifica si hay una sesión válida
        /// </summary>
        public bool IsValid
        {
            get
            {
                var tokenInfo = GetTokenInfo();
                return tokenInfo.EsValido;
            }
        }

        /// <summary>
        /// Obtiene la información completa del token
        /// </summary>
        public SessionTokenInfo TokenInfo => GetTokenInfo();
    }

    /// <summary>
    /// Extensión para crear SessionHelper desde HttpContext
    /// </summary>
    public static class SessionHelperExtensions
    {
        /// <summary>
        /// Crea un SessionHelper para el contexto actual
        /// Requiere que LoginService esté registrado en DI
        /// </summary>
        public static SessionHelper GetSessionHelper(this HttpContext context, LoginService loginService)
        {
            return new SessionHelper(loginService, context);
        }
    }
}
