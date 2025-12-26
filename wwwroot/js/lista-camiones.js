(function () {
    'use strict';

    // Configuración de tipos de falta por evento
    const faultTypes = {
        'DAÑOS A LA INFRAESTRUCTURA': [
            'Golpe a plumas de portón de acceso',
            'Golpe a portones de acceso',
            'Golpes a bolardos',
            'Golpes a jardineras',
            'Daños a ductos de despacho',
            'Daños a infraestructura de torres de despacho',
            'Daños a bases de silos',
            'Daños a cortinas metálicas',
            'Daños a muros perimetrales',
            'Daños a bases de plumas de basculas',
            'Daños a tendido eléctrico',
            'Golpes a techos de módulos',
            'Golpes a infraestructuras módulos',
            'Derrames de aceites en volcadores',
            'Derrame de melaza en pileta',
            'Derrame de melaza en calles internas',
            'Daños a tubería de red contra incendios',
            'Daños a rótulos de señalización o información',
            'Daño a cámaras de video vigilancia',
            'Golpes a ductos de despacho',
            'Daños a aceras por maniobras'
        ],
        'HURTOS O INTENTOS DE ROBO': [
            'Camión con carga superior a la indicada en la nota de remisión',
            'Deficiente limpieza en unidades para sustraer producto afuera',
            'Camión con llantas fuera del área de pesaje'
        ],
        'ACCIDENTES ENTRE UNIDADES DENTRO DE PLANTA': [
            'Colisión de equipo frontal con camiones en carga',
            'Maniobras en reversa en despacho',
            'Caída de compuertas durante descarga',
            'Colisión por falla mecánica o error del motorista'
        ]
    };

    let evidenceDropzone;
    let selectedFiles = [];
    let currentFileIndex = 0;
    let isValidationError = false;

    // Deshabilitar autodiscover de Dropzone
    Dropzone.autoDiscover = false;

    if (window.AlmapacUtils && window.AlmapacUtils.hideSpinner) {
        window.AlmapacUtils.hideSpinner();
    }

    function initializeListaCamiones() {
        const form = document.getElementById('lc-filter-form');
        if (!form) {
            console.warn('Formulario lc-filter-form no encontrado');
            return;
        }

        setupExistingFunctionality();
        setupIncidentModal();
    }

    function setupExistingFunctionality() {
        const form = document.getElementById('lc-filter-form');
        
        const pageSizeSelect = document.getElementById('pageSizeSelect');
        if (pageSizeSelect) {
            pageSizeSelect.addEventListener('change', function() {
                changePaginationSize(this.value);
            });
        }

        form.addEventListener('submit', function (e) {
            if (!validateDates()) {
                e.preventDefault();
                return false;
            }
            ensureExcludeStatus();
        });

        const searchInput = document.getElementById('search');
        if (searchInput) {
            searchInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (form.requestSubmit) {
                        form.requestSubmit();
                    } else {
                        form.submit();
                    }
                }
            });
        }

        setupDateValidation();
    }

    function setupIncidentModal() {
        document.querySelectorAll('.card-clickable').forEach(card => {
            card.addEventListener('click', function() {
                openIncidentModal(this);
            });
        });

        const eventTypeSelect = document.getElementById('eventType');
        if (eventTypeSelect) {
            eventTypeSelect.addEventListener('change', updateFaultTypes);
        }

        // Configurar Dropzone cuando el modal se muestre
        $('#incidentReportModal').on('shown.bs.modal', function () {
            if (!evidenceDropzone) {
                setupDropzone();
            }
            updateNavigationButtons();
        });

        // Limpiar Dropzone cuando se cierre el modal
        $('#incidentReportModal').on('hidden.bs.modal', function () {
            if (evidenceDropzone) {
                evidenceDropzone.removeAllFiles(true);
                selectedFiles = [];
                updateFileCounter();
                toggleDropzoneMessage(true);
                togglePreviewsContainer(false);
                updateNavigationButtons();
            }
        });

        const confirmButton = document.getElementById('confirmReport');
        if (confirmButton) {
            confirmButton.addEventListener('click', showConfirmationAlert);
        }

        const prevFileBtn = document.getElementById('prev-file');
        const nextFileBtn = document.getElementById('next-file');
        
        if (prevFileBtn) prevFileBtn.addEventListener('click', showPrevFile);
        if (nextFileBtn) nextFileBtn.addEventListener('click', showNextFile);

        initializeDateTime();
    }

    function setupDropzone() {
        const dropzoneElement = document.getElementById('evidence-dropzone');
        if (!dropzoneElement) {
            console.error('Dropzone element not found');
            return;
        }

        evidenceDropzone = new Dropzone('#evidence-dropzone', {
            url: '#',
            autoProcessQueue: false,
            uploadMultiple: false,
            parallelUploads: 10,
            maxFiles: 10,
            maxFilesize: 20,
            acceptedFiles: 'image/png, image/jpg, image/jpeg, video/mp4, video/x-m4v, video/hevc',
            addRemoveLinks: false,
            previewsContainer: '.previews-container',
            dictDefaultMessage: `
                <i class="fas fa-cloud-upload-alt fa-3x mb-2"></i>
                <h4>Arrastra archivos aquí o haz click para seleccionar</h4>
            `,
            dictRemoveFile: 'X',
            dictCancelUpload: 'Cancelar',
            dictUploadCanceled: 'Subida cancelada',
            dictFileTooBig: 'El archivo es muy grande ({{filesize}}MB). Máximo: {{maxFilesize}}MB',
            dictInvalidFileType: 'Tipo de archivo no válido',
            dictMaxFilesExceeded: 'No puedes subir más archivos (máximo 10)',
            dictResponseError: 'Error del servidor: {{statusCode}}',

            init: function() {
                const dz = this;

                dz.on('addedfile', function(file) {
                    console.log('Intentando agregar archivo:', file.name, 'Tipo:', file.type, 'Archivos actuales:', selectedFiles.length);
                    
                    if (selectedFiles.length >= 10) {
                        console.log('Límite alcanzado, removiendo archivo inmediatamente');
                        isValidationError = true;
                        dz.removeFile(file);
                        Swal.fire({
                            title: 'Límite alcanzado',
                            text: 'No puedes subir más de 10 archivos. Elimina algunos archivos existentes para agregar nuevos.',
                            icon: 'warning',
                            confirmButtonText: 'Aceptar',
                            confirmButtonColor: '#182A6E'
                        });
                        isValidationError = false;
                        return;
                    }

                    const acceptedTypes = [
                        'image/',
                        'video/mp4',
                        'video/x-m4v',
                        'video/hevc'
                    ];
                    const isValidType = acceptedTypes.some(type =>
                        file.type.startsWith(type) || file.type === type
                    );

                    if (!isValidType) {
                        console.log('Tipo de archivo no válido, tipo:', file.type, 'nombre:', file.name);
                        isValidationError = true;
                        dz.removeFile(file);
                        Swal.fire({
                            title: 'Archivo no válido',
                            text: 'Solo se permiten archivos de tipo: imágenes y videos (MP4, M4V, HEVC).',
                            icon: 'error',
                            confirmButtonColor: '#182A6E'
                        });
                        isValidationError = false;
                        return;
                    }

                    if (file.size > 20 * 1024 * 1024) {
                        console.log('Archivo muy grande, removiendo archivo');
                        isValidationError = true;
                        dz.removeFile(file);
                        Swal.fire({
                            title: 'Archivo muy grande',
                            text: 'El archivo excede el límite de 20MB. Por favor, selecciona un archivo más pequeño.',
                            icon: 'error',
                            confirmButtonColor: '#182A6E'
                        });
                        isValidationError = false;
                        return;
                    }

                    console.log('Archivo validado exitosamente, agregando a la lista:', file.name);
                    selectedFiles.push(file);
                    updateFileCounter();
                    toggleDropzoneMessage(false);
                    togglePreviewsContainer(true);
                    customizeFilePreview(file);

                    setTimeout(() => {
                        const previewElement = file.previewElement;
                        if (previewElement) {
                            previewElement.addEventListener('click', function(e) {
                                if (!e.target.closest('.dz-remove')) {
                                    viewFile(file);
                                }
                            });
                        }
                    }, 100);

                    console.log('Archivo agregado exitosamente:', file.name, 'Total archivos:', selectedFiles.length);
                    updateNavigationButtons();
                });

                dz.on('removedfile', function(file) {
                    console.log('Evento removedfile disparado para:', file.name);
                    if (isValidationError) {
                        console.log('Remoción por error de validación, ignorando');
                        return;
                    }

                    const index = selectedFiles.findIndex(f => f.name === file.name && f.size === file.size);
                    if (index > -1) {
                        console.log('Removiendo archivo de la lista:', file.name);
                        selectedFiles.splice(index, 1);
                        updateFileCounter();
                        console.log('Total archivos después de eliminar:', selectedFiles.length);
                        if (selectedFiles.length === 0) {
                            toggleDropzoneMessage(true);
                            togglePreviewsContainer(false);
                        }
                        updateNavigationButtons();
                    }
                });

                dz.on('error', function(file, errorMessage) {
                    console.log('Error de Dropzone:', file.name, errorMessage);
                    if (errorMessage.includes('File is too big') || errorMessage.includes('muy grande')) {
                        Swal.fire({
                            title: 'Archivo muy grande',
                            text: 'El archivo excede el límite de 20MB. Por favor, selecciona un archivo más pequeño.',
                            icon: 'error',
                            confirmButtonColor: '#182A6E'
                        });
                    } else if (errorMessage.includes('You can\'t upload files of this type') || errorMessage.includes('Tipo de archivo no válido')) {
                        Swal.fire({
                            title: 'Archivo no válido',
                            text: 'Solo se permiten archivos de tipo: imágenes y videos (MP4, M4V, HEVC).',
                            icon: 'error',
                            confirmButtonColor: '#182A6E'
                        });
                    } else if (errorMessage.includes('You can\'t upload any more files') || errorMessage.includes('No puedes subir más archivos')) {
                        Swal.fire({
                            title: 'Límite alcanzado',
                            text: 'No puedes subir más de 10 archivos. Elimina algunos archivos existentes para agregar nuevos.',
                            icon: 'warning',
                            confirmButtonText: 'Aceptar',
                            confirmButtonColor: '#182A6E'
                        });
                    }
                });

                dz.on('success', function(file) {
                    console.log('Archivo procesado exitosamente:', file.name);
                });
            }
        });
    }

    function toggleDropzoneMessage(show) {
        const messageElement = document.querySelector('#evidence-dropzone .dz-message');
        if (messageElement) {
            messageElement.classList.toggle('hidden', !show);
        }
    }

    function togglePreviewsContainer(show) {
        const previewsContainer = document.querySelector('#evidence-dropzone .previews-container');
        if (previewsContainer) {
            previewsContainer.style.display = show ? 'flex' : 'none';
        }
    }

    function customizeFilePreview(file) {
        setTimeout(() => {
            const previewElement = file.previewElement;
            if (!previewElement) return;

            const removeButton = document.createElement('div');
            removeButton.className = 'dz-remove';
            removeButton.innerHTML = '<i class="fas fa-times"></i>';
            removeButton.addEventListener('click', function(e) {
                e.stopPropagation();
                evidenceDropzone.removeFile(file);
            });

            previewElement.appendChild(removeButton);
        }, 100);
    }

    function viewFile(file) {
        const modal = document.getElementById('fileViewerModal');
        const content = document.getElementById('file-viewer-content');
        currentFileIndex = selectedFiles.findIndex(f => f.name === file.name && f.size === file.size);
        console.log('Abriendo archivo:', file.name, 'Índice:', currentFileIndex, 'Total archivos:', selectedFiles.length);
        content.innerHTML = '';

        let objectUrl;
        try {
            objectUrl = URL.createObjectURL(file);

            if (file.type.startsWith('image/')) {
                const img = document.createElement('img');
                img.src = objectUrl;
                img.className = 'img-fluid';
                img.style = 'max-height: 70vh;';
                content.appendChild(img);
            } else if (file.type.startsWith('video/')) {
                const video = document.createElement('video');
                video.src = objectUrl;
                video.controls = true;
                video.className = 'img-fluid';
                video.style = 'max-height: 70vh;';
                content.appendChild(video);
            } else {
                content.innerHTML = `<p class="text-center text-white">No se puede previsualizar este tipo de archivo: ${file.type}</p>`;
            }

            document.getElementById('fileViewerModalLabel').textContent = file.name;
            $(modal).modal('show');

            $(modal).off('hidden.bs.modal').on('hidden.bs.modal', function() {
                if (objectUrl) {
                    URL.revokeObjectURL(objectUrl);
                }
            });
        } catch (error) {
            console.error('Error al crear URL para el archivo:', file.name, error);
            content.innerHTML = `<p class="text-center text-white">Error al cargar el archivo: ${file.name}</p>`;
            $(modal).modal('show');
        }
    }

    function showPrevFile() {
        if (selectedFiles.length === 0) {
            console.log('No hay archivos para navegar');
            return;
        }
        console.log('Antes de Anterior: currentFileIndex =', currentFileIndex, 'Total archivos:', selectedFiles.length);
        currentFileIndex = (currentFileIndex - 1 + selectedFiles.length) % selectedFiles.length;
        console.log('Después de Anterior: currentFileIndex =', currentFileIndex);
        viewFile(selectedFiles[currentFileIndex]);
    }

    function showNextFile() {
        if (selectedFiles.length === 0) {
            console.log('No hay archivos para navegar');
            return;
        }
        console.log('Antes de Siguiente: currentFileIndex =', currentFileIndex, 'Total archivos:', selectedFiles.length);
        currentFileIndex = (currentFileIndex + 1) % selectedFiles.length;
        console.log('Después de Siguiente: currentFileIndex =', currentFileIndex);
        viewFile(selectedFiles[currentFileIndex]);
    }

    function updateFileCounter() {
        const counter = document.getElementById('fileCounter');
        const countSpan = document.getElementById('fileCount');
        
        if (selectedFiles.length > 0) {
            counter.style.display = 'inline';
            countSpan.textContent = selectedFiles.length;
        } else {
            counter.style.display = 'none';
        }
        updateNavigationButtons();
    }

    function updateNavigationButtons() {
        const prevFileBtn = document.getElementById('prev-file');
        const nextFileBtn = document.getElementById('next-file');
        if (prevFileBtn && nextFileBtn) {
            const disableButtons = selectedFiles.length <= 1;
            prevFileBtn.disabled = disableButtons;
            nextFileBtn.disabled = disableButtons;
            console.log('Botones de navegación actualizados: disabled =', disableButtons, 'Total archivos:', selectedFiles.length);
        }
    }

    function openIncidentModal(cardElement) {
        const driverName = cardElement.getAttribute('data-driver-name');
        const driverLicense = cardElement.getAttribute('data-driver-license');
        const shipmentId = cardElement.getAttribute('data-shipment-id');
        const trailerPlate = cardElement.getAttribute('data-trailer-plate');
        const truckPlate = cardElement.getAttribute('data-truck-plate');
        const transportista = cardElement.getAttribute('data-transporter');
        const cliente = cardElement.getAttribute('data-client');
        const producto = cardElement.getAttribute('data-product');

        document.getElementById('driverName').value = driverName || '';
        document.getElementById('driverLicense').value = driverLicense || '';
        document.getElementById('shipmentId').value = shipmentId || '';
        document.getElementById('trailerPlate').value = trailerPlate || '';
        document.getElementById('truckPlate').value = truckPlate || '';
        document.getElementById('transportista').value = transportista || '';
        document.getElementById('cliente').value = cliente || '';
        document.getElementById('producto').value = producto || '';

        document.getElementById('incidentForm').reset();
        
        if (evidenceDropzone) {
            evidenceDropzone.removeAllFiles(true);
        }
        selectedFiles = [];
        updateFileCounter();
        toggleDropzoneMessage(true);
        togglePreviewsContainer(false);
        updateNavigationButtons();
        
        initializeDateTime();
        $('#incidentReportModal').modal('show');
    }

    function initializeDateTime() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        document.getElementById('reportDateTime').value = `${year}-${month}-${day}T${hours}:${minutes}`;
    }

    function updateFaultTypes() {
        const eventType = document.getElementById('eventType').value;
        const faultTypeSelect = document.getElementById('faultType');
        
        faultTypeSelect.innerHTML = '<option value="">Seleccione</option>';
        
        if (eventType && faultTypes[eventType]) {
            faultTypes[eventType].forEach(fault => {
                const option = document.createElement('option');
                option.value = fault;
                option.textContent = fault;
                faultTypeSelect.appendChild(option);
            });
        }
    }

    function showConfirmationAlert() {
        const form = document.getElementById('incidentForm');
        
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        if (selectedFiles.length === 0) {
            Swal.fire({
                title: 'Sin evidencia',
                text: '¿Desea continuar sin ninguna evidencia?',
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#3085d6',
                cancelButtonColor: '#d33',
                confirmButtonText: 'Continuar',
                cancelButtonText: 'Cancelar'
            }).then((result) => {
                if (result.isConfirmed) {
                    showFinalConfirmation();
                }
            });
        } else {
            showFinalConfirmation();
        }
    }

    function showFinalConfirmation() {
        const driverName = document.getElementById('driverName').value;
        const trailerPlate = document.getElementById('trailerPlate').value;
        const truckPlate = document.getElementById('truckPlate').value;
        const transportista = document.getElementById('transportista').value;
        const cliente = document.getElementById('cliente').value;
        const producto = document.getElementById('producto').value;
        const eventType = document.getElementById('eventType').value;
        const faultType = document.getElementById('faultType').value;
        const eventLocation = document.getElementById('eventLocation').value;
        const reportDateTime = document.getElementById('reportDateTime').value;
        const description = document.getElementById('description').value;

        const formattedDate = new Date(reportDateTime).toLocaleString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const confirmationMessage = `
        <div style="display:inline-block; margin: 0 2rem; text-align:left; font-family:Arial, sans-serif;">
            <p><strong>Motorista:</strong> ${driverName}</p>
            <p><strong>Placa Remolque:</strong> ${trailerPlate}</p>
            <p><strong>Placa Camión:</strong> ${truckPlate}</p>
            <p><strong>Transportista:</strong> ${transportista}</p>
            <p><strong>Cliente:</strong> ${cliente}</p>
            <p><strong>Producto:</strong> ${producto}</p>
            <p><strong>Evento:</strong> ${eventType}</p>
            <p><strong>Falta:</strong> ${faultType}</p>
            <p><strong>Lugar:</strong> ${eventLocation}</p>
            <p><strong>Fecha y Hora:</strong> ${formattedDate}</p>
            <p><strong>Detalle:</strong> ${description.substring(0, 50)}${description.length > 50 ? '...' : ''}</p>
        </div>
        `;

        Swal.fire({
            title: 'Confirmación',
            html: confirmationMessage,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33',
            confirmButtonText: 'Enviar',
            cancelButtonText: 'Cancelar',
            width: '500px'
        }).then((result) => {
            if (result.isConfirmed) {
                submitIncidentReport();
            }
        });
    }

    function submitIncidentReport() {
        const confirmButton = document.getElementById('confirmReport');
        const originalText = confirmButton.innerHTML;
        
        confirmButton.disabled = true;
        confirmButton.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Enviando...';

        // Array de mensajes que se iran alternando
        const loadingMessages = [
            'Por favor espere...',
            'Generando reporte...',
            'Validando información...',
            'Guardando imágenes...',
            'Procesando archivos...',
            'Subiendo evidencias...',
            'Casi listo...'
        ];

        let currentMessageIndex = 0;
        let messageInterval;

        Swal.fire({
            title: 'Enviando reporte...',
            html: `
                <div class="spinner-border mb-1" role="status">
                    <span class="sr-only">Cargando...</span>
                </div>
                <p id="loadingMessage" class="text-muted">${loadingMessages[0]}</p>
            `,
            allowOutsideClick: false,
            allowEscapeKey: false,
            showConfirmButton: false,
            showCancelButton: false,
            didOpen: () => {
                Swal.showLoading();
                
                // Cambiar mensaje cada 2 segundos
                messageInterval = setInterval(() => {
                    currentMessageIndex = (currentMessageIndex + 1) % loadingMessages.length;
                    const messageElement = document.getElementById('loadingMessage');
                    if (messageElement) {
                        // Animación fade para suavizar el cambio
                        messageElement.style.opacity = '0';
                        setTimeout(() => {
                            messageElement.textContent = loadingMessages[currentMessageIndex];
                            messageElement.style.opacity = '1';
                        }, 200);
                    }
                }, 2000);
            },
            willClose: () => {
                // Limpiar el intervalo cuando se cierre el modal
                if (messageInterval) {
                    clearInterval(messageInterval);
                }
            }
        });

        const formData = new FormData();
        
        const token = document.querySelector('input[name="__RequestVerificationToken"]').value;
        formData.append('__RequestVerificationToken', token);
        
        formData.append('license', document.getElementById('driverLicense').value);
        formData.append('shipmentId', document.getElementById('shipmentId').value);
        formData.append('eventType', document.getElementById('eventType').value);
        formData.append('faultType', document.getElementById('faultType').value);
        formData.append('eventLocation', document.getElementById('eventLocation').value);
        formData.append('description', document.getElementById('description').value);
        
        const reportDateTime = document.getElementById('reportDateTime').value;
        const reportDateTimeISO = new Date(reportDateTime).toISOString();
        formData.append('reportDatetime', reportDateTimeISO);

        selectedFiles.forEach((file) => {
            formData.append('evidenceFiles', file);
        });

        fetch('/ListaCamiones/CreateIncidentReport', {
        method: 'POST',
        body: formData,
        headers: {
            'RequestVerificationToken': token
        }
        })

        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {

            Swal.close();
            // Detener mensajes alternados
            if (messageInterval) {
                clearInterval(messageInterval);
            }
            if (data.success) {
                Swal.fire({
                    title: '¡Reporte enviado!',
                    text: 'El reporte de incidente ha sido enviado exitosamente',
                    icon: 'success',
                    confirmButtonText: 'Aceptar',
                    confirmButtonColor: '#182A6E'
                }).then(() => {
                    $('#incidentReportModal').modal('hide');
                    if (evidenceDropzone) {
                        evidenceDropzone.removeAllFiles(true);
                    }
                    selectedFiles = [];
                    updateFileCounter();
                    toggleDropzoneMessage(true);
                    togglePreviewsContainer(false);
                    document.getElementById('incidentForm').reset();
                });
            } else {
                let messageToShow = 'Error desconocido';
                
                if (data.message) {
                    try {
                        const parsedMessage = JSON.parse(data.message);
                        messageToShow = parsedMessage.message || data.message;
                    } catch (e) {
                        messageToShow = data.message;
                    }
                } else if (data.error) {
                    messageToShow = data.error;
                }
                
                Swal.fire({
                    title: 'ATENCIÓN',
                    text: messageToShow,
                    icon: 'warning',
                    confirmButtonText: 'Aceptar',
                    confirmButtonColor: '#182A6E'
                });
            }
        })
        .catch(error => {
            Swal.close();
            console.error('Error al enviar reporte:', error);
            Swal.fire({
                title: 'Error de conexión',
                text: 'No se pudo conectar con el servidor. Por favor, intente nuevamente.',
                icon: 'error',
                confirmButtonColor: '#182A6E'
            });
        })
        .finally(() => {
            confirmButton.disabled = false;
            confirmButton.innerHTML = originalText;
        });
    }

    function changePaginationSize(newSize) {
        if (!newSize) return;
        
        const url = new URL(window.location);
        url.searchParams.set('size', newSize);
        url.searchParams.set('page', '1');
        url.searchParams.set('excludeStatus', '1');
        
        showLoadingIndicator();
        window.location.href = url.toString();
    }

    function validateDates() {
        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');
        
        if (!startDateInput || !endDateInput) return true;
        
        const start = startDateInput.value;
        const end = endDateInput.value;

        if (start && end) {
            const d1 = new Date(start + 'T00:00:00');
            const d2 = new Date(end + 'T00:00:00');
            
            if (d1 > d2) {
                Swal.fire({
                    title: 'Error en fechas',
                    text: 'La fecha "Desde" no puede ser mayor que "Hasta".',
                    icon: 'error',
                    confirmButtonColor: '#182A6E'
                });
                startDateInput.focus();
                return false;
            }
        }
        
        return true;
    }

    function setupDateValidation() {
        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');
        
        if (startDateInput) {
            startDateInput.addEventListener('change', function() {
                if (this.value && endDateInput && endDateInput.value) {
                    if (this.value > endDateInput.value) {
                        Swal.fire({
                            title: 'Error en fechas',
                            text: 'La fecha de inicio no puede ser mayor a la fecha de fin.',
                            icon: 'error',
                            confirmButtonColor: '#182A6E'
                        });
                        this.value = '';
                    }
                }
            });
        }

        if (endDateInput) {
            endDateInput.addEventListener('change', function() {
                if (this.value && startDateInput && startDateInput.value) {
                    if (this.value < startDateInput.value) {
                        Swal.fire({
                            title: 'Error en fechas',
                            text: 'La fecha de fin no puede ser menor a la fecha de inicio.',
                            icon: 'error',
                            confirmButtonColor: '#182A6E'
                        });
                        this.value = '';
                    }
                }
            });
        }
    }

    function ensureExcludeStatus() {
        const form = document.getElementById('lc-filter-form');
        if (!form) return;
        
        let hidden = form.querySelector('input[name="excludeStatus"]');
        if (!hidden) {
            hidden = document.createElement('input');
            hidden.type = 'hidden';
            hidden.name = 'excludeStatus';
            form.appendChild(hidden);
        }
        hidden.value = '1';
    }

    function showLoadingIndicator() {
        if (window.AlmapacUtils && window.AlmapacUtils.showSpinner) {
            window.AlmapacUtils.showSpinner();
            return;
        }

        let loadingDiv = document.getElementById('lc-loading');
        if (!loadingDiv) {
            loadingDiv = document.createElement('div');
            loadingDiv.id = 'lc-loading';
            loadingDiv.innerHTML = 'Cargando...';
            loadingDiv.style.cssText = `
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(24, 42, 110, 0.9);
                color: white;
                padding: 1rem 2rem;
                border-radius: 8px;
                z-index: 9999;
                font-weight: 600;
            `;
            document.body.appendChild(loadingDiv);
        }
        loadingDiv.style.display = 'block';
    }

    function hideLoadingIndicator() {
        if (window.AlmapacUtils && window.AlmapacUtils.hideSpinner) {
            window.AlmapacUtils.hideSpinner();
        }

        const loadingDiv = document.getElementById('lc-loading');
        if (loadingDiv) {
            loadingDiv.style.display = 'none';
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeListaCamiones);
    } else {
        initializeListaCamiones();
    }

    window.addEventListener('load', hideLoadingIndicator);
})();