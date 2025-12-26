/* ====== SOLICITUD DE UNIDADES ====== */
window.AlmapacUtils?.hideSpinner();

// Límite máximo del contador
const MAX_COUNTER = 5;

// Configuración del polling
const POLLING_CONFIG = {
    ENABLED: true,           // Cambiar a false para desactivar el polling
    INTERVAL: 30000,         // 30 segundos en milisegundos
    ENDPOINT: '/TiemposMelaza/ObtenerDatos'  // Endpoint existente para obtener datos actualizados
};

class SolicitudUnidadesManager {
    constructor() {
        this.counterState = {
            currentValue: 0,
            originalValue: 0,
            isInitialized: false
        };
        this.isLocked = false;
        this.elements = {};
        this.lastServerData = null;
        this.initialized = false;
        this.pollingInterval = null;
        this.isPollingActive = false;
    }

    init() {
        console.log('Inicializando Solicitud de Unidades...');
        
        // Verificar si el componente está disponible y visible
        if (!this.isComponentVisible()) {
            console.log('Componente no visible o no disponible');
            return false;
        }
        
        try {
            this.loadElements();
            this.initializeCounter();
            this.bindEvents();
            this.initialized = true;
            
            // Iniciar polling si está habilitado
            this.startPolling();
            
            console.log('Solicitud de Unidades inicializado exitosamente');
            return true;
        } catch (error) {
            console.error('Error inicializando componente:', error);
            this.initialized = false;
            return false;
        }
    }

    isComponentVisible() {
        const component = document.getElementById('component-solicitud-unidades');
        return component && component.classList.contains('active');
    }

    loadElements() {
        this.elements = {
            decreaseBtn: document.getElementById('decreaseButtonPipa'),
            increaseBtn: document.getElementById('increaseButtonPipa'),
            numberInput: document.getElementById('numberInputPipa'),
            solicitarBtn: document.getElementById('solicitarPipa'),
            totalRegistros: document.getElementById('lblTotalRegistrosPipa')
        };

        // Verificar elementos críticos
        const required = ['decreaseBtn', 'increaseBtn', 'numberInput', 'solicitarBtn'];
        const missing = required.filter(key => !this.elements[key]);
        
        if (missing.length > 0) {
            console.error('Elementos faltantes:', missing);
            throw new Error(`Elementos requeridos no encontrados: ${missing.join(', ')}`);
        }

        console.log('Elementos cargados correctamente');
    }

    initializeCounter() {
        // Obtener el valor actual del DOM (valor del servidor)
        const domValue = parseInt(this.elements.numberInput.value) || 0;
        const initialValue = Math.max(0, Math.min(MAX_COUNTER, domValue));
        
        // Inicializar el contador con el valor (clamp a 0..MAX_COUNTER)
        this.counterState = {
            currentValue: initialValue,
            originalValue: initialValue,
            isInitialized: true
        };
        
        console.log(`Contador inicializado - Valor original (clamped): ${initialValue}`);
        this.updateDisplay();
    }

    updateDisplay() {
        if (!this.initialized || !this.elements.numberInput) return;
        
        const safeValue = Math.max(0, Math.min(MAX_COUNTER, this.counterState.currentValue));
        this.counterState.currentValue = safeValue; // asegurar estado consistente en rango
        this.elements.numberInput.value = safeValue;
        
        // Agregar animación visual si hay cambios
        if (this.counterState.currentValue !== this.counterState.originalValue) {
            this.elements.numberInput.classList.add('changed');
            setTimeout(() => {
                this.elements.numberInput.classList.remove('changed');
            }, 1000);
        }
        
        console.log(`Display actualizado: ${safeValue} (original: ${this.counterState.originalValue})`);
    }

