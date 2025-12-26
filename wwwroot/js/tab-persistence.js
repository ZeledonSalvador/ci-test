// Gestión de persistencia de pestañas entre páginas
(function() {
    'use strict';
    
    const TAB_STORAGE_KEY = 'selectedProductTab';
    
    // Guardar pestaña seleccionada
    function saveSelectedTab(tabType) {
        sessionStorage.setItem(TAB_STORAGE_KEY, tabType);
        console.log('✓ Pestaña guardada:', tabType);
    }
    
    // Obtener pestaña seleccionada (default: azucar)
    function getSelectedTab() {
        return sessionStorage.getItem(TAB_STORAGE_KEY) || 'azucar';
    }
    
    // Detectar pestaña actual según URL
    function detectCurrentTab() {
        const path = window.location.pathname.toLowerCase();
        return path.includes('melaza') ? 'melaza' : 'azucar';
    }
    
    // Aplicar estado visual a las pestañas
    function applyTabState() {
        const selectedTab = getSelectedTab();
        const tabButtons = document.querySelectorAll('.tab-button');
        
        console.log('📍 Aplicando estado visual:', selectedTab);
        
        tabButtons.forEach(button => {
            const href = button.getAttribute('href');
            if (!href) return;
            
            const isAzucar = !href.includes('Melaza');
            const isMelaza = href.includes('Melaza');
            
            button.classList.remove('active-tab');
            
            if ((selectedTab === 'azucar' && isAzucar) || 
                (selectedTab === 'melaza' && isMelaza)) {
                button.classList.add('active-tab');
            }
        });
    }
    
    // Configurar listeners en las pestañas internas
    function setupTabListeners() {
        const tabButtons = document.querySelectorAll('.tab-button');
        
        tabButtons.forEach(button => {
            button.addEventListener('click', function() {
                const href = this.getAttribute('href');
                const tabType = href.includes('Melaza') ? 'melaza' : 'azucar';
                saveSelectedTab(tabType);
                console.log('🔄 Click en pestaña:', tabType);
            });
        });
    }
    
    // Inicializar
    function init() {
        console.log('🚀 Tab Persistence iniciado');
        
        // Guardar pestaña actual basándose en la URL
        const currentTab = detectCurrentTab();
        saveSelectedTab(currentTab);
        
        // Aplicar estado visual
        applyTabState();
        
        // Configurar listeners
        setupTabListeners();
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    window.addEventListener('pageshow', function(event) {
        if (event.persisted) {
            applyTabState();
        }
    });
    
    // Exportar para uso en layout
    window.TabPersistence = {
        getSelectedTab,
        saveSelectedTab
    };
})();