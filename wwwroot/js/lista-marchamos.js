// wwwroot/js/lista-marchamos.js

document.addEventListener("DOMContentLoaded", () => {

    // ============================
    //  REFERENCIAS DOM
    // ============================
    const tabla =
        document.querySelector(".tabla-marchamos") ||
        document.getElementById("tablaCorrelativos");

    const searchInput = document.getElementById("search");
    const btnSearch = document.getElementById("btnSearch");
    const btnVolver = document.getElementById("btnVolver");
    const pageSizeSelect = document.getElementById("pageSizeSelect");

    // 🔹 Correlativo actual
    const correlativoId = tabla ? parseInt(tabla.dataset.correlativoId || "0", 10) : 0;

    // 🔹 Parámetros de retorno a CorrelativoMarchamo desde data attributes
    let returnPage = 1;
    let returnSize = 10;
    let returnSearch = "";

    if (tabla) {
        returnPage = parseInt(tabla.dataset.returnPage || "1", 10) || 1;
        returnSize = parseInt(tabla.dataset.returnSize || "10", 10) || 10;
        returnSearch = tabla.dataset.returnSearch || "";
    }

    // 🔹 ESTADO DE BÚSQUEDA LOCAL (para server-side search)
    let currentSize = 10;
    let currentSearch = "";

    // Leer valores iniciales desde data attributes de la tabla
    if (tabla) {
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

        // Si la URL trae querystring (?correlativoId=..., page=..., etc.), lo limpiamos visualmente
        if (initialUrl.search) {
            const cleanUrl = initialUrl.origin + initialUrl.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
        }
    } catch (e) {
        // Por si en algún entorno raro falla new URL(...)
        console.warn("No se pudo procesar la URL actual:", e);
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

        return `/CorrelativoMarchamo/ListaMarchamos?${params.toString()}`;
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
            const url = `/CorrelativoMarchamo?page=${encodeURIComponent(returnPage)}&size=${encodeURIComponent(returnSize)}&search=${encodeURIComponent(returnSearch)}`;
            window.location.href = url;
        });
    }

});
