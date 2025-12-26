// wwwroot/js/correlativo-comprobante.js

document.addEventListener("DOMContentLoaded", () => {
    // ============================
    //  LIMPIAR URL (como en CorrelativoMarchamo)
    // ============================
    let initialUrl;
    try {
        initialUrl = new URL(window.location.href);
        if (initialUrl.search) {
            const cleanUrl = initialUrl.origin + initialUrl.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
        }
    } catch (e) {
        console.warn("No se pudo procesar la URL actual:", e);
        initialUrl = null;
    }

    // ============================
    //  REFERENCIAS DEL DOM
    // ============================
    const searchInput = document.getElementById("search");
    const tabla = document.getElementById("tablaCorrelativos");

    // ============================
    //  SELECT DE TAMAÑO DE PÁGINA
    // ============================
    const pageSizeSelect = document.getElementById("pageSizeSelect");
    if (pageSizeSelect && initialUrl && tabla) {
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
    const tablaBody = tabla ? tabla.querySelector("tbody") : null;
    const listUrlBase = tabla ? (tabla.dataset.listUrl || "/CorrelativoComprobante/ListaComprobante") : "";

    const btnAgregar = document.getElementById("btnAgregar");
    const modal = $("#modalComprobante");
    const modalTitulo = document.getElementById("modalComprobanteTitulo");
    const btnGuardar = document.getElementById("btnGuardarComprobante");

    const idInput = document.getElementById("comprobanteId");
    const inicioInput = document.getElementById("inicioInput");
    const finInput = document.getElementById("finInput");
    const basculaInput = document.getElementById("basculaInput");
    const numeroCajaInput = document.getElementById("numeroCajaInput");

    const modalAnular = $("#modalAnularComprobante");
    const numeroComprobanteInput = document.getElementById("numeroComprobanteInput");
    const motivoAnulacionInput = document.getElementById("motivoAnulacionInput");
    const btnConfirmarAnular = document.getElementById("btnConfirmarAnularComprobante");

    let filaSeleccionadaParaAnular = null;
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
        const url = new URL(window.location.origin + "/CorrelativoComprobante/Index");
        url.searchParams.set("page", currentPage);
        url.searchParams.set("size", size);
        if (currentSearch) url.searchParams.set("search", currentSearch);
        window.location.href = url.toString();
    }

    // ============================
    //  BÚSQUEDA SERVER-SIDE
    // ============================
    function realizarBusquedaServerSide() {
        if (!searchInput || !tabla) return;

        const searchValue = searchInput.value.trim();
        const url = new URL(window.location.origin + "/CorrelativoComprobante/Index");
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
        if (idInput) idInput.value = "";
        if (inicioInput) inicioInput.value = "";
        if (finInput) finInput.value = "";
        if (numeroCajaInput) numeroCajaInput.value = "";
        if (basculaInput) basculaInput.value = "";

        if (inicioInput) inicioInput.classList.remove("is-invalid");
        if (finInput) finInput.classList.remove("is-invalid");
        if (numeroCajaInput) numeroCajaInput.classList.remove("is-invalid");
        if (basculaInput) basculaInput.classList.remove("is-invalid");
    }

    // ============================
    //  MODAL: AGREGAR
    // ============================
    if (btnAgregar) {
        btnAgregar.addEventListener("click", () => {
            resetForm();
            if (modalTitulo) modalTitulo.textContent = "Registro de correlativos";
            modal.modal("show");
        });
    }

    // ============================
    //  ESTILOS POR ACTIVO/INACTIVO
    // ============================
    function actualizarEstilosPorEstado() {
        document.querySelectorAll(".fila-comprobante").forEach(row => {
            const isActive = (row.dataset.isActive || "").toLowerCase() === "true";
            const canEdit = (row.dataset.canEdit || "").toLowerCase() === "true";

            const btnEdit = row.querySelector(".btn-edit");
            const btnAnnul = row.querySelector(".btn-annul");
            const btnToggleActive = row.querySelector(".btn-toggle-active");

            if (isActive) {
                row.classList.remove("fila-comprobante-disabled");

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

                // Otros botones habilitados
                if (btnAnnul) btnAnnul.classList.remove("btn-icon-disabled");

                // Botón toggle: muestra "Deshabilitar" cuando está activo
                if (btnToggleActive) {
                    btnToggleActive.classList.remove("btn-icon-disabled");
                    btnToggleActive.title = "Deshabilitar";
                }
            } else {
                row.classList.add("fila-comprobante-disabled");

                if (btnEdit) btnEdit.classList.add("btn-icon-disabled");
                if (btnAnnul) btnAnnul.classList.add("btn-icon-disabled");

                // Botón toggle: muestra "Habilitar" cuando está inactivo y se destaca
                if (btnToggleActive) {
                    btnToggleActive.classList.remove("btn-icon-disabled");
                    btnToggleActive.title = "Habilitar";
                }
            }
        });
    }

    // ============================
    //  ALERTAS CONSISTENTES (SweetAlert2)
    // ============================
    const SWAL_CONFIRM_TEXT = "Confirmar";
    const SWAL_CONFIRM_COLOR = "#182A6E";
    const SWAL_CANCEL_TEXT = "Cancelar";
    const SWAL_CANCEL_COLOR = "red";

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
                    text: 'Solo se permiten números enteros (sin decimales ni "e").',
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
            const sanitizedValue = originalValue.replace(/[^\d]/g, '');

            if (originalValue !== sanitizedValue) {
                inputEl.value = sanitizedValue;
            }
        });
    }

    // Aplicar la validación a los inputs numéricos
    enforceIntegerOnly(inicioInput);
    enforceIntegerOnly(finInput);
    enforceIntegerOnly(numeroCajaInput);
    enforceIntegerOnly(numeroComprobanteInput);

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

    function formatApiMessage(rawMessage, options = {}) {
        const msg = String(rawMessage || "").trim().replace(/\s+/g, " ");
        const defaultTitle = options.defaultTitle || "Mensaje";

        // A) GUARDAR/AGREGAR: límite por disponibles en Báscula
        const mBascula = msg.match(/a la\s+"([^"]+)"/i);
        const mDisponibles = msg.match(/tiene\s+(\d+)\s+comprobantes\s+disponibles/i);
        const mRegla = msg.match(/Solo se permite[^.]*\./i);

        if (mBascula && (mDisponibles || mRegla) && /agregar\s+m[aá]s\s+comprobantes/i.test(msg)) {
            const bascula = escapeHtml(mBascula[1]);
            const disponibles = escapeHtml(mDisponibles?.[1] || "—");
            const regla = escapeHtml(
                (mRegla?.[0] || "Solo se permite agregar nuevos comprobantes cuando haya 100 o menos disponibles.").trim()
            );

            return {
                title: "No es posible agregar más comprobantes.",
                html: `
                  <div style="text-align:left; line-height:1.6;">
                    <div><b>Razón:</b> ${regla}</div>
                    <div style="margin-top:8px;"><b>${bascula}:</b> tiene <b>${disponibles}</b> comprobantes disponibles.</div>
                  </div>
                `
            };
        }

        // B) EDITAR (caso A): cambio total de rango
        const mCambioRango = msg.match(/cambiar\s+el\s+rango\s+de\s+(\d+)\s*-\s*(\d+)\s+a\s+(\d+)\s*-\s*(\d+)/i);
        if (mCambioRango) {
            const from = `${mCambioRango[1]}-${mCambioRango[2]}`;
            const to = `${mCambioRango[3]}-${mCambioRango[4]}`;

            const mSoloSePermite = msg.match(/Solo se permite[^.]*\./i);
            const razon = escapeHtml(
                mSoloSePermite?.[0] ||
                "Solo se permite expandir o reducir el rango existente, no reemplazarlo completamente."
            );

            const mSugerencia = msg.match(/Si necesita[^.]*\./i);
            const sugerencia = escapeHtml(mSugerencia?.[0] || "");

            return {
                title: "No es posible modificar el rango.",
                html: `
                  <div style="text-align:left; line-height:1.6;">
                    <div><b>Intento:</b> cambiar de <b>${escapeHtml(from)}</b> a <b>${escapeHtml(to)}</b>.</div>
                    <div style="margin-top:8px;"><b>Razón:</b> ${razon}</div>
                  </div>
                `
            };
        }

 
        // C) EDITAR (caso B): conflicto por asignación en otra báscula
        if (/No es posible expandir el fin del rango/i.test(msg)) {
            const mConflicto = msg.match(/Los\s+comprobantes\s+(\d+)\s*-\s*(\d+)\s+ya\s+est[aá]n\s+asignados/i);
            const conflicto = mConflicto ? `${mConflicto[1]}-${mConflicto[2]}` : "";

            // Puede venir como: (Báscula 1, Caja 1)  o  "Caja 2, Báscula 6" (sin paréntesis)
            const mDestinoParens = msg.match(/\(([^)]+)\)\.?$/);
            const mDestinoDirect = msg.match(/Asignado\s+en:\s*([^\n.]+)\.?$/i);
            const destinoRaw = (mDestinoParens?.[1] || mDestinoDirect?.[1] || "").trim();

            // Reordenar a: "Báscula X, Caja Y"
            let destinoOrdenado = destinoRaw;
            if (destinoRaw) {
                const parts = destinoRaw.split(",").map(p => p.trim()).filter(Boolean);
                const basculaPart = parts.find(p => /b[áa]scula/i.test(p)) || "";
                const cajaPart = parts.find(p => /caja/i.test(p)) || "";

                if (basculaPart && cajaPart) {
                    destinoOrdenado = `${basculaPart}, ${cajaPart}`;
                }
            }

            return {
                title: "No es posible expandir el fin del rango.",
                html: `
                <div style="text-align:left; line-height:1.6;">
                    ${conflicto
                        ? `<div><b>Conflicto:</b> el rango <b>${escapeHtml(conflicto)}</b> ya está asignado.</div>`
                        : `<div>${escapeHtml(msg)}</div>`}
                    ${destinoOrdenado ? `<div style="margin-top:8px;"><b>Asignado en:</b> ${escapeHtml(destinoOrdenado)}</div>` : ""}
                </div>
                `
            };
        }


        // D) ANULAR: ya se encuentra anulado
        const mYaAnulado = msg.match(/comprobante\s+#?(\d+)\s+ya\s+se\s+encuentra\s+anulado/i);
        if (mYaAnulado) {
            const n = escapeHtml(mYaAnulado[1]);
            return {
                title: "El comprobante ya estaba anulado.",
                html: `
                  <div style="text-align:left; line-height:1.6;">
                    <div><b>Comprobante:</b> #${n}</div>
                    <div style="margin-top:8px;"><b>Estado:</b> ANULADO</div>
                  </div>
                `
            };
        }

        // E) Número fuera de rango (validación / backend)
        const mFueraRango = msg.match(/debe\s+estar\s+entre\s+(\d+)\s+y\s+(\d+)/i);
        if (/fuera\s+de\s+rango/i.test(msg) && mFueraRango) {
            const a = escapeHtml(mFueraRango[1]);
            const b = escapeHtml(mFueraRango[2]);

            return {
                title: "Número fuera de rango",
                html: `
                  <div style="text-align:left; line-height:1.6;">
                    <div><b>Rango permitido:</b> ${a} - ${b}</div>
                    <div style="margin-top:8px;">Verifica el número ingresado y vuelve a intentar.</div>
                  </div>
                `
            };
        }

        // -----------------------------------------
        // A2) GUARDAR/AGREGAR: rango ya existe en una báscula
        // Ej: El rango de comprobantes 1-10000 ya existe en la "Báscula 2".
        // -----------------------------------------
        const mRangoExiste = msg.match(/El\s+rango\s+de\s+comprobantes\s+(\d+)\s*-\s*(\d+)\s+ya\s+existe\s+en\s+la\s+"([^"]+)"/i);
        if (mRangoExiste) {
            const inicio = escapeHtml(mRangoExiste[1]);
            const fin = escapeHtml(mRangoExiste[2]);
            const bascula = escapeHtml(mRangoExiste[3]);

            return {
                title: "No se pudo guardar",
                html: `
                <div style="text-align:left; line-height:1.6;">
                    <div><b>El rango ya existe.</b></div>
                    <div style="margin-top:8px;"><b>Rango:</b> ${inicio} - ${fin}</div>
                    <div style="margin-top:6px;"><b>Asignado en:</b> ${bascula}</div>
                </div>
                `
            };
        }


        // F) Default: genérico (divide en frases en bullets)
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

    function showApiAlert({ icon, defaultTitle, message, confirmColor = "#182A6E" }) {
        const formatted = formatApiMessage(message, { defaultTitle: defaultTitle || "Mensaje" });
        return Swal.fire({
            icon: icon || "info",
            title: formatted.title,
            html: formatted.html,
            confirmButtonColor: confirmColor,
            confirmButtonText: "Confirmar" 
        });
    }

    // ============================
    //  CONFIRMAR ANULACIÓN -> POST
    // ============================
    if (btnConfirmarAnular) {
        btnConfirmarAnular.addEventListener("click", async () => {
            if (!numeroComprobanteInput || !motivoAnulacionInput) return;

            const numeroStr = numeroComprobanteInput.value.trim();
            const motivo = motivoAnulacionInput.value;

            if (!numeroStr || !motivo) {
                Swal.fire({
                    icon: "warning",
                    title: "Campos incompletos",
                    text: "Debe seleccionar un motivo y tener un número de comprobante válido.",
                    confirmButtonColor: "#182A6E"
                });
                return;
            }

            const numero = Number(numeroStr);

            if (Number.isNaN(numero)) {
                Swal.fire({
                    icon: "error",
                    title: "Número inválido",
                    text: "El número de comprobante debe ser un número válido.",
                    confirmButtonColor: "#182A6E"
                });
                return;
            }

            if (numero <= 0) {
                Swal.fire({
                    icon: "error",
                    title: "Número inválido",
                    text: "El número de comprobante debe ser mayor que cero.",
                    confirmButtonColor: "#182A6E"
                });
                return;
            }

            if (rangoInicioAnulacion !== null && rangoFinAnulacion !== null) {
                if (numero < rangoInicioAnulacion || numero > rangoFinAnulacion) {
                    // ✅ (cambiado) usar formato consistente porque YA lo tenemos contemplado
                    await showApiAlert({
                        icon: "error",
                        defaultTitle: "Número fuera de rango",
                        message: `El número ingresado debe estar entre ${rangoInicioAnulacion} y ${rangoFinAnulacion} para este correlativo.`,
                        confirmColor: "#182A6E"
                    });
                    return;
                }
            }

            const token = getAntiForgeryToken();
            const formData = new FormData();
            formData.append("comprobanteNumber", numeroStr);
            formData.append("motivo", motivo);

            try {
                Swal.fire({
                    icon: "info",
                    title: "Anulando...",
                    text: "Procesando la anulación del comprobante.",
                    allowOutsideClick: false,
                    showConfirmButton: false,
                    didOpen: () => Swal.showLoading()
                });

                const response = await fetch("/CorrelativoComprobante/Anular", {
                    method: "POST",
                    headers: { "RequestVerificationToken": token },
                    body: formData
                });

                const raw = await response.text();
                let result = { success: response.ok, message: "" };

                if (raw && raw.trim().length > 0) {
                    try {
                        result = JSON.parse(raw);
                    } catch {
                        console.warn("Respuesta no JSON al anular comprobante:", raw);
                        result.message = raw;
                    }
                } else {
                    result.message = response.ok
                        ? "El comprobante ha sido anulado correctamente."
                        : `Error del servidor (${response.status} ${response.statusText}).`;
                }

                if (result.success) {
                    if (filaSeleccionadaParaAnular) {
                        filaSeleccionadaParaAnular.classList.add("table-secondary");
                    }

                    modalAnular.modal("hide");
                    filaSeleccionadaParaAnular = null;

                    // ✅ (cambiado) éxito con wrapper (no afecta otros casos)
                    await showApiAlert({
                        icon: "success",
                        defaultTitle: "Comprobante anulado",
                        message: result.message || "El comprobante ha sido anulado correctamente.",
                        confirmColor: "#182A6E"
                    });

                    reloadPreservingState();
                } else {
                    // ✅ (cambiado) error backend anular (ya contemplado "ya se encuentra anulado")
                    await showApiAlert({
                        icon: "error",
                        defaultTitle: "No se pudo anular",
                        message: result.message || "No fue posible anular el comprobante.",
                        confirmColor: "#182A6E"
                    });
                }
            } catch (err) {
                console.error("Error al anular comprobante:", err);
                Swal.fire({
                    icon: "error",
                    title: "Error de red",
                    text: "Ocurrió un error al intentar anular el comprobante.",
                    confirmButtonColor: "#182A6E"
                });
            }
        });
    }

    // ============================
    //  GUARDAR (AGREGAR / EDITAR) -> FETCH
    // ============================
    if (btnGuardar) {
        btnGuardar.addEventListener("click", async () => {
            if (!inicioInput || !finInput || !basculaInput || !numeroCajaInput) return;

            const bascula = basculaInput.value;

            // Normalizar valores numéricos para evitar duplicados por ceros a la izquierda
            const inicioStr = normalizeNumericString(inicioInput.value);
            const finStr = normalizeNumericString(finInput.value);
            const boxNumberStr = normalizeNumericString(numeroCajaInput.value);

            // Actualizar los inputs con valores normalizados para que el usuario vea el valor limpio
            inicioInput.value = inicioStr;
            finInput.value = finStr;
            numeroCajaInput.value = boxNumberStr;

            if (!bascula || !inicioStr || !finStr || !boxNumberStr) {
                Swal.fire({
                    icon: "warning",
                    title: "Campos incompletos",
                    text: "Debe completar todos los campos requeridos.",
                    confirmButtonColor: "#182A6E"
                });
                return;
            }

            const inicio = Number(inicioStr);
            const fin = Number(finStr);
            const boxNumber = Number(boxNumberStr);

            if (Number.isNaN(inicio) || Number.isNaN(fin) || Number.isNaN(boxNumber)) {
                Swal.fire({
                    icon: "error",
                    title: "Valores inválidos",
                    text: "Inicio, Fin y N° de caja deben ser números válidos.",
                    confirmButtonColor: "#182A6E"
                });
                return;
            }

            if (inicio < 0 || fin < 0 || boxNumber <= 0) {
                Swal.fire({
                    icon: "error",
                    title: "Valores inválidos",
                    text: "Inicio y Fin no pueden ser negativos y el N° de caja debe ser mayor que cero.",
                    confirmButtonColor: "#182A6E"
                });
                return;
            }

            if (fin < inicio) {
                Swal.fire({
                    icon: "error",
                    title: "Rango incorrecto",
                    text: "El valor de Fin no puede ser menor que el de Inicio.",
                    confirmButtonColor: "#182A6E"
                });
                return;
            }

            const esEdicion = !!(idInput && idInput.value && idInput.value.trim().length > 0);

            const token = getAntiForgeryToken();
            const formData = new FormData();

            formData.append("comprobanteId", esEdicion ? idInput.value.trim() : "");
            formData.append("idBascula", bascula);
            formData.append("inicioCorrelativo", inicioStr);
            formData.append("finCorrelativo", finStr);
            formData.append("boxNumber", boxNumberStr);

            try {
                Swal.fire({
                    icon: "info",
                    title: esEdicion ? "Actualizando..." : "Guardando...",
                    text: esEdicion
                        ? "Actualizando correlativo de comprobante."
                        : "Registrando nuevo correlativo de comprobante.",
                    allowOutsideClick: false,
                    showConfirmButton: false,
                    didOpen: () => Swal.showLoading()
                });

                const response = await fetch("/CorrelativoComprobante/Guardar", {
                    method: "POST",
                    headers: { "RequestVerificationToken": token },
                    body: formData
                });

                const raw = await response.text();
                let result = { success: response.ok, message: "" };

                if (raw && raw.trim().length > 0) {
                    try {
                        result = JSON.parse(raw);
                    } catch {
                        console.warn("Respuesta no JSON al guardar correlativo:", raw);
                        result.message = raw;
                    }
                } else {
                    result.message = response.ok
                        ? (esEdicion
                            ? "Correlativo de comprobante actualizado correctamente."
                            : "Correlativo de comprobante creado correctamente.")
                        : `Error del servidor (${response.status} ${response.statusText}).`;
                }

                if (result.success) {
                    modal.modal("hide");

                    // ✅ (cambiado) éxito con wrapper
                    await showApiAlert({
                        icon: "success",
                        defaultTitle: esEdicion ? "Correlativo actualizado" : "Correlativo registrado",
                        message: result.message || (esEdicion
                            ? "El correlativo se actualizó correctamente."
                            : "El nuevo correlativo se registró correctamente."),
                        confirmColor: "#182A6E"
                    });

                    reloadPreservingState();
                } else {
                    // ✅ (cambiado) error backend guardar/editar (ya contemplado en patrones)
                    await showApiAlert({
                        icon: "error",
                        defaultTitle: "No se pudo guardar",
                        message: result.message || "No fue posible guardar el correlativo.",
                        confirmColor: "#182A6E"
                    });
                }
            } catch (err) {
                console.error("Error al guardar correlativo de comprobante:", err);
                Swal.fire({
                    icon: "error",
                    title: "Error de red",
                    text: "Ocurrió un error al intentar guardar el correlativo.",
                    confirmButtonColor: "#182A6E"
                });
            }
        });
    }

    // ============================
    //  HELPER: MOSTRAR MENÚ DE ACCIONES (MÓVIL)
    // ============================
    async function mostrarMenuAccionesComprobante(row) {
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

        // Editar: solo si canEdit es true y está activo
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
                confirmButtonColor: "#182A6E",
                confirmButtonText: "Confirmar"
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
            cancelButtonText: "Cancelar",
            cancelButtonColor: "red",
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
    //  EVENTOS DE CADA FILA
    // ============================
    function attachRowEvents(row) {
        const btnDetail = row.querySelector(".btn-detail");
        const btnEdit = row.querySelector(".btn-edit");
        const btnToggleActive = row.querySelector(".btn-toggle-active");
        const btnAnnul = row.querySelector(".btn-annul");
        const btnActions = row.querySelector(".btn-actions");

        // ============================
        //  VER DETALLE (NAVEGAR A LISTA DE COMPROBANTES)
        // ============================
        if (btnDetail) {
            btnDetail.addEventListener("click", (e) => {
                e.stopPropagation();

                const id = row.dataset.id;
                if (!id || !listUrlBase) return;

                const url =
                    `${listUrlBase}?correlativoId=${encodeURIComponent(id)}`
                    + `&page=1`
                    + `&size=${encodeURIComponent(size)}`
                    + `&search=`
                    + `&returnPage=${encodeURIComponent(currentPage)}`
                    + `&returnSize=${encodeURIComponent(size)}`
                    + `&returnSearch=${encodeURIComponent(currentSearch)}`;

                window.location.href = url;
            });
        }

        if (btnEdit) {
            btnEdit.addEventListener("click", (e) => {
                e.stopPropagation();

                // Verificar si el botón está deshabilitado (por canEdit o isActive)
                if (btnEdit.classList.contains("btn-icon-disabled")) return;

                const { id, idbascula, inicio, fin, numerocaja } = row.dataset;

                resetForm();

                if (idInput) idInput.value = id || "";
                if (basculaInput) basculaInput.value = idbascula || "";
                if (inicioInput) inicioInput.value = inicio || "";
                if (finInput) finInput.value = fin || "";
                if (numeroCajaInput) numeroCajaInput.value = numerocaja || "";

                if (modalTitulo) modalTitulo.textContent = "Editar correlativo";
                modal.modal("show");
            });
        }


        if (btnAnnul) {
            btnAnnul.addEventListener("click", (e) => {
                e.stopPropagation();
                if (btnAnnul.classList.contains("btn-icon-disabled")) return;

                filaSeleccionadaParaAnular = row;

                const inicio = Number(row.dataset.inicio);
                const fin = Number(row.dataset.fin);

                rangoInicioAnulacion = Number.isNaN(inicio) ? null : inicio;
                rangoFinAnulacion = Number.isNaN(fin) ? null : fin;

                if (rangoInicioAnulacion !== null) numeroComprobanteInput.min = rangoInicioAnulacion;
                else numeroComprobanteInput.removeAttribute("min");

                if (rangoFinAnulacion !== null) numeroComprobanteInput.max = rangoFinAnulacion;
                else numeroComprobanteInput.removeAttribute("max");

                // Dejar el campo en blanco para que el usuario ingrese manualmente
                numeroComprobanteInput.value = "";
                motivoAnulacionInput.value = "";

                modalAnular.modal("show");

                // Enfocar el input del número después de abrir el modal
                setTimeout(() => numeroComprobanteInput.focus(), 150);
            });
        }

        // ============================
        //  TOGGLE ACTIVO/INACTIVO (HABILITAR/DESHABILITAR)
        // ============================
        if (btnToggleActive) {
            btnToggleActive.addEventListener("click", async (e) => {
                e.stopPropagation();

                if (btnToggleActive.classList.contains("btn-icon-disabled")) return;

                const isActive = (row.dataset.isActive || "").toLowerCase() === "true";
                const idStr = row.dataset.id;
                const id = Number(idStr);

                if (!Number.isFinite(id) || id <= 0) {
                    Swal.fire({
                        icon: "error",
                        title: "Error",
                        text: "No se pudo obtener el ID del correlativo.",
                        confirmButtonColor: "#182A6E"
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
                        confirmButtonText: "Confirmar",
                        cancelButtonText: "Cancelar",
                        confirmButtonColor: "#182A6E",
                        cancelButtonColor: "red"
                    });

                    if (!confirmResult.isConfirmed) return;

                    const token = getAntiForgeryToken();
                    const formData = new FormData();
                    formData.append("id", id.toString());

                    try {
                        Swal.fire({
                            icon: "info",
                            title: "Deshabilitando...",
                            text: "Procesando la solicitud.",
                            allowOutsideClick: false,
                            showConfirmButton: false,
                            didOpen: () => Swal.showLoading()
                        });

                        const response = await fetch("/CorrelativoComprobante/Eliminar", {
                            method: "POST",
                            headers: { "RequestVerificationToken": token },
                            body: formData
                        });

                        const raw = await response.text();
                        let result = { success: response.ok, message: "" };

                        if (raw && raw.trim().length > 0) {
                            try {
                                result = JSON.parse(raw);
                            } catch {
                                console.warn("Respuesta no JSON al deshabilitar correlativo:", raw);
                                result.message = raw;
                            }
                        } else {
                            result.message = response.ok
                                ? "El correlativo fue deshabilitado correctamente."
                                : `Error del servidor (${response.status} ${response.statusText}).`;
                        }

                        if (result.success) {
                            Swal.fire({
                                icon: "success",
                                title: "Correlativo deshabilitado",
                                text: result.message || "El correlativo fue deshabilitado correctamente.",
                                confirmButtonColor: "#182A6E",
                                confirmButtonText: "Confirmar"
                            }).then(() => reloadPreservingState());
                        } else {
                            Swal.fire({
                                icon: "error",
                                title: "No se pudo deshabilitar",
                                text: result.message || "No fue posible deshabilitar el correlativo.",
                                confirmButtonColor: "#182A6E",
                                confirmButtonText: "Confirmar"
                            });
                        }
                    } catch (err) {
                        console.error("Error al deshabilitar correlativo de comprobante:", err);
                        Swal.fire({
                            icon: "error",
                            title: "Error de red",
                            text: "Ocurrió un error al intentar deshabilitar el correlativo.",
                            confirmButtonColor: "#182A6E",
                            confirmButtonText: "Confirmar"
                        });
                    }
                } else {
                    // Si está INACTIVO -> HABILITAR
                    const confirmResult = await Swal.fire({
                        title: "¿Seguro que quieres habilitar este rango?",
                        text: (inicio && fin) ? `Se habilitará el rango ${inicio}-${fin}.` : "Se habilitará el rango seleccionado.",
                        icon: "question",
                        showCancelButton: true,
                        confirmButtonText: "Sí, habilitar",
                        cancelButtonText: "Cancelar",
                        confirmButtonColor: "#182A6E",
                        cancelButtonColor: "red"
                    });

                    if (!confirmResult.isConfirmed) return;

                    const token = getAntiForgeryToken();
                    if (!token) {
                        Swal.fire({
                            icon: "error",
                            title: "Error",
                            text: "No se encontró el token de seguridad.",
                            confirmButtonColor: "#182A6E"
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
                            didOpen: () => Swal.showLoading()
                        });

                        const response = await fetch("/CorrelativoComprobante/HabilitarRango", {
                            method: "POST",
                            headers: {
                                "RequestVerificationToken": token,
                                "Content-Type": "application/json"
                            },
                            body: JSON.stringify({ id })
                        });

                        const raw = await response.text();
                        let result = { success: response.ok, message: "" };

                        if (raw && raw.trim().length > 0) {
                            try {
                                result = JSON.parse(raw);
                            } catch {
                                result.message = raw;
                            }
                        } else {
                            result.message = response.ok
                                ? "El rango se habilitó correctamente."
                                : `Error del servidor (${response.status} ${response.statusText}).`;
                        }

                        // Si la respuesta NO es exitosa (incluyendo 409 Conflict), mostrar error
                        if (!response.ok) {
                            await showApiAlert({
                                icon: response.status === 409 ? "warning" : "error",
                                defaultTitle: "No se pudo habilitar el rango",
                                message: result.message || `Error del servidor (${response.status} ${response.statusText}).`,
                                confirmColor: "#182A6E"
                            });
                            return;
                        }

                        // Si resp.ok pero result.success === false, también es error
                        if (result.success === false) {
                            await showApiAlert({
                                icon: "error",
                                defaultTitle: "No se pudo habilitar el rango",
                                message: result.message || "No se pudo habilitar el rango.",
                                confirmColor: "#182A6E"
                            });
                            return;
                        }

                        // Solo si response.ok y no hay success=false => éxito
                        Swal.fire({
                            icon: "success",
                            title: "Rango habilitado",
                            text: result.message || "El rango se habilitó correctamente.",
                            confirmButtonColor: "#182A6E",
                            confirmButtonText: "Confirmar"
                        }).then(() => {
                            reloadPreservingState();
                        });
                    } catch (err) {
                        console.error("Error al habilitar rango:", err);
                        Swal.fire({
                            icon: "error",
                            title: "Error de red",
                            text: "Ocurrió un error al habilitar el rango.",
                            confirmButtonColor: "#182A6E"
                        });
                    }
                }
            });
        }

        // ============================
        //  BOTÓN KEBAB (MÓVIL)
        // ============================
        if (btnActions) {
            btnActions.addEventListener("click", async (e) => {
                e.stopPropagation();
                await mostrarMenuAccionesComprobante(row);
            });
        }

    }

    document.querySelectorAll(".fila-comprobante").forEach(attachRowEvents);

    actualizarEstilosPorEstado();

    // ============================
    //  NAVEGACIÓN DESHABILITADA (ahora se usa botón en Opciones)
    // ============================
    // La navegación a ListaComprobante se hace con botón .btn-detail
});
