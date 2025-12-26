/**
 * Helper global de permisos para validar en JavaScript
 * SEGURO: Obtiene datos desde el servidor (no desde cookies editables)
 *
 * Uso:
 *   await PERMISSION.init(); // Llamar al inicio de cada página
 *   PERMISSION.hasRole('GERENTE_PLANTA')
 *   PERMISSION.can('ListaNegra', 'DELETE')
 *   PERMISSION.hasModule('Dashboard')
 */

const PERMISSION = {
    // Cache de datos de sesión (obtenidos del servidor)
    _sessionData: null,
    _initialized: false,

    // Rutas públicas donde NO se requiere sesión
    _rutasPublicas: ['/', '/Login', '/Logout', '/Prechequeo'],

    /**
     * Detectar si la ruta actual es pública
     * @returns {boolean}
     */
    _esRutaPublica() {
        const path = window.location.pathname;
        return this._rutasPublicas.some(ruta =>
            path === ruta || path.startsWith(ruta + '/')
        );
    },

    /**
     * Inicializar datos de sesión desde el servidor
     * Solo se ejecuta en rutas privadas
     */
    async init() {
        // Ya inicializado
        if (this._initialized) {
            return this._sessionData !== null;
        }

        // RUTA PÚBLICA: no verificar sesión
        if (this._esRutaPublica()) {
            console.log('Ruta pública detectada. Omitiendo verificación de sesión.');
            this._initialized = true;
            this._sessionData = null; // No hay sesión
            return true;
        }

        // RUTA PRIVADA: verificar sesión
        console.log('Ruta privada. Verificando sesión con el servidor...');

        try {
            const response = await fetch('/api/session/info', {
                method: 'GET',
                credentials: 'include', // ¡¡OBLIGATORIO para enviar cookies HttpOnly!!
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (response.status === 401) {
                console.warn('Sesión no encontrada o expirada (401). Redirigiendo a login...');
                this._redireccionarALogin();
                return false;
            }

            if (!response.ok) {
                console.error(`Error HTTP ${response.status} al cargar sesión`);
                this._redireccionarALogin();
                return false;
            }

            this._sessionData = await response.json();
            this._initialized = true;
            return true;

        } catch (error) {
            console.error('PERMISSION: Error de red al cargar sesión:', error);
            this._redireccionarALogin();
            return false;
        }
    },

    /**
     * Redirigir al login (con mensaje opcional)
     */
    _redireccionarALogin() {
        // Evitar bucle infinito
        if (window.location.pathname === '/Login') return;

        // Mostrar mensaje solo si hay UI
        if (typeof alert === 'function') {
            alert('Su sesión ha expirado. Será redirigido al login.');
        }

        // Redirigir
        window.location.href = '/Login';
    },

    /**
     * Obtener el código del rol actual
     */
    getRoleCode() {
        if (!this._initialized) {
            console.warn('PERMISSION: No inicializado, llamar a init() primero');
            return '';
        }
        if (this._esRutaPublica()) return '';
        return this._sessionData?.roleCode || '';
    },

    /**
     * Obtener el código de báscula del usuario actual
     */
    getCodBascula() {
        if (!this._initialized) {
            console.warn('PERMISSION: No inicializado, llamar a init() primero');
            return '';
        }
        if (this._esRutaPublica()) return '';
        return this._sessionData?.codBascula || '';
    },

    /**
     * Validar si el usuario tiene un rol específico
     * @param {string} roleCode - Código del rol
     * @returns {boolean}
     */
    hasRole(roleCode) {
        if (this._esRutaPublica()) return false;
        if (!this._initialized || !this._sessionData) {
            console.warn('PERMISSION: No inicializado, devolviendo false');
            return false;
        }
        const userRole = this.getRoleCode();
        return userRole.toUpperCase() === roleCode.toUpperCase();
    },

    /**
     * Validar si tiene alguno de los roles
     * @param {...string} roleCodes
     * @returns {boolean}
     */
    hasAnyRole(...roleCodes) {
        if (this._esRutaPublica()) return false;
        if (!this._initialized || !this._sessionData) return false;
        const userRole = this.getRoleCode().toUpperCase();
        return roleCodes.some(role => role.toUpperCase() === userRole);
    },

    /**
     * Validar si puede realizar una acción en un módulo
     * @param {string} module
     * @param {string} action
     * @returns {boolean}
     */
    can(module, action) {
        if (this._esRutaPublica()) return false;
        if (!this._initialized || !this._sessionData) return false;

        const permissions = this._sessionData?.permissions || [];
        return permissions.some(p => p.toUpperCase() === module.toUpperCase());
    },

    /**
     * Validar si tiene acceso a un módulo
     * @param {string} module
     * @returns {boolean}
     */
    hasModule(module) {
        return this.can(module, 'READ');
    },

    /**
     * Obtener acciones permitidas (placeholder)
     */
    getModuleActions(module) {
        return this.hasModule(module) ? ['CREATE', 'READ', 'UPDATE', 'DELETE'] : [];
    },

    /**
     * ¿Es administrador?
     */
    isAdmin() {
        return this.hasRole('ADMINISTRADOR');
    },

    // ===== HELPERS DE UI =====

    showIfRole(selector, roleCode) {
        const elements = document.querySelectorAll(selector);
        const hasPermission = this.hasRole(roleCode);
        elements.forEach(el => el.style.display = hasPermission ? '' : 'none');
    },

    showIfCan(selector, module, action) {
        const elements = document.querySelectorAll(selector);
        const hasPermission = this.can(module, action);
        elements.forEach(el => el.style.display = hasPermission ? '' : 'none');
    },

    disableIfCannot(selector, module, action) {
        const elements = document.querySelectorAll(selector);
        const hasPermission = this.can(module, action);
        elements.forEach(el => {
            if (!hasPermission) {
                el.setAttribute('disabled', 'disabled');
                el.style.opacity = '0.5';
                el.style.cursor = 'not-allowed';
            }
        });
    },

    /**
     * Forzar reinicio (útil para pruebas)
     */
    reset() {
        this._sessionData = null;
        this._initialized = false;
    }
};

// Exponer globalmente
window.PERMISSION = PERMISSION;

// Auto-inicializar cuando el DOM esté listo
(function () {
    const initPermission = () => {
        PERMISSION.init().catch(err => {
            console.error('Error crítico inicializando PERMISSION:', err);
        });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPermission);
    } else {
        initPermission();
    }
})();