    // ========== SISTEMA DE POLLING SILENCIOSO ==========
    startPolling() {
        if (!POLLING_CONFIG.ENABLED) {
            console.log('Polling deshabilitado por configuración');
            return;
        }

        if (this.isPollingActive) {
            console.log('Polling ya está activo');
            return;
        }

        console.log(`Iniciando polling silencioso cada ${POLLING_CONFIG.INTERVAL / 1000} segundos`);
        this.isPollingActive = true;

        // Ejecutar primera consulta inmediatamente (silenciosa)
        this.performSilentPollingRequest();

        // Configurar intervalo
        this.pollingInterval = setInterval(() => {
            // Verificar si aún estamos en el componente correcto
            if (this.isComponentVisible() && this.initialized) {
                this.performSilentPollingRequest();
            } else {
                console.log('Componente ya no visible, deteniendo polling');
                this.stopPolling();
            }
        }, POLLING_CONFIG.INTERVAL);
    }

    stopPolling() {
        if (!this.isPollingActive) {
            return;
        }

        console.log('Deteniendo polling');
        this.isPollingActive = false;

        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    async performSilentPollingRequest() {
        try {
            console.log('Ejecutando polling silencioso...');
            
            // NO mostrar spinner para polling silencioso
            const response = await this.postJson(POLLING_CONFIG.ENDPOINT, {}, true); // true = modo silencioso
            
            if (response && response.success && response.data) {
                this.updateFromPolling(response.data, true); // true = actualización silenciosa
                console.log('Polling silencioso completado exitosamente');
            } else {
                console.warn('Respuesta de polling sin datos válidos:', response);
            }
            
        } catch (error) {
            console.error('Error en polling silencioso:', error);
            
            // Si hay errores de conexión repetidos, espaciar más el polling
            if (error.message.includes('conexión') || error.message.includes('network')) {
                console.log('Error de conexión en polling silencioso, continuando...');
            }
        }
    }

    updateFromPolling(data, isSilent = false) {
        if (!this.initialized) return;
        
        if (!isSilent) {
            console.log('Actualizando desde polling:', data);
        }
        
        try {
            let hasUpdates = false;

            // Actualizar total de registros usando la estructura de datos de ObtenerDatos
            if (data.pendientes && data.pendientes.pipa !== undefined && this.elements.totalRegistros) {
                const currentTotal = this.elements.totalRegistros.textContent;
                if (currentTotal !== data.pendientes.pipa.toString()) {
                    // Actualización silenciosa - sin animaciones
                    this.elements.totalRegistros.textContent = data.pendientes.pipa;
                    
                    if (!isSilent) {
                        console.log(`Total registros actualizado: ${currentTotal} → ${data.pendientes.pipa}`);
                    }
                    hasUpdates = true;
                }
            }
            
            // Solo actualizar el valor base si no hay cambios pendientes del usuario
            if (data.solicitudes && data.solicitudes.pipa !== undefined && !this.hasPendingChanges()) {
                const serverValue = data.solicitudes.pipa;
                const clamped = Math.max(0, Math.min(MAX_COUNTER, serverValue));
                const oldValue = this.counterState.originalValue;
                if (oldValue !== clamped) {
                    this.counterState.originalValue = clamped;
                    this.counterState.currentValue = clamped;
                    
                    // Actualizar display sin animaciones para polling silencioso
                    if (isSilent) {
                        this.updateDisplaySilent();
                    } else {
                        this.updateDisplay();
                    }
                    
                    if (!isSilent) {
                        console.log(`Valor del servidor actualizado (clamped): ${oldValue} → ${clamped}`);
                    }
                    hasUpdates = true;
                }
            } else if (data.solicitudes && data.solicitudes.pipa !== undefined && this.hasPendingChanges()) {
                if (!isSilent) {
                    console.log('Polling: Usuario tiene cambios pendientes, no se actualiza el valor');
                }
            }

            if (hasUpdates && !isSilent) {
                console.log('Se aplicaron actualizaciones desde el servidor');
            }
            
        } catch (error) {
            console.error('Error actualizando desde polling:', error);
        }
    }

    // Método para actualizar display sin animaciones (para polling silencioso)
    updateDisplaySilent() {
        if (!this.initialized || !this.elements.numberInput) return;
        
        const safeValue = Math.max(0, Math.min(MAX_COUNTER, this.counterState.currentValue));
        this.counterState.currentValue = safeValue; // asegurar estado consistente en rango
        this.elements.numberInput.value = safeValue;
        
        // NO agregar animación para actualizaciones silenciosas
        console.log(`Display actualizado silenciosamente: ${safeValue} (original: ${this.counterState.originalValue})`);
    }

    // ========== FIN SISTEMA DE POLLING SILENCIOSO ==========

    handleDecrease() {
        if (!this.initialized || this.isLocked) {
            console.warn('Contador no disponible o bloqueado');
            if (this.isLocked) this.showWarning('Operación en proceso, espere...');
            return;
        }
        
        if (this.counterState.currentValue > 0) {
            this.counterState.currentValue--;
            this.updateDisplay();
            
            console.log(`Decrementado: valor actual=${this.counterState.currentValue}, original=${this.counterState.originalValue}`);
        }
    }

    handleIncrease() {
        if (!this.initialized || this.isLocked) {
            console.warn('Contador no disponible o bloqueado');
            if (this.isLocked) this.showWarning('Operación en proceso, espere...');
            return;
        }
        
        if (this.counterState.currentValue < MAX_COUNTER) {
            this.counterState.currentValue++;
            this.updateDisplay();
            console.log(`Incrementado: valor actual=${this.counterState.currentValue}, original=${this.counterState.originalValue}`);
        } else {
            this.showWarning(`Límite de ${MAX_COUNTER} alcanzado. No se pueden solicitar más unidades.`);
            console.log(`Intento de incrementar por encima del límite (${MAX_COUNTER}).`);
        }
    }

    handleInputChange() {
        if (!this.initialized || this.isLocked) return;
        
        const inputValue = parseInt(this.elements.numberInput.value) || 0;
        const clampedValue = Math.max(0, Math.min(MAX_COUNTER, inputValue));
        
        // Asegurar que el valor esté en rango
        if (inputValue !== clampedValue) {
            this.elements.numberInput.value = clampedValue;
            if (inputValue > MAX_COUNTER) {
                this.showWarning(`Límite de ${MAX_COUNTER} alcanzado. No se pueden solicitar más unidades.`);
            }
        }
        
        this.counterState.currentValue = clampedValue;
        
        // Agregar animación visual
        this.elements.numberInput.classList.add('changed');
        setTimeout(() => {
            this.elements.numberInput.classList.remove('changed');
        }, 1000);
        
        console.log(`Valor editado manualmente: ${clampedValue} (original: ${this.counterState.originalValue})`);
    }

    getChangeAmount() {
        return this.counterState.currentValue - this.counterState.originalValue;
    }

    getOperationType() {
        const change = this.getChangeAmount();
        if (change > 0) return 'increase';
        if (change < 0) return 'decrease';
        return 'none';
    }

    async handleSolicitar() {
        if (!this.initialized || this.isLocked) {
            if (this.isLocked) this.showWarning('Operación en proceso, espere...');
            return;
        }
        
        const changeAmount = this.getChangeAmount();
        const operationType = this.getOperationType();
        
        console.log(`Procesando solicitud: cambio=${changeAmount}, tipo=${operationType}`);
        
        if (operationType === 'none') {
            this.showWarning('No hay cambios para procesar');
            return;
        }

        try {
            this.setLocked(true);

            if (operationType === 'increase') {
                console.log(`Solicitando ${changeAmount} unidades`);
                await this.solicitarUnidad(changeAmount);
            } else if (operationType === 'decrease') {
                const unitsToReduce = Math.abs(changeAmount);
                console.log(`Reduciendo ${unitsToReduce} unidades`);
                await this.reducirUnidad(unitsToReduce);
            }

        } catch (error) {
            console.error('Error procesando solicitudes:', error);
            
            // Mostrar el mensaje de error específico del servidor al usuario
            let userMessage = 'Error procesando las solicitudes';
            
            if (error.message) {
                // Extraer mensajes específicos conocidos del servidor
                if (error.message.includes('Límite de 5 alcanzado') || error.message.includes('límite') || error.message.includes('alcanzado')) {
                    userMessage = 'Límite de 5 alcanzado. No se pueden solicitar más unidades en este momento.';
                } else if (error.message.includes('No se pueden llamar más cupos')) {
                    userMessage = 'No se pueden solicitar más unidades. Se ha alcanzado el límite máximo permitido.';
                } else if (error.message.includes('No hay suficientes unidades')) {
                    userMessage = 'No hay suficientes unidades disponibles para reducir.';
                } else {
                    // Usar el mensaje original del servidor si no es uno de los casos específicos
                    userMessage = error.message;
                }
            }
            
            this.showError(userMessage);
            
            // Restaurar el valor original si hay error
            this.counterState.currentValue = this.counterState.originalValue;
            this.updateDisplay();
            
        } finally {
            this.setLocked(false);
        }
    }

    async solicitarUnidad(unidadesSolicitadas) {
        try {
            this.showSpinner();
            console.log(`Solicitando ${unidadesSolicitadas} unidades Pipa`);
            
            const response = await this.postJson('/TiemposMelaza/SolicitarUnidad', {
                CurrentValue: unidadesSolicitadas
            });
            
            await this.showSuccess(`Has solicitado ${unidadesSolicitadas} unidades Pipa exitosamente.`);
            
            // Actualizar el valor original al nuevo valor después del éxito
            this.counterState.originalValue = this.counterState.currentValue;
            console.log(`Valor original actualizado a: ${this.counterState.originalValue}`);
            
            // Forzar un polling inmediato silencioso para actualizar datos
            if (POLLING_CONFIG.ENABLED && this.isPollingActive) {
                setTimeout(() => this.performSilentPollingRequest(), 1000);
            }
            
        } finally {
            this.hideSpinner();
        }
    }

    async reducirUnidad(unidadesReducidas) {
        try {
            this.showSpinner();
            console.log(`Reduciendo ${unidadesReducidas} unidades Pipa`);
            
            const response = await this.postJson('/TiemposMelaza/ReducirUnidad', {
                UnidadesReducidas: unidadesReducidas
            });
            
            await this.showSuccess(`Se eliminaron ${unidadesReducidas} unidades Pipa exitosamente.`);
            
            // Actualizar el valor original al nuevo valor después del éxito
            this.counterState.originalValue = this.counterState.currentValue;
            console.log(`Valor original actualizado a: ${this.counterState.originalValue}`);
            
            // Forzar un polling inmediato silencioso para actualizar datos
            if (POLLING_CONFIG.ENABLED && this.isPollingActive) {
                setTimeout(() => this.performSilentPollingRequest(), 1000);
            }
            
        } finally {
            this.hideSpinner();
        }
    }

    setLocked(locked) {
        if (!this.initialized) return;
        
        this.isLocked = locked;
        
        // Deshabilitar/habilitar botones e input
        if (this.elements.decreaseBtn) this.elements.decreaseBtn.disabled = locked;
        if (this.elements.increaseBtn) this.elements.increaseBtn.disabled = locked;
        if (this.elements.solicitarBtn) this.elements.solicitarBtn.disabled = locked;
        if (this.elements.numberInput) this.elements.numberInput.disabled = locked;
        
        console.log(locked ? 'Controles bloqueados' : 'Controles desbloqueados');
    }

    bindEvents() {
        // Verificar que los elementos existan antes de agregar eventos
        if (!this.elements.decreaseBtn || !this.elements.increaseBtn || !this.elements.solicitarBtn || !this.elements.numberInput) {
            console.error('No se pueden vincular eventos - elementos faltantes');
            return;
        }

        // Remover eventos previos para evitar duplicados
        this.unbindEvents();

        // Crear funciones bound para poder removerlas después
        this.boundHandleDecrease = (e) => {
            e.preventDefault();
            this.handleDecrease();
        };
        
        this.boundHandleIncrease = (e) => {
            e.preventDefault();
            this.handleIncrease();
        };
        
        this.boundHandleSolicitar = (e) => {
            e.preventDefault();
            this.handleSolicitar();
        };

        this.boundHandleInputChange = (e) => {
            this.handleInputChange();
        };

        // Eventos para botones
        this.elements.decreaseBtn.addEventListener('click', this.boundHandleDecrease);
        this.elements.increaseBtn.addEventListener('click', this.boundHandleIncrease);
        this.elements.solicitarBtn.addEventListener('click', this.boundHandleSolicitar);

        // Eventos para input
        this.elements.numberInput.addEventListener('input', this.boundHandleInputChange);
        this.elements.numberInput.addEventListener('change', this.boundHandleInputChange);

        // Prevenir envío de formulario en botones
        [this.elements.decreaseBtn, this.elements.increaseBtn, this.elements.solicitarBtn].forEach(btn => {
            btn.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                }
            });
        });

        console.log('Eventos vinculados correctamente');
    }

    unbindEvents() {
        // Remover eventos previos si existen las funciones bound
        if (this.boundHandleDecrease && this.elements.decreaseBtn) {
            this.elements.decreaseBtn.removeEventListener('click', this.boundHandleDecrease);
        }
        if (this.boundHandleIncrease && this.elements.increaseBtn) {
            this.elements.increaseBtn.removeEventListener('click', this.boundHandleIncrease);
        }
        if (this.boundHandleSolicitar && this.elements.solicitarBtn) {
            this.elements.solicitarBtn.removeEventListener('click', this.boundHandleSolicitar);
        }
        if (this.boundHandleInputChange && this.elements.numberInput) {
            this.elements.numberInput.removeEventListener('input', this.boundHandleInputChange);
            this.elements.numberInput.removeEventListener('change', this.boundHandleInputChange);
        }
    }

    // Métodos de utilidad
    async postJson(url, body, isSilent = false) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                body: JSON.stringify(body || {})
            });

            const text = await response.text();
            let json = {};
            
            try { 
                json = text ? JSON.parse(text) : {}; 
            } catch (parseError) { 
                if (!isSilent) {
                    console.error('Error parsing JSON response:', parseError);
                }
                throw new Error('Error en la respuesta del servidor: formato inválido');
            }

            if (!response.ok) {
                // Extraer mensaje de error del JSON o usar mensaje HTTP por defecto
                const errorMessage = json.message || json.error || `Error HTTP ${response.status}: ${response.statusText}`;
                if (!isSilent) {
                    console.error('HTTP Error:', response.status, errorMessage);
                }
                throw new Error(errorMessage);
            }

            // Verificar si la respuesta indica éxito o fallo
            if (typeof json.success === 'boolean' && !json.success) {
                const errorMessage = json.message || json.error || 'Error en la operación';
                if (!isSilent) {
                    console.error('API Error:', errorMessage);
                }
                throw new Error(errorMessage);
            }

            return json;
            
        } catch (networkError) {
            // Errores de red o fetch
            if (networkError.name === 'TypeError' && networkError.message.includes('fetch')) {
                throw new Error('Error de conexión: No se pudo conectar con el servidor');
            }
            
            // Re-lanzar otros errores
            throw networkError;
        }
    }

    showSpinner() {
        if (window.AlmapacUtils?.showSpinner) {
            window.AlmapacUtils.showSpinner();
        }
    }

    hideSpinner() {
        if (window.AlmapacUtils?.hideSpinner) {
            window.AlmapacUtils.hideSpinner();
        }
    }

    showSuccess(message) {
        if (window.Swal) {
            return Swal.fire({
                icon: 'success',
                title: 'Operación Exitosa',
                text: message,
                confirmButtonText: 'Aceptar',
                confirmButtonColor: '#0F2A62',
                timer: 3000,
                timerProgressBar: true
            });
        } else {
            alert(`✓ ${message}`);
            return Promise.resolve();
        }
    }

    showError(message) {
        if (window.Swal) {
            return Swal.fire({
                icon: 'warning',
                title: 'Error',
                text: message,
                confirmButtonText: 'Aceptar',
                confirmButtonColor: '#0F2A62',
                allowOutsideClick: false
            });
        } else {
            alert(`✗ Error: ${message}`);
            return Promise.resolve();
        }
    }

    showWarning(message) {
        if (window.Swal) {
            return Swal.fire({
                icon: 'warning',
                title: 'ATENCIÓN',
                text: message,
                confirmButtonText: 'Aceptar',
                confirmButtonColor: '#0F2A62',
                timer: 2000,
                timerProgressBar: true
            });
        } else {
            alert(`⚠ Advertencia: ${message}`);
            return Promise.resolve();
        }
    }

    // Método público para actualizar desde eventos externos (mantenido por compatibilidad)
    updateFromServer(data) {
        this.updateFromPolling(data);
    }

    hasPendingChanges() {
        return this.counterState.currentValue !== this.counterState.originalValue;
    }

    // Método para limpiar y refrescar el componente
    refresh() {
        if (this.isComponentVisible()) {
            console.log('Refrescando componente...');
            this.init();
        }
    }

    // Método para destruir el componente
    destroy() {
        console.log('Destruyendo SolicitudUnidadesManager');
        
        // Detener polling
        this.stopPolling();
        
        // Remover event listeners
        this.unbindEvents();
        
        // Limpiar referencias
        this.elements = {};
        this.counterState = null;
        this.lastServerData = null;
        this.initialized = false;
    }
}

