// wwwroot/js/lista-comprobante.js

document.addEventListener("DOMContentLoaded", () => {

    // ============================
    //  REFERENCIAS DOM
    // ============================
    const tabla = document.querySelector(".tabla-marchamos") || document.getElementById("tablaListaComprobante");
    const searchInput = document.getElementById("search");
    const btnSearch = document.getElementById("btnSearch");
    const pageSizeSelect = document.getElementById("pageSizeSelect");
    const btnVolver = document.getElementById("btnVolver");

    console.log("lista-comprobante.js cargado ✅");

    // Base URL para el PDF
    const pdfBaseUrl = tabla?.dataset.pdfUrl || "/ComprobantePDF/Index";

    // 🔹 Correlativo actual
    const correlativoId = tabla ? parseInt(tabla.dataset.correlativoId || "0", 10) : 0;

    // 🔹 Parámetros de retorno a CorrelativoComprobante desde data attributes
    let returnPage = 1;
    let returnSize = 10;
    let returnSearch = "";

    if (tabla) {
        returnPage = parseInt(tabla.dataset.returnPage || "1", 10) || 1;
        returnSize = parseInt(tabla.dataset.returnSize || "10", 10) || 10;
        returnSearch = tabla.dataset.returnSearch || "";
    }

    // 🔹 ESTADO DE BÚSQUEDA LOCAL (para server-side search)
    let currentPage = 1;
    let currentSize = 10;
    let currentSearch = "";

    // Leer valores iniciales desde data attributes de la tabla
    if (tabla) {
        currentPage = parseInt(tabla.dataset.currentPage || "1", 10) || 1;
        currentSize = parseInt(tabla.dataset.size || "10", 10) || 10;
        currentSearch = tabla.dataset.search || "";
    }

    // Poblar el input de búsqueda con el valor inicial
    if (searchInput && currentSearch) {
        searchInput.value = currentSearch;
    }

    // ============================
    //  LIMPIAR URL (solo visual)
    // ============================
    try {
        const initialUrl = new URL(window.location.href);
        if (initialUrl.search) {
            const cleanUrl = initialUrl.origin + initialUrl.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
        }
    } catch (e) {
        console.warn("No se pudo procesar la URL actual en ListaComprobante:", e);
    }

    // ============================
    //  HELPER: CONSTRUIR URL DE DETALLE
    // ============================
    function buildDetailUrl(page, size, search) {
        const params = new URLSearchParams();
        params.set("correlativoId", correlativoId.toString());
        params.set("page", page.toString());
        params.set("size", size.toString());
        if (search) {
            params.set("search", search);
        }

        // Preservar parámetros de retorno
        params.set("returnPage", returnPage.toString());
        params.set("returnSize", returnSize.toString());
        if (returnSearch) {
            params.set("returnSearch", returnSearch);
        }

        return `/CorrelativoComprobante/ListaComprobante?${params.toString()}`;
    }

    // ============================
    //  FUNCIÓN: RECARGAR CON SERVER-SIDE SEARCH
    // ============================
    function loadDetail(page, size, search) {
        const url = buildDetailUrl(page, size, search);
        window.location.href = url;
    }

    // ============================
    //  BÚSQUEDA SERVER-SIDE
    // ============================
    function ejecutarBusqueda() {
        const searchTerm = (searchInput?.value || "").trim();
        currentSearch = searchTerm;
        loadDetail(1, currentSize, currentSearch); // Siempre resetear a página 1 al buscar
    }

    // Evento input: búsqueda mientras escribe (Enter)
    if (searchInput) {
        searchInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                ejecutarBusqueda();
            }
        });
    }

    // Botón buscar
    if (btnSearch) {
        btnSearch.addEventListener("click", (e) => {
            e.preventDefault();
            ejecutarBusqueda();
        });
    }

    // ============================
    //  CAMBIO DE CANTIDAD DE REGISTROS
    // ============================
    if (pageSizeSelect) {
        pageSizeSelect.addEventListener("change", () => {
            const newSize = parseInt(pageSizeSelect.value, 10) || 10;
            currentSize = newSize;
            loadDetail(1, currentSize, currentSearch); // Resetear a página 1 al cambiar tamaño
        });
    }

    // ============================
    //  BOTÓN VOLVER
    // ============================
    if (btnVolver) {
        btnVolver.addEventListener("click", (e) => {
            e.preventDefault();

            // Construir URL con los parámetros de retorno
            const url = `/CorrelativoComprobante?page=${encodeURIComponent(returnPage)}&size=${encodeURIComponent(returnSize)}&search=${encodeURIComponent(returnSearch)}`;
            window.location.href = url;
        });
    }

    // Si no hay tabla, no seguimos
    if (!tabla) return;

    // ============================
    //  IFRAME OCULTO PARA IMPRESIÓN
    // ============================
    let hiddenPrintIframe = null;

    function ensureHiddenIframe() {
        if (!hiddenPrintIframe) {
            hiddenPrintIframe = document.createElement("iframe");
            hiddenPrintIframe.id = "hiddenPrintIframe";
            hiddenPrintIframe.style.position = "fixed";
            hiddenPrintIframe.style.width = "0";
            hiddenPrintIframe.style.height = "0";
            hiddenPrintIframe.style.border = "0";
            hiddenPrintIframe.style.visibility = "hidden";
            hiddenPrintIframe.style.pointerEvents = "none";
            document.body.appendChild(hiddenPrintIframe);
        }
        return hiddenPrintIframe;
    }

    function cargarPdfParaImprimir(url) {
        const iframe = ensureHiddenIframe();
        // Cambiar src dispara la carga del comprobante y luego window.print() dentro del iframe
        iframe.src = url;
    }

    function limpiarIframeDespuesDeImprimir() {
        if (hiddenPrintIframe) {
            // Limpiar el contenido para liberar recursos
            hiddenPrintIframe.src = "about:blank";
        }
    }

    // ============================
    //  ESCUCHAR MENSAJE DESDE EL IFRAME (fin de impresión)
    //  (esto ya lo envía ComprobantePDF con postMessage)
    // ============================
    window.addEventListener("message", (event) => {
        try {
            if (event.origin !== window.location.origin) {
                return; // seguridad básico: mismo origen
            }

            if (event.data && event.data.type === "comprobante-print-finished") {
                limpiarIframeDespuesDeImprimir();
            }
        } catch (e) {
            console.warn("Error procesando mensaje de impresión:", e);
        }
    });

    // ============================
    //  CLICK EN TABLA: SELECCIÓN + ACCIONES
    // ============================
    tabla.addEventListener("click", (e) => {
        const row = e.target.closest("tr");
        if (!row || !row.parentElement || row.parentElement.tagName !== "TBODY") {
            return;
        }

        const id = row.dataset.id;
        if (!id) {
            console.warn("Fila sin data-id para acciones");
            return;
        }

        const btnPrint = e.target.closest(".btn-annul"); // icono impresora

        // 🔹 Imprimir comprobante (iframe oculto)
        if (btnPrint) {
            // Si es un botón deshabilitado, no hacer nada
            if (btnPrint.classList.contains("btn-disabled")) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            e.stopPropagation();

            const envio = (row.dataset.envio || "").trim();
            const numeroCell = row.querySelector(".NumeroComprobante");
            const numero = numeroCell ? numeroCell.textContent.trim() : "";

            if (!envio) {
                console.warn("No hay número de envío para este comprobante, no se puede generar PDF.");
                return;
            }

            console.log("Imprimir comprobante → envío:", envio, "número:", numero);

            const url = `${pdfBaseUrl}?envio=${encodeURIComponent(envio)}&numero=${encodeURIComponent(numero)}`;
            cargarPdfParaImprimir(url);
            return;
        }

        // 🔹 Si no fue clic en ningún botón, solo seleccionar la fila
        tabla.querySelectorAll("tbody tr").forEach(r => r.classList.remove("selected-row"));
        row.classList.add("selected-row");
    });

});
