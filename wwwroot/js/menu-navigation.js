class MenuNavigationManager {
    constructor() {
        this.currentComponent = '';
        this.components = ['solicitud-unidades', 'descarga-unidades', 'brix-unidades', 'enfriamiento-unidades'];
        this.elements = {};
        this.isTransitioning = false;
        this.currentIndex = 0;
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.minSwipeDistance = 50;
        this.init();
    }

    init() {
        console.log('🚀 Inicializando navegación de menú...');

        this.loadElements();
        this.validateComponentsMapping();
        this.syncWithInitialState();
        
        // Mostrar indicador inmediatamente después de sincronizar
        this.updateMenuUI();
        this.updateIndicatorPosition();
        this.elements.menu.setAttribute('data-ready', '1');
        
        this.enableTransitions();
        this.bindEvents();
        this.bindSwipeEvents();

        console.log('✅ Navegación de menú inicializado:', {
            currentComponent: this.currentComponent,
            currentIndex: this.currentIndex,
            indicatorPosition: this.elements.menu.getAttribute('data-active')
        });
    }

    loadElements() {
        this.elements.menu = document.getElementById('navigationMenu');
        this.elements.menuItems = document.querySelectorAll('.menu-melaza-item');
        this.elements.componentContainer = document.getElementById('componentesContainer');
        this.elements.indicator = document.querySelector('.indicator');

        if (!this.elements.menu || !this.elements.componentContainer) {
            console.error('❌ Elementos de navegación no encontrados');
            throw new Error('Elementos de navegación requeridos no encontrados');
        }

        console.log('📋 Elementos cargados:', {
            menu: !!this.elements.menu,
            menuItems: this.elements.menuItems.length,
            container: !!this.elements.componentContainer,
            indicator: !!this.elements.indicator
        });
    }

    validateComponentsMapping() {
        // Verificar que el HTML y JS coinciden exactamente
        const htmlComponents = Array.from(this.elements.menuItems).map(item => item.getAttribute('data-component'));
        
        console.log('🔍 Validación de mapeo:', {
            jsComponents: this.components,
            htmlComponents: htmlComponents,
            match: JSON.stringify(this.components) === JSON.stringify(htmlComponents)
        });

        // Verificar índices HTML
        this.elements.menuItems.forEach((item, domIndex) => {
            const component = item.getAttribute('data-component');
            const dataIndex = parseInt(item.getAttribute('data-index'), 10);
            const jsIndex = this.components.indexOf(component);
            
            console.log(`📍 Item ${domIndex}: component="${component}", data-index="${dataIndex}", js-index="${jsIndex}"`);
            
            if (domIndex !== jsIndex) {
                console.warn(`⚠️ Desajuste detectado en índice ${domIndex}: HTML index != JS index`);
            }
        });
    }

    syncWithInitialState() {
        console.log('🔄 Sincronizando estado inicial...');
        
        // Usar estado previo si existe y está listo
        if (window._menuInitialState && window._menuInitialState.isReady) {
            this.currentComponent = window._menuInitialState.currentComponent;
            this.currentIndex = window._menuInitialState.currentIndex;
            
            // Validación adicional
            const expectedComponent = this.components[this.currentIndex];
            if (expectedComponent !== this.currentComponent) {
                console.error(`❌ Inconsistencia detectada: índice ${this.currentIndex} debería ser "${expectedComponent}" pero es "${this.currentComponent}"`);
                // Corregir usando el componente como fuente de verdad
                this.currentIndex = this.components.indexOf(this.currentComponent);
            }
            
            console.log('✅ Usando estado inicial del script inline:', {
                currentComponent: this.currentComponent,
                currentIndex: this.currentIndex,
                validation: this.components[this.currentIndex] === this.currentComponent
            });
            return;
        }

        // Fallback al código original
        const initialComponent = this.elements.menu.getAttribute('data-initial-component') ||
            localStorage.getItem('currentMenuComponent') ||
            'solicitud-unidades';

        const initialIndexAttr = this.elements.menu.getAttribute('data-active');
        let initialIndex = 0;
        
        if (initialIndexAttr !== null && initialIndexAttr !== '') {
            const parsedIndex = parseInt(initialIndexAttr, 10);
            if (!isNaN(parsedIndex) && parsedIndex >= 0 && parsedIndex < this.components.length) {
                initialIndex = parsedIndex;
            } else {
                const componentIndex = this.components.indexOf(initialComponent);
                initialIndex = componentIndex >= 0 ? componentIndex : 0;
            }
        } else {
            const componentIndex = this.components.indexOf(initialComponent);
            initialIndex = componentIndex >= 0 ? componentIndex : 0;
        }

        this.currentComponent = initialComponent;
        this.currentIndex = initialIndex;

        console.log('✅ Estado sincronizado con fallback:', {
            currentComponent: this.currentComponent,
            currentIndex: this.currentIndex,
            validation: this.components[this.currentIndex] === this.currentComponent
        });
    }

    enableTransitions() {
        setTimeout(() => {
            this.elements.menu.classList.add('menu-transitions-enabled');
            console.log('🎨 Transiciones del indicador habilitadas');
        }, 200);
    }

    saveCurrentComponent() {
        try {
            localStorage.setItem('currentMenuComponent', this.currentComponent);
            console.log('💾 Componente guardado:', this.currentComponent);
        } catch (error) {
            console.error('❌ Error guardando componente actual:', error);
        }
    }

    bindEvents() {
        this.elements.menuItems.forEach((item, domIndex) => {
            const component = item.getAttribute('data-component');
            const jsIndex = this.components.indexOf(component);
            
            item.addEventListener('click', (e) => this.handleItemClick(e, item, jsIndex));
            item.addEventListener('touchend', (e) => this.handleTouchEnd(e, item, jsIndex), { passive: false });
            
            console.log(`🔗 Evento vinculado: DOM index ${domIndex} -> JS index ${jsIndex} (${component})`);
        });
    }

    bindSwipeEvents() {
        const container = document.body;

        container.addEventListener('touchstart', (e) => {
            this.touchStartX = e.touches[0].clientX;
            this.touchStartY = e.touches[0].clientY;
        }, { passive: true });

        container.addEventListener('touchend', (e) => {
            if (this.isTransitioning) return;

            const touchEndX = e.changedTouches[0].clientX;
            const touchEndY = e.changedTouches[0].clientY;

            const deltaX = touchEndX - this.touchStartX;
            const deltaY = touchEndY - this.touchStartY;

            if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > this.minSwipeDistance) {
                if (deltaX > 0) {
                    this.navigateToPrevious();
                } else {
                    this.navigateToNext();
                }
            }
        }, { passive: true });
    }

    navigateToPrevious() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            const targetComponent = this.components[this.currentIndex];
            console.log(`⬅️ Navegando al anterior: índice ${this.currentIndex} (${targetComponent})`);
            this.navigateToComponent(targetComponent);
        }
    }

    navigateToNext() {
        if (this.currentIndex < this.components.length - 1) {
            this.currentIndex++;
            const targetComponent = this.components[this.currentIndex];
            console.log(`➡️ Navegando al siguiente: índice ${this.currentIndex} (${targetComponent})`);
            this.navigateToComponent(targetComponent);
        }
    }

    handleItemClick(e, item, jsIndex) {
        e.preventDefault();
        e.stopPropagation();

        if (this.isTransitioning) return;

        const component = item.getAttribute('data-component');
        console.log(`🖱️ Click en: ${component} (JS index: ${jsIndex})`);
        
        if (component && component !== this.currentComponent) {
            this.currentIndex = jsIndex; // Usar el índice corregido
            this.navigateToComponent(component);
        }
    }

    handleTouchEnd(e, item, jsIndex) {
        e.preventDefault();

        if (this.isTransitioning) return;

        const component = item.getAttribute('data-component');
        console.log(`👆 Touch en: ${component} (JS index: ${jsIndex})`);
        
        if (component && component !== this.currentComponent) {
            this.currentIndex = jsIndex; // Usar el índice corregido
            this.navigateToComponent(component);
        }
    }

    navigateToComponent(componentName) {
        if (!this.components.includes(componentName) || this.isTransitioning) {
            return;
        }

        const previousComponent = this.currentComponent;
        const expectedIndex = this.components.indexOf(componentName);

        // Verificación de consistencia antes de navegar
        if (this.currentIndex !== expectedIndex) {
            console.warn(`⚠️ Índice inconsistente detectado. Corrigiendo de ${this.currentIndex} a ${expectedIndex}`);
            this.currentIndex = expectedIndex;
        }

        this.isTransitioning = true;
        this.currentComponent = componentName;
        this.saveCurrentComponent();

        console.log(`🧭 Navegando: ${previousComponent} -> ${componentName} (índice: ${this.currentIndex})`);

        // Actualizar UI inmediatamente
        this.updateMenuUI();
        this.updateIndicatorPosition();
        
        // Mostrar componente con delay mínimo
        this.showComponent(componentName);

        // Emitir evento después de que el componente esté visible
        setTimeout(() => {
            this.emitNavigationEvent(previousComponent, componentName);
        }, 150);

        setTimeout(() => {
            this.isTransitioning = false;
        }, 600);
    }

    emitNavigationEvent(from, to) {
        const event = new CustomEvent('menuNavigation', {
            detail: { from, to },
            bubbles: true
        });
        document.dispatchEvent(event);
        console.log('📡 Evento de navegación emitido:', { from, to });
    }

    updateMenuUI() {
        this.elements.menuItems.forEach((item) => {
            const component = item.getAttribute('data-component');
            const isActive = component === this.currentComponent;
            item.classList.toggle('active', isActive);
        });
        console.log(`🎨 UI del menú actualizada para: ${this.currentComponent}`);
    }

    updateIndicatorPosition() {
        const oldPosition = this.elements.menu.getAttribute('data-active');
        this.elements.menu.setAttribute('data-active', this.currentIndex.toString());
        
        console.log(`📍 Indicador actualizado: posición ${oldPosition} -> ${this.currentIndex} (componente: ${this.currentComponent})`);
        
        // Validación final
        const expectedComponent = this.components[this.currentIndex];
        if (expectedComponent !== this.currentComponent) {
            console.error(`❌ ERROR CRÍTICO: Indicador en posición ${this.currentIndex} pero componente activo es ${this.currentComponent}. Debería ser ${expectedComponent}`);
        }
    }

    showComponent(componentName) {
        // Ocultar todos los componentes primero
        this.components.forEach(name => {
            const element = document.getElementById(`component-${name}`);
            if (element) {
                element.classList.remove('active');
                element.classList.add('hidden');
            }
        });

        // Mostrar el componente activo con un delay mínimo para asegurar el DOM
        setTimeout(() => {
            const activeElement = document.getElementById(`component-${componentName}`);
            if (activeElement) {
                activeElement.classList.remove('hidden');
                activeElement.classList.add('active');
                window.scrollTo({ top: 0, behavior: 'smooth' });
                
                console.log(`👁️ Componente ${componentName} ahora visible`);
            } else {
                console.error(`❌ Componente ${componentName} no encontrado en el DOM`);
            }
        }, 50);
    }

    getCurrentComponent() {
        return this.currentComponent;
    }

    destroy() {
        const container = this.elements.componentContainer;
        if (container) {
            const clonedContainer = container.cloneNode(true);
            container.parentNode.replaceChild(clonedContainer, container);
        }

        this.elements.menuItems?.forEach(item => {
            const newItem = item.cloneNode(true);
            item.parentNode.replaceChild(newItem, item);
        });
        
        console.log('🗑️ MenuNavigationManager destruido');
    }
}

