/**
 * Sistema de Prechequeo - Clase Principal
 * Maneja toda la funcionalidad de prechequeo para dispositivos móviles y desktop
 */
// --- Utils para extraer el codigoGeneracion ---
// Regex más permisiva que acepta UUIDs con 8-10 caracteres en el primer segmento
const UUID_RE = /[0-9A-Fa-f]{8,10}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}/;

function extractCodigoGeneracionSync(raw) {
    if (!raw) return null;

    // a) ¿ya hay un UUID
    const m = raw.match(UUID_RE);
    if (m) {
        // Solo normalizar a mayúsculas, mantener el formato original
        return m[0].toUpperCase();
    }

    // b) ¿viene una URL? intenta leer params
    try {
        const u = new URL(raw);
        const p = u.searchParams.get('codigoGeneracion') || u.searchParams.get('codGen');
        if (p && UUID_RE.test(p)) {
            return p.toUpperCase();
        }
    } catch (_) { /* no era URL válida */ }

    return null;
}

function looksLikeTinyPreview(raw) {
    // Mantiene el nombre por compatibilidad, pero ahora detecta cualquier URL "resoluble"
    if (typeof raw !== 'string') return false;

    // Limpiezas típicas de scanners
    raw = raw.replace(/^URL=/i, "").replace(/^<|>$/g, "").trim();

    // Si ya hay un UUID en el string, no hace falta resolver nada
    if (UUID_RE.test(raw)) return false;

    try {
        const u = new URL(raw);

        // Solo http/https
        if (!/^https?:$/i.test(u.protocol)) return false;

        // Si ya es Hacienda y trae codigoGeneracion/codGen válido, no hay que resolver
        if (/admin\.factura\.gob\.sv/i.test(u.host)) {
            const p = u.searchParams.get('codigoGeneracion') || u.searchParams.get('codGen');
            return !(p && UUID_RE.test(p)); // true solo si NO trae UUID en query
        }

        // Lista de acortadores/comunes “puente”
        const shortHosts =
            /(tinyurl\.com|bit\.ly|t\.co|is\.gd|rebrand\.ly|ow\.ly|goo\.gl|tiny\.cc|cutt\.ly|buff\.ly|shorturl\.at|lnkd\.in|s\.id|rb\.gy|v\.gd|trib\.al|fb\.me|wa\.me)$/i;
        if (shortHosts.test(u.host)) return true;

        // Genérico: Si es otra URL distinta a Hacienda y aún no tenemos UUID, intentamos resolverla.
        return true;
    } catch {
        // No era una URL válida: entonces no tratamos de resolver
        return false;
    }
}


class PrechequeoManager {
    constructor() {
        // Configuración inicial
        this.isMobile = window.matchMedia('(max-width: 768px)').matches;
        this.isSearching = false;
        this.cameraStream = null;
        this.currentTransaction = null;
        this.currentTransactionCode = null; // Guardar el código de transacción actual
        this.searchTimeout = null;

        // Configuración de elementos DOM
        this.config = this.getElementConfig();

        // Cache de elementos DOM
        this.elements = this.getElements();

        // Inicializar el sistema
        this.init();
    }

    /**
     * Configuración de IDs de elementos según dispositivo
     */
    getElementConfig() {
        return {
            inputId: this.isMobile ? 'txtTransaccionMobile' : 'txtTransaccion',
            btnId: this.isMobile ? 'btnBuscarMobile' : 'lnkBuscar',
            modalId: this.isMobile ? 'editModalMobile' : 'editModalDesktop',
            carouselId: this.isMobile ? 'carouselFormsMobile' : 'carouselFormsDesktop',
            videoId: this.isMobile ? 'cameraMobile' : 'cameraDesktop',
            canvasId: this.isMobile ? 'canvasMobile' : 'canvasDesktop',
            photoId: this.isMobile ? 'capturedPhotoMobile' : 'capturedPhotoDesktop',
            takePhotoId: this.isMobile ? 'takePhotoMobile' : 'takePhotoDesktop'
        };
    }

    /**
     * Cache de elementos DOM
     */
    getElements() {
        return {
            input: document.getElementById(this.config.inputId),
            searchBtn: document.getElementById(this.config.btnId),
            modal: document.getElementById(this.config.modalId),
            carousel: document.getElementById(this.config.carouselId),
            video: document.getElementById(this.config.videoId),
            canvas: document.getElementById(this.config.canvasId),
            photo: document.getElementById(this.config.photoId),
            takePhotoBtn: document.getElementById(this.config.takePhotoId),
            nextBtn: document.getElementById('nextBtn'),
            backBtn: document.getElementById('backBtn'),
            changeStatusBtn: document.getElementById('changeStatusButton')
        };
    }

    /**
     * Inicialización del sistema
     */
    init() {
        console.log(`🚀 Iniciando PrechequeoManager para ${this.isMobile ? 'móvil' : 'desktop'}`);

        this.setupEventListeners();
        // BS4 con jQuery
        if (this.elements.carousel) {
            $(this.elements.carousel).carousel({
                interval: false,
                ride: false,
                wrap: false,
                keyboard: false,
                pause: false,
                touch: false
            });
        }
        this.setupResponsiveHandler();
        this.setupCamera();
        this.focusInput();
        this.preventDefaultButtonBehavior();

        // Ocultar spinner si existe
        if (window.AlmapacUtils?.hideSpinner) {
            window.AlmapacUtils.hideSpinner();
        }
    }

