// wwwroot/js/correlativo-marchamo.js

document.addEventListener("DOMContentLoaded", () => {

    // Guardamos la URL original (con los parámetros)
    const initialUrl = new URL(window.location.href);

    // Limpiamos lo que se muestra en la barra del navegador (quitamos ?page=..., etc.)
    if (initialUrl.search) {
        const cleanUrl = initialUrl.origin + initialUrl.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
    }

    // ============================
    //  SELECT DE TAMAÑO DE PÁGINA
    // ============================
    const pageSizeSelect = document.getElementById("pageSizeSelect");
    const tabla = document.getElementById("tablaCorrelativos");

    if (pageSizeSelect && tabla) {
        pageSizeSelect.addEventListener("change", () => {
            const newSize = pageSizeSelect.value;
            const currentSearch = tabla.dataset.search || "";

            const url = new URL(initialUrl);
            url.searchParams.set("size", newSize);
            url.searchParams.set("page", "1");
            if (currentSearch) {
                url.searchParams.set("search", currentSearch);
            }

            window.location.href = url.toString();
        });
    }

    // ============================
    //  REFERENCIAS DEL DOM
    // ============================
    const searchInput = document.getElementById("search");
    const tablaBody = document.querySelector("#tablaCorrelativos tbody");

    // USAR JQUERY para los modales (como en la versión que funcionaba)
    const btnAgregar = document.getElementById("btnAgregar");
    const modal = $("#modalMarchamo");
    const modalTitulo = document.getElementById("modalMarchamoTitulo");
    const btnGuardar = document.getElementById("btnGuardarMarchamo");

    const idInput = document.getElementById("marchamoId");
    const clienteInput = document.getElementById("clienteInput");
    const productoInput = document.getElementById("productoInput");
    const basculaInput = document.getElementById("basculaInput");
    const inicioInput = document.getElementById("inicioInput");
    const finInput = document.getElementById("finInput");

    const modalAnular = $("#modalAnularMarchamo");
    const numeroMarchamoInput = document.getElementById("numeroMarchamoInput");
    const motivoAnulacionInput = document.getElementById("motivoAnulacionInput");
    const btnConfirmarAnular = document.getElementById("btnConfirmarAnular");

    let filaSeleccionadaParaAnular = null;
    let codigoIngenioEdicion = null;
    let codigoProductoEdicion = null;
    let rangoInicioAnulacion = null;
    let rangoFinAnulacion = null;

    if (!tabla) return;

    // ============================
    //  ANTIFORGERY TOKEN
    // ============================
    function getAntiForgeryToken() {
        const tokenInput = document.querySelector('input[name="__RequestVerificationToken"]');
        return tokenInput ? tokenInput.value : "";
    }

    // Parámetros que vienen del HTML (servidor)
    const currentPage = tabla.dataset.currentPage || 1;
    const size = tabla.dataset.size || 10;
    const currentSearch = tabla.dataset.search || "";

    // ============================
    //  HELPERS
    // ============================
    function reloadPreservingState() {
        const url = new URL(window.location.origin + "/CorrelativoMarchamo");
        url.searchParams.set("page", currentPage);
        url.searchParams.set("size", size);
        if (currentSearch) url.searchParams.set("search", currentSearch);
        window.location.href = url.toString();
    }

    // ============================
    //  ALERTAS CONSISTENTES (SweetAlert2) - MARCHAMO
    // ============================
    const SWAL_CONFIRM_TEXT = "Confirmar";
    const SWAL_CONFIRM_COLOR = "#182A6E";
    const SWAL_CANCEL_TEXT = "Cancelar";
    const SWAL_CANCEL_COLOR = "red";

    // ============================
    //  CARGA DE CLIENTES (CACHE EN MEMORIA)
    // ============================
    let clientesCache = null;

    async function cargarClientes() {
        if (clientesCache) return clientesCache;

        try {
            const response = await fetch("/CorrelativoMarchamo/clientes");

            if (!response.ok) {
                throw new Error("Error al obtener la lista de clientes");
            }

            const result = await response.json();

            if (!result.success) {
                throw new Error(result.message || "Error al obtener la lista de clientes");
            }

            // Ordenar por name
            clientesCache = (result.data || []).sort((a, b) =>
                (a.name || "").localeCompare(b.name || "")
            );

            return clientesCache;
        } catch (error) {
            console.error("Error al cargar clientes:", error);

            Swal.fire({
                icon: "error",
                title: "Error al cargar clientes",
                text: error.message || "No se pudo obtener la lista de clientes.",
                confirmButtonText: SWAL_CONFIRM_TEXT,
                confirmButtonColor: SWAL_CONFIRM_COLOR
            });

            return [];
        }
    }

    async function poblarSelectClientes(valorSeleccionado = null) {
        const clientes = await cargarClientes();

        if (!clienteInput) return;

        // Limpiar opciones existentes (excepto el placeholder)
        clienteInput.innerHTML = '<option value="">Seleccione un cliente</option>';

        // Agregar opciones dinámicamente
        clientes.forEach(cliente => {
            const option = document.createElement("option");
            option.value = cliente.ingenioCode;
            option.textContent = cliente.name;
            clienteInput.appendChild(option);
        });

        // Re-aplicar valor seleccionado si existe (para edición)
        if (valorSeleccionado) {
            clienteInput.value = valorSeleccionado;
        }
    }

    // Enganchar carga de clientes al abrir el modal
    modal.on("show.bs.modal", async function() {
        // Capturar el valor actual antes de repoblar (para edición)
        const valorActual = clienteInput.value;
        await poblarSelectClientes(valorActual);
    });

    // ============================
    //  FUNCIÓN PARA VALIDAR SOLO ENTEROS
    // ============================
    function enforceIntegerOnly(inputEl) {
        if (!inputEl) return;

        // Bloquear teclas no permitidas en keydown
        inputEl.addEventListener('keydown', (e) => {
            // Permitir: Backspace, Tab, Delete, flechas, Home, End
            const allowedKeys = ['Backspace', 'Tab', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];

            if (allowedKeys.includes(e.key)) {
                return; // Permitir estas teclas
            }

            // Bloquear: e, E, +, -, ., , (coma), espacio
            const blockedKeys = ['e', 'E', '+', '-', '.', ',', ' '];
            if (blockedKeys.includes(e.key)) {
                e.preventDefault();
                return;
            }

            // Permitir Ctrl/Cmd + A/C/V/X (para copiar/pegar/seleccionar)
            if ((e.ctrlKey || e.metaKey) && ['a', 'c', 'v', 'x'].includes(e.key.toLowerCase())) {
                return;
            }

            // Si no es un dígito, bloquear
            if (!/^[0-9]$/.test(e.key)) {
                e.preventDefault();
            }
        });

        // Validar paste - solo permitir dígitos
        inputEl.addEventListener('paste', (e) => {
            e.preventDefault();

            const pastedText = (e.clipboardData || window.clipboardData).getData('text');

            // Verificar si el texto pegado contiene solo dígitos
            if (!/^\d+$/.test(pastedText)) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Formato no válido',
                    text: 'Solo se permiten números enteros (sin decimales ni caracteres especiales).',
                    confirmButtonColor: SWAL_CONFIRM_COLOR,
                    confirmButtonText: SWAL_CONFIRM_TEXT
                });
                return;
            }

            // Si es válido, insertar el texto
            inputEl.value = pastedText;
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        });

        // Sanitizar en input - remover cualquier carácter no numérico
        inputEl.addEventListener('input', (e) => {
            const originalValue = inputEl.value;
            const sanitizedValue = originalValue.replace(/[^0-9]/g, '');

            if (originalValue !== sanitizedValue) {
                inputEl.value = sanitizedValue;
            }
        });
    }

    // Aplicar la validación a los inputs numéricos
    enforceIntegerOnly(inicioInput);
    enforceIntegerOnly(finInput);
    enforceIntegerOnly(numeroMarchamoInput);

    // ============================
    //  HELPER: CONVERTIR UTC A UTC-6 Y FORMATEAR
    // ============================
    function convertUtcToUtcMinus6(isoString) {
        try {
            const date = new Date(isoString);
            if (isNaN(date.getTime())) return null;

            // Restar 6 horas (6 * 60 * 60 * 1000 ms)
            const utcMinus6 = new Date(date.getTime() - (6 * 60 * 60 * 1000));

            // Formatear usando getUTC... para dd/MM/yyyy HH:mm
            const day = String(utcMinus6.getUTCDate()).padStart(2, '0');
            const month = String(utcMinus6.getUTCMonth() + 1).padStart(2, '0');
            const year = utcMinus6.getUTCFullYear();
            const hours = String(utcMinus6.getUTCHours()).padStart(2, '0');
            const minutes = String(utcMinus6.getUTCMinutes()).padStart(2, '0');

            return `${day}/${month}/${year} ${hours}:${minutes}`;
        } catch (e) {
            console.error('Error al convertir fecha UTC:', e);
            return null;
        }
    }

    // Aplicar conversión a todas las celdas de fecha
    document.querySelectorAll('.js-utc-date').forEach(cell => {
        const utcIso = cell.getAttribute('data-utc');
        if (utcIso) {
            const formatted = convertUtcToUtcMinus6(utcIso);
            if (formatted) {
                cell.textContent = formatted;
            }
        }
    });

    // ============================
    //  HELPER: NORMALIZAR CEROS A LA IZQUIERDA
    // ============================
    function normalizeNumericString(raw) {
        const s = (raw ?? "").toString().trim();
        if (!s) return "";
        const normalized = s.replace(/^0+(?=\d)/, "");
        return normalized === "" ? "0" : normalized;
    }

    function escapeHtml(str) {
        return String(str || "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function formatApiMessageMarchamo(rawMessage, options = {}) {
        const msg = String(rawMessage || "").trim().replace(/\s+/g, " ");
        const defaultTitle = options.defaultTitle || "Mensaje";

        // -----------------------------------------
        // A) GUARDAR: overlap dentro de otro rango existente
        // Ej:
        // No es posible crear el rango. Los marchamos 1-10000 ya existen en el rango 2000-3000
        // (Báscula 1, Cliente: Ingenio Chaparrastique, Producto: AZUCAR CRUDO GRANEL).
        // -----------------------------------------
        const mOverlap = msg.match(
            /No\s+es\s+posible\s+crear\s+el\s+rango\.\s*Los\s+marchamos\s+(\d+)\s*-\s*(\d+)\s+ya\s+existen\s+en\s+el\s+rango\s+(\d+)\s*-\s*(\d+)\s*\(([^)]+)\)\.?/i
        );
        if (mOverlap) {
            const nuevo = `${mOverlap[1]}-${mOverlap[2]}`;
            const existente = `${mOverlap[3]}-${mOverlap[4]}`;
            const detalles = mOverlap[5]; // "Báscula 1, Cliente: ..., Producto: ..."

            // Extraer Báscula / Cliente / Producto (si existen)
            const mBascula = detalles.match(/B[áa]scula\s*[:\s]*([0-9]+)/i);
            const mCliente = detalles.match(/Cliente\s*:\s*([^,]+)/i);
            const mProducto = detalles.match(/Producto\s*:\s*(.+)$/i);

            const bascula = mBascula ? `Báscula ${mBascula[1]}` : "";
            const cliente = mCliente ? mCliente[1].trim() : "";
            const producto = mProducto ? mProducto[1].trim() : "";

            return {
                title: "No es posible crear el rango.",
                html: `
                <div style="text-align:left; line-height:1.6;">
                    <div><b>Rango solicitado:</b> ${escapeHtml(nuevo)}</div>
                    <div style="margin-top:8px;"><b>Conflicto:</b> ya existe dentro del rango <b>${escapeHtml(existente)}</b>.</div>
                    ${(bascula || cliente || producto) ? `
                    <div style="margin-top:10px;"><b>Asignado en:</b></div>
                    <ul style="margin:6px 0 0; padding-left:18px;">
                        ${bascula ? `<li>${escapeHtml(bascula)}</li>` : ""}
                        ${cliente ? `<li><b>Cliente:</b> ${escapeHtml(cliente)}</li>` : ""}
                        ${producto ? `<li><b>Producto:</b> ${escapeHtml(producto)}</li>` : ""}
                    </ul>
                    ` : ""}
                </div>
                `
            };
        }

        // -----------------------------------------
        // B) GUARDAR/EDITAR: asignados a otro cliente
        // Ej:
        // No es posible crear el rango. Los marchamos 16126-16130 ya están asignados a otro cliente
        // (Compania Azucarera Salvadoreña, Báscula 3).
        // No es posible expandir el fin del rango. Los marchamos 16131-30000 ya están asignados a otro cliente
        // (Ingenio El Angel, Báscula 3).
        // -----------------------------------------
        const mAsignadoOtro = msg.match(
            /Los\s+marchamos\s+(\d+)\s*-\s*(\d+)\s+ya\s+est[aá]n\s+asignados\s+a\s+otro\s+cliente\s*\(([^)]+)\)\.?/i
        );
        if (mAsignadoOtro) {
            const rango = `${mAsignadoOtro[1]}-${mAsignadoOtro[2]}`;
            const destinoRaw = mAsignadoOtro[3].trim(); // "Ingenio El Angel, Báscula 3"
            const parts = destinoRaw.split(",").map(p => p.trim()).filter(Boolean);

            const cliente = parts.find(p => !/b[áa]scula/i.test(p)) || destinoRaw;
            const basculaPart = parts.find(p => /b[áa]scula/i.test(p)) || "";

            const titulo = /expandir\s+el\s+fin/i.test(msg)
                ? "No es posible expandir el fin del rango."
                : "No es posible crear el rango.";

            return {
                title: titulo,
                html: `
                <div style="text-align:left; line-height:1.6;">
                    <div><b>Conflicto:</b> el rango <b>${escapeHtml(rango)}</b> ya está asignado.</div>
                    <div style="margin-top:10px;"><b>Asignado en:</b></div>
                    <ul style="margin:6px 0 0; padding-left:18px;">
                    <li><b>Cliente:</b> ${escapeHtml(cliente)}</li>
                    ${basculaPart ? `<li><b>Ubicación:</b> ${escapeHtml(basculaPart)}</li>` : ""}
                    </ul>
                </div>
                `
            };
        }

        // -----------------------------------------
        // B2) GUARDAR/EDITAR: asignados en otra báscula (con Cliente/Producto dentro del paréntesis)
        // Ej:
        // Los marchamos 16126-16130 ya están asignados en otra báscula
        // (Báscula 3, Cliente: ..., Producto: ...).
        // -----------------------------------------
        const mOtraBascula = msg.match(
        /Los\s+marchamos\s+(\d+)\s*-\s*(\d+)\s+ya\s+est[aá]n\s+asignados\s+en\s+otra\s+b[áa]scula\s*\(([^)]+)\)\.?/i
        );

        if (mOtraBascula) {
        const rango = `${mOtraBascula[1]}-${mOtraBascula[2]}`;
        const detalles = mOtraBascula[3];

        const mBascula = detalles.match(/B[áa]scula\s*[:\s]*([0-9]+)/i);
        const mCliente = detalles.match(/Cliente\s*:\s*([^,]+)/i);
        const mProducto = detalles.match(/Producto\s*:\s*(.+)$/i);

        const bascula = mBascula ? `Báscula ${mBascula[1]}` : "";
        const cliente = mCliente ? mCliente[1].trim() : "";
        const producto = mProducto ? mProducto[1].trim() : "";

        return {
            title: "No es posible crear el rango.",
            html: `
            <div style="text-align:left; line-height:1.6;">
                <div><b>Conflicto:</b> el rango <b>${escapeHtml(rango)}</b> ya está asignado.</div>
                <div style="margin-top:10px;"><b>Asignado en:</b></div>
                <ul style="margin:6px 0 0; padding-left:18px;">
                ${bascula ? `<li><b>Ubicación: </b>${escapeHtml(bascula)}</li>` : ""}
                ${cliente ? `<li><b>Cliente:</b> ${escapeHtml(cliente)}</li>` : ""}
                ${producto ? `<li><b>Producto:</b> ${escapeHtml(producto)}</li>` : ""}
                </ul>
            </div>
            `
        };
        }

        // -----------------------------------------
        // C) EDITAR: cambio total de rango (no permitido)
        // Ej:
        // No es posible cambiar el rango de 16126-16130 a 1-10. Solo se permite...
        // -----------------------------------------
        const mCambioRango = msg.match(/cambiar\s+el\s+rango\s+de\s+(\d+)\s*-\s*(\d+)\s+a\s+(\d+)\s*-\s*(\d+)/i);
        if (mCambioRango) {
            const from = `${mCambioRango[1]}-${mCambioRango[2]}`;
            const to = `${mCambioRango[3]}-${mCambioRango[4]}`;

            const mRazon = msg.match(/Solo\s+se\s+permite[^.]*\./i);
            const razon = (mRazon?.[0] || "Solo se permite expandir o reducir el rango existente.").trim();

            const mSug = msg.match(/Si\s+necesita[^.]*\./i);
            const sugerencia = (mSug?.[0] || "").trim();

            return {
                title: "No es posible modificar el rango.",
                html: `
                <div style="text-align:left; line-height:1.6;">
                    <div><b>Intento:</b> cambiar de <b>${escapeHtml(from)}</b> a <b>${escapeHtml(to)}</b>.</div>
                    <div style="margin-top:8px;"><b>Razón:</b> ${escapeHtml(razon)}</div>
                    ${sugerencia ? `<div style="margin-top:8px;"><b>Sugerencia:</b> ${escapeHtml(sugerencia)}</div>` : ""}
                </div>
                `
            };
        }

        // -----------------------------------------
        // D) ANULAR: ya anulado
        // Ej: El marchamo #16126 ya se encuentra anulado.
        // -----------------------------------------
        const mYaAnulado = msg.match(/marchamo\s+#?(\d+)\s+ya\s+se\s+encuentra\s+anulado/i);
        if (mYaAnulado) {
            const n = mYaAnulado[1];
            return {
                title: "El marchamo ya estaba anulado.",
                html: `
                <div style="text-align:left; line-height:1.6;">
                    <div><b>Marchamo:</b> #${escapeHtml(n)}</div>
                    <div style="margin-top:8px;"><b>Estado:</b> ANULADO</div>
                </div>
                `
            };
        }

        // -----------------------------------------
        // E) ANULAR: número fuera de rango
        // Ej: El número ingresado debe estar entre 16126 y 16130 para este correlativo.
        // -----------------------------------------
        const mFueraRango = msg.match(/debe\s+estar\s+entre\s+(\d+)\s+y\s+(\d+)/i);
        if (/fuera\s+de\s+rango/i.test(msg) && mFueraRango) {
            return {
                title: "Número fuera de rango",
                html: `
                <div style="text-align:left; line-height:1.6;">
                    <div><b>Rango permitido:</b> ${escapeHtml(mFueraRango[1])} - ${escapeHtml(mFueraRango[2])}</div>
                    <div style="margin-top:8px;">Verifica el número ingresado y vuelve a intentar.</div>
                </div>
                `
            };
        }

       // Default: genérico (divide en frases en bullets)
            const parts = msg
            .split(". ")
            .map(s => s.trim())
            .filter(Boolean)
            .map(s => (s.endsWith(".") ? s : s + "."));

            if (parts.length >= 2) {
            return {
                title: defaultTitle,
                html: `
                <div style="text-align:left; line-height:1.6;">
                    <ul style="margin:0; padding-left:18px;">
                    ${parts.map(p => `<li>${escapeHtml(p)}</li>`).join("")}
                    </ul>
                </div>
                `
            };
            }

            return {
            title: defaultTitle,
            html: `
                <div style="text-align:left; line-height:1.6;">
                <div>${escapeHtml(msg || "Ocurrió un problema.")}</div>
                </div>
            `
};

    }

    function showApiAlertMarchamo({ icon, defaultTitle, message }) {
    const formatted = formatApiMessageMarchamo(message, { defaultTitle: defaultTitle || "Mensaje" });

    return Swal.fire({
        icon: icon || "info",
        title: formatted.title,
        html: formatted.html,
        confirmButtonColor: SWAL_CONFIRM_COLOR,
        confirmButtonText: SWAL_CONFIRM_TEXT
    });
    }



    // ============================
    //  BÚSQUEDA SERVER-SIDE
    // ============================
    function realizarBusquedaServerSide() {
        if (!searchInput || !tabla) return;

        const searchValue = searchInput.value.trim();
        const url = new URL(window.location.origin + "/CorrelativoMarchamo");
        url.searchParams.set("page", "1");
        url.searchParams.set("size", size);
        if (searchValue) {
            url.searchParams.set("search", searchValue);
        }

        window.location.href = url.toString();
    }

    // ============================
    //  BOTÓN DE BÚSQUEDA (lupa)
    // ============================
    const btnSearch = document.getElementById("btnSearch");

    if (searchInput) {
        searchInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                realizarBusquedaServerSide();
            }
        });
    }

    if (btnSearch) {
        btnSearch.addEventListener("click", () => {
            realizarBusquedaServerSide();
        });
    }

    // ============================
    //  LIMPIAR FORMULARIO
    // ============================
    function resetForm() {
        idInput.value = "";
        clienteInput.value = "";
        productoInput.value = "";
        basculaInput.value = "";
        inicioInput.value = "";
        finInput.value = "";
        codigoIngenioEdicion = null;
        codigoProductoEdicion = null;
    }

    // ============================
    //  MODAL: AGREGAR
    // ============================
    if (btnAgregar) {
        btnAgregar.addEventListener("click", () => {
            resetForm();
            modalTitulo.textContent = "Registro de correlativos";
            modal.modal("show");
        });
    }

    // ============================
    //  CONFIRMAR ANULACIÓN
    // ============================
    if (btnConfirmarAnular) {
        btnConfirmarAnular.addEventListener("click", async () => {
            if (!filaSeleccionadaParaAnular) return;

            const numeroStr = numeroMarchamoInput.value.trim();
            const motivo = motivoAnulacionInput.value;

            if (!numeroStr || !motivo) {
                Swal.fire({
                    icon: "warning",
                    title: "Campos incompletos",
                    text: "Debe seleccionar un motivo y tener un número de marchamo válido.",
                    confirmButtonColor: SWAL_CONFIRM_COLOR,
                    confirmButtonText: SWAL_CONFIRM_TEXT
                });
                return;
            }

            const numero = Number(numeroStr);

            if (Number.isNaN(numero)) {
                Swal.fire({
                    icon: "error",
                    title: "Número inválido",
                    text: "El número de marchamo no es válido.",
                    confirmButtonColor: SWAL_CONFIRM_COLOR,
                    confirmButtonText: SWAL_CONFIRM_TEXT
                });
                return;
            }

            if (numero <= 0) {
                Swal.fire({
                    icon: "error",
                    title: "Número inválido",
                    text: "El número de marchamo debe ser mayor que cero.",
                    confirmButtonColor: SWAL_CONFIRM_COLOR,
                    confirmButtonText: SWAL_CONFIRM_TEXT
                });
                return;
            }

            // Validar que el número esté dentro del rango del correlativo
            if (rangoInicioAnulacion !== null && rangoFinAnulacion !== null) {
                if (numero < rangoInicioAnulacion || numero > rangoFinAnulacion) {
                    await showApiAlertMarchamo({
                        icon: "error",
                        defaultTitle: "Número fuera de rango",
                        message: `El número ingresado debe estar entre ${rangoInicioAnulacion} y ${rangoFinAnulacion} para este correlativo.`
                    });
                    return;
                }
            }

            const token = getAntiForgeryToken();

            const formData = new FormData();
            formData.append("sealCode", numeroStr);
            formData.append("motivo", motivo);

            try {
                Swal.fire({
                    icon: "info",
                    title: "Anulando...",
                    text: "Procesando la anulación del marchamo.",
                    allowOutsideClick: false,
                    showConfirmButton: false,
                    didOpen: () => {
                        Swal.showLoading();
                    }
                });

                const response = await fetch("/CorrelativoMarchamo/Anular", {
                    method: "POST",
                    headers: {
                        "RequestVerificationToken": token
                    },
                    body: formData
                });

                const raw = await response.text();
                let result = { success: response.ok, message: "" };

                if (raw && raw.trim().length > 0) {
                    try {
                        const parsed = JSON.parse(raw);
                        result = parsed;
                    } catch {
                        console.warn("Respuesta no JSON al anular marchamo:", raw);
                        result.message = raw;
                    }
                } else {
                    result.message = response.ok
                        ? "El marchamo ha sido anulado correctamente."
                        : `Error del servidor (${response.status} ${response.statusText}).`;
                }

                // Si la respuesta no es OK (400, 409, 500, etc.), mostrar error
                if (!response.ok) {
                    await showApiAlertMarchamo({
                        icon: "error",
                        defaultTitle: "No se pudo anular",
                        message: result.message || "No se pudo anular el marchamo."
                    });
                    return;
                }

                // Si response.ok pero result.success === false, también es error
                if (result.success === false) {
                    await showApiAlertMarchamo({
                        icon: "error",
                        defaultTitle: "No se pudo anular",
                        message: result.message || "No se pudo anular el marchamo."
                    });
                    return;
                }

                // Solo si response.ok y no hay success=false => éxito
                filaSeleccionadaParaAnular.classList.add("table-secondary");

                modalAnular.modal("hide");
                filaSeleccionadaParaAnular = null;

                Swal.fire({
                    icon: "success",
                    title: "Marchamo anulado",
                    text: result.message || "El marchamo ha sido anulado correctamente.",
                    confirmButtonColor: SWAL_CONFIRM_COLOR,
                    confirmButtonText: SWAL_CONFIRM_TEXT
                }).then(() => {
                    reloadPreservingState();
                });
            } catch (error) {
                console.error(error);
                Swal.fire({
                    icon: "error",
                    title: "Error",
                    text: "Ocurrió un error inesperado al anular el marchamo.",
                    confirmButtonColor: SWAL_CONFIRM_COLOR,
                    confirmButtonText: SWAL_CONFIRM_TEXT
                });
            }
        });
    }

    // ============================
    //  GUARDAR (AGREGAR / EDITAR)
    // ============================
    if (btnGuardar) {
        btnGuardar.addEventListener("click", async () => {

            // CORRECCIÓN: Leer directamente el VALUE del select (que ya son códigos)
            const clienteCode = clienteInput.value.trim();
            const productoCode = productoInput.value.trim();
            const bascula = basculaInput.value;

            // Normalizar valores numéricos para evitar duplicados por ceros a la izquierda
            const inicioStr = normalizeNumericString(inicioInput.value);
            const finStr = normalizeNumericString(finInput.value);

            // Actualizar los inputs con valores normalizados para que el usuario vea el valor limpio
            inicioInput.value = inicioStr;
            finInput.value = finStr;

            if (!clienteCode || !productoCode || !bascula || !inicioStr || !finStr) {
                Swal.fire({
                    icon: "warning",
                    title: "Campos incompletos",
                    text: "Completa todos los campos requeridos.",
                    confirmButtonColor: SWAL_CONFIRM_COLOR,
                    confirmButtonText: SWAL_CONFIRM_TEXT
                });
                return;
            }

            const inicio = Number(inicioStr);
            const fin = Number(finStr);

            if (Number.isNaN(inicio) || Number.isNaN(fin)) {
                Swal.fire({
                    icon: "error",
                    title: "Valores inválidos",
                    text: "Los campos Inicio y Fin deben ser números válidos.",
                    confirmButtonColor: SWAL_CONFIRM_COLOR,
                    confirmButtonText: SWAL_CONFIRM_TEXT
                });
                return;
            }

            if (inicio < 0 || fin < 0) {
                Swal.fire({
                    icon: "error",
                    title: "Valores negativos no permitidos",
                    text: "Inicio y Fin no pueden ser números negativos.",
                    confirmButtonColor: SWAL_CONFIRM_COLOR,
                    confirmButtonText: SWAL_CONFIRM_TEXT
                });
                return;
            }

            if (fin < inicio) {
                Swal.fire({
                    icon: "error",
                    title: "Rango incorrecto",
                    text: "El valor de Fin no puede ser menor que el de Inicio.",
                    confirmButtonColor: SWAL_CONFIRM_COLOR,
                    confirmButtonText: SWAL_CONFIRM_TEXT
                });
                return;
            }

            const esEdicion = !!idInput.value;

            // YA NO NECESITAMOS MAPEAR - Los selects ya tienen los códigos como value
            const ingenioCode = clienteCode;
            const productCode = productoCode;

            const formData = new FormData();

            if (esEdicion) {
                formData.append("marchamoId", idInput.value);
            }
            formData.append("idBascula", bascula);
            formData.append("minSealnumber", inicioStr);
            formData.append("maxSealnumber", finStr);
            formData.append("ingenioCode", ingenioCode);
            formData.append("productCode", productCode);

            const token = getAntiForgeryToken();

            try {
                Swal.fire({
                    icon: "info",
                    title: "Guardando...",
                    text: "Procesando la información.",
                    allowOutsideClick: false,
                    showConfirmButton: false,
                    didOpen: () => {
                        Swal.showLoading();
                    }
                });

                const response = await fetch("/CorrelativoMarchamo/Guardar", {
                    method: "POST",
                    headers: {
                        "RequestVerificationToken": token
                    },
                    body: formData
                });

                const result = await response.json();

                if (result.success) {
                    modal.modal("hide");

                    Swal.fire({
                        icon: "success",
                        title: esEdicion ? "Correlativo actualizado" : "Correlativo registrado",
                        text: result.message || (esEdicion
                            ? "El correlativo se actualizó correctamente."
                            : "El nuevo correlativo se registró correctamente."),
                        confirmButtonColor: SWAL_CONFIRM_COLOR,
                        confirmButtonText: SWAL_CONFIRM_TEXT
                    }).then(() => {
                        reloadPreservingState();
                    });
                } else {
                    await showApiAlertMarchamo({
                        icon: "error",
                        defaultTitle: "No se pudo guardar",
                        message: result.message || "No se pudo guardar el correlativo de marchamo."
                    });
                }
            } catch (error) {
                console.error(error);
                Swal.fire({
                    icon: "error",
                    title: "Error",
                    text: "Ocurrió un error inesperado al guardar.",
                    confirmButtonColor: SWAL_CONFIRM_COLOR,
                    confirmButtonText: SWAL_CONFIRM_TEXT
                });
            }
        });
    }

    // ============================
    //  APLICAR ESTILOS A BOTONES Y FILAS SEGÚN ESTADO
    // ============================
    function actualizarEstilosBotonesHabilitar() {
        const filas = document.querySelectorAll(".fila-marchamo");

        filas.forEach(row => {
            const isActiveAttr = (row.dataset.isActive || "").toLowerCase();
            const isActive = isActiveAttr === "true";

            const canEditAttr = (row.dataset.canEdit || "").toLowerCase();
            const canEdit = canEditAttr === "true";

            const btnToggleActive = row.querySelector(".btn-toggle-active");
            const btnEdit = row.querySelector(".btn-edit");
            const btnAnnul = row.querySelector(".btn-annul");

            if (isActive) {
                // Rango activo/habilitado -> fila NORMAL
                row.classList.remove("fila-marchamo-disabled");

                // Botón Editar: depende de canEdit (INDEPENDIENTE de isActive)
                if (btnEdit) {
                    if (canEdit) {
                        btnEdit.classList.remove("btn-icon-disabled");
                        btnEdit.removeAttribute("aria-disabled");
                    } else {
                        btnEdit.classList.add("btn-icon-disabled");
                        btnEdit.setAttribute("aria-disabled", "true");
                    }
                }

                // Otros botones HABILITADOS
                if (btnAnnul) btnAnnul.classList.remove("btn-icon-disabled");

                // Botón toggle: muestra "Deshabilitar" cuando está activo
                if (btnToggleActive) {
                    btnToggleActive.classList.remove("btn-icon-disabled");
                    btnToggleActive.title = "Deshabilitar";
                }
            } else {
                // Rango inactivo/deshabilitado -> fila GRIS
                row.classList.add("fila-marchamo-disabled");

                // Botones de acción DESHABILITADOS (editar, anular)
                if (btnEdit) {
                    btnEdit.classList.add("btn-icon-disabled");
                    btnEdit.setAttribute("aria-disabled", "true");
                }
                if (btnAnnul) {
                    btnAnnul.classList.add("btn-icon-disabled");
                    btnAnnul.setAttribute("aria-disabled", "true");
                }

                // Botón toggle: muestra "Habilitar" cuando está inactivo y se destaca
                if (btnToggleActive) {
                    btnToggleActive.classList.remove("btn-icon-disabled");
                    btnToggleActive.title = "Habilitar";
                }
            }
        });
    }

    // Ejecutar al cargar la página
    actualizarEstilosBotonesHabilitar();

    // ============================
    //  HELPER: MOSTRAR MENÚ DE ACCIONES (MÓVIL)
    // ============================
    async function mostrarMenuAccionesMarchamo(row) {
        const isActiveAttr = (row.dataset.isActive || "").toLowerCase();
        const isActive = isActiveAttr === "true";

        const canEditAttr = (row.dataset.canEdit || "").toLowerCase();
        const canEdit = canEditAttr === "true";

        // Construir las opciones disponibles
        const opciones = [];

        // Ver detalle: siempre disponible
        opciones.push({
            id: "detail",
            label: '<i class="fas fa-list mr-2"></i> Ver detalle',
            clase: "btn-menu-opcion"
        });

        // Editar: solo si canEdit es true
        if (canEdit && isActive) {
            opciones.push({
                id: "edit",
                label: '<i class="fas fa-pen mr-2"></i> Editar',
                clase: "btn-menu-opcion"
            });
        }

        // Anular: solo si está activo
        if (isActive) {
            opciones.push({
                id: "annul",
                label: '<i class="fas fa-times-circle mr-2"></i> Anular',
                clase: "btn-menu-opcion"
            });
        }

        // Toggle: Habilitar si está inactivo, Deshabilitar si está activo
        if (isActive) {
            opciones.push({
                id: "toggle",
                label: '<i class="fas fa-ban mr-2"></i> Deshabilitar',
                clase: "btn-menu-opcion"
            });
        } else {
            opciones.push({
                id: "toggle",
                label: '<i class="fas fa-redo mr-2"></i> Habilitar',
                clase: "btn-menu-opcion"
            });
        }

        // Si no hay opciones disponibles, mostrar mensaje
        if (opciones.length === 0) {
            await Swal.fire({
                icon: "info",
                title: "Sin opciones disponibles",
                text: "No hay acciones disponibles para este registro.",
                confirmButtonColor: SWAL_CONFIRM_COLOR,
                confirmButtonText: SWAL_CONFIRM_TEXT
            });
            return;
        }

        // Construir HTML de botones
        const botonesHTML = opciones.map(op =>
            `<button type="button" class="${op.clase}" data-action="${op.id}" style="
                width: 100%;
                padding: 12px 20px;
                margin: 5px 0;
                border: 1px solid #dee2e6;
                border-radius: 5px;
                background: white;
                text-align: left;
                cursor: pointer;
                transition: all 0.2s;
                font-size: 15px;
            " onmouseover="this.style.backgroundColor='#f8f9fa'" onmouseout="this.style.backgroundColor='white'">
                ${op.label}
            </button>`
        ).join("");

        const result = await Swal.fire({
            title: "Seleccione una acción",
            html: `<div style="display: flex; flex-direction: column;">${botonesHTML}</div>`,
            showConfirmButton: false,
            showCancelButton: true,
            cancelButtonText: SWAL_CANCEL_TEXT,
            cancelButtonColor: SWAL_CANCEL_COLOR,
            customClass: {
                popup: 'swal-wide'
            },
            didOpen: () => {
                // Agregar listeners a los botones
                const botones = Swal.getHtmlContainer().querySelectorAll(".btn-menu-opcion");
                botones.forEach(btn => {
                    btn.addEventListener("click", () => {
                        Swal.close();
                        const action = btn.dataset.action;

                        // Simular click en el botón correspondiente
                        switch (action) {
                            case "detail":
                                row.querySelector(".btn-detail")?.click();
                                break;
                            case "edit":
                                row.querySelector(".btn-edit")?.click();
                                break;
                            case "annul":
                                row.querySelector(".btn-annul")?.click();
                                break;
                            case "toggle":
                                row.querySelector(".btn-toggle-active")?.click();
                                break;
                        }
                    });
                });
            }
        });
    }

    // ============================
    //  EVENTOS EN LA TABLA (DELEGACIÓN)
    // ============================

    if (tablaBody) {
        tablaBody.addEventListener("click", async (e) => {
            const row = e.target.closest(".fila-marchamo");
            if (!row) return;

            // Si el clic fue en la columna de opciones, NO navegar a ListaMarchamos
            const opcionesCell = e.target.closest(".opciones-cell");
            if (opcionesCell) {
                e.stopPropagation();
                // Continuar procesando si es un botón específico
            }

            // NUEVO: Detectar click en botón kebab (móvil)
            const btnActions = e.target.closest(".btn-actions");
            if (btnActions) {
                e.stopPropagation();
                await mostrarMenuAccionesMarchamo(row);
                return;
            }

            const btnDetail = e.target.closest(".btn-detail");
            const btnEdit = e.target.closest(".btn-edit");
            const btnToggleActive = e.target.closest(".btn-toggle-active");
            const btnAnnul = e.target.closest(".btn-annul");

            // ============================
            //  VER DETALLE (NAVEGAR A LISTA DE MARCHAMOS)
            // ============================
            if (btnDetail) {
                e.stopPropagation();

                const id = row.dataset.id;
                if (!id) return;

                const url =
                    `/CorrelativoMarchamo/ListaMarchamos/?correlativoId=${encodeURIComponent(id)}`
                    + `&page=1`
                    + `&size=${encodeURIComponent(size)}`
                    + `&search=`
                    + `&returnPage=${encodeURIComponent(currentPage)}`
                    + `&returnSize=${encodeURIComponent(size)}`
                    + `&returnSearch=${encodeURIComponent(currentSearch)}`;

                window.location.href = url;
                return;
            }

            // ============================
            //  TOGGLE ACTIVO/INACTIVO (HABILITAR/DESHABILITAR)
            // ============================
            if (btnToggleActive) {
                e.stopPropagation();

                const isActiveAttr = (row.dataset.isActive || "").toLowerCase();
                const isActive = isActiveAttr === "true";

                const idStr = row.dataset.id;
                if (!idStr) {
                    await Swal.fire({
                        icon: "error",
                        title: "Error",
                        text: "No se pudo obtener el identificador del correlativo.",
                        confirmButtonColor: SWAL_CONFIRM_COLOR,
                        confirmButtonText: SWAL_CONFIRM_TEXT
                    });
                    return;
                }

                const id = Number(idStr);
                if (!Number.isFinite(id) || id <= 0) {
                    await Swal.fire({
                        icon: "error",
                        title: "Error",
                        text: "El identificador del correlativo no es válido.",
                        confirmButtonColor: SWAL_CONFIRM_COLOR,
                        confirmButtonText: SWAL_CONFIRM_TEXT
                    });
                    return;
                }

                const inicio = row.dataset.inicio || "";
                const fin = row.dataset.fin || "";

                // Si está ACTIVO -> DESHABILITAR
                if (isActive) {
                    const confirmResult = await Swal.fire({
                        title: "¿Seguro que quieres deshabilitar este correlativo?",
                        text: "Esta acción no se puede deshacer.",
                        icon: "warning",
                        showCancelButton: true,
                        confirmButtonText: SWAL_CONFIRM_TEXT,
                        cancelButtonText: SWAL_CANCEL_TEXT,
                        confirmButtonColor: SWAL_CONFIRM_COLOR,
                        cancelButtonColor: SWAL_CANCEL_COLOR
                    });

                    if (!confirmResult.isConfirmed) {
                        return;
                    }

                    const token = getAntiForgeryToken();

                    try {
                        Swal.fire({
                            icon: "info",
                            title: "Deshabilitando...",
                            text: "Procesando la solicitud.",
                            allowOutsideClick: false,
                            showConfirmButton: false,
                            didOpen: () => {
                                Swal.showLoading();
                            }
                        });

                        const formData = new FormData();
                        formData.append("id", id.toString());

                        const response = await fetch("/CorrelativoMarchamo/Eliminar", {
                            method: "POST",
                            headers: {
                                "RequestVerificationToken": token
                            },
                            body: formData
                        });

                        const data = await response.json();

                        if (data.success) {
                            Swal.fire({
                                title: "Deshabilitado",
                                text: data.message || "El correlativo ha sido deshabilitado.",
                                icon: "success",
                                confirmButtonColor: SWAL_CONFIRM_COLOR,
                                confirmButtonText: SWAL_CONFIRM_TEXT
                            }).then(() => {
                                reloadPreservingState();
                            });
                        } else {
                            Swal.fire({
                                icon: "error",
                                title: "Error",
                                text: data.message || "No se pudo deshabilitar el correlativo.",
                                confirmButtonColor: SWAL_CONFIRM_COLOR,
                                confirmButtonText: SWAL_CONFIRM_TEXT
                            });
                        }
                    } catch (error) {
                        console.error(error);
                        Swal.fire({
                            icon: "error",
                            title: "Error",
                            text: "Ocurrió un error al deshabilitar el correlativo.",
                            confirmButtonColor: SWAL_CONFIRM_COLOR,
                            confirmButtonText: SWAL_CONFIRM_TEXT
                        });
                    }
                } else {
                    // Si está INACTIVO -> HABILITAR
                    const confirmResult = await Swal.fire({
                        title: "¿Seguro que quieres activar este rango?",
                        text: (inicio && fin)
                            ? `Se habilitará el rango ${inicio}-${fin}.`
                            : "Se habilitará el rango seleccionado.",
                        icon: "question",
                        showCancelButton: true,
                        confirmButtonText: SWAL_CONFIRM_TEXT,
                        cancelButtonText: SWAL_CANCEL_TEXT,
                        confirmButtonColor: SWAL_CONFIRM_COLOR,
                        cancelButtonColor: SWAL_CANCEL_COLOR
                    });

                    if (!confirmResult.isConfirmed) {
                        return;
                    }

                    const token = getAntiForgeryToken();
                    if (!token) {
                        await Swal.fire({
                            icon: "error",
                            title: "Error",
                            text: "No se encontró el token de seguridad para enviar la solicitud.",
                            confirmButtonColor: SWAL_CONFIRM_COLOR,
                            confirmButtonText: SWAL_CONFIRM_TEXT
                        });
                        return;
                    }

                    try {
                        Swal.fire({
                            icon: "info",
                            title: "Habilitando...",
                            text: "Procesando la activación del rango.",
                            allowOutsideClick: false,
                            showConfirmButton: false,
                            didOpen: () => {
                                Swal.showLoading();
                            }
                        });

                        const resp = await fetch("/CorrelativoMarchamo/HabilitarRango", {
                            method: "POST",
                            headers: {
                                "RequestVerificationToken": token,
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({ id })
                        });

                        let result = null;
                        let mensaje = "";

                        try {
                            result = await resp.json();
                            if (result && typeof result.message === "string") {
                                mensaje = result.message;
                            }
                        } catch (err) {
                            console.warn("No se pudo parsear la respuesta de HabilitarRango como JSON.", err);
                        }

                        // Si la respuesta no es OK (incluyendo 409 Conflict), mostrar error
                        if (!resp.ok) {
                            await showApiAlertMarchamo({
                                icon: "error",
                                defaultTitle: "Conflicto al habilitar",
                                message: mensaje || result?.message || `No se pudo habilitar el rango (HTTP ${resp.status})`
                            });
                            return;
                        }

                        // Si resp.ok pero result.success === false, también es error
                        if (result && result.success === false) {
                            await showApiAlertMarchamo({
                                icon: "error",
                                defaultTitle: "No se pudo habilitar el rango",
                                message: mensaje || result.message || "No se pudo habilitar el rango."
                            });
                            return;
                        }

                        // Solo si resp.ok y no hay success=false => éxito
                        Swal.fire({
                            icon: "success",
                            title: "Rango habilitado",
                            text: mensaje || "El rango se habilitó correctamente.",
                            confirmButtonColor: SWAL_CONFIRM_COLOR,
                            confirmButtonText: SWAL_CONFIRM_TEXT
                        }).then(() => {
                            reloadPreservingState();
                        });
                    } catch (error) {
                        console.error(error);
                        Swal.fire({
                            icon: "error",
                            title: "Error",
                            text: "Ocurrió un error inesperado al habilitar el rango.",
                            confirmButtonColor: SWAL_CONFIRM_COLOR,
                            confirmButtonText: SWAL_CONFIRM_TEXT
                        });
                    }
                }

                return;
            }

            // ============================
            //  EDITAR
            // ============================
            if (btnEdit) {
                e.stopPropagation();

                // Verificar si el botón está deshabilitado (por canEdit o isActive)
                if (btnEdit.classList.contains("btn-icon-disabled")) {
                    return;
                }

                const {
                    id,
                    idbascula,
                    inicio,
                    fin,
                    ingenioCode,
                    productCode
                } = row.dataset;

                // Guardar los valores en variables temporales
                const datosEdicion = {
                    id: id || "",
                    ingenioCode: ingenioCode,
                    productCode: productCode,
                    idbascula: idbascula,
                    inicio: inicio || "",
                    fin: fin || ""
                };

                // Cambiar el título
                modalTitulo.textContent = "Editar correlativo de marchamo";

                // Configurar un evento ONE-TIME para cuando el modal se muestre
                $('#modalMarchamo').one('shown.bs.modal', function() {
                    // Ahora sí setear los valores de forma FORZADA
                    idInput.value = datosEdicion.id;

                    // CLIENTE - Setear de forma más directa
                    if (datosEdicion.ingenioCode) {
                        // Buscar la opción y marcarla como selected
                        Array.from(clienteInput.options).forEach(opt => {
                            opt.selected = (opt.value === datosEdicion.ingenioCode);
                        });
                        clienteInput.value = datosEdicion.ingenioCode;
                        
                        // Forzar refresh visual
                        clienteInput.dispatchEvent(new Event('change', { bubbles: true }));
                        $(clienteInput).trigger('change');
                    }

                    // PRODUCTO - Setear de forma más directa
                    if (datosEdicion.productCode) {
                        // Buscar la opción y marcarla como selected
                        Array.from(productoInput.options).forEach(opt => {
                            opt.selected = (opt.value === datosEdicion.productCode);
                        });
                        productoInput.value = datosEdicion.productCode;
                        
                        // Forzar refresh visual
                        productoInput.dispatchEvent(new Event('change', { bubbles: true }));
                        $(productoInput).trigger('change');
                    }

                    // BÁSCULA
                    if (datosEdicion.idbascula) {
                        basculaInput.value = datosEdicion.idbascula;
                        $(basculaInput).trigger('change');
                    }

                    inicioInput.value = datosEdicion.inicio;
                    finInput.value = datosEdicion.fin;

                    codigoIngenioEdicion = datosEdicion.ingenioCode || null;
                    codigoProductoEdicion = datosEdicion.productCode || null;

                    console.log("✅ Edición cargada correctamente");
                });

                // Abrir el modal
                modal.modal("show");

                return;
            }

            // ============================
            //  ANULAR (ABRIR MODAL)
            // ============================
            if (btnAnnul) {
                e.stopPropagation();

                filaSeleccionadaParaAnular = row;

                const inicio = Number(row.dataset.inicio);
                const fin = Number(row.dataset.fin);

                rangoInicioAnulacion = Number.isNaN(inicio) ? null : inicio;
                rangoFinAnulacion = Number.isNaN(fin) ? null : fin;

                if (rangoInicioAnulacion !== null) {
                    numeroMarchamoInput.min = rangoInicioAnulacion;
                } else {
                    numeroMarchamoInput.removeAttribute("min");
                }

                if (rangoFinAnulacion !== null) {
                    numeroMarchamoInput.max = rangoFinAnulacion;
                } else {
                    numeroMarchamoInput.removeAttribute("max");
                }

                // Dejar el campo en blanco para que el usuario ingrese manualmente
                numeroMarchamoInput.value = "";
                motivoAnulacionInput.value = "";

                modalAnular.modal("show");

                // Enfocar el input del número después de abrir el modal
                setTimeout(() => numeroMarchamoInput.focus(), 150);

                return;
            }

        });
    }

    // ============================
    //  NAVEGACIÓN DESHABILITADA (ahora se usa botón en Opciones)
    // ============================
    // La navegación a ListaMarchamos se hace con botón .btn-detail

});