let menuNavigationManager = null;

function initMenuNavigation() {
    try {
        if (menuNavigationManager) {
            menuNavigationManager.destroy();
        }
        
        // Esperar a que el estado inicial esté listo si existe
        if (window._menuInitialState && !window._menuInitialState.isReady) {
            console.log('⏳ Esperando a que el estado inicial esté listo...');
            setTimeout(initMenuNavigation, 100);
            return;
        }
        
        menuNavigationManager = new MenuNavigationManager();
        window.menuNavigationManager = menuNavigationManager;

        // Emitir evento inicial con delay mayor para asegurar que el componente esté visible
        setTimeout(() => {
            const currentComponent = menuNavigationManager.getCurrentComponent();
            const event = new CustomEvent('menuNavigation', {
                detail: { from: null, to: currentComponent },
                bubbles: true
            });
            document.dispatchEvent(event);
            console.log('📡 Evento inicial emitido para:', currentComponent);
        }, 400);

        // Log de debugging final
        console.log('🔍 Estado final del menú:', {
            menu: !!document.getElementById('navigationMenu'),
            indicator: !!document.querySelector('.indicator'),
            menuItems: document.querySelectorAll('.menu-melaza-item').length,
            containers: document.querySelectorAll('.component-section').length,
            initialState: window._menuInitialState,
            currentComponent: menuNavigationManager.getCurrentComponent(),
            currentIndex: menuNavigationManager.currentIndex,
            indicatorPosition: document.getElementById('navigationMenu')?.getAttribute('data-active')
        });

    } catch (error) {
        console.error('❌ Error inicializando navegación de menú:', error);
        setTimeout(initMenuNavigation, 1000);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMenuNavigation);
} else {
    initMenuNavigation();
}

window.MenuNavigationManager = MenuNavigationManager;
window.initMenuNavigation = initMenuNavigation;