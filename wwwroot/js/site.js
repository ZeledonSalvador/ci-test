// site.js - Versión ajustada con toasts solo para sesión
$("#spinner-overlay").hide();
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Inicializando componentes globales...');
    initializeGlobalComponents();
});

function initializeGlobalComponents() {    
    // Configurar manejo global de errores AJAX
    setupAjaxErrorHandling();
    
    // Configurar interceptor global para fetch
    setupFetchInterceptor();
    
    console.log('✅ Componentes globales inicializados');
}

// Función para obtener cookies
function getCookie(nombre) {
    const nombreEQ = nombre + "=";
    const cookies = document.cookie.split(";");
    
    for (let i = 0; i < cookies.length; i++) {
        let cookie = cookies[i].trim();
        if (cookie.indexOf(nombreEQ) === 0) {
            return cookie.substring(nombreEQ.length);
        }
    }
    
    return null;
}

// Configurar manejo global de errores AJAX
function setupAjaxErrorHandling() {
    console.log('🔧 Configurando manejo de errores AJAX...');
    
    if (typeof jQuery !== 'undefined' && jQuery.fn && jQuery.fn.jquery) {
        jQuery(document).ajaxError(function(event, xhr, settings, thrownError) {
            console.error('❌ Error AJAX capturado:', {
                url: settings.url,
                status: xhr.status,
                error: thrownError,
                response: xhr.responseText
            });
            
            // ERRORES DE AUTENTICACIÓN Y PERMISOS
            if (xhr.status === 401) {
                console.log('🔐 Error de autenticación (401) detectado en AJAX, redirigiendo...');
                handleAuthenticationError();
            } else if (xhr.status === 403) {
                console.log('🚫 Error de permisos (403) detectado en AJAX');
                // Para AJAX, el mensaje ya viene en thrownError o en la respuesta
                // No redirigimos, dejamos que el código que hizo la llamada maneje el error
            }
        });
        
        console.log('✅ Manejo de errores AJAX configurado');
    } else {
        console.warn('⚠️ jQuery no disponible para configurar manejo de errores');
    }
}

// Configurar interceptor global para fetch
function setupFetchInterceptor() {
    console.log('🔧 Configurando interceptor de fetch...');
    
    if (typeof window.fetch !== 'undefined') {
        const originalFetch = window.fetch;
        
        window.fetch = function(...args) {
            return originalFetch.apply(this, args)
                .then(response => {
                    // 401: Error de autenticación (token inválido/expirado) → redirect a login
                    if (response.status === 401) {
                        console.log('🔐 Error de autenticación (401) en fetch detectado');
                        handleAuthenticationError();

                        const error = new Error('Token inválido. Por favor, inicie sesión nuevamente.');
                        error.status = 401;
                        throw error;
                    }

                    // 403: Error de permisos → solo logging, no interceptar
                    // Dejar que el código que hizo la llamada maneje el error apropiadamente
                    if (response.status === 403) {
                        console.log('🚫 Error de permisos (403) en fetch detectado - el código debe manejar este error');
                    }

                    return response;
                })
                .catch(error => {
                    // Re-lanzar el error para que el código que hizo fetch pueda manejarlo
                    throw error;
                });
        };
        
        console.log('✅ Interceptor global de fetch configurado');
    } else {
        console.warn('⚠️ Fetch no disponible en este navegador');
    }
}

// Función centralizada para manejar errores de autenticación
function handleAuthenticationError() {
    console.log('🔄 Ejecutando manejo de error de autenticación...');
    
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: 'error',
            title: 'Sesión Expirada',
            text: 'Su sesión ha expirado. Será redirigido al login.',
            confirmButtonText: 'Aceptar',
            allowOutsideClick: false,
            allowEscapeKey: false
        }).then(() => {
            console.log('🔄 Redirigiendo a login...');
            window.location.href = '/Login';
        });
    } else {
        alert('Su sesión ha expirado. Será redirigido al login.');
        console.log('🔄 Redirigiendo a login (fallback)...');
        window.location.href = '/Login';
    }
}

// Utilidades adicionales
function showSpinner() {
    const spinner = document.getElementById('spinner-overlay');
    if (spinner) {
        spinner.style.display = 'flex';
    }
}

function hideSpinner() {
    const spinner = document.getElementById('spinner-overlay');
    if (spinner) {
        spinner.style.display = 'none';
    }
}

function showNotification(type, title, message, timer = 3000) {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: type,
            title: title,
            text: message,
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: timer,
            timerProgressBar: true,
            showCloseButton: true
        });
    } else {
        console.log(`${type.toUpperCase()}: ${title} - ${message}`);
    }
}

function showModal(type, title, message) {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            icon: type,
            title: title,
            text: message,
            confirmButtonText: 'Aceptar',
            confirmButtonColor: type === 'success' ? '#28a745' : 
                               type === 'error' ? '#d33' : 
                               type === 'warning' ? '#ffc107' : 
                               '#17a2b8'
        });
    } else {
        alert(`${title}: ${message}`);
    }
}

// Exportar funciones globales
window.AlmapacUtils = {
    getCookie,
    showSpinner,
    hideSpinner,
    showNotification,  
    showModal      
};