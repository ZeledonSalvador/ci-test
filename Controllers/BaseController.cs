using Microsoft.AspNetCore.Mvc;
using System.Dynamic;

namespace FrontendQuickpass.Controllers
{
    /// <summary>
    /// Controlador base con utilidades comunes para todos los controladores
    /// </summary>
    public class BaseController : Controller
    {
        /// <summary>
        /// Obtiene la información del usuario autenticado desde el contexto HTTP.
        /// El middleware RoleAuthorizationMiddleware ya validó el token JWT y agregó esta información.
        /// </summary>
        /// <returns>Información del usuario o null si no está disponible</returns>
        protected dynamic? GetUserInfo()
        {
            if (HttpContext.Items.TryGetValue("UserInfo", out var userInfo))
            {
                return userInfo;
            }
            return null;
        }

        /// <summary>
        /// Obtiene el código de usuario autenticado desde el contexto HTTP.
        /// </summary>
        /// <returns>Código de usuario o 0 si no está disponible</returns>
        protected int GetUserId()
        {
            var userInfo = GetUserInfo();
            if (userInfo != null)
            {
                try
                {
                    // userInfo es un objeto anónimo con la propiedad CodUsuario
                    var expandoDict = userInfo as IDictionary<string, object>;
                    if (expandoDict != null && expandoDict.ContainsKey("CodUsuario"))
                    {
                        return Convert.ToInt32(expandoDict["CodUsuario"]);
                    }

                    // Intentar acceso directo usando reflexión
                    var type = userInfo.GetType();
                    var prop = type.GetProperty("CodUsuario");
                    if (prop != null)
                    {
                        return Convert.ToInt32(prop.GetValue(userInfo));
                    }
                }
                catch
                {
                    return 0;
                }
            }
            return 0;
        }

        /// <summary>
        /// Obtiene el nombre de usuario autenticado desde el contexto HTTP.
        /// </summary>
        /// <returns>Nombre de usuario o null si no está disponible</returns>
        protected string? GetUsername()
        {
            var userInfo = GetUserInfo();
            if (userInfo != null)
            {
                try
                {
                    // userInfo es un objeto anónimo con la propiedad Username
                    var expandoDict = userInfo as IDictionary<string, object>;
                    if (expandoDict != null && expandoDict.ContainsKey("Username"))
                    {
                        return expandoDict["Username"]?.ToString();
                    }

                    // Intentar acceso directo usando reflexión
                    var type = userInfo.GetType();
                    var prop = type.GetProperty("Username");
                    if (prop != null)
                    {
                        return prop.GetValue(userInfo)?.ToString();
                    }
                }
                catch
                {
                    return null;
                }
            }
            return null;
        }

        /// <summary>
        /// Verifica si hay un usuario autenticado en el contexto.
        /// </summary>
        /// <returns>True si hay usuario autenticado, false en caso contrario</returns>
        protected bool IsAuthenticated()
        {
            return GetUserInfo() != null;
        }

        /// <summary>
        /// Retorna un JSON de error con formato estándar para usuarios no autenticados.
        /// Este método solo debería usarse en casos excepcionales donde el middleware no interceptó la solicitud.
        /// </summary>
        protected JsonResult JsonErrorUnauthorized(string message = "Usuario no autenticado")
        {
            Response.StatusCode = 401;
            return Json(new
            {
                success = false,
                message = message
            });
        }

        /// <summary>
        /// Retorna un JSON de error con formato estándar.
        /// </summary>
        protected JsonResult JsonError(string message, int statusCode = 400)
        {
            Response.StatusCode = statusCode;
            return Json(new
            {
                success = false,
                message = message
            });
        }

        /// <summary>
        /// Retorna un JSON de éxito con formato estándar.
        /// </summary>
        protected JsonResult JsonSuccess(string message, object? data = null)
        {
            return Json(new
            {
                success = true,
                message = message,
                data = data
            });
        }
    }
}