    /**
     * Configuración de event listeners
     */
    setupEventListeners() {
        // Input events
        if (this.elements.input) {
            // 1) Normalizador: convierte URL de Hacienda -> UUID al vuelo
            function attachQrNormalizer(inputEl) {
                const normalizeOnce = () => {
                    const raw = (inputEl.value || "").trim().replace(/\r?\n/g, " ");
                    const cleaned = raw.replace(/^URL=/i, "").replace(/^<|>$/g, "").trim();

                    const uuid = extractCodigoGeneracionSync(cleaned);
                    if (uuid) {
                        inputEl.value = uuid;        // ← deja SOLO el UUID
                        // Evita loops: NO dispares 'change' aquí.
                        // Si necesitas notificar, podrías disparar 'input':
                        // inputEl.dispatchEvent(new Event("input", { bubbles: true }));
                    } else {
                        inputEl.value = cleaned;
                    }
                };

                // Importante: NO usar 'change' aquí para evitar recursión
                ["input", "paste", "blur"].forEach(evt =>
                    inputEl.addEventListener(evt, normalizeOnce)
                );
                inputEl.addEventListener("keydown", (e) => {
                    if (e.key === "Enter") normalizeOnce();
                });
            }

            // Llamada una sola vez cuando montas la vista
            attachQrNormalizer(this.elements.input);

            // 2) Tus listeners existentes
            this.elements.input.addEventListener('input', this.handleInputChange.bind(this));
            this.elements.input.addEventListener('blur', this.handleInputBlur.bind(this));
            this.elements.input.addEventListener('keypress', this.handleKeyPress.bind(this));
        }

        // Search button
        if (this.elements.searchBtn) {
            this.elements.searchBtn.addEventListener('click', this.searchTransaction.bind(this));
        }

        // Mobile specific events
        if (this.isMobile) {
            const mobileForm = document.querySelector('.pre-mobile-precheck-box');
            if (mobileForm) {
                mobileForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.searchTransaction();
                });
            }
        }

        // Modal events
        if (this.elements.modal) {
            $(this.elements.modal).on('show.bs.modal', this.onModalShow.bind(this));
            $(this.elements.modal).on('hidden.bs.modal', this.onModalHide.bind(this));
        }

        // Camera events
        if (this.elements.takePhotoBtn) {
            this.elements.takePhotoBtn.addEventListener('click', this.takePhoto.bind(this));
        }

        // Navigation buttons
        if (this.elements.nextBtn) {
            this.elements.nextBtn.addEventListener('click', this.handleNext.bind(this));
        }

        if (this.elements.backBtn) {
            this.elements.backBtn.addEventListener('click', this.handleBack.bind(this));
        }

        if (this.elements.changeStatusBtn) {
            this.elements.changeStatusBtn.addEventListener('click', this.changeStatus.bind(this));
        }

        // Carousel events
        if (this.elements.carousel) {
            this.elements.carousel.addEventListener('slid.bs.carousel', this.onCarouselSlide.bind(this));
        }

        // Global events
        document.addEventListener('keydown', this.handleGlobalKeydown.bind(this));

        // Modal dismiss buttons
        document.querySelectorAll('[data-bs-dismiss="modal"]').forEach(element => {
            element.addEventListener('click', this.closeModal.bind(this));
        });
    }

    /**
     * Manejo de cambios en el input
     */
    handleInputChange(event) {
        // Reemplazar ' por -
        const value = event.target.value.replace(/'/g, '-');
        event.target.value = value;
    }

    /**
     * Manejo de pérdida de foco del input
     */
    handleInputBlur() {
        const value = this.elements.input.value.trim();
        if (value !== '' && !this.isSearching) {
            console.log('Input perdió el foco. Disparando verificación.');
            // Pequeño delay para evitar búsquedas duplicadas con Enter
            setTimeout(() => {
                if (!this.isSearching && this.elements.input.value.trim() !== '') {
                    this.searchTransaction();
                }
            }, 100);
        } else {
            console.log('Input vacío o búsqueda en progreso, no se ejecuta verificación.');
        }
    }

    /**
     * Manejo de teclas presionadas
     */
    handleKeyPress(event) {
        if (event.which === 13) { // Enter key
            event.preventDefault();
            this.searchTransaction();
        }
    }

    /**
     * Manejo de teclas globales
     */
    handleGlobalKeydown(event) {
        if (event.key === 'Escape') {
            this.closeModal();
        }
    }

    /**
     * Búsqueda de transacción unificada
     */
    async searchTransaction() {
        // Limpiar timeout anterior si existe
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }

        // Evitar múltiples llamadas simultáneas
        if (this.isSearching) {
            console.log('Ya se está buscando una transacción...');
            return false;
        }

        const transactionCode = this.elements.input.value.trim();

        if (transactionCode === '') {
            this.showError();
            return false;
        }

        console.log('🔍 Código original del input:', transactionCode);

        // 1) Si ya trae UUID o URL de Hacienda, úsalo
        let codigo = extractCodigoGeneracionSync(transactionCode);
        console.log('🔍 Código después de extractCodigoGeneracionSync:', codigo);

        // 2) Si es TinyURL preview, resolver en backend sin esperar
        if (!codigo && looksLikeTinyPreview(transactionCode)) {
            try {
                const r = await this.makeAjaxRequest('/Prechequeo/ResolverCodigoGeneracion', {
                    raw: transactionCode
                });
                if (r?.success && r?.codigoGeneracion) {
                    codigo = r.codigoGeneracion;
                }
            } catch (e) {
                console.warn('ResolverCodigoGeneracion falló:', e);
            }
        }

        if (codigo) {
            // Sobrescribe el input para que el flujo actual use el codeGen correcto
            this.elements.input.value = codigo;
        }

        this.isSearching = true;

        try {
            const payloadCode = codigo || transactionCode;
            console.log('📤 Enviando al servidor:', payloadCode);

            const response = await this.makeAjaxRequest('/Prechequeo/BuscarTransaccion', {
                transaccion: payloadCode
            });

            if (response.success) {
                this.isSearching = false;
                this.currentTransaction = response.data;
                this.currentTransactionCode = payloadCode; // Guardar el código de transacción
                this.loadTransactionData(response.data);
                $(this.elements.modal).modal('show');
            } else {
                this.handleSearchError(response.message);
            }
        } catch (error) {
            console.error('Error en búsqueda:', error);
            this.searchTimeout = setTimeout(() => {
                this.isSearching = false;
            }, 200);
            this.showError();
        }

        return true;
    }

    /**
     * Realizar petición AJAX
     */
    makeAjaxRequest(url, data) {
        return new Promise((resolve, reject) => {
            $.ajax({
                type: "POST",
                url: url,
                data: JSON.stringify(data),
                contentType: "application/json; charset=utf-8",
                dataType: "json",
                success: resolve,
                error: reject
            });
        });
    }

    /**
     * Manejo de errores de búsqueda
     */
    handleSearchError(message) {
        if (message.includes("ya ha sido prechequeada") || message.includes("ya fue prechequeado")) {
            Swal.fire({
                title: 'Atención',
                text: 'Esta transacción ya ha sido prechequeada.',
                icon: 'warning',
                confirmButtonColor: '#3085d6',
                confirmButtonText: 'Aceptar',
                allowOutsideClick: false,
                allowEscapeKey: false
            }).then(() => {
                this.searchTimeout = setTimeout(() => {
                    this.isSearching = false;
                    location.reload();
                }, 300);
            });
        } else if (message.includes("no se encontró") || message.includes("no existe")) {
            this.isSearching = false;
            this.showError();
        } else {
            this.isSearching = false;
            this.showError();
        }
    }

    /**
     * Cargar datos de transacción en el modal
     */
    loadTransactionData(data) {
        console.log(`🔄 cargarDatosEnModal iniciado con datos para ${this.isMobile ? 'móvil' : 'desktop'}:`, data);

        // Mapeo de datos básicos
        const dataMapping = {
            'txt_ingenio': data.ingenio || '',
            'txtFecha': data.fecha || '',
            'txt_transporte': data.transporte || '',
            'txtHora': data.hora || '',
            'txt_placaCamion': data.placaCamion || '',
            'txt_placaRemolque': data.placaRemolque || '',
            'txt_licencia': data.licencia || '',
            'txt_motorista': data.motorista || '',
            'txt_producto': data.producto
        };

        // Cargar datos básicos
        Object.entries(dataMapping).forEach(([elementId, value]) => {
            const element = document.getElementById(elementId);
            if (element) {
                element.textContent = value;
            }
        });
        // 2) Pintar en DOM (si es input usa .value, si no .textContent)
        Object.entries(dataMapping).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (!el) return;
            const v = val ?? '';
            if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') {
                el.value = v;
            } else {
                el.textContent = v;
            }
        });

        // 3) Aplicar clase al contenedor según el producto (usa producto o nameProduct)
        const productForCss = (data.producto ?? data.nameProduct ?? '');
        applyImageContainerByProduct(productForCss);

        //console.log(dataMapping);
        // Configurar tipo de camión
        this.setupTruckType(data.truckType || '');

        // Obtener datos de ranking del motorista
        if (data.licencia) {
            console.log('✅ Licencia encontrada, llamando obtenerRankingMotorista...');
            this.loadDriverRanking(data.licencia, data.truckType);
        } else {
            console.log('❌ No hay licencia, mostrando ranking por defecto');
            this.showDefaultRanking();
        }
    }

    /**
     * Configurar tipo de camión en el modal
     */
    setupTruckType(truckType) {
        console.log('🚛 Configurando tipo de camión:', truckType);

        // Elementos a ocultar/mostrar
        const containers = ['imgPlanaContainer', 'imgVolteoContainer', 'imgPipaContainer'];
        const divs = ['divPlana', 'divVolteo', 'divPipa'];
        const checkboxes = ['chkPlana', 'chkVolteo', 'chkPipa'];

        // Ocultar todos los contenedores y divs
        [...containers, ...divs].forEach(id => {
            const element = document.getElementById(id);
            if (element) element.style.display = 'none';
        });

        // Limpiar todos los checkboxes
        checkboxes.forEach(id => {
            const element = document.getElementById(id);
            if (element) element.checked = false;
        });

        // Lógica de mostrar según tipo de camión
        if (truckType === "PIPA") {
            this.showElements(['divPipa', 'imgPipaContainer']);
            this.checkElement('chkPipa');
        } else {
            this.showElements(['divPlana', 'divVolteo']);
            if (truckType === "VOLTEO") {
                this.showElements(['imgVolteoContainer']);
                this.checkElement('chkVolteo');
            } else {
                this.showElements(['imgPlanaContainer']);
                this.checkElement('chkPlana');
            }
        }
    }

    /**
     * Mostrar elementos por ID
     */
    showElements(ids) {
        ids.forEach(id => {
            const element = document.getElementById(id);
            if (element) element.style.display = 'block';
        });
    }

    /**
     * Marcar checkbox como seleccionado
     */
    checkElement(id) {
        const element = document.getElementById(id);
        if (element) element.checked = true;
    }

    /**
     * Obtener datos de ranking del motorista
     */
    async loadDriverRanking(license, truckType) {
        console.log('🚀 obtenerRankingMotorista iniciado');
        console.log('📝 Parámetros recibidos:', { license, truckType });

        try {
            const response = await this.makeAjaxRequest('/Prechequeo/GetMotoristaRanking', {
                license: license
            });

            console.log('✅ AJAX success - Respuesta completa:', response);

            if (response.success && response.data) {
                console.log('📊 Datos recibidos correctamente:', response.data);
                console.log('🔢 Cantidad de registros:', response.data.length);
                this.displayRankingData(response.data, truckType);
            } else {
                console.log('❌ No se pudieron obtener datos de ranking - Response:', response);
                this.showDefaultRanking();
            }
        } catch (error) {
            console.error('💥 Error AJAX completo:', error);
            this.showDefaultRanking();
        }
    }

    /**
     * Mostrar datos de ranking
     */
    displayRankingData(rankingData, truckType) {
        console.log('🎯 mostrarDatosRanking iniciado');
        console.log('📊 Datos recibidos:', rankingData);
        console.log('🚛 Tipo de camión:', truckType);

        // Determinar qué producto mostrar según el tipo de camión
        const productToShow = truckType === "PIPA" ? "MEL-001" : "AZ-001";
        console.log('🎯 Producto a buscar:', productToShow);

        // Buscar los datos del producto correspondiente
        let driverData = rankingData.find(item => item.product === productToShow);
        console.log('🔍 Datos encontrados para el producto:', driverData);

        if (!driverData) {
            console.log('⚠️ No se encontraron datos para el producto específico, usando el primero disponible');
            driverData = rankingData[0];
            console.log('🔄 Datos alternativos:', driverData);
        }

        if (!driverData) {
            this.showDefaultRanking();
            return;
        }

        // Extraer número de viajes
        const trips = driverData.n_Veces || driverData.N_Veces || 0;
        console.log('🔢 Número de viajes extraído:', trips);

        // Calcular información de nivel
        const levelInfo = this.calculateLevelInfo(trips);
        console.log('📊 Información de nivel calculada:', levelInfo);

        // Mostrar datos de ranking
        this.updateRankingDisplay(trips, levelInfo);
    }

    /**
     * Calcular información de nivel y porcentaje
     */
    calculateLevelInfo(trips) {
        console.log('🧮 calcularNivelYPorcentaje - Entrada:', trips);

        // Validación robusta de entrada
        if (trips === undefined || trips === null || isNaN(trips)) {
            console.error('❌ trips es inválido:', trips);
            return {
                current: "Sin Clasificación",
                next: "Pionero del Trayecto",
                percentage: 0,
                remaining: 0
            };
        }

        // Convertir a número por seguridad
        trips = parseInt(trips) || 0;
        console.log('🔢 trips convertido a número:', trips);

        // Definir niveles
        const levels = [
            { min: 1, max: 50, name: "Pionero del Trayecto", next: "As del Volante" },
            { min: 51, max: 100, name: "As del Volante", next: "Maestro de Ruta" },
            { min: 101, max: 150, name: "Maestro de Ruta", next: "Ícono del Camino" },
            { min: 151, max: 200, name: "Ícono del Camino", next: "Leyenda del Camino" },
            { min: 201, max: 250, name: "Leyenda del Camino", next: "Mito Viviente" },
            { min: 251, max: Infinity, name: "Mito Viviente", next: "Máximo Nivel" }
        ];

        // Encontrar nivel actual
        const currentLevel = levels.find(level => trips >= level.min && trips <= level.max) ||
            { name: "Sin Clasificación", next: "Pionero del Trayecto", min: 0, max: 1 };

        // Calcular porcentaje
        let percentage = 0;
        if (currentLevel.max !== Infinity) {
            const progress = trips - currentLevel.min + 1;
            const range = currentLevel.max - currentLevel.min + 1;
            percentage = Math.round((progress / range) * 100);
        } else {
            percentage = 100;
        }

        const result = {
            current: currentLevel.name,
            next: currentLevel.next,
            percentage: percentage,
            remaining: trips < 206 ? (currentLevel.max + 1) - trips : 0
        };

        console.log('📊 Resultado del cálculo:', result);
        return result;
    }

    /**
     * Actualizar display de ranking
     */
    updateRankingDisplay(trips, levelInfo) {
        console.log('🎨 updateRankingDisplay iniciado');

        // Verificar elementos DOM
        const elements = {
            trips: document.querySelector('.viajes-numero'),
            badge: document.querySelector('.badge-icon'),
            batteryFill: document.querySelector('.battery-fill')
        };

        console.log('🔍 Elementos encontrados:', {
            trips: !!elements.trips,
            badge: !!elements.badge,
            batteryFill: !!elements.batteryFill
        });

        // Actualizar número de viajes
        if (elements.trips) {
            console.log('✅ Actualizando viajes con valor:', trips);
            elements.trips.textContent = trips.toString();
        }

        // Actualizar badge
        if (elements.badge) {
            const badgeConfig = this.getBadgeConfig(levelInfo.current);
            console.log('✅ Actualizando badge icon');
            elements.badge.src = badgeConfig.imagePath;
            if (badgeConfig.filter) elements.badge.style.filter = badgeConfig.filter;
        }

        // Actualizar batería SVG
        if (elements.batteryFill) {
            const levelConfig = this.getLevelConfig(levelInfo.percentage);
            console.log('✅ Actualizando batería SVG:', levelConfig);

            // Calcular la altura basada en el porcentaje
            const bottomYAttr = elements.batteryFill.getAttribute('data-bottom-y');
            const maxHeightAttr = elements.batteryFill.getAttribute('data-max-height');
            const bottomY = bottomYAttr ? parseFloat(bottomYAttr) : 83;
            const maxHeight = maxHeightAttr ? parseFloat(maxHeightAttr) : 58;
            const fillHeight = Math.max(0, Math.min(maxHeight, (levelInfo.percentage / 100) * maxHeight));
            const newY = bottomY - fillHeight;

            // Actualizar la altura del rectángulo de llenado con animación suave
            elements.batteryFill.style.transition = 'height 0.5s ease-in-out, y 0.5s ease-in-out';
            elements.batteryFill.setAttribute('height', fillHeight);
            elements.batteryFill.setAttribute('y', newY);
            elements.batteryFill.setAttribute('fill', '#000000');

        }

        console.log('✅ updateRankingDisplay completado');
    }

    /**
     * Obtener configuración de badge
     */
    getBadgeConfig(level) {
        const badges = {
            "Pionero del Trayecto": { imagePath: "assets/images/pionero-trayecto.png" },
            "As del Volante": { imagePath: "assets/images/as-volante.png" },
            "Maestro de Ruta": { imagePath: "assets/images/maestro-ruta.png" },
            "Ícono del Camino": { imagePath: "assets/images/icono-camino.png" },
            "Leyenda del Camino": { imagePath: "assets/images/leyenda-camino.png" },
            "Mito Viviente": { imagePath: "assets/images/mito-viviente.png" },
            "Sin Clasificación": { imagePath: "assets/images/sin-clasificacion.png" }
        };

        return badges[level] || badges["Sin Clasificación"];
    }

    /**
     * Obtener configuración de nivel (ahora basado en SVG)
     */
    getLevelConfig(percentage) {
        // Determinar el color basado en el porcentaje
        let fillColor;
        if (percentage >= 80) {
            fillColor = "#4CAF50"; // Verde
        } else if (percentage >= 60) {
            fillColor = "#8BC34A"; // Verde claro
        } else if (percentage >= 40) {
            fillColor = "#FFC107"; // Amarillo
        } else if (percentage >= 20) {
            fillColor = "#FF9800"; // Naranja
        } else {
            fillColor = "#F44336"; // Rojo
        }

        return { fillColor, percentage };
    }

    /**
     * Animar relleno vertical de batería (altura + posición Y)
     */
    animateVerticalFill(batteryFillEl, percentage) {
        try {
            const bottomY = parseFloat(batteryFillEl.getAttribute('data-bottom-y') || '83');
            const maxHeight = parseFloat(batteryFillEl.getAttribute('data-max-height') || '58');
            const targetHeight = Math.max(0, Math.min(maxHeight, (percentage / 100) * maxHeight));
            const startHeight = parseFloat(batteryFillEl.getAttribute('height') || '0');
            const duration = 500;
            const startTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

            const easeInOut = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;

            const step = () => {
                const current = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                const elapsed = current - startTime;
                const t = Math.min(1, elapsed / duration);
                const eased = easeInOut(t);
                const h = startHeight + (targetHeight - startHeight) * eased;
                const y = bottomY - h;
                batteryFillEl.setAttribute('height', h);
                batteryFillEl.setAttribute('y', y);
                batteryFillEl.setAttribute('fill', '#000000');
                if (t < 1) {
                    requestAnimationFrame(step);
                }
            };

            requestAnimationFrame(step);
        } catch (e) {
            // Fallback sin animación
            const bottomY = parseFloat(batteryFillEl.getAttribute('data-bottom-y') || '83');
            const maxHeight = parseFloat(batteryFillEl.getAttribute('data-max-height') || '58');
            const h = Math.max(0, Math.min(maxHeight, (percentage / 100) * maxHeight));
            const y = bottomY - h;
            batteryFillEl.setAttribute('height', h);
            batteryFillEl.setAttribute('y', y);
            batteryFillEl.setAttribute('fill', '#000000');
        }
    }

    /**
     * Mostrar ranking por defecto
     */
    showDefaultRanking() {
        console.log('🔄 showDefaultRanking iniciado');

        // Actualizar número de viajes a 0
        const viajesNumero = document.querySelector('.viajes-numero');
        if (viajesNumero) {
            console.log('✅ Configurando viajes por defecto');
            viajesNumero.textContent = '0';
        }

        // Actualizar badge a sin clasificación
        const badgeIcon = document.querySelector('.badge-icon');
        if (badgeIcon) {
            console.log('✅ Configurando badge por defecto');
            badgeIcon.src = 'assets/images/sin-clasificacion.png';
        }

        // Actualizar batería SVG a 0%
        const batteryFill = document.querySelector('.battery-fill');

        if (batteryFill) {
            console.log('✅ Configurando batería SVG por defecto');
            const bottomYAttr = batteryFill.getAttribute('data-bottom-y');
            const bottomY = bottomYAttr ? parseFloat(bottomYAttr) : 83;
            batteryFill.style.transition = 'none';
            batteryFill.setAttribute('height', '0');
            batteryFill.setAttribute('y', bottomY);
            batteryFill.setAttribute('fill', '#000000');
        }

        // Eliminado: porcentaje en batería ya no se usa

        console.log('✅ showDefaultRanking completado');
    }

    /**
     * Configuración de cámara
     */
    setupCamera() {
        console.log('🎥 Configurando cámara con config:', this.config);

        if (!this.elements.video || !this.elements.canvas || !this.elements.takePhotoBtn) {
            console.warn('❌ Elementos de cámara no encontrados para:', this.config);
            return;
        }

        console.log(`📱 Configurando cámara para: ${this.isMobile ? 'Móvil' : 'Desktop'}`);
    }

    /**
     * Iniciar cámara
     */
    async startCamera() {
        let constraints;

        if (this.isMobile) {
            // Para móvil: intentar primero cámara frontal
            constraints = {
                video: {
                    facingMode: "user",
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            };

            console.log('🎥 Dispositivo móvil: Intentando acceder a cámara frontal...');
        } else {
            // Para desktop: configuración estándar
            constraints = { video: true, audio: false };
        }

        try {
            this.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
            if (this.elements.video) {
                this.elements.video.srcObject = this.cameraStream;
                await this.elements.video.play();
                console.log('✅ Cámara activada correctamente');
            }
        } catch (error) {
            console.error('Error al acceder a la cámara:', error);
            await this.tryFallbackCamera();
        }
    }

    /**
     * Intentar cámara de fallback
     */
    async tryFallbackCamera() {
        if (this.isMobile) {
            console.log('🔄 Intentando con cámara trasera como fallback...');

            try {
                const backCameraConstraints = {
                    video: { facingMode: "environment" },
                    audio: false
                };

                this.cameraStream = await navigator.mediaDevices.getUserMedia(backCameraConstraints);
                if (this.elements.video) {
                    this.elements.video.srcObject = this.cameraStream;
                    await this.elements.video.play();
                    console.log('✅ Cámara trasera activada como fallback');
                }
            } catch (fallbackError) {
                console.error('💥 Error al acceder a cualquier cámara:', fallbackError);
                await this.tryGenericCamera();
            }
        } else {
            await this.tryGenericCamera();
        }
    }

    /**
     * Intentar cámara genérica
     */
    async tryGenericCamera() {
        console.log('🔄 Último intento: sin restricciones de cámara...');

        try {
            this.cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            if (this.elements.video) {
                this.elements.video.srcObject = this.cameraStream;
                await this.elements.video.play();
                console.log('✅ Cámara genérica activada');
            }
        } catch (finalError) {
            console.error('💥 Error final - No se pudo acceder a ninguna cámara:', finalError);
            this.showError('No se pudo acceder a la cámara del dispositivo. Verifique los permisos de la aplicación.');
        }
    }

    /**
     * Detener cámara
     */
    stopCamera() {
        if (this.cameraStream) {
            this.cameraStream.getTracks().forEach(track => track.stop());
            if (this.elements.video) this.elements.video.srcObject = null;
            this.cameraStream = null;
            console.log('Cámara detenida y liberada');
        }
    }

    /**
     * Tomar foto
     */
    takePhoto(event) {
        if (!this.elements.canvas || !this.elements.video) return;

        const ctx = this.elements.canvas.getContext('2d');
        ctx.drawImage(this.elements.video, 0, 0, this.elements.canvas.width, this.elements.canvas.height);
        event.preventDefault();

        const photo = this.elements.canvas.toDataURL('image/jpeg');
        if (photo === 'data:,') {
            this.showError('Por favor, capture una foto antes de continuar.');
            return;
        }

        if (this.elements.photo) {
            this.elements.photo.src = photo;
            this.elements.photo.style.display = 'block';
        }
        if (this.elements.canvas) this.elements.canvas.style.display = 'none';
        if (this.elements.video) this.elements.video.style.display = 'none';
    }

    /**
     * Resetear estado de cámara
     */
    resetCameraState() {
        console.log('Resetting camera state');
        this.stopCamera();

        if (this.elements.photo) {
            this.elements.photo.style.display = 'none';
            this.elements.photo.src = '';
        }
        if (this.elements.canvas) this.elements.canvas.style.display = 'none';
        if (this.elements.video) this.elements.video.style.display = 'block';

        // Volver a iniciar la cámara
        this.startCamera();
    }

    /**
     * Cambiar estado de transacción
     */
    async changeStatus() {
        // Usar el código guardado en lugar de leer del input
        const transactionCode = this.currentTransactionCode || this.elements.input.value.trim();

        if (!this.elements.canvas) {
            console.error('Canvas element not found:', this.config.canvasId);
            return false;
        }

        const context = this.elements.canvas.getContext('2d');
        const photo = this.elements.canvas.toDataURL('image/jpeg');

        // Verificaciones
        if (!transactionCode || transactionCode === '') {
            this.showError('Por favor, Ingrese un Código de Generación');
            return false;
        }

        // Verificar si la foto ha sido tomada
        const isCanvasEmpty = !context.getImageData(0, 0, this.elements.canvas.width, this.elements.canvas.height).data.some(channel => channel !== 0);

        if (isCanvasEmpty) {
            this.showError('Por favor, capture una foto antes de continuar.');
            return false;
        }

        const predefinedStatusId = 2;

        try {
            // Cambiar estado
            const statusResponse = await this.makeAjaxRequest('/Prechequeo/ChangeTransactionStatus', {
                codeGen: transactionCode,
                predefinedStatusId: predefinedStatusId,
                imageData: photo
            });

            if (statusResponse === "Error: No se puede cambiar el estado sin haber subido una foto.") {
                Swal.fire({
                    title: 'Advertencia',
                    text: statusResponse,
                    icon: 'warning',
                    confirmButtonColor: '#3085d6',
                    confirmButtonText: 'Aceptar',
                    allowOutsideClick: false,
                    allowEscapeKey: false
                });
            } else if (statusResponse === "Cambio de estatus realizado con éxito") {
                await this.uploadPhoto(photo, transactionCode);
            } else {
                console.log("Error en cambio de estado:", statusResponse);

                let mensajeError = 'Hubo un problema al realizar el cambio de estatus.';

                try {
                    // Si es string, intenta parsearlo
                    const data = typeof statusResponse === 'string'
                        ? JSON.parse(statusResponse)
                        : statusResponse;

                    if (data && data.message) {
                        mensajeError = data.message; // Aquí obtienes: "El primer estado debe ser 1, pero se recibió 2."
                    }
                } catch (e) {
                    console.warn("No se pudo parsear el error:", e);
                }

                this.showError(mensajeError);
            }
        } catch (error) {
            console.error("Error cambiando el estado: ", error);
            const errorMessage = error.responseText ?
                JSON.parse(error.responseText).message || 'Hubo un error al cambiar el estado.' :
                'Hubo un error al cambiar el estado.';

            this.showError(errorMessage);
        }

        return false;
    }

    /**
     * Subir foto
     */
    async uploadPhoto(photo, transactionCode) {
        try {
            const response = await this.makeAjaxRequest('/Prechequeo/UploadPhoto', {
                imageData: photo,
                codeGen: transactionCode
            });

            if (response === 'success') {
                Swal.fire({
                    title: 'Éxito',
                    text: 'Prechequeo realizado, por favor presente sus documentos en ventanilla para ser validados',
                    icon: 'success',
                    showConfirmButton: false,
                    timer: 1750,
                    allowOutsideClick: false,
                    allowEscapeKey: false
                }).then(() => {
                    location.reload();
                    if (window.AlmapacUtils?.showSpinner) {
                        window.AlmapacUtils.showSpinner();
                    }
                });
            } else {
                this.showError(response || 'No se pudo subir la imagen al servidor');
            }
        } catch (error) {
            console.error('Error al subir la imagen:', error);
            const serverResponse = error.responseText ?
                JSON.parse(error.responseText) :
                { message: 'No se recibió respuesta del servidor.' };

            const errorMessage = serverResponse.message || 'No se pudo conectar con el servidor para subir la imagen';

            this.showError(errorMessage);
        }
    }

    /**
     * Manejar botón siguiente
     */
    handleNext() {
        console.log('Next button clicked');

        Swal.fire({
            title: 'Aviso Importante',
            html: `
                <div style="white-space: pre-line; margin-top: -20px">
                    Asegúrese de revisar cuidadosamente todos los detalles antes de continuar, ya que cualquier discrepancia o error en la información puede resultar en demoras o rechazos en el proceso.

                    Al hacer clic en Aceptar, usted autoriza y valida que los datos ingresados son correctos y completos.

                    En caso de error, seleccione "Cancelar" y comuníquese con el ingenio para actualizar la información con ALMAPAC.
                </div>
            `,
            icon: 'warning',
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            confirmButtonText: 'Aceptar',
            customClass: {
                popup: 'custom-alert-wide-container',
                confirmButton: 'btn btn-success',
                cancelButton: 'btn btn-danger'
            },
            buttonsStyling: false,
            allowOutsideClick: false,
            allowEscapeKey: false
        }).then((result) => {
            if (result.isConfirmed) {
                console.log('Confirm button pressed');
                this.resetCameraState();
                $(this.elements.carousel).carousel('next');
            } else if (result.isDismissed) {
                console.log('Cancel button pressed');
                location.reload();
            }
        });
    }

    /**
     * Manejar botón atrás
     */
    handleBack() {
        console.log('Back button clicked');
        $(this.elements.carousel).carousel('prev');
    }

    /**
     * Manejar slide del carrusel
     */
    onCarouselSlide() {
        console.log('Slide changed');
        this.resetCameraState();
    }

    /**
     * Evento de mostrar modal
     */
    onModalShow() {
        console.log(`Modal ${this.config.modalId} is being shown`);
        this.resetCameraState();
    }

    /**
     * Evento de ocultar modal
     */
    onModalHide() {
        console.log(`Modal ${this.config.modalId} is being hidden`);
        this.stopCamera();
        this.currentTransactionCode = null; // Limpiar el código guardado
        setTimeout(() => {
            location.reload();
        }, 100);
    }

    /**
     * Cerrar modal
     */
    closeModal() {
        $(this.elements.modal).modal('hide');
        location.reload();
    }

    /**
     * Enfocar input
     */
    focusInput() {
        if (this.elements.input) {
            this.elements.input.focus();
        }
    }

    /**
     * Mostrar error genérico
     */
    showError(mensaje = 'El código de generación ingresado no existe.') {
        Swal.fire({
            html: `
                <div class="swal2-icon-custom">
                    <div class="swal2-x-mark">
                        <div class="swal2-x-mark-line"></div>
                        <div class="swal2-x-mark-line"></div>
                    </div>
                </div>
                <div class="swal2-title">ERROR</div>
                <div class="custom-divider"></div>
                ${mensaje}
            `,
            confirmButtonText: 'Aceptar',
            customClass: {
                popup: 'swal2-popup',
                confirmButton: 'swal2-styled swal2-confirm'
            },
            showConfirmButton: true,
            allowOutsideClick: false,
            allowEscapeKey: false
        }).then((result) => {
            if (result.isConfirmed) {
                this.elements.input.value = '';
                this.focusInput();
            }
        }).catch((error) => {
            console.error('Error en SweetAlert2:', error);
        });
    }

    /**
     * Configurar manejador responsivo
     */
    setupResponsiveHandler() {
        const initialIsMobile = this.isMobile;
        let resizeTimeout;
        let hasReloaded = false;

        const handleResize = () => {
            clearTimeout(resizeTimeout);

            resizeTimeout = setTimeout(() => {
                if (hasReloaded) return;

                const currentIsMobile = window.matchMedia('(max-width: 768px)').matches;

                if (initialIsMobile !== currentIsMobile) {
                    console.log(`Device type changed: ${initialIsMobile ? 'Mobile' : 'Desktop'} → ${currentIsMobile ? 'Mobile' : 'Desktop'}`);

                    hasReloaded = true;

                    // Mostrar indicador de carga
                    if (document.body) {
                        const overlay = document.createElement('div');
                        overlay.style.cssText = `
                            position: fixed;
                            top: 0;
                            left: 0;
                            width: 100%;
                            height: 100%;
                            background: rgba(255, 255, 255, 0.9);
                            display: flex;
                            justify-content: center;
                            align-items: center;
                            z-index: 9999;
                            font-family: 'Poppins', Arial, sans-serif;
                        `;
                        overlay.innerHTML = `
                            <div style="text-align: center;">
                                <div style="width: 40px; height: 40px; border: 4px solid #f3f3f3; border-top: 4px solid #1E3A8A; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1rem;"></div>
                                <p style="color: #6B7280; font-size: 1rem; margin: 0;">Adaptando interfaz...</p>
                            </div>
                            <style>
                                @keyframes spin {
                                    0% { transform: rotate(0deg); }
                                    100% { transform: rotate(360deg); }
                                }
                            </style>
                        `;
                        document.body.appendChild(overlay);
                    }

                    setTimeout(() => {
                        window.location.reload();
                    }, 100);
                }
            }, 500);
        };

        // Event listeners
        window.addEventListener('resize', handleResize);

        if ('orientation' in screen) {
            screen.orientation.addEventListener('change', () => {
                console.log('Orientation changed');
                setTimeout(handleResize, 300);
            });
        }

        window.addEventListener('orientationchange', () => {
            console.log('Orientation change event fired');
            setTimeout(handleResize, 300);
        });

        console.log('Responsive handler initialized:', {
            initialIsMobile: initialIsMobile,
            currentScreenWidth: window.innerWidth,
            userAgent: navigator.userAgent.substring(0, 50) + '...'
        });
    }

    /**
     * Prevenir comportamiento por defecto de botones
     */
    preventDefaultButtonBehavior() {
        const buttonsToPrevent = this.isMobile
            ? ['btnBuscarMobile', 'nextBtn', 'backBtn', 'takePhotoMobile', 'changeStatusButton']
            : ['lnkBuscar', 'nextBtn', 'backBtn', 'takePhotoDesktop', 'changeStatusButton'];

        buttonsToPrevent.forEach(buttonId => {
            const button = document.getElementById(buttonId);
            if (button) {
                button.addEventListener("click", function (event) {
                    event.preventDefault();
                });
            }
        });

        // Prevenir recarga en botones generales
        document.querySelectorAll("button").forEach(button => {
            if (!buttonsToPrevent.includes(button.id)) {
                button.addEventListener("click", function (event) {
                    event.preventDefault();
                });
            }
        });
    }

    /**
     * Función checkInput para compatibilidad
     */
    checkInput() {
        const transactionCode = this.elements.input.value.trim();

        if (transactionCode === '') {
            this.showError();
            return false;
        }

        // Solo para desktop (legacy)
        if (!this.isMobile) {
            const dataFound = document.getElementById('dataFound')?.value;

            if (typeof Sys !== 'undefined' && Sys.WebForms) {
                Sys.WebForms.PageRequestManager.getInstance().add_endRequest(function () {
                    if (dataFound === 'true') {
                        $('#editModalDesktop').modal('show');
                    }
                });
            }
        }

        return true;
    }
}

