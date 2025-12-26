/* =========================================================
   Lista Negra de Motoristas - JS completo con contador y
   foto del motorista solo en miniaturas/preview
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

  // ====== Utilidades visuales de fechas / contador ======
  function formatDateTimeForDisplay(dateTimeString) {
    if (!dateTimeString) return 'No especificada';
    try {
      const date = new Date(dateTimeString);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${day}/${month}/${year} ${hours}:${minutes}`;
    } catch {
      return 'Fecha inválida';
    }
  }

  function updateCountdown(penaltyType, endDate, element) {
    if (!element) return;
    const type = penaltyType ? penaltyType.toLowerCase() : '';

    if (type === 'permanente') {
      element.textContent = '00:00:00';
      element.className = 'penalty-countdown permanent';
      return;
    }
    
    if (type === 'finalizado') {
      element.textContent = '00:00:00';
      element.className = 'penalty-countdown expired';
      return;
    }

    if (type === 'no aplicado') {
      element.textContent = '00:00:00';
      element.className = 'penalty-countdown expired';
      return;
    }
    
    // Validar que exista fecha de fin
    if (!endDate || endDate === 'No especificada') {
      element.textContent = 'SIN FECHA FIN';
      element.className = 'penalty-countdown active';
      return;
    }
    
    try {
      const now = new Date();
      const end = new Date(endDate);
      
      // Validar que la fecha sea válida
      if (isNaN(end.getTime())) {
        element.textContent = 'FECHA INVÁLIDA';
        element.className = 'penalty-countdown active';
        return;
      }
      
      const diffTime = end.getTime() - now.getTime();
      
      if (diffTime <= 0) {
        element.textContent = 'VENCIDO';
        element.className = 'penalty-countdown expired';
        return;
      }
      
      const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diffTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diffTime % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diffTime % (1000 * 60)) / 1000);
      
      let timeString = '';
      let className = 'penalty-countdown';
      
      if (days > 0) {
        timeString = `${days}d ${hours}h ${minutes}m ${seconds}s`;
        className += days <= 3 ? ' warning' : ' active';
      } else if (hours > 0) {
        timeString = `${hours}h ${minutes}m ${seconds}s`;
        className += ' warning';
      } else if (minutes > 0) {
        timeString = `${minutes}m ${seconds}s`;
        className += ' warning';
      } else {
        timeString = `${seconds}s`;
        className += ' warning';
      }
      
      element.textContent = timeString;
      element.className = className;
    } catch (error) {
      element.textContent = 'ERROR EN FECHA';
      element.className = 'penalty-countdown active';
    }
  }

  // Variables para el contador - una por modal
  let countdownInterval = null;
  let currentModalId = null;

  function startCountdown(penaltyType, endDate, modalId) {
    // Detener contador anterior si existe
    stopCountdown();
    
    const element = document.getElementById('detailCountdown');
    if (!element) return;
    
    // Guardar ID del modal actual
    currentModalId = modalId;
    
    // Actualizar inmediatamente
    updateCountdown(penaltyType, endDate, element);
    
    // Solo iniciar intervalo si tiene fecha de fin válida y no es estado especial
    const type = penaltyType ? penaltyType.toLowerCase() : '';
    const hasValidEndDate = endDate && endDate !== 'No especificada';
    const needsCountdown = type !== 'permanente' && type !== 'finalizado' && type !== 'no aplicado';
    
    if (needsCountdown && hasValidEndDate) {
      countdownInterval = setInterval(() => {
        // Verificar que el modal actual sigue siendo el mismo
        if (currentModalId === modalId) {
          updateCountdown(penaltyType, endDate, element);
        } else {
          // Si cambió el modal, detener este contador
          stopCountdown();
        }
      }, 1000);
    }
  }

  function stopCountdown() {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
    currentModalId = null;
  }

  // -----------------------------
  // Filtros / paginación
  // -----------------------------
  const form = document.getElementById('lnm-filter-form');
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
  const viewDetailsModal = document.getElementById('viewDetailsModal');

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
          if (myTicket === renderTicket && this.parentNode) this.style.opacity = '1';
        };
        img.onerror = function() {
          if (myTicket === renderTicket) {
            showMediaError(viewer, 'No se han podido cargar las imágenes, por favor recargue la página');
          }
        };
        img.style.opacity = '0';
        viewer.appendChild(img);
        if (img.complete) img.onload();
      }
    } catch {
      if (myTicket === renderTicket) {
        showMediaError(viewer, 'No se han podido cargar las imágenes, por favor recargue la página');
      }
    } finally {
      if (myTicket === renderTicket && spinner.parentNode) spinner.remove();
    }

    setNavDisabledState();
    drawCounter();
    preloadNeighbor();
  }

  function drawCounter() {
    const id = 'lnm-counter';
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
    } catch {
      /* silencioso */
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

    if (modalEl) modalEl.style.zIndex = '1300';

    renderCurrent();

    if ($ && typeof $().modal === 'function') {
      $(modalEl).modal({ backdrop: 'static', keyboard: true, focus: true });
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

    if (viewDetailsModal && viewDetailsModal.classList.contains('show')) {
      setTimeout(() => {
        viewDetailsModal.focus();
        const remainingBackdrop = document.querySelector('.modal-backdrop:not(.evidence-backdrop)');
        if (remainingBackdrop) remainingBackdrop.style.zIndex = '1040';
        viewDetailsModal.style.pointerEvents = 'auto';
        viewDetailsModal.querySelectorAll('input, select, textarea, button').forEach(el => {
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
      const c = document.getElementById('lnm-counter');
      if (c && c.parentNode) c.parentNode.removeChild(c);
      renderTicket++;

      const evidenceBackdrops = document.querySelectorAll('.modal-backdrop.evidence-backdrop');
      evidenceBackdrops.forEach(backdrop => backdrop.remove());

      if (viewDetailsModal && viewDetailsModal.classList.contains('show')) {
        setTimeout(() => {
          viewDetailsModal.focus();
          const remainingBackdrop = document.querySelector('.modal-backdrop:not(.evidence-backdrop)');
          if (remainingBackdrop) remainingBackdrop.style.zIndex = '1040';
          viewDetailsModal.style.pointerEvents = 'auto';
          viewDetailsModal.querySelectorAll('input, select, textarea, button').forEach(el => {
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
    const isDetailsVisible = viewDetailsModal && viewDetailsModal.classList.contains('show');
    
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
    } else if (isDetailsVisible && e.key === 'Escape') {
      e.preventDefault();
      if ($ && typeof $().modal === 'function') {
        $(viewDetailsModal).modal('hide');
      }
    }
  });

  // Gestos táctiles
  (function attachSwipe() {
    if (!modalEl) return;
    let startX = 0, startY = 0, startTime = 0;
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
  // Modal de detalles (solo consulta)
  // -----------------------------
  let currentReport = null;

  document.querySelectorAll('.view-details-card-clickable:not([data-lnm-bound])').forEach(card => {
    card.setAttribute('data-lnm-bound', '1');
    card.addEventListener('click', function() {
      openViewDetailsModal(this);
    });
  });

  function openViewDetailsModal(cardElement) {
    // foto del motorista para usarla únicamente en miniaturas/preview
    const driverPhoto = cardElement.getAttribute('data-driver-photo') || '';

    const evidenceFromCard = (cardElement.getAttribute('data-evidence-urls') || '')
                              .split('||').filter(Boolean);
    const allFromCard = (cardElement.getAttribute('data-all-urls') || '')
                              .split('||').filter(Boolean);

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

    // Descripción
    document.getElementById('detailDescription').textContent =
      currentReport.description || 'Sin descripción';

    // Info de la amonestación
    const penaltyType = currentReport.penaltyType || 'N/D';
    const penaltyStart = formatDateTimeForDisplay(currentReport.penaltyStart);
    const penaltyEnd = formatDateTimeForDisplay(currentReport.penaltyEnd);
    const penaltyObservation = currentReport.penaltyObservation || 'Sin observaciones';

    document.getElementById('detailPenaltyType').textContent = penaltyType;
    document.getElementById('detailPenaltyStart').textContent = penaltyStart;
    document.getElementById('detailPenaltyEnd').textContent = penaltyEnd;
    document.getElementById('detailPenaltyObservation').textContent = penaltyObservation;

    // Iniciar contador
    const modalId = `modal_${currentReport.id}_${Date.now()}`;
    startCountdown(penaltyType, currentReport.penaltyEnd, modalId);

    loadDetailStatusHistory();
    loadDetailEvidenceSlider();

    if (viewDetailsModal) {
      viewDetailsModal.style.zIndex = '1050';
      viewDetailsModal.style.pointerEvents = 'auto';
    }

    if ($ && typeof $().modal === 'function') {
      $(viewDetailsModal).modal({ backdrop: 'static', keyboard: false });
      $(viewDetailsModal).modal('show');
    }
  }

  function parseStatusHistory(historyData) {
    if (!historyData) return [];
    try { return JSON.parse(historyData); }
    catch { return []; }
  }

  function loadDetailStatusHistory() {
    const historyContainer = document.getElementById('detailStatusHistory');
    if (!historyContainer) return;
    historyContainer.innerHTML = '';
    const history = currentReport.statusHistory || [];
    if (history.length === 0) {
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
        </div>`;
      historyContainer.appendChild(item);
    });
  }

  async function addDetailThumb(thumb, url, index) {
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
          </div>`;
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
            </div>`;
        };
        thumb.appendChild(img);
      }
    } catch {
      thumb.innerHTML = `
        <div style="width:100%;height:100%;background:#f8f9fa;display:flex;align-items:center;justify-content:center;border:1px dashed #dee2e6;">
          <div style="text-align:center;color:#6c757d;">
            <i class="fas fa-exclamation-triangle" style="font-size:1rem;display:block;margin-bottom:2px;color:#ffc107;"></i>
            <span style="font-size:8px;">Error</span>
          </div>
        </div>`;
    }
  }

  async function loadDetailEvidenceSlider() {
    const slider = document.getElementById('detailEvidenceSlider');
    const counter = document.getElementById('detailEvidenceCount');
    const evidenceList = currentReport.evidenceUrls || [];

    counter.textContent = evidenceList.length > 0 ? `(${evidenceList.length})` : '';
    slider.innerHTML = '';

    if (evidenceList.length === 0) {
      slider.innerHTML = '<p class="text-muted small">Sin evidencias</p>';
      return;
    }

    for (let index = 0; index < evidenceList.length; index++) {
      const url = evidenceList[index];
      const thumb = document.createElement('div');
      thumb.className = 'evidence-thumbnail';

      await addDetailThumb(thumb, url, index);

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

  // Limpiar modal al cerrar
  if ($ && viewDetailsModal) {
    $(viewDetailsModal).on('hidden.bs.modal', function () {
      stopCountdown();
      currentReport = null;

      const slider = document.getElementById('detailEvidenceSlider');
      if (slider) slider.innerHTML = '';

      const counter = document.getElementById('detailEvidenceCount');
      if (counter) counter.textContent = '';

      const historyContainer = document.getElementById('detailStatusHistory');
      if (historyContainer) historyContainer.innerHTML = '';

      const countdownElement = document.getElementById('detailCountdown');
      if (countdownElement) {
        countdownElement.textContent = '';
        countdownElement.className = 'penalty-countdown';
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

  // Limpiar intervalos al salir
  window.addEventListener('beforeunload', function() {
    stopCountdown();
  });

  // Precarga de tipos
  window.addEventListener('load', function() {
    if (window.AlmapacUtils && window.AlmapacUtils.hideSpinner) {
      window.AlmapacUtils.hideSpinner();
    }
    const evidenceUrls = document.querySelectorAll('[data-evidence-urls]');
    evidenceUrls.forEach(el => {
      const urls = (el.getAttribute('data-evidence-urls') || '').split('||').filter(Boolean);
      urls.slice(0, 3).forEach(url => {
        getMediaType(url).catch(() => {});
      });
    });
  });

})();