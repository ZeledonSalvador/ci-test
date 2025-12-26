using Microsoft.Extensions.Configuration;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using System.Text.Json;
using FrontendQuickpass.Models;
using FrontendQuickpass.Helpers;
using Microsoft.Extensions.Caching.Memory;

namespace FrontendQuickpass.Services
{
    public class LoginService
    {
        private readonly IConfiguration _configuration;
        private readonly string _secretKey;
        private readonly string _issuer;
        private readonly string _audience;
        private readonly int _expirationHours;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly string _apiBaseUrl;
        private readonly IMemoryCache _memoryCache;

        public LoginService(IConfiguration configuration, IHttpClientFactory httpClientFactory, IMemoryCache memoryCache)
        {
            _configuration = configuration;
            _httpClientFactory = httpClientFactory;
            _memoryCache = memoryCache;

            // Leer configuraciones JWT del appsettings.json (solo para usuarios de báscula legacy si los hay)
            _secretKey = configuration["JwtSettings:SecretKey"] ?? "default-secret-key";
            _issuer = configuration["JwtSettings:Issuer"] ?? "FrontendQuickpass";
            _audience = configuration["JwtSettings:Audience"] ?? "QuickpassUsers";
            _expirationHours = configuration.GetValue<int>("JwtSettings:ExpirationHours", 8);
            _apiBaseUrl = configuration["ApiSettings:BaseUrl"] ?? throw new ArgumentNullException("ApiSettings:BaseUrl", "API Base URL is missing.");

            // Comentado para reducir logs verbosos
            // Console.WriteLine($"🔧 Configuración cargada - Expiration: {_expirationHours} horas");
            // Console.WriteLine($"🌐 API Base URL: {_apiBaseUrl}");
        }

        // =====================================================
        // MÉTODOS DE AUTENTICACIÓN VIA API
        // Ya no se usa autenticación SQL Server
        // =====================================================

        // CREAR TOKEN JWT CON PERMISOS INCLUIDOS (PARA AUTORIZACIÓN SEGURA)
        // Sobrecarga que recibe permisos específicos (para usuarios del API)
        public SessionTokenInfo CrearTokenSesion(int codUsuario, int codRol, string usuario, string bascula, string turno, List<string> permisos, string nombreRol, string fullName = "")
        {
            try
            {
                var fechaCreacion = DateTime.Now;
                var fechaExpiracion = fechaCreacion.AddHours(_expirationHours);

                // Console.WriteLine($"🕐 Creando token con duración de {_expirationHours} horas (hasta: {fechaExpiracion:dd/MM/yyyy HH:mm:ss})");
                // Console.WriteLine($"🔐 Permisos incluidos en token para autorización: {string.Join(", ", permisos)}");

                var claims = new[]
                {
                    new Claim("cod_usuario", codUsuario.ToString()),
                    new Claim("cod_rol", codRol.ToString()),
                    new Claim("username", usuario),
                    new Claim("cod_bascula", bascula),
                    new Claim("cod_turno", turno),
                    new Claim("nombre_rol", nombreRol),
                    new Claim("full_name", fullName), // Nombre completo del usuario

                    // Permisos firmados dentro del token (PARA AUTORIZACIÓN)
                    new Claim("permisos", JsonSerializer.Serialize(permisos)),

                    new Claim("fecha_creacion", fechaCreacion.ToString("yyyy-MM-dd HH:mm:ss")),
                    new Claim(JwtRegisteredClaimNames.Exp, ((DateTimeOffset)fechaExpiracion).ToUnixTimeSeconds().ToString()),
                    new Claim(JwtRegisteredClaimNames.Iat, ((DateTimeOffset)fechaCreacion).ToUnixTimeSeconds().ToString()),
                    new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()) // ID único del token
                };

                var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_secretKey));
                var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

                var token = new JwtSecurityToken(
                    issuer: _issuer,
                    audience: _audience,
                    claims: claims,
                    expires: fechaExpiracion,
                    signingCredentials: creds
                );

                var tokenString = new JwtSecurityTokenHandler().WriteToken(token);

