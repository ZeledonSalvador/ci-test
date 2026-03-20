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

        /// <summary>
        /// Obtiene los ingenios permitidos según el rol del usuario autenticado.
        /// Si es CLIENTE (rol 8), solo retorna su ingenio correspondiente.
        /// Si es otro rol, retorna todos los ingenios.
        /// </summary>
        protected List<IngenioOption> GetIngeniosPermitidos()
        {
            var userInfo = GetUserInfo();
            const int ROL_CLIENTE = 13;

            // Lista completa de ingenios
            var ingeniosCompletos = new List<IngenioOption>
            {
                new IngenioOption { Value = "JB", Text = "Ingenio Central Azucarero Jiboa" },
                new IngenioOption { Value = "ILC", Text = "Ingenio La Cabaña" },
                new IngenioOption { Value = "IEA", Text = "Ingenio El Angel" },
                new IngenioOption { Value = "ILM", Text = "Ingenio La Magdalena" },
                new IngenioOption { Value = "ICHP", Text = "Ingenio Chaparrastique" },
                new IngenioOption { Value = "CASSA", Text = "Compañía Azucarera Salvadoreña" }
            };

            if (userInfo == null)
            {
                return ingeniosCompletos;
            }

            try
            {
                int codRol = 0;
                string? clientCode = null;
                string? fullName = null;
                string? username = null;

                // Intentar como IDictionary (ExpandoObject)
                var expandoDict = userInfo as IDictionary<string, object>;
                if (expandoDict != null)
                {
                    codRol = expandoDict.ContainsKey("CodRol") ? Convert.ToInt32(expandoDict["CodRol"]) : 0;
                    clientCode = expandoDict.ContainsKey("ClientCode") ? expandoDict["ClientCode"]?.ToString() : null;
                    fullName = expandoDict.ContainsKey("FullName") ? expandoDict["FullName"]?.ToString() : null;
                    username = expandoDict.ContainsKey("Username") ? expandoDict["Username"]?.ToString() : null;
                }
                else
                {
                    // Fallback: reflexión para tipos anónimos
                    var type = userInfo.GetType();
                    var propRol = type.GetProperty("CodRol");
                    var propClientCode = type.GetProperty("ClientCode");
                    var propFullName = type.GetProperty("FullName");
                    var propUsername = type.GetProperty("Username");

                    if (propRol != null) codRol = Convert.ToInt32(propRol.GetValue(userInfo));
                    if (propClientCode != null) clientCode = propClientCode.GetValue(userInfo)?.ToString();
                    if (propFullName != null) fullName = propFullName.GetValue(userInfo)?.ToString();
                    if (propUsername != null) username = propUsername.GetValue(userInfo)?.ToString();
                }

                // Si es cliente, filtrar por su ingenio
                if (codRol == ROL_CLIENTE)
                {
                    // Prioridad 1: buscar por ClientCode (ej. "IEA" → Value)
                    if (!string.IsNullOrEmpty(clientCode))
                    {
                        var ingenioDelCliente = ingeniosCompletos.FirstOrDefault(i => i.Value.Equals(clientCode, StringComparison.OrdinalIgnoreCase));
                        if (ingenioDelCliente != null)
                        {
                            return new List<IngenioOption> { ingenioDelCliente };
                        }
                    }

                    // Fallback 1: buscar por FullName (ej. "Ingenio El Angel" → Text)
                    if (!string.IsNullOrEmpty(fullName))
                    {
                        var ingenioDelCliente = ingeniosCompletos.FirstOrDefault(i => i.Text.Equals(fullName, StringComparison.OrdinalIgnoreCase));
                        if (ingenioDelCliente != null)
                        {
                            return new List<IngenioOption> { ingenioDelCliente };
                        }
                    }

                    // Fallback 2: buscar por Username (ej. "IEA" → Value)
                    if (!string.IsNullOrEmpty(username))
                    {
                        var ingenioDelCliente = ingeniosCompletos.FirstOrDefault(i => i.Value.Equals(username, StringComparison.OrdinalIgnoreCase));
                        if (ingenioDelCliente != null)
                        {
                            return new List<IngenioOption> { ingenioDelCliente };
                        }
                    }
                }

                return ingeniosCompletos;
            }
            catch
            {
                return ingeniosCompletos;
            }
        }
    }

    /// <summary>
    /// Representa una opción del select de ingenios
    /// </summary>
    public class IngenioOption
    {
        public string Value { get; set; } = string.Empty;
        public string Text { get; set; } = string.Empty;
    }
}
