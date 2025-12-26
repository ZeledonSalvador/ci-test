/* ========================================================= 
   Lista Negra de Motoristas - JS completo
   ========================================================= */
(function () {
  'use strict';
  
  if (window.AlmapacUtils && window.AlmapacUtils.hideSpinner) {
    window.AlmapacUtils.hideSpinner();
  }
  
  const $ = window.jQuery || null;

  // ===== Caché y detección robusta por Content-Type =====
  const _mediaTypeCache = new Map();

  function isVideoUrlByExt(url) {
    return /\.(mp4|m4v|mov|webm|ogg|ogv)(\?.*)?$/i.test(url || '');
  }

  function isImageUrlByExt(url) {
    return /\.(jpg|jpeg|png|gif|webp|heic|heif)(\?.*)?$/i.test(url || '');
  }

  async function getMediaType(url) {
    if (!url) return 'unknown';

    if (url.startsWith('data:video/')) return 'video';
    if (url.startsWith('data:image/')) return 'image';

    if (isVideoUrlByExt(url)) return 'video';
    if (isImageUrlByExt(url)) return 'image';

    if (_mediaTypeCache.has(url)) return _mediaTypeCache.get(url);

    try {
      const response = await fetch(url, { method: 'HEAD', cache: 'force-cache' });
      const ct = (response.headers.get('Content-Type') || '').toLowerCase();
      const kind =
        ct.startsWith('video/') ? 'video' :
        ct.startsWith('image/') ? 'image' :
        'unknown';
      _mediaTypeCache.set(url, kind);
      return kind;
    } catch {
      if (isVideoUrlByExt(url)) return 'video';
      if (isImageUrlByExt(url)) return 'image';
      return 'unknown';
    }
  }

  function uniqueList(list) {
    const seen = new Set();
    const out = [];
    list.forEach(u => {
      if (u && !seen.has(u)) {
        seen.add(u);
        out.push(u);
      }
    });
    return out;
  }

  function showLoadingSpinner(container) {
    const spinner = document.createElement('div');
    spinner.className = 'media-loading';
    container.innerHTML = '';
    container.appendChild(spinner);
    return spinner;
  }

  function showMediaError(container, message = 'No se han podido cargar las imágenes, por favor recargue la página') {
    container.innerHTML = `
      <div class="media-error">
        <i class="fas fa-exclamation-triangle"></i>
        <div>${message}</div>
      </div>
    `;
  }

  // Utilidad faltante: usada en showModifyConfirmationAlert
  function formatDateTimeForDisplay(dateTimeString) {
    if (!dateTimeString) return 'No especificada';
    try {
      const d = new Date(dateTimeString);
      if (isNaN(d.getTime())) return 'Fecha inválida';
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      const hh = String(d.getHours()).padStart(2, '0');
      const mi = String(d.getMinutes()).padStart(2, '0');
      return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
    } catch {
      return 'Fecha inválida';
    }
  }

  // -----------------------------
  // Filtros / paginación
  // -----------------------------
  const form = document.getElementById('ln-filter-form');
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

  // -----------------------------
  // Visor de evidencias
  // -----------------------------
  const modalEl = document.getElementById('evidenceModal');
  const viewer = document.getElementById('evidence-viewer-content');
  const prevBtn = document.getElementById('prev-evidence');
  const nextBtn = document.getElementById('next-evidence');
  const modifyPenaltyModal = document.getElementById('modifyPenaltyModal');

  let files = [];
  let idx = 0;
  let renderTicket = 0;

  function setNavDisabledState() {
    if (!prevBtn || !nextBtn) return;
    const disabled = files.length <= 1;
    prevBtn.disabled = disabled;
    nextBtn.disabled = disabled;
    prevBtn.style.pointerEvents = disabled ? 'none' : 'auto';
    nextBtn.style.pointerEvents = disabled ? 'none' : 'auto';
  }

  function clearViewer() {
    if (viewer) {
      viewer.innerHTML = '';
    }
  }

  async function renderCurrent() {
    const myTicket = ++renderTicket;
    if (!viewer) return;

    if (!files.length || idx < 0 || idx >= files.length) {
      showMediaError(viewer, 'Sin evidencias disponibles');
      setNavDisabledState();
      return;
    }

    const url = files[idx];
    const spinner = showLoadingSpinner(viewer);

    try {
      const type = await getMediaType(url);

      if (myTicket !== renderTicket) return;

      viewer.innerHTML = '';

      if (type === 'video') {
        const v = document.createElement('video');
        v.src = url;
        v.controls = true;
        v.preload = 'metadata';
        v.playsInline = true;
        v.style.cssText = 'max-width: 100%; max-height: 70vh; object-fit: contain;';

        v.addEventListener('loadstart', () => {
          if (myTicket === renderTicket) {
            viewer.innerHTML = '';
            viewer.appendChild(v);
          }
        });

        v.addEventListener('error', () => {
          if (myTicket === renderTicket) {
            showMediaError(viewer, 'No se han podido cargar las imágenes, por favor recargue la página');
          }
        });

        viewer.appendChild(v);
      } else {
        const img = document.createElement('img');
        img.src = url;
        img.alt = 'Evidencia';
        img.style.cssText = 'max-width: 100%; max-height: 70vh; object-fit: contain; transition: opacity 0.3s ease;';

        img.onload = function() {
          if (myTicket === renderTicket && this.parentNode) {
            this.style.opacity = '1';
          }
        };

        img.onerror = function() {
          if (myTicket === renderTicket) {
            showMediaError(viewer, 'No se han podido cargar las imágenes, por favor recargue la página');
          }
        };

        img.style.opacity = '0';
        viewer.appendChild(img);

        if (img.complete) {
          img.onload();
        }
      }
    } catch (error) {
      if (myTicket === renderTicket) {
        showMediaError(viewer, 'No se han podido cargar las imágenes, por favor recargue la página');
      }
    } finally {
      if (myTicket === renderTicket && spinner.parentNode) {
        spinner.remove();
      }
    }

    setNavDisabledState();
    drawCounter();
    preloadNeighbor();
  }

  function drawCounter() {
    const id = 'ln-counter';
    let c = document.getElementById(id);
    if (!c) {
      c = document.createElement('div');
      c.id = id;
      c.style.cssText = `
        position: absolute;
        bottom: 15px;
        right: 20px;
        background: rgba(0,0,0,.8);
        color: #fff;
        padding: 6px 12px;
        border-radius: 12px;
        font-size: 13px;
        font-weight: 600;
        z-index: 1305;
        backdrop-filter: blur(4px);
        box-shadow: 0 2px 10px rgba(0,0,0,.3);
      `;
      if (modalEl && modalEl.querySelector('.modal-body')) {
        modalEl.querySelector('.modal-body').appendChild(c);
      }
    }
    c.textContent = files.length ? `${idx + 1} / ${files.length}` : '0 / 0';
  }

  async function preloadNeighbor() {
    if (!files.length) return;
    const nextIndex = (idx + 1) % files.length;
    const u = files[nextIndex];
    if (!u || u.startsWith('data:')) return;

    try {
      const kind = await getMediaType(u);
      if (kind === 'image') {
        const i = new Image();
        i.src = u;
        i.onerror = () => {};
      }
    } catch (error) {
      // Silenciar errores de precarga
    }
  }

  function showPrev() {
    if (!files.length) return;
    idx = (idx - 1 + files.length) % files.length;
    renderCurrent();
  }

  function showNext() {
    if (!files.length) return;
    idx = (idx + 1) % files.length;
    renderCurrent();
  }

  function openModalWith(list, startIndex = 0) {
    files = uniqueList((list || []).filter(Boolean));
    idx = Math.min(Math.max(startIndex, 0), Math.max(files.length - 1, 0));

    if (modalEl) {
      modalEl.style.zIndex = '1300';
    }

    renderCurrent();

    if ($ && typeof $().modal === 'function') {
      $(modalEl).modal({
        backdrop: 'static',
        keyboard: true,
        focus: true
      });
      $(modalEl).modal('show');
      
      setTimeout(() => {
        const backdrops = document.querySelectorAll('.modal-backdrop');
        const lastBackdrop = backdrops[backdrops.length - 1];
        if (lastBackdrop) {
          lastBackdrop.classList.add('evidence-backdrop');
          lastBackdrop.style.zIndex = '1290';
        }
      }, 100);
      
    } else if (modalEl) {
      modalEl.style.display = 'block';
      modalEl.classList.add('show');
      modalEl.removeAttribute('aria-hidden');
      modalEl.setAttribute('aria-modal', 'true');
      modalEl.focus();

      const backdrop = document.createElement('div');
      backdrop.className = 'modal-backdrop fade show evidence-backdrop';
      backdrop.style.zIndex = '1290';
      document.body.appendChild(backdrop);
    }

    setTimeout(() => {
      if (prevBtn) prevBtn.style.pointerEvents = files.length > 1 ? 'auto' : 'none';
      if (nextBtn) nextBtn.style.pointerEvents = files.length > 1 ? 'auto' : 'none';
    }, 100);
  }

  function closeModal() {
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

    if (modifyPenaltyModal && modifyPenaltyModal.classList.contains('show')) {
      setTimeout(() => {
        modifyPenaltyModal.focus();
        const remainingBackdrop = document.querySelector('.modal-backdrop:not(.evidence-backdrop)');
        if (remainingBackdrop) {
          remainingBackdrop.style.zIndex = '1040';
        }
        modifyPenaltyModal.style.pointerEvents = 'auto';
        (modifyPenaltyModal.querySelectorAll('input, select, textarea, button') || []).forEach(el => {
          el.style.pointerEvents = 'auto';
        });
      }, 100);
    } else {
      document.body.style.pointerEvents = 'auto';
    }
  }

  function attachNavListeners() {
    if (prevBtn) {
      prevBtn.removeEventListener('click', showPrev);
      prevBtn.addEventListener('click', showPrev);
    }
    if (nextBtn) {
      nextBtn.removeEventListener('click', showNext);
      nextBtn.addEventListener('click', showNext);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    attachNavListeners();
  });

  if ($ && modalEl) {
    $(modalEl).on('hidden.bs.modal', function () {
      files = [];
      idx = 0;
      clearViewer();
      const c = document.getElementById('ln-counter');
      if (c && c.parentNode) c.parentNode.removeChild(c);
      renderTicket++;

      const evidenceBackdrops = document.querySelectorAll('.modal-backdrop.evidence-backdrop');
      evidenceBackdrops.forEach(backdrop => backdrop.remove());

      if (modifyPenaltyModal && modifyPenaltyModal.classList.contains('show')) {
        setTimeout(() => {
          modifyPenaltyModal.focus();
          const remainingBackdrop = document.querySelector('.modal-backdrop:not(.evidence-backdrop)');
          if (remainingBackdrop) {
            remainingBackdrop.style.zIndex = '1040';
          }
          modifyPenaltyModal.style.pointerEvents = 'auto';
          (modifyPenaltyModal.querySelectorAll('input, select, textarea, button') || []).forEach(el => {
            el.style.pointerEvents = 'auto';
          });
        }, 100);
      } else {
        document.body.style.pointerEvents = 'auto';
      }
    });

    $(modalEl).on('shown.bs.modal', function () {
      attachNavListeners();
      setNavDisabledState();
    });
  }

  // Navegación con teclado
  document.addEventListener('keydown', function (e) {
    const isEvidenceVisible = modalEl && modalEl.classList.contains('show');
    const isModifyPenaltyVisible = modifyPenaltyModal && modifyPenaltyModal.classList.contains('show');
    
    if (isEvidenceVisible) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        showPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        showNext();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
      }
    } else if (isModifyPenaltyVisible && e.key === 'Escape') {
      e.preventDefault();
      if ($ && typeof $().modal === 'function') {
        $(modifyPenaltyModal).modal('hide');
      }
    }
  });

  // Gestos táctiles
  (function attachSwipe() {
    if (!modalEl) return;
    let startX = 0;
    let startY = 0;
    let startTime = 0;

    const area = modalEl.querySelector('.modal-body') || modalEl;

    area.addEventListener('touchstart', function (ev) {
      if (!ev.touches || !ev.touches.length) return;
      startX = ev.touches[0].clientX;
      startY = ev.touches[0].clientY;
      startTime = Date.now();
    }, { passive: true });

    area.addEventListener('touchend', function (ev) {
      const t = ev.changedTouches && ev.changedTouches[0];
      if (!t) return;

      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      const dt = Date.now() - startTime;

      if (dt < 300 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 2) {
        if (dx > 0) showPrev();
        else showNext();
      }
    }, { passive: true });
  })();

  // -----------------------------
  // Modal de modificación de amonestación
  // -----------------------------
  const modifyPenaltyForm = document.getElementById('modifyPenaltyForm');
  const confirmModifyPenaltyBtn = document.getElementById('confirmModifyPenalty');

  let currentReport = null;

  document.querySelectorAll('.modify-penalty-card-clickable:not([data-ln-bound])').forEach(card => {
    card.setAttribute('data-ln-bound', '1');
    card.addEventListener('click', function() {
      openModifyPenaltyModal(this);
    });
  });

  function openModifyPenaltyModal(cardElement) {
    if (!modifyPenaltyModal) {
      console.warn('modifyPenaltyModal no encontrado en el DOM.');
    }

    // tomar foto del motorista (data-driver-photo) para usarla solo en miniaturas/preview
    const driverPhoto = cardElement.getAttribute('data-driver-photo') || '';

    const evidenceFromCard = (cardElement.getAttribute('data-evidence-urls') || '').split('||').filter(Boolean);
    const allFromCard = (cardElement.getAttribute('data-all-urls') || '').split('||').filter(Boolean);

    const evidenceUrls = uniqueList([...(driverPhoto ? [driverPhoto] : []), ...evidenceFromCard]);
    const allUrls = uniqueList([...(driverPhoto ? [driverPhoto] : []), ...allFromCard]);

    const rawHistoryData = cardElement.getAttribute('data-status-history');

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
      evidenceUrls,
      allUrls,
      penaltyType: cardElement.getAttribute('data-penalty-type'),
      penaltyStart: cardElement.getAttribute('data-penalty-start'),
      penaltyEnd: cardElement.getAttribute('data-penalty-end'),
      penaltyDays: parseInt(cardElement.getAttribute('data-penalty-days')) || 0,
      penaltyObservation: cardElement.getAttribute('data-penalty-observation'),
      statusHistory: parseStatusHistory(rawHistoryData)
    };

    // Llenar información del reporte
    const idEl = document.getElementById('modifyPenaltyReportId');
    if (idEl) idEl.value = currentReport.id || '';
    const descEl = document.getElementById('modifyPenaltyDescription');
    if (descEl) descEl.textContent = currentReport.description || 'Sin descripción';
    
    loadModifyStatusHistory();

    // Llenar formulario con datos actuales
    const typeEl = document.getElementById('modifyPenaltyType');
    const startEl = document.getElementById('modifyPenaltyStartDate');
    const endEl = document.getElementById('modifyPenaltyEndDate');
    const obsEl = document.getElementById('modifyPenaltyObservation');

    if (typeEl) typeEl.value = currentReport.penaltyType || '';
    if (startEl) startEl.value = currentReport.penaltyStart || '';
    if (endEl) endEl.value = currentReport.penaltyEnd || '';
    if (obsEl) obsEl.value = currentReport.penaltyObservation || '';

    // Cargar slider de evidencias (ya con foto del motorista primero si existe)
    loadModifyEvidenceSlider();

    if (modifyPenaltyModal) {
      modifyPenaltyModal.style.zIndex = '1050';
      modifyPenaltyModal.style.pointerEvents = 'auto';
    }

    if ($ && typeof $().modal === 'function' && modifyPenaltyModal) {
      $(modifyPenaltyModal).modal({
        backdrop: 'static',
        keyboard: false
      });
      $(modifyPenaltyModal).modal('show');
    }

    toggleEndDateField();
  }

  // ---- Historial
  function parseStatusHistory(historyData) {
    if (!historyData) return [];
    try {
      return JSON.parse(historyData);
    } catch (error) {
      console.error('Error parsing status history:', error);
      return [];
    }
  }

  function loadModifyStatusHistory() {
    const historyContainer = document.getElementById('modifyStatusHistory');
    if (!historyContainer) return;
    
    historyContainer.innerHTML = '';
    const history = currentReport.statusHistory || [];
    if (history.length === 0) {
      historyContainer.innerHTML = '<p class="text-muted small">Sin historial disponible</p>';
      return;
    }
    const timeline = document.createElement('div');
    history.forEach((entry) => {
      const historyItem = document.createElement('div');
      historyItem.className = 'history-item';
      const changeDate = entry.ChangeDateTime ? new Date(entry.ChangeDateTime).toLocaleString() : 'Sin fecha';
      historyItem.innerHTML = `
        <div class="history-content">
          <span class="history-date">${changeDate}</span>
          <span class="history-separator">|</span>
          <span class="history-reason">${entry.ChangeReason || 'Sin comentarios'}</span>
          <span class="history-separator">|</span>
          <span class="history-user">${entry.ChangedBy || 'Usuario desconocido'}</span>
        </div>
      `;
      timeline.appendChild(historyItem);
    });
    historyContainer.appendChild(timeline);
  }

  // ---- Miniaturas
  async function addModifyThumb(thumb, url, index) {
    try {
      const type = await getMediaType(url);

      if (type === 'video') {
        thumb.classList.add('video');
        thumb.innerHTML = `
          <div style="width:100%;height:100%;background:#333;display:flex;align-items:center;justify-content:center;position:relative;">
            <i class="fas fa-video" style="color:white;font-size:1rem;"></i>
            <div style="position:absolute;bottom:2px;right:2px;background:rgba(0,0,0,0.8);color:white;font-size:8px;padding:1px 3px;border-radius:2px;">
              <i class="fas fa-play"></i>
            </div>
          </div>
        `;
      } else {
        const img = document.createElement('img');
        img.src = url;
        img.alt = `Evidencia ${index + 1}`;
        img.loading = 'lazy';
        img.onerror = function() {
          this.style.display = 'none';
          thumb.innerHTML = `
            <div style="width:100%;height:100%;background:#f8f9fa;display:flex;align-items:center;justify-content:center;border:1px dashed #dee2e6;">
              <div style="text-align:center;color:#6c757d;">
                <i class="fas fa-exclamation-triangle" style="font-size:1rem;display:block;margin-bottom:2px;color:#ffc107;"></i>
                <span style="font-size:8px;">Token expirado</span>
              </div>
            </div>
          `;
        };
        thumb.appendChild(img);
      }
    } catch (error) {
      thumb.innerHTML = `
        <div style="width:100%;height:100%;background:#f8f9fa;display:flex;align-items:center;justify-content:center;border:1px dashed #dee2e6;">
          <div style="text-align:center;color:#6c757d;">
            <i class="fas fa-exclamation-triangle" style="font-size:1rem;display:block;margin-bottom:2px;color:#ffc107;"></i>
            <span style="font-size:8px;">Error</span>
          </div>
        </div>
      `;
    }
  }

  async function loadModifyEvidenceSlider() {
    const slider = document.getElementById('modifyEvidenceSlider');
    const counter = document.getElementById('modifyEvidenceCount');
    
    const evidenceList = currentReport.evidenceUrls || [];

    if (counter) counter.textContent = evidenceList.length > 0 ? `(${evidenceList.length})` : '';

    if (!slider) return;
    slider.innerHTML = '';

    if (evidenceList.length === 0) {
      slider.innerHTML = '<p class="text-muted small">Sin evidencias</p>';
      return;
    }

    for (let index = 0; index < evidenceList.length; index++) {
      const url = evidenceList[index];
      const thumb = document.createElement('div');
      thumb.className = 'evidence-thumbnail';

      await addModifyThumb(thumb, url, index);

      thumb.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();

        const startIndex = currentReport.allUrls.indexOf(url);

        if (startIndex >= 0) {
          openModalWith(currentReport.allUrls, startIndex);
        } else {
          openModalWith([url], 0);
        }
      });

      slider.appendChild(thumb);
    }
  }

  // ---- Validaciones y envío
  function toggleEndDateField() {
    const penaltyTypeSelect = document.getElementById('modifyPenaltyType');
    const endDateField = document.getElementById('modifyPenaltyEndDate');
    
    if (!penaltyTypeSelect || !endDateField) return;

    if (penaltyTypeSelect.value === 'Temporal') {
      endDateField.required = true;
      endDateField.disabled = false;
      endDateField.style.opacity = '1';
      endDateField.style.backgroundColor = '#fff';
    } else {
      endDateField.required = false;
      endDateField.disabled = true;
      endDateField.style.opacity = '0.6';
      endDateField.style.backgroundColor = '#f8f9fa';
      endDateField.value = '';
    }
  }

  function validateModifyPenaltyForm() {
    const penaltyType = document.getElementById('modifyPenaltyType').value;
    const startDate = document.getElementById('modifyPenaltyStartDate').value;
    
    if (!penaltyType) {
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          title: 'Campo requerido',
          text: 'Por favor seleccione un tipo de amonestación',
          icon: 'warning',
          confirmButtonText: 'Aceptar',
          confirmButtonColor: '#182A6E'
        });
      } else {
        alert('Por favor seleccione un tipo de amonestación');
      }
      return false;
    }
    
    if (!startDate) {
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          title: 'Campo requerido',
          text: 'Por favor ingrese la fecha y hora de inicio',
          icon: 'warning',
          confirmButtonText: 'Aceptar',
          confirmButtonColor: '#182A6E'
        });
      } else {
        alert('Por favor ingrese la fecha y hora de inicio');
      }
      return false;
    }

    if (penaltyType === 'Temporal') {
      const endDate = document.getElementById('modifyPenaltyEndDate').value;
      if (!endDate) {
        if (typeof Swal !== 'undefined') {
          Swal.fire({
            title: 'Campo requerido',
            text: 'Para amonestaciones temporales debe especificar fecha y hora de fin',
            icon: 'warning',
            confirmButtonText: 'Aceptar',
            confirmButtonColor: '#182A6E'
          });
        } else {
          alert('Para amonestaciones temporales debe especificar fecha y hora de fin');
        }
        return false;
      }
      
      if (new Date(endDate) <= new Date(startDate)) {
        if (typeof Swal !== 'undefined') {
          Swal.fire({
            title: 'Error en fechas',
            text: 'La fecha y hora de fin debe ser posterior a la fecha y hora de inicio',
            icon: 'error',
            confirmButtonColor: '#182A6E'
          });
        } else {
          alert('La fecha y hora de fin debe ser posterior a la fecha y hora de inicio');
        }
        return false;
      }
    }

    return true;
  }

  function showModifyConfirmationAlert(formData) {
    const driverName = currentReport.driverName || 'N/D';
    const driverLicense = currentReport.driverLicense || 'N/D';
    const penaltyType = formData.penaltyType;
    const startDate = formatDateTimeForDisplay(formData.penaltyStartDate);
    const endDate = formatDateTimeForDisplay(formData.penaltyEndDate);
    const observation = formData.observation || 'Sin comentarios';
    let penaltyTypeText = '';
    let dateInfo = '';

    switch (penaltyType) {
      case 'Temporal':
        penaltyTypeText = 'Temporal';
        dateInfo = `${startDate} - ${endDate}`;
        break;
      case 'Permanente':
        penaltyTypeText = 'Permanente';
        dateInfo = `${startDate} - Indefinido`;
        break;
      case 'Finalizado':
        penaltyTypeText = 'Finalizado';
        dateInfo = endDate ? `${startDate} - ${endDate}` : `Desde: ${startDate}`;
        break;
      default:
        penaltyTypeText = penaltyType || 'N/D';
        dateInfo = `${startDate}${endDate ? ' - ' + endDate : ''}`;
        break;
    }

    if (typeof Swal !== 'undefined') {
        const confirmationMessage = `
          <div style="display:inline-block; margin: 0 2.5rem; text-align:left; font-family:Arial, sans-serif;">
            <p><strong>Motorista:</strong> ${driverName}</p>
            <p><strong>Tipo:</strong> ${penaltyTypeText}</p>
            <p><strong>Fecha:</strong> ${dateInfo}</p>
            <p><strong>Comentarios:</strong> ${observation}</p>
          </div>
        `;
        Swal.fire({
          title: 'Confirmación',
          html: confirmationMessage,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#3085d6',
          cancelButtonColor: '#d33',
          confirmButtonText: 'Modificar',
          cancelButtonText: 'Cancelar'
        }).then((result) => {
          if (result.isConfirmed) submitModifyPenalty(formData);
        });
    } else {
      const confirmMessage = `¿Confirmar modificación de amonestación?\n\n` +
        `Motorista: ${driverName} (${driverLicense})\n` +
        `Tipo: ${penaltyTypeText}\n` +
        `Inicio: ${startDate}\n` +
        `Fin: ${endDate}\n` +
        `Comentarios: ${observation}`;

      if (confirm(confirmMessage)) {
        submitModifyPenalty(formData);
      }
    }
  }

  if (confirmModifyPenaltyBtn) {
    confirmModifyPenaltyBtn.addEventListener('click', function() {
      if (!validateModifyPenaltyForm()) return;

      const formData = {
        penaltyType: document.getElementById('modifyPenaltyType').value,
        observation: document.getElementById('modifyPenaltyObservation').value || ''
      };

      const startDateValue = document.getElementById('modifyPenaltyStartDate').value;
      if (startDateValue) {
        formData.penaltyStartDate = new Date(startDateValue).toISOString();
      }

      const endDateValue = document.getElementById('modifyPenaltyEndDate').value;
      if (endDateValue) {
        formData.penaltyEndDate = new Date(endDateValue).toISOString();
      }

      showModifyConfirmationAlert(formData);
    });
  }

  async function submitModifyPenalty(data) {
    const btn = confirmModifyPenaltyBtn;
    if (!btn) {
      console.warn('confirmModifyPenaltyBtn no encontrado');
      return;
    }
    const originalText = btn.innerHTML;
    
    try {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status"></span> Enviando...';

      if (typeof Swal !== 'undefined') {
        Swal.fire({
          title: 'Actualizando amonestación...',
          html: '<div class="spinner-border" role="status"><span class="sr-only">Cargando...</span></div>',
          allowOutsideClick: false,
          allowEscapeKey: false,
          showConfirmButton: false,
          showCancelButton: false,
          didOpen: () => {
            Swal.showLoading();
          }
        });
      }

      const tokenInput = document.querySelector('input[name="__RequestVerificationToken"]');
      const token = tokenInput ? tokenInput.value : '';

      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['RequestVerificationToken'] = token;

      const response = await fetch(`/ListaNegra/UpdatePenalty/${currentReport.id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(data)
      });

      const result = await response.json().catch(() => ({}));

      if (typeof Swal !== 'undefined') {
        Swal.close();
      }

      if (response.ok && result.success) {
        if (typeof Swal !== 'undefined') {
          Swal.fire({
            title: '¡Amonestación actualizada!',
            text: 'La amonestación ha sido actualizada exitosamente',
            icon: 'success',
            confirmButtonText: 'Aceptar',
            confirmButtonColor: '#182A6E'
          }).then(() => {
            if ($ && typeof $().modal === 'function' && modifyPenaltyModal) {
              $(modifyPenaltyModal).modal('hide');
            }
            location.reload();
          });
        } else {
          alert('Amonestación actualizada exitosamente');
          location.reload();
        }
      } else {
        const message = (result && result.message) ? result.message : 'Error al actualizar la amonestación';
        
        if (typeof Swal !== 'undefined') {
          Swal.fire({
            title: 'Error',
            text: message,
            icon: 'error',
            confirmButtonText: 'Aceptar',
            confirmButtonColor: '#182A6E'
          });
        } else {
          alert(message);
        }
      }
    } catch (error) {
      console.error('Error:', error);
      if (typeof Swal !== 'undefined') {
        Swal.close();
        Swal.fire({
          title: 'Error de conexión',
          text: 'No se pudo conectar con el servidor',
          icon: 'error',
          confirmButtonColor: '#182A6E'
        });
      } else {
        alert('Error de conexión');
      }
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }

  // Manejo del select de tipo de amonestación
  const modifyPenaltyTypeSelect = document.getElementById('modifyPenaltyType');
  if (modifyPenaltyTypeSelect) {
    modifyPenaltyTypeSelect.addEventListener('change', toggleEndDateField);
  }

  // Limpiar modal al cerrar
  if ($ && modifyPenaltyModal) {
    $(modifyPenaltyModal).on('hidden.bs.modal', function () {
      if (modifyPenaltyForm) {
        modifyPenaltyForm.reset();
      }
      
      currentReport = null;
      
      const slider = document.getElementById('modifyEvidenceSlider');
      if (slider) {
        slider.innerHTML = '';
      }
      const counter = document.getElementById('modifyEvidenceCount');
      if (counter) {
        counter.textContent = '';
      }

      const historyContainer = document.getElementById('modifyStatusHistory');
      if (historyContainer) {
        historyContainer.innerHTML = '';
      }
    });
  }

  // Manejo optimizado de redimensionado
  let resizeTimeout;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(function() {
      if (modalEl && modalEl.classList.contains('show') && files.length > 0) {
        drawCounter();
      }
    }, 250);
  });

  // Precargar tipos de media al cargar la página
  window.addEventListener('load', function() {
    if (window.AlmapacUtils && window.AlmapacUtils.hideSpinner) {
      window.AlmapacUtils.hideSpinner();
    }
    
    const evidenceUrls = document.querySelectorAll('[data-evidence-urls]');
    evidenceUrls.forEach(el => {
      const urls = (el.getAttribute('data-evidence-urls') || '').split('||').filter(Boolean);
      urls.slice(0, 3).forEach(url => {
        getMediaType(url).catch(() => {
          // Silenciar errores de precarga
        });
      });
    });
  });

})();