// Funciones globales para compatibilidad
let prechequeoManager;

function buscarTransaccion() {
    if (prechequeoManager) {
        return prechequeoManager.searchTransaction();
    }
}

function changeStatus() {
    if (prechequeoManager) {
        return prechequeoManager.changeStatus();
    }
}

function closeModal() {
    if (prechequeoManager) {
        prechequeoManager.closeModal();
    }
}

function checkInput() {
    if (prechequeoManager) {
        return prechequeoManager.checkInput();
    }
}

// Funciones de ranking para compatibilidad
function obtenerRankingMotorista(licencia, truckType) {
    if (prechequeoManager) {
        prechequeoManager.loadDriverRanking(licencia, truckType);
    }
}

function mostrarRankingDefault() {
    if (prechequeoManager) {
        prechequeoManager.showDefaultRanking();
    }
}

// Inicialización cuando el DOM esté listo
$(document).ready(function () {
    prechequeoManager = new PrechequeoManager();
});

// Fallback para cuando jQuery no esté disponible
if (typeof $ === 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
        prechequeoManager = new PrechequeoManager();
    });
}

function applyImageContainerByProduct(productValue) {
    const normalized = (productValue || '').toString().trim().toUpperCase();
    const el = document.getElementById('mainImageContainer')
        || document.querySelector('.image-container');
    if (!el) return;

    // Limpia variantes previas
    el.classList.remove('image-container-Mel', 'image-container-Az');

    // Asigna según código (con fallback por texto)
    if (normalized === 'MEL-001' || normalized.includes('MEL')) {
        el.classList.add('image-container-Mel');
    } else if (normalized === 'AZ-001' || normalized.includes('AZ')) {
        el.classList.add('image-container-Az');
    }
}
