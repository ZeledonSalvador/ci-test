/* =========================================================
   Reportes de Incidentes - OPTIMIZADO Y SIN WARNINGS
   ========================================================= */
(function () {
  'use strict';
  
  if (window.AlmapacUtils?.hideSpinner) window.AlmapacUtils.hideSpinner();
  
  const $ = window.jQuery || null;

  // ===== Utilidades de Media =====
  function getMediaTypeFromUrl(url) {
    if (!url) return 'image';
    
    // Leer marcador del backend (#media-type=video o #media-type=image)
    const hashIndex = url.indexOf('#media-type=');
    if (hashIndex !== -1) {
      const type = url.substring(hashIndex + 12).split('&')[0];
      if (type === 'video' || type === 'image') return type;
    }
    
    // Fallback: detectar por parámetro k=v|i
    if (url.includes('&k=v')) return 'video';
    if (url.includes('&k=i')) return 'image';
    
    return 'image'; // Default
  }

  function cleanUrl(url) {
    if (!url) return url;
    const hashIndex = url.indexOf('#media-type=');
    return hashIndex !== -1 ? url.substring(0, hashIndex) : url;
  }

  function uniqueList(list) {
    return [...new Set(list.filter(Boolean))];
  }

  function showLoadingSpinner(container) {
    container.innerHTML = `
      <div class="media-loading">
        <div class="spinner-border text-primary" role="status">
          <span class="sr-only">Cargando...</span>
        </div>
        <p class="text-white mt-3">Cargando evidencia...</p>
      </div>
    `;
  }

  function showMediaError(container, message = 'No se pudo cargar el contenido') {
    container.innerHTML = `
      <div class="media-error">
        <i class="fas fa-exclamation-triangle"></i>
        <div>${message}</div>
      </div>
    `;
  }

  // ===== Utilidades de fecha/hora =====
  function getCurrentDateTime() {
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  }

  function formatDateTimeForInput(dateString) {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      const pad = n => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    } catch {
      return '';
    }
  }

  function addHoursToDateTime(dateTimeString, hours) {
    try {
      const date = new Date(dateTimeString);
      date.setHours(date.getHours() + hours);
      return formatDateTimeForInput(date.toISOString());
    } catch {
      return dateTimeString;
    }
  }

  function formatDateTimeForDisplay(dateTimeString) {
    if (!dateTimeString) return 'No especificada';
    try {
      const date = new Date(dateTimeString);
      const pad = n => String(n).padStart(2, '0');
      return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    } catch {
      return 'Fecha inválida';
    }
  }

  // ===== Filtros / paginación =====
  const form = document.getElementById('ri-filter-form');
  const pageSizeSelect = document.getElementById('pageSizeSelect');

  if (pageSizeSelect) {
    pageSizeSelect.addEventListener('change', function () {
      const url = new URL(window.location.href);
      url.searchParams.set('size', this.value);
      url.searchParams.set('page', '1');
      window.location.href = url.toString();
    });
  }

  if (form) {
    const searchInput = document.getElementById('search');
    if (searchInput) {
      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          form.requestSubmit ? form.requestSubmit() : form.submit();
        }
      });
    }
  }

  // ===== Visor de evidencias =====
  const modalEl = document.getElementById('evidenceModal');
  const viewer = document.getElementById('evidence-viewer-content');
  const prevBtn = document.getElementById('prev-evidence');
  const nextBtn = document.getElementById('next-evidence');
  const penaltyModal = document.getElementById('penaltyModal');

  let files = [];
  let idx = 0;
  let renderTicket = 0;
  let currentVideoElement = null;

  function setNavDisabledState() {
    if (!prevBtn || !nextBtn) return;
    const disabled = files.length <= 1;
    prevBtn.disabled = nextBtn.disabled = disabled;
    prevBtn.style.pointerEvents = nextBtn.style.pointerEvents = disabled ? 'none' : 'auto';
  }

  function clearViewer() {
    if (currentVideoElement) {
      currentVideoElement.pause();
      currentVideoElement.src = '';
      currentVideoElement = null;
    }
    if (viewer) viewer.innerHTML = '';
  }

  function renderCurrent() {
    const myTicket = ++renderTicket;
    if (!viewer || !files.length || idx < 0 || idx >= files.length) {
      showMediaError(viewer, 'Sin evidencias disponibles');
      setNavDisabledState();
      return;
    }

    const rawUrl = files[idx];
    const mediaType = getMediaTypeFromUrl(rawUrl);
    const url = cleanUrl(rawUrl);

    showLoadingSpinner(viewer);

    try {
      if (myTicket !== renderTicket) return;
      clearViewer();
      
      mediaType === 'video' ? renderVideo(url, myTicket) : renderImage(url, myTicket);
    } catch (error) {
      console.error('Error en renderCurrent:', error);
      if (myTicket === renderTicket) showMediaError(viewer, 'Error al cargar el contenido');
    }

    setNavDisabledState();
    drawCounter();
  }

  function renderVideo(url, myTicket) {
    const video = document.createElement('video');
    video.controls = true;
    video.preload = 'metadata';
    video.playsInline = true;
    video.controlsList = 'nodownload';
    video.style.cssText = 'max-width: 100%; max-height: 70vh; width: auto; height: auto; object-fit: contain;';

    let loaded = false;
    const onLoad = () => {
      if (myTicket === renderTicket && !loaded) {
        loaded = true;
        viewer.querySelector('.media-loading')?.remove();
      }
    };

    video.addEventListener('loadedmetadata', onLoad);
    video.addEventListener('loadeddata', onLoad);
    video.addEventListener('canplay', onLoad);
    
    video.addEventListener('error', () => {
      if (myTicket === renderTicket) {
        const errorMessages = ['Carga abortada', 'Error de red', 'Error de decodificación', 'Formato no soportado'];
        const msg = video.error ? errorMessages[video.error.code - 1] || 'Error desconocido' : 'Error desconocido';
        showMediaError(viewer, `No se pudo cargar el video. ${msg}`);
      }
    });

    video.src = url;
    currentVideoElement = video;
    
    const container = document.createElement('div');
    container.style.cssText = 'width: 100%; display: flex; justify-content: center; align-items: center;';
    container.appendChild(video);
    viewer.appendChild(container);

    setTimeout(() => {
      if (myTicket === renderTicket && !loaded) onLoad();
    }, 8000);
  }

  function renderImage(url, myTicket) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = 'Evidencia';
    img.loading = 'eager';
    img.style.cssText = 'max-width: 100%; max-height: 70vh; object-fit: contain; opacity: 0; transition: opacity 0.3s;';

    img.onload = function() {
      if (myTicket === renderTicket && this.parentNode) {
        this.style.opacity = '1';
        viewer.querySelector('.media-loading')?.remove();
      }
    };

    img.onerror = function() {
      if (myTicket === renderTicket) showMediaError(viewer, 'No se pudo cargar la imagen');
    };

    viewer.appendChild(img);
    if (img.complete) img.onload();
  }

  function drawCounter() {
    let c = document.getElementById('ri-counter');
    if (!c) {
      c = document.createElement('div');
      c.id = 'ri-counter';
      c.style.cssText = `
        position: absolute; bottom: 15px; right: 20px; background: rgba(0,0,0,.8);
        color: #fff; padding: 8px 16px; border-radius: 20px; font-size: 14px;
        font-weight: 600; z-index: 1305; backdrop-filter: blur(4px);
        box-shadow: 0 2px 10px rgba(0,0,0,.3); border: 1px solid rgba(255,255,255,0.1);
      `;
      modalEl?.querySelector('.modal-body')?.appendChild(c);
    }
    c.textContent = files.length ? `${idx + 1} / ${files.length}` : '0 / 0';
  }

  function showPrev() {
    if (!files.length) return;
    currentVideoElement?.pause();
    idx = (idx - 1 + files.length) % files.length;
    renderCurrent();
  }

  function showNext() {
    if (!files.length) return;
    currentVideoElement?.pause();
    idx = (idx + 1) % files.length;
    renderCurrent();
  }

  function openModalWith(list, startIndex = 0) {
    files = uniqueList(list);
    idx = Math.min(Math.max(startIndex, 0), Math.max(files.length - 1, 0));

    if (modalEl) {
      modalEl.style.zIndex = '1300';
      modalEl.setAttribute('aria-hidden', 'false');
      modalEl.setAttribute('aria-modal', 'true');
    }
    
    renderCurrent();

    if ($ && typeof $().modal === 'function') {
      $(modalEl).modal({ backdrop: 'static', keyboard: true });
      $(modalEl).modal('show');
      setTimeout(() => {
        const backdrop = [...document.querySelectorAll('.modal-backdrop')].pop();
        if (backdrop) {
          backdrop.classList.add('evidence-backdrop');
          backdrop.style.zIndex = '1290';
        }
      }, 100);
    }
  }

  function closeModal() {
    if (currentVideoElement) {
      currentVideoElement.pause();
      currentVideoElement.src = '';
      currentVideoElement = null;
    }

    if (modalEl) {
      const focusedElement = modalEl.querySelector(':focus');
      if (focusedElement && typeof focusedElement.blur === 'function') {
        focusedElement.blur();
      }
    }

    if ($ && typeof $().modal === 'function') {
      $(modalEl).modal('hide');
    } else if (modalEl) {
      modalEl.style.display = 'none';
      modalEl.classList.remove('show');
      modalEl.setAttribute('aria-hidden', 'true');
      modalEl.removeAttribute('aria-modal');

      const evidenceBackdrops = document.querySelectorAll('.modal-backdrop.evidence-backdrop');
      evidenceBackdrops.forEach(backdrop => backdrop.remove());
    }

    if (penaltyModal?.classList.contains('show')) {
      setTimeout(() => {
        const focusedInPenalty = penaltyModal.querySelector(':focus');
        if (focusedInPenalty && typeof focusedInPenalty.blur === 'function') {
          focusedInPenalty.blur();
        }
        
        penaltyModal.focus();
        const remainingBackdrop = document.querySelector('.modal-backdrop:not(.evidence-backdrop)');
        if (remainingBackdrop) remainingBackdrop.style.zIndex = '1040';
      }, 100);
    }
  }

  // Navegación
  prevBtn?.addEventListener('click', showPrev);
  nextBtn?.addEventListener('click', showNext);

  if ($ && modalEl) {
    $(modalEl).on('hidden.bs.modal', function () {
      files = [];
      idx = 0;
      clearViewer();
      document.getElementById('ri-counter')?.remove();
      renderTicket++;
      document.querySelectorAll('.modal-backdrop.evidence-backdrop').forEach(b => b.remove());
    });

    $(modalEl).on('shown.bs.modal', setNavDisabledState);
  }

  // Navegación con teclado
  document.addEventListener('keydown', function (e) {
    const isEvidenceVisible = modalEl?.classList.contains('show');
    const isPenaltyVisible = penaltyModal?.classList.contains('show');
    
    if (isEvidenceVisible) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); showPrev(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); showNext(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
    } else if (isPenaltyVisible && e.key === 'Escape') {
      e.preventDefault();
      if ($) $(penaltyModal).modal('hide');
    }
  });

  // Gestos táctiles
  if (modalEl) {
    let startX = 0, startTime = 0;
    const area = modalEl.querySelector('.modal-body') || modalEl;

    area.addEventListener('touchstart', (ev) => {
      if (ev.touches?.length) {
        startX = ev.touches[0].clientX;
        startTime = Date.now();
      }
    }, { passive: true });

    area.addEventListener('touchend', (ev) => {
      const t = ev.changedTouches?.[0];
      if (!t) return;
      const dx = t.clientX - startX;
      const dt = Date.now() - startTime;
      if (dt < 300 && Math.abs(dx) > 50) dx > 0 ? showPrev() : showNext();
    }, { passive: true });
  }

  // ===== Modal de amonestación =====
  const penaltyForm = document.getElementById('penaltyForm');
  const confirmPenaltyBtn = document.getElementById('confirmPenalty');
  let currentReport = null;

  document.querySelectorAll('.penalty-card-clickable:not([data-ri-bound])').forEach(card => {
    card.setAttribute('data-ri-bound', '1');
    card.addEventListener('click', () => openPenaltyModal(card));
  });

  function openPenaltyModal(cardElement) {
    const driverPhoto = cardElement.getAttribute('data-driver-photo') || '';
    const evidenceFromCard = (cardElement.getAttribute('data-evidence-urls') || '').split('||').filter(Boolean);
    const allFromCard = (cardElement.getAttribute('data-all-urls') || '').split('||').filter(Boolean);

    currentReport = {
      id: cardElement.getAttribute('data-report-id'),
      driverName: cardElement.getAttribute('data-driver-name'),
      driverLicense: cardElement.getAttribute('data-driver-license'),
      client: cardElement.getAttribute('data-client'),
      product: cardElement.getAttribute('data-product'),
      eventType: cardElement.getAttribute('data-event-type'),
      faultType: cardElement.getAttribute('data-fault-type'),
      location: cardElement.getAttribute('data-location'),
      eventDate: cardElement.getAttribute('data-event-date'),
      description: cardElement.getAttribute('data-description'),
      driverPhoto,
      evidenceUrls: uniqueList([...(driverPhoto ? [driverPhoto] : []), ...evidenceFromCard]),
      allUrls: uniqueList([...(driverPhoto ? [driverPhoto] : []), ...allFromCard]),
      statusHistory: parseStatusHistory(cardElement.getAttribute('data-status-history'))
    };

    document.getElementById('penaltyReportId').value = currentReport.id || '';
    document.getElementById('penaltyLicense').value = currentReport.driverLicense || '';
    document.getElementById('penaltyDescription').textContent = currentReport.description || 'Sin descripción';

    loadStatusHistory();

    document.getElementById('penaltyStartDate').value = getCurrentDateTime();
    document.getElementById('penaltyType').value = '';
    document.getElementById('penaltyEndDate').value = '';
    document.getElementById('penaltyObservation').value = '';

    loadEvidenceSlider();

    if (penaltyModal) {
      penaltyModal.style.zIndex = '1050';
      penaltyModal.setAttribute('aria-hidden', 'false');
      penaltyModal.setAttribute('aria-modal', 'true');
    }
    
    if ($) $(penaltyModal).modal({ backdrop: 'static', keyboard: false }).modal('show');
  }

  function parseStatusHistory(historyData) {
    if (!historyData) return [];
    try {
      return JSON.parse(historyData);
    } catch {
      return [];
    }
  }

  function loadStatusHistory() {
    const historyContainer = document.getElementById('statusHistory');
    if (!historyContainer) return;
    
    historyContainer.innerHTML = '';
    const history = currentReport.statusHistory || [];
    
    if (!history.length) {
      historyContainer.innerHTML = '<p class="text-muted small">Sin historial disponible</p>';
      return;
    }
    
    history.forEach(entry => {
      const item = document.createElement('div');
      item.className = 'history-item';
      const changeDate = entry.ChangeDateTime ? new Date(entry.ChangeDateTime).toLocaleString() : 'Sin fecha';
      item.innerHTML = `
        <div class="history-content">
          <span class="history-date">${changeDate}</span>
          <span class="history-separator">|</span>
          <span class="history-reason">${entry.ChangeReason || 'Sin comentarios'}</span>
          <span class="history-separator">|</span>
          <span class="history-user">${entry.ChangedBy || 'Usuario desconocido'}</span>
        </div>
      `;
      historyContainer.appendChild(item);
    });
  }

  function addThumb(thumb, rawUrl, index) {
    const mediaType = getMediaTypeFromUrl(rawUrl);
    const url = cleanUrl(rawUrl);

    if (mediaType === 'video') {
      thumb.classList.add('video');
      thumb.innerHTML = `
          <div style="width:100%;height:100%;background:#333;display:flex;align-items:center;justify-content:center;position:relative;">
            <i class="fas fa-video" style="color:white;font-size:1rem;"></i>
            <div style="position:absolute;bottom:2px;right:2px;background:rgba(0,0,0,0.8);color:white;font-size:8px;padding:1px 3px;border-radius:2px;">
              <i class="fas fa-play"></i>
            </div>
          </div>`;
    } else {
      const img = document.createElement('img');
      img.src = url;
      img.alt = `Evidencia ${index + 1}`;
      img.loading = 'lazy';
      img.style.cssText = 'width: 100%; height: 100%; object-fit: cover;';
      
      img.onerror = function() {
        this.style.display = 'none';
        thumb.innerHTML = `
          <div style="width:100%;height:100%;background:#f8f9fa;display:flex;align-items:center;justify-content:center;border:1px dashed #dee2e6;">
            <div style="text-align:center;color:#6c757d;">
              <i class="fas fa-image-slash" style="font-size:1.2rem;color:#dc3545;"></i>
              <div style="font-size:9px;margin-top:4px;">No disponible</div>
            </div>
          </div>
        `;
      };
      thumb.appendChild(img);
    }
  }

  function loadEvidenceSlider() {
    const slider = document.getElementById('evidenceSlider');
    const counter = document.getElementById('evidenceCount');
    const evidenceList = currentReport.evidenceUrls || [];

    counter.textContent = evidenceList.length ? `(${evidenceList.length})` : '';
    slider.innerHTML = evidenceList.length ? '' : '<p class="text-muted small">Sin evidencias</p>';

    evidenceList.forEach((rawUrl, index) => {
      const thumb = document.createElement('div');
      thumb.className = 'evidence-thumbnail';
      addThumb(thumb, rawUrl, index);

      thumb.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const startIndex = currentReport.allUrls.indexOf(rawUrl);
        openModalWith(currentReport.allUrls, startIndex >= 0 ? startIndex : 0);
      });

      slider.appendChild(thumb);
    });
  }

  function validatePenaltyForm() {
    const penaltyType = document.getElementById('penaltyType').value;
    const startDate = document.getElementById('penaltyStartDate').value;
    
    const showAlert = (text) => {
      if (typeof Swal !== 'undefined') {
        Swal.fire({ title: 'Campo requerido', text, icon: 'warning', confirmButtonText: 'Aceptar', confirmButtonColor: '#182A6E' });
      } else {
        alert(text);
      }
    };
    
    if (!penaltyType) { showAlert('Por favor seleccione un tipo de amonestación'); return false; }
    if (!startDate) { showAlert('Por favor ingrese la fecha y hora de inicio'); return false; }

    if (penaltyType === 'Temporal') {
      const endDate = document.getElementById('penaltyEndDate').value;
      if (!endDate) { showAlert('Para amonestaciones temporales debe especificar fecha y hora de fin'); return false; }
      if (new Date(endDate) <= new Date(startDate)) {
        if (typeof Swal !== 'undefined') {
          Swal.fire({ title: 'Error de validación', text: 'La fecha y hora de fin debe ser posterior', icon: 'error', confirmButtonColor: '#182A6E' });
        } else {
          alert('La fecha y hora de fin debe ser posterior');
        }
        return false;
      }
    }

    return true;
  }

  function showConfirmationAlert(formData) {
    const penaltyType = formData.penaltyType;
    const startDate = formatDateTimeForDisplay(formData.penaltyStartDate);
    const endDate = formatDateTimeForDisplay(formData.penaltyEndDate);
    
    let days = 'No aplica';
    if (penaltyType === 'Temporal' && formData.penaltyStartDate && formData.penaltyEndDate) {
      const diffMs = new Date(formData.penaltyEndDate) - new Date(formData.penaltyStartDate);
      const diffHours = Math.round(diffMs / 3600000);
      days = diffHours <= 24 ? `${diffHours} hora(s)` : `${Math.ceil(diffMs / 86400000)} día(s)`;
    } else if (penaltyType === 'Permanente') {
      days = 'Indefinido';
    }

    const penaltyTypeText = penaltyType === 'No aplicado' ? 'No aplicado' : 
                            penaltyType === 'Temporal' ? 'Temporal' : 'Permanente';
    const dateInfo = penaltyType === 'No aplicado' ? 'No aplica' :
                     penaltyType === 'Temporal' ? `${startDate} - ${endDate}` : `${startDate} - Indefinido`;

    if (typeof Swal !== 'undefined') {
      Swal.fire({
        title: 'Confirmación',
        html: `
          <div style="text-align:left; margin: 0 2.5rem;">
            <p><strong>Motorista:</strong> ${currentReport.driverName}</p>
            <p><strong>Tipo:</strong> ${penaltyTypeText}</p>
            <p><strong>Fecha:</strong> ${dateInfo}</p>
            <p><strong>Duración:</strong> ${days}</p>
            <p><strong>Comentarios:</strong> ${formData.observation || 'Sin comentarios'}</p>
          </div>
        `,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Enviar',
        cancelButtonText: 'Cancelar'
      }).then((result) => { if (result.isConfirmed) submitPenalty(formData); });
    } else {
      if (confirm(`¿Confirmar amonestación?\n\nMotorista: ${currentReport.driverName}\nTipo: ${penaltyTypeText}\nDuración: ${days}`)) {
        submitPenalty(formData);
      }
    }
  }

  if (confirmPenaltyBtn) {
    confirmPenaltyBtn.addEventListener('click', function() {
      if (!validatePenaltyForm()) return;

      const formData = {
        license: document.getElementById('penaltyLicense').value,
        reportId: parseInt(document.getElementById('penaltyReportId').value),
        penaltyType: document.getElementById('penaltyType').value,
        observation: document.getElementById('penaltyObservation').value || ''
      };

      const startDateValue = document.getElementById('penaltyStartDate').value;
      if (startDateValue) formData.penaltyStartDate = new Date(startDateValue).toISOString();

      const endDateValue = document.getElementById('penaltyEndDate').value;
      if (formData.penaltyType === 'Temporal' && endDateValue) {
        formData.penaltyEndDate = new Date(endDateValue).toISOString();
      }

      showConfirmationAlert(formData);
    });
  }

  async function submitPenalty(data) {
    const btn = confirmPenaltyBtn;
    const originalText = btn.innerHTML;
    
    try {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Enviando...';

      if (typeof Swal !== 'undefined') {
        Swal.fire({
          title: 'Aplicando amonestación...',
          html: '<div class="spinner-border"></div>',
          allowOutsideClick: false,
          showConfirmButton: false,
          didOpen: () => Swal.showLoading()
        });
      }

      const tokenInput = document.querySelector('input[name="__RequestVerificationToken"]');
      const headers = { 'Content-Type': 'application/json' };
      if (tokenInput?.value) headers['RequestVerificationToken'] = tokenInput.value;

      const response = await fetch('/ReportesIncidentes/ApplyPenalty', {
        method: 'POST',
        headers,
        body: JSON.stringify(data)
      });

      const result = await response.json().catch(() => ({}));
      if (typeof Swal !== 'undefined') Swal.close();

      if (response.ok && result.success) {
        if (typeof Swal !== 'undefined') {
          Swal.fire({
            title: '¡Amonestación aplicada!',
            text: 'La amonestación ha sido aplicada exitosamente',
            icon: 'success',
            confirmButtonColor: '#182A6E'
          }).then(() => location.reload());
        } else {
          alert('Amonestación aplicada exitosamente');
          location.reload();
        }
      } else {
        const message = result.message || 'Error al aplicar la amonestación';
        if (typeof Swal !== 'undefined') {
          Swal.fire({ title: 'Error', text: message, icon: 'error', confirmButtonColor: '#182A6E' });
        } else {
          alert(message);
        }
      }
    } catch (error) {
      if (typeof Swal !== 'undefined') {
        Swal.close();
        Swal.fire({ title: 'Error de conexión', text: 'No se pudo conectar con el servidor', icon: 'error', confirmButtonColor: '#182A6E' });
      } else {
        alert('Error de conexión');
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }

  // Manejo del select de tipo
  const penaltyTypeSelect = document.getElementById('penaltyType');
  if (penaltyTypeSelect) {
    penaltyTypeSelect.addEventListener('change', function() {
      const endDateField = document.getElementById('penaltyEndDate');
      const startDateField = document.getElementById('penaltyStartDate');
      
      if (this.value === 'Temporal') {
        endDateField.required = true;
        endDateField.disabled = false;
        endDateField.style.opacity = '1';
        if (startDateField.value) endDateField.value = addHoursToDateTime(startDateField.value, 24);
      } else {
        endDateField.required = false;
        endDateField.disabled = true;
        endDateField.value = '';
        endDateField.style.opacity = '0.5';
      }
    });
  }

  // Estado inicial
  const initialEndDateField = document.getElementById('penaltyEndDate');
  if (initialEndDateField) {
    initialEndDateField.disabled = true;
    initialEndDateField.style.opacity = '0.5';
  }

  // Validación de fechas
  const startDateField = document.getElementById('penaltyStartDate');
  const endDateField = document.getElementById('penaltyEndDate');

  if (startDateField && endDateField) {
    const validateDates = () => {
      if (startDateField.value && endDateField.value && new Date(endDateField.value) <= new Date(startDateField.value)) {
        endDateField.setCustomValidity('La fecha de fin debe ser posterior');
      } else {
        endDateField.setCustomValidity('');
      }
    };

    startDateField.addEventListener('change', function() {
      validateDates();
      const penaltyType = document.getElementById('penaltyType').value;
      if (penaltyType === 'Temporal' && this.value && !endDateField.value) {
        endDateField.value = addHoursToDateTime(this.value, 24);
        validateDates();
      }
    });
    
    endDateField.addEventListener('change', validateDates);
  }

  // Limpiar modal al cerrar
  if ($ && penaltyModal) {
    $(penaltyModal).on('hidden.bs.modal', function () {
      penaltyForm?.reset();
      currentReport = null;
      
      const endField = document.getElementById('penaltyEndDate');
      if (endField) {
        endField.disabled = true;
        endField.style.opacity = '0.5';
      }
      
      const slider = document.getElementById('evidenceSlider');
      if (slider) slider.innerHTML = '';
      
      const counter = document.getElementById('evidenceCount');
      if (counter) counter.textContent = '';
      
      const historyContainer = document.getElementById('statusHistory');
      if (historyContainer) historyContainer.innerHTML = '';

      // Remover foco antes de cerrar
      const focusedInModal = penaltyModal.querySelector(':focus');
      if (focusedInModal && typeof focusedInModal.blur === 'function') {
        focusedInModal.blur();
      }
    });
  }

  // Redimensionado optimizado
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (modalEl?.classList.contains('show') && files.length) drawCounter();
    }, 250);
  });

  // Inicialización
  window.addEventListener('load', () => {
    if (window.AlmapacUtils?.hideSpinner) window.AlmapacUtils.hideSpinner();
    console.log('✓ Módulo de Reportes de Incidentes cargado correctamente');
  });

})();