                // Console.WriteLine($"✅ Token JWT seguro creado - Duración: {_expirationHours}h, Longitud: {tokenString.Length} caracteres");

                return new SessionTokenInfo
                {
                    Token = tokenString,
                    CodUsuario = codUsuario,
                    CodRol = codRol,
                    Username = usuario,
                    CodBascula = bascula,
                    CodTurno = turno,
                    NombreRol = nombreRol,
                    Permisos = permisos,
                    FechaCreacion = fechaCreacion,
                    FechaExpiracion = fechaExpiracion,
                    DuracionHoras = _expirationHours,
                    EsValido = true
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ Error creando token: {ex.Message}");
                return new SessionTokenInfo { EsValido = false, MensajeError = $"Error creando token: {ex.Message}" };
            }
        }

        // VALIDAR TOKEN Y EXTRAER PERMISOS (PARA AUTORIZACIÓN EN MIDDLEWARE)
        public SessionTokenInfo ValidarToken(string token)
        {
            if (string.IsNullOrEmpty(token))
            {
                return new SessionTokenInfo { EsValido = false, MensajeError = "Token vacío" };
            }

            // Generar clave de caché usando hash del token (más corto y eficiente)
            var cacheKey = $"jwt_validated_{token.GetHashCode()}";

            // Intentar obtener del caché primero (MÁXIMA PRIORIDAD - SIN VALIDACIONES)
            if (_memoryCache.TryGetValue(cacheKey, out SessionTokenInfo? cachedTokenInfo))
            {
                // Console.WriteLine($"⚡ Token obtenido del caché - Usuario: {cachedTokenInfo?.Username}");
                return cachedTokenInfo!;
            }

            // Si no está en caché, validar normalmente
            try
            {
                var tokenHandler = new JwtSecurityTokenHandler();
                var key = Encoding.UTF8.GetBytes(_secretKey);

                var validationParameters = new TokenValidationParameters
                {
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(key),
                    ValidateIssuer = true,
                    ValidIssuer = _issuer,
                    ValidateAudience = true,
                    ValidAudience = _audience,
                    ValidateLifetime = true,
                    ClockSkew = TimeSpan.Zero // Sin tolerancia de tiempo
                };

                SecurityToken validatedToken;
                var principal = tokenHandler.ValidateToken(token, validationParameters, out validatedToken);

                var jwtToken = (JwtSecurityToken)validatedToken;

                // EXTRAER TODOS LOS DATOS DEL TOKEN INCLUYENDO PERMISOS
                var codUsuario = int.Parse(jwtToken.Claims.First(x => x.Type == "cod_usuario").Value);
                var codRol = int.Parse(jwtToken.Claims.First(x => x.Type == "cod_rol").Value);
                var username = jwtToken.Claims.First(x => x.Type == "username").Value;
                var bascula = jwtToken.Claims.First(x => x.Type == "cod_bascula").Value;
                var turno = jwtToken.Claims.First(x => x.Type == "cod_turno").Value;
                var nombreRol = jwtToken.Claims.First(x => x.Type == "nombre_rol").Value;
                var fullName = jwtToken.Claims.FirstOrDefault(x => x.Type == "full_name")?.Value ?? "";

                // OBTENER PERMISOS DEL TOKEN
                var permisosJson = jwtToken.Claims.First(x => x.Type == "permisos").Value;
                var permisos = JsonSerializer.Deserialize<List<string>>(permisosJson) ?? new List<string>();

                var fechaCreacion = DateTime.Parse(jwtToken.Claims.First(x => x.Type == "fecha_creacion").Value);
                var fechaExpiracion = DateTimeOffset.FromUnixTimeSeconds(long.Parse(jwtToken.Claims.First(x => x.Type == JwtRegisteredClaimNames.Exp).Value)).DateTime;
                var tiempoRestante = fechaExpiracion - DateTime.Now;

                // Console.WriteLine($"✅ Token válido - Usuario: {username}, Permisos: {string.Join(", ", permisos)}");

                var tokenInfo = new SessionTokenInfo
                {
                    Token = token,
                    CodUsuario = codUsuario,
                    CodRol = codRol,
                    Username = username,
                    CodBascula = bascula,
                    CodTurno = turno,
                    NombreRol = nombreRol,
                    FullName = fullName,
                    Permisos = permisos,
                    FechaCreacion = fechaCreacion,
                    FechaExpiracion = fechaExpiracion,
                    DuracionHoras = _expirationHours,
                    TiempoRestanteHoras = tiempoRestante.TotalHours,
                    EsValido = true
                };

                // Guardar en caché solo si es válido (por 30 segundos)
                if (tokenInfo.EsValido)
                {
                    var cacheOptions = new MemoryCacheEntryOptions
                    {
                        AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(30),
                        SlidingExpiration = TimeSpan.FromSeconds(15) // Renueva si se usa dentro de 15 seg
                    };
                    _memoryCache.Set(cacheKey, tokenInfo, cacheOptions);
                    // Console.WriteLine($"💾 Token guardado en caché (30s) - Usuario: {username}");
                }

                return tokenInfo;
            }
            catch (SecurityTokenExpiredException ex)
            {
                Console.WriteLine($"❌ Token expirado: {ex.Message}");
                return new SessionTokenInfo { EsValido = false, MensajeError = "Token expirado" };
            }
            catch (SecurityTokenInvalidSignatureException ex)
            {
                Console.WriteLine($"❌ Firma de token inválida: {ex.Message}");
                return new SessionTokenInfo { EsValido = false, MensajeError = "Token con firma inválida" };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ Error validando token: {ex.Message}");
                return new SessionTokenInfo { EsValido = false, MensajeError = "Token inválido" };
            }
        }

        // =====================================================
        // AUTENTICACIÓN DE USUARIOS INTERNOS VIA API
        // =====================================================

        /// <summary>
        /// Autenticar usuario interno usando el API de Quickpass
        /// </summary>
        public async Task<InternalUserSessionInfo> AuthenticateInternalUserAsync(string username, string password, string bascula, string turno = "1")
        {
            try
            {
                var client = _httpClientFactory.CreateClient();
                var loginUrl = $"{_apiBaseUrl}internal-auth/login";

                // Console.WriteLine($"🔐 Intentando login de usuario interno: {username} en {loginUrl}");
                // Console.WriteLine($"📋 Báscula: {bascula}, Turno: {turno}");

                var requestBody = new InternalUserLoginRequest
                {
                    Username = username,
                    Password = password,
                    Bascula = bascula,
                    Turno = turno
                };

                var jsonContent = JsonSerializer.Serialize(requestBody);
                var httpContent = new StringContent(jsonContent, Encoding.UTF8, "application/json");

                // Console.WriteLine($"📤 Request Body: {jsonContent}");

                var response = await client.PostAsync(loginUrl, httpContent);
                var responseContent = await response.Content.ReadAsStringAsync();

                // Console.WriteLine($"📡 Response Status: {response.StatusCode}");
                // Console.WriteLine($"📥 Response Body: {responseContent}");

                if (response.IsSuccessStatusCode)
                {
                    var loginResponse = JsonSerializer.Deserialize<InternalUserLoginResponse>(responseContent);

                    if (loginResponse?.Success == true && loginResponse.Data != null)
                    {
                        var data = loginResponse.Data;
                        var user = data.User!;

                        // Console.WriteLine($"✅ Login exitoso - Usuario: {user.FullName}, Rol: {user.Role?.Name}");
                        // Console.WriteLine($"📋 Permisos: {data.Permissions.Count} módulos disponibles");

                        // Crear lista de permisos para el token JWT (incluye TODOS los permisos, visibles y no visibles)
                        // Los permisos no visibles (como TimerSync) son necesarios para autorización de APIs
                        var permisosRutas = data.Permissions
                            .Select(p => p.Route)
                            .ToList();

                        // Mapear role.id a role_code usando RoleMapper
                        var roleId = user.Role?.Id ?? 0;
                        var roleCode = RoleMapper.GetRoleCodeById(roleId);

                        return new InternalUserSessionInfo
                        {
                            IsValid = true,
                            Token = data.Token,
                            TokenExpiration = data.TokenExpiration,
                            UserId = user.Id,
                            Username = user.Username,
                            FullName = user.FullName,
                            Email = user.Email,
                            Category = user.Category?.Name ?? "Sin Categoría",
                            RoleId = roleId,
                            RoleName = user.Role?.Name ?? "Sin Rol",
                            RoleCode = roleCode, // Mapeado desde role.id
                            Weighbridges = user.Weighbridges,
                            Permissions = data.Permissions,
                            PermissionsRoutes = permisosRutas,
                            IsActive = user.IsActive
                        };
                    }
                    else
                    {
                        Console.WriteLine($"❌ Response no válido: {loginResponse?.Message ?? "Sin mensaje"}");
                        return new InternalUserSessionInfo
                        {
                            IsValid = false,
                            ErrorMessage = loginResponse?.Message ?? "Error desconocido"
                        };
                    }
                }
                else
                {
                    // Console.WriteLine($"❌ Error HTTP {response.StatusCode}: {responseContent}");

                    // Intentar deserializar error con el formato del API
                    try
                    {
                        var errorResponse = JsonSerializer.Deserialize<InternalAuthErrorResponse>(responseContent);
                        if (errorResponse != null && !string.IsNullOrEmpty(errorResponse.Message))
                        {
                            // Console.WriteLine($"❌ Mensaje de error del API: {errorResponse.Message}");
                            return new InternalUserSessionInfo
                            {
                                IsValid = false,
                                ErrorMessage = errorResponse.Message
                            };
                        }
                    }
                    catch (Exception ex)
                    {
                        Console.WriteLine($"⚠️ No se pudo deserializar error del API: {ex.Message}");
                    }

                    // Fallback: retornar el status code
                    return new InternalUserSessionInfo
                    {
                        IsValid = false,
                        ErrorMessage = $"Error de autenticación (HTTP {response.StatusCode})"
                    };
                }
            }
            catch (HttpRequestException ex)
            {
                Console.WriteLine($"❌ Error de conexión con API: {ex.Message}");
                return new InternalUserSessionInfo
                {
                    IsValid = false,
                    ErrorMessage = "No se pudo conectar con el servidor de autenticación"
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"❌ Error inesperado en login interno: {ex.Message}");
                return new InternalUserSessionInfo
                {
                    IsValid = false,
                    ErrorMessage = $"Error interno: {ex.Message}"
                };
            }
        }

    }

    public class SessionTokenInfo
    {
        public string Token { get; set; } = "";
        public int CodUsuario { get; set; }
        public int CodRol { get; set; }
        public string Username { get; set; } = "";
        public string CodBascula { get; set; } = "";
        public string CodTurno { get; set; } = "";
        public string NombreRol { get; set; } = "";
        public string FullName { get; set; } = "";
        public List<string> Permisos { get; set; } = new();
        public DateTime FechaCreacion { get; set; }
        public DateTime FechaExpiracion { get; set; }
        public int DuracionHoras { get; set; }
        public double TiempoRestanteHoras { get; set; }
        public bool EsValido { get; set; }
        public string MensajeError { get; set; } = "";
    }

    // NOTA: Clase JwtConfigInfo eliminada en Fase 3 (nunca se usó)

    // Clase para sesión de usuario interno
    public class InternalUserSessionInfo
    {
        public bool IsValid { get; set; }
        public string Token { get; set; } = "";
        public DateTime TokenExpiration { get; set; }
        public int UserId { get; set; }
        public string Username { get; set; } = "";
        public string FullName { get; set; } = "";
        public string Email { get; set; } = "";
        public string Category { get; set; } = "";
        public int RoleId { get; set; }
        public string RoleName { get; set; } = "";
        public string RoleCode { get; set; } = "";
        public List<int> Weighbridges { get; set; } = new();
        public List<Permission> Permissions { get; set; } = new();
        public List<string> PermissionsRoutes { get; set; } = new();
        public bool IsActive { get; set; }
        public string ErrorMessage { get; set; } = "";
    }
}