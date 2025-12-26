namespace FrontendQuickpass.Helpers
{
    /// <summary>
    /// Mapeo de roles del sistema a códigos internos
    /// </summary>
    public static class RoleMapper
    {
        /// <summary>
        /// Códigos de roles para uso en validaciones
        /// </summary>
        public static class RoleCodes
        {
            public const string ADMINISTRADOR = "ADMINISTRADOR";
            public const string GERENTE_PLANTA = "GERENTE_PLANTA";
            public const string GERENTE_OPERACIONES = "GERENTE_OPERACIONES";
            public const string SUPERVISOR_SEGURIDAD = "SUPERVISOR_SEGURIDAD";
            public const string SUPERVISOR_OPERACIONES = "SUPERVISOR_OPERACIONES";
            public const string OPERADOR_AZUCAR = "OPERADOR_AZUCAR";
            public const string OPERADOR_MELAZA = "OPERADOR_MELAZA";
            public const string VIGILANTE_PRECHEQUEO = "VIGILANTE_PRECHEQUEO";
            public const string VIGILANTE_PORTON4 = "VIGILANTE_PORTON4";
            public const string VIGILANTE_PORTON3 = "VIGILANTE_PORTON3";
            public const string AUDITOR = "AUDITOR";
            public const string PESADOR = "PESADOR";
        }

        /// <summary>
        /// Mapeo de ID de rol a código de rol
        /// </summary>
        private static readonly Dictionary<int, string> RoleIdToCode = new()
        {
            { 1, RoleCodes.ADMINISTRADOR },
            { 2, RoleCodes.GERENTE_PLANTA },
            { 3, RoleCodes.GERENTE_OPERACIONES },
            { 4, RoleCodes.SUPERVISOR_SEGURIDAD },
            { 5, RoleCodes.SUPERVISOR_OPERACIONES },
            { 6, RoleCodes.OPERADOR_AZUCAR },
            { 7, RoleCodes.OPERADOR_MELAZA },
            { 8, RoleCodes.VIGILANTE_PRECHEQUEO },
            { 9, RoleCodes.VIGILANTE_PORTON4 },
            { 10, RoleCodes.VIGILANTE_PORTON3 },
            { 11, RoleCodes.AUDITOR },
            { 12, RoleCodes.PESADOR }
        };

        /// <summary>
        /// Mapeo de nombre de rol a código de rol (alternativa por nombre)
        /// </summary>
        private static readonly Dictionary<string, string> RoleNameToCode = new(StringComparer.OrdinalIgnoreCase)
        {
            { "Administrador", RoleCodes.ADMINISTRADOR },
            { "Gerente de Planta", RoleCodes.GERENTE_PLANTA },
            { "Gerente de Operaciones", RoleCodes.GERENTE_OPERACIONES },
            { "Supervisor de Seguridad", RoleCodes.SUPERVISOR_SEGURIDAD },
            { "Supervisor de Operaciones", RoleCodes.SUPERVISOR_OPERACIONES },
            { "Operador de Azucar", RoleCodes.OPERADOR_AZUCAR },
            { "Operador de Melaza", RoleCodes.OPERADOR_MELAZA },
            { "Vigilante Prechequeo", RoleCodes.VIGILANTE_PRECHEQUEO },
            { "Vigilante Porton 4", RoleCodes.VIGILANTE_PORTON4 },
            { "Vigilante Porton 3", RoleCodes.VIGILANTE_PORTON3 },
            { "Auditor", RoleCodes.AUDITOR },
            { "Pesador", RoleCodes.PESADOR }
        };

        /// <summary>
        /// Obtener código de rol a partir del ID
        /// </summary>
        public static string GetRoleCodeById(int roleId)
        {
            return RoleIdToCode.TryGetValue(roleId, out var code) ? code : "";
        }

        /// <summary>
        /// Obtener código de rol a partir del nombre
        /// </summary>
        public static string GetRoleCodeByName(string roleName)
        {
            return RoleNameToCode.TryGetValue(roleName, out var code) ? code : "";
        }

        /// <summary>
        /// Validar si un roleId corresponde a Administrador
        /// </summary>
        public static bool IsAdmin(int roleId)
        {
            return roleId == 1;
        }
    }
}