// Instancia global del manager
let solicitudUnidadesManager = null;

// Función que se llama cuando se navega a la sección
function initSolicitudUnidades() {
    try {
        console.log('Intentando inicializar Solicitud de Unidades...');
        
        // Crear instancia si no existe
        if (!solicitudUnidadesManager) {
            solicitudUnidadesManager = new SolicitudUnidadesManager();
        }
        
        // Intentar inicializar
        const success = solicitudUnidadesManager.init();
        
        if (success) {
            console.log('SolicitudUnidadesManager inicializado exitosamente');
        } else {
            console.log('SolicitudUnidadesManager no pudo inicializarse - componente no disponible');
        }
        
        return success;
        
    } catch (error) {
        console.error('Error inicializando Solicitud de Unidades:', error);
        return false;
    }
}

// Función para refrescar el componente
function refreshSolicitudUnidades() {
    if (solicitudUnidadesManager) {
        solicitudUnidadesManager.refresh();
    }
}

// Función para destruir el componente cuando se navega fuera
function destroySolicitudUnidades() {
    if (solicitudUnidadesManager) {
        solicitudUnidadesManager.destroy();
    }
}

// Funciones públicas para controlar el polling manualmente (opcional)
function enablePolling() {
    POLLING_CONFIG.ENABLED = true;
    if (solicitudUnidadesManager && solicitudUnidadesManager.initialized) {
        solicitudUnidadesManager.startPolling();
    }
    console.log('Polling habilitado');
}

