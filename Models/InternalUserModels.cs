using System.Text.Json.Serialization;

namespace FrontendQuickpass.Models
{
    // =====================================================
    // MODELOS PARA AUTENTICACIÓN DE USUARIOS INTERNOS
    // =====================================================

    /// <summary>
    /// Request para login de usuarios internos
    /// </summary>
    public class InternalUserLoginRequest
    {
        [JsonPropertyName("username")]
        public string Username { get; set; } = string.Empty;

        [JsonPropertyName("password")]
        public string Password { get; set; } = string.Empty;

        [JsonPropertyName("bascula")]
        public string Bascula { get; set; } = string.Empty;

        [JsonPropertyName("turno")]
        public string Turno { get; set; } = "1";
    }

    /// <summary>
    /// Response completo del API de login interno
    /// </summary>
    public class InternalUserLoginResponse
    {
        [JsonPropertyName("success")]
        public bool Success { get; set; }

        [JsonPropertyName("message")]
        public string Message { get; set; } = string.Empty;

        [JsonPropertyName("data")]
        public InternalUserLoginData? Data { get; set; }
    }

    /// <summary>
    /// Response de error específico para autenticación interna
    /// </summary>
    public class InternalAuthErrorResponse
    {
        [JsonPropertyName("message")]
        public string Message { get; set; } = string.Empty;

        [JsonPropertyName("error")]
        public string Error { get; set; } = string.Empty;

        [JsonPropertyName("statusCode")]
        public int StatusCode { get; set; }
    }

    // NOTA: Clases TokenVerify* y TokenPayload eliminadas en Fase 3
    // (nunca se implementó la verificación de token con el API)

    /// <summary>
    /// Datos del usuario y permisos
    /// </summary>
    public class InternalUserLoginData
    {
        [JsonPropertyName("user")]
        public InternalUser? User { get; set; }

        [JsonPropertyName("permissions")]
        public List<Permission> Permissions { get; set; } = new();

        [JsonPropertyName("token")]
        public string Token { get; set; } = string.Empty;

        [JsonPropertyName("tokenExpiration")]
        public DateTime TokenExpiration { get; set; }
    }

    /// <summary>
    /// Información del usuario interno
    /// </summary>
    public class InternalUser
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("username")]
        public string Username { get; set; } = string.Empty;

        [JsonPropertyName("email")]
        public string Email { get; set; } = string.Empty;

        [JsonPropertyName("fullName")]
        public string FullName { get; set; } = string.Empty;

        [JsonPropertyName("category")]
        public Category? Category { get; set; }

        [JsonPropertyName("role")]
        public Role? Role { get; set; }

        [JsonPropertyName("weighbridges")]
        public List<int> Weighbridges { get; set; } = new();

        [JsonPropertyName("isActive")]
        public bool IsActive { get; set; }

        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; }

        [JsonPropertyName("lastAccess")]
        public DateTime? LastAccess { get; set; }
    }

    /// <summary>
    /// Categoría del usuario
    /// </summary>
    public class Category
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;
    }

    /// <summary>
    /// Rol del usuario
    /// </summary>
    public class Role
    {
        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;
    }

    /// <summary>
    /// Permiso de un módulo con sus acciones
    /// </summary>
    public class Permission
    {
        [JsonPropertyName("module")]
        public string Module { get; set; } = string.Empty;

        [JsonPropertyName("displayName")]
        public string DisplayName { get; set; } = string.Empty;

        [JsonPropertyName("route")]
        public string Route { get; set; } = string.Empty;

        [JsonPropertyName("icon")]
        public string Icon { get; set; } = string.Empty;

        [JsonPropertyName("isVisible")]
        public bool IsVisible { get; set; } = true;

        [JsonPropertyName("actions")]
        public List<string> Actions { get; set; } = new();
    }
}