function disablePolling() {
    POLLING_CONFIG.ENABLED = false;
    if (solicitudUnidadesManager) {
        solicitudUnidadesManager.stopPolling();
    }
    console.log('Polling deshabilitado');
}

// Escuchar eventos de navegación del menú
document.addEventListener('menuNavigation', (event) => {
    const { from, to } = event.detail;
    
    if (to === 'solicitud-unidades') {
        // Navegando hacia solicitud-unidades
        console.log('Navegando a solicitud-unidades');
        setTimeout(() => {
            initSolicitudUnidades();
        }, 100); // Pequeño delay para asegurar que el DOM esté listo
    } else if (from === 'solicitud-unidades') {
        // Navegando fuera de solicitud-unidades
        console.log('Navegando fuera de solicitud-unidades');
        destroySolicitudUnidades();
    }
});

// Escuchar cambios de visibilidad de página - REMOVIDO EL REFRESH
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && solicitudUnidadesManager && solicitudUnidadesManager.initialized) {
        console.log('Página visible - continuando con polling silencioso...');
        // Ya no se hace refresh, solo continúa el polling
    } else if (document.hidden && solicitudUnidadesManager) {
        console.log('Página oculta - polling continuará verificando visibilidad');
        // El polling se pausará automáticamente porque verificará isComponentVisible()
    }
});

console.log('Módulo Solicitud de Unidades cargado');