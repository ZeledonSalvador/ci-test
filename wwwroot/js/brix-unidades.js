/************************************************************* 
 * BRIX UNIDADES
 *************************************************************/

// Config
const MAX_SELECTION = 3;
const CACHE_DURATION = 30000;

// Estado
let brixInitialized = false;
let currentBrixData = null;
let selectedShipments = new Set();
let currentIngenioData = null;
let filteredCamiones = [];
let globalFloatingButton = null;
let lastDataLoad = 0;
let elements = {};
let currentView = 'ingenios'; // Track current view state
let isLoadingData = false; // Flag para prevenir consultas duplicadas
let dataWasModified = false; // Flag para saber si se registró brix

/* ========== Utils ========== */
function debounce(fn, delay = 300) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), delay);
  };
}

function getCamionId(camion){
  const shipmentId = camion?.shipment_id;
  if (shipmentId !== undefined && shipmentId !== null && !isNaN(shipmentId) && shipmentId > 0) {
    return parseInt(shipmentId, 10);
  }
  return null;
}

function getCardId(card){
  const id = card?.dataset?.shipmentId;
  return id ? parseInt(id, 10) : null;
}

function buildNoCacheUrl(url) {
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}_=${Date.now()}`;
}

async function fetchJSON(url, options = {}) {
  const resp = await fetch(buildNoCacheUrl(url), {
    method: options.method || 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'Pragma': 'no-cache',
      'Cache-Control': 'no-cache',
      ...(options.headers || {})
    },
    body: options.body || undefined
  });
  const txt = await resp.text();
  let json = {};
  try { json = txt ? JSON.parse(txt) : {}; } catch { json = {}; }
  if (!resp.ok) {
    const msg = json?.message || `HTTP ${resp.status}`;
    throw new Error(msg);
  }
  return json;
}

/* ========== Botón flotante ========== */
function createGlobalFloatingButton(){
  if (globalFloatingButton) return;
  
  globalFloatingButton = document.createElement('div');
  globalFloatingButton.id = 'brix-floating-global';
  globalFloatingButton.innerHTML = `
    <button class="btn-floating" id="btnFloatingAsignarGlobal">
      <i class="fas fa-flask"></i>
      <span class="floating-counter" id="floatingCounterGlobal">0</span>
    </button>
  `;
  
  document.body.appendChild(globalFloatingButton);
  
  const btn = globalFloatingButton.querySelector('#btnFloatingAsignarGlobal');
  if (btn) {
    btn.addEventListener('click', showBrixModal);
  }
}

function removeGlobalFloatingButton(){
  if (globalFloatingButton) {
    globalFloatingButton.remove();
    globalFloatingButton = null;
  }
}

/* ========== INIT SIN PARPADEO ========== */
async function initBrixUnidades(){
  console.log('Inicializando Brix Unidades sin parpadeo...');
  
  // Prevenir consultas duplicadas
  if (isLoadingData) {
    console.log('Ya se está cargando datos, evitando consulta duplicada');
    return;
  }

  // Verificar si los datos son recientes (menos de 30 segundos) Y no han sido modificados
  const now = Date.now();
  const dataAge = now - lastDataLoad;
  if (currentBrixData && dataAge < CACHE_DURATION && !dataWasModified) {
    console.log('Usando datos en cache (edad:', Math.floor(dataAge / 1000), 'segundos)');
    
    if (!brixInitialized) {
      cacheElements();
      createGlobalFloatingButton();
      bindBrixEvents();
      brixInitialized = true;
    }
    
    const ingenios = currentBrixData.ingenio || [];
    setupViewRespectingCurrentState(ingenios);
    return;
  }
  
  if (!brixInitialized) {
    cacheElements();
    createGlobalFloatingButton();
    bindBrixEvents();
    brixInitialized = true;
  }
  
  try {
    isLoadingData = true;
    console.log('Cargando datos en background...');
    const json = await fetchJSON('/TiemposMelaza/ObtenerDatosBrix');
    
    if (json?.success && json.data) {
      currentBrixData = json.data;
      lastDataLoad = now;
      dataWasModified = false; // Resetear flag después de cargar datos frescos
      const ingenios = currentBrixData.ingenio || [];
      
      // Preparar vista respetando el estado actual
      setupViewRespectingCurrentState(ingenios);
    } else {
      // Preparar vista vacía
      setupEmptyView();
    }
    
  } catch (error) {
    console.error('Error cargando datos:', error);
    setupErrorView(error.message);
  } finally {
    isLoadingData = false;
  }
  
  console.log('Brix Unidades inicializado correctamente');
}

function setupViewRespectingCurrentState(ingenios) {
  const wasInCamionesView = currentView === 'camiones';
  
  // Si estamos en vista de camiones, recargar los datos del ingenio actual
  if (wasInCamionesView && currentIngenioData) {
    // Recargar los datos del ingenio actual
    loadCamionesByIngenio(currentIngenioData.ingenioCode);
    return;
  }
  
  // Si no, mostrar vista de ingenios
  currentView = 'ingenios';
  elements.ingeniosView.classList.remove('hidden');
  elements.camionesView.classList.add('hidden');
  
  selectedShipments.clear();
  currentIngenioData = null;
  filteredCamiones = [];
  if (elements.searchInput) elements.searchInput.value = '';
  updateSelectionCount();
  updateAsignarButton();
  
  // Renderizar datos inmediatamente
  if (ingenios.length > 0) {
    renderIngeniosList(ingenios);
  } else {
    showIngeniosEmpty();
  }
}

function setupEmptyView() {
  currentView = 'ingenios';
  elements.ingeniosView.classList.remove('hidden');
  elements.camionesView.classList.add('hidden');
  showIngeniosEmpty();
}

function setupErrorView(message) {
  currentView = 'ingenios';
  elements.ingeniosView.classList.remove('hidden');
  elements.camionesView.classList.add('hidden');
  showIngeniosError(message);
}

function cacheElements(){
  elements = {
    ingeniosView: document.getElementById('brix-ingenios-view'),
    camionesView: document.getElementById('brix-camiones-view'),
    ingeniosContainer: document.getElementById('brixIngeniosContainer'),
    camionesContainer: document.getElementById('brixCamionesContainer'),
    ingeniosLoading: document.getElementById('brixIngeniosLoading'),
    camionesLoading: document.getElementById('brixCamionesLoading'),
    ingeniosEmpty: document.getElementById('brixIngeniosEmpty'),
    camionesEmpty: document.getElementById('brixCamionesEmpty'),
    ingeniosError: document.getElementById('brixIngeniosError'),
    camionesError: document.getElementById('brixCamionesError'),
    ingeniosErrorMessage: document.getElementById('brixIngeniosErrorMessage'),
    camionesErrorMessage: document.getElementById('brixCamionesErrorMessage'),
    btnBack: document.getElementById('btnBackToIngenios'),
    searchInput: document.getElementById('brixSearchInput'),
    btnAsignar: document.getElementById('btnAsignarBrix'),
    ingenioName: document.getElementById('brixIngenioName'),
    selectionCount: document.getElementById('brixSelectionCount'),
    ingenioTemplate: document.getElementById('brix-ingenio-template'),
    camionTemplate: document.getElementById('brix-camion-template')
  };
}

const debouncedFilter = debounce((term) => filterCamiones(term), 300);

function bindBrixEvents(){
  elements.btnBack?.addEventListener('click', handleBackToIngenios);
  elements.searchInput?.addEventListener('input', handleSearchInput);
  elements.btnAsignar?.addEventListener('click', showBrixModal);
  document.addEventListener('click', handleBrixCardClick);
}

function unbindBrixEvents(){
  elements.btnBack?.removeEventListener('click', handleBackToIngenios);
  elements.searchInput?.removeEventListener('input', handleSearchInput);
  elements.btnAsignar?.removeEventListener('click', showBrixModal);
  document.removeEventListener('click', handleBrixCardClick);
}

/* ========== Eventos ========== */
function handleBrixCardClick(e){
  const ingenioCard = e.target.closest('.brix-ingenio-card');
  if (ingenioCard){
    e.preventDefault();
    const code = ingenioCard.getAttribute('data-ingenio-code');
    const name = ingenioCard.getAttribute('data-ingenio-name');
    if (code && name) showCamionesView(code, name);
    return;
  }

  const camionCard = e.target.closest('.brix-camion-card');
  if (camionCard){
    if (camionCard.classList.contains('no-id')) {
      e.preventDefault();
      if (typeof Swal !== 'undefined' && Swal?.fire) {
        Swal.fire({
          title:'No seleccionable',
          text:'Este camión no tiene un ID válido y no puede ser seleccionado.',
          icon:'warning',
          confirmButtonText:'Aceptar',
          confirmButtonColor:'#0F2A62'
        });
      }
      return;
    }
    
    const cardId = getCardId(camionCard);
    const isCurrentlySelected = selectedShipments.has(cardId);
    
    if (!isCurrentlySelected && camionCard.classList.contains('disabled')) {
      return;
    }
    
    e.preventDefault();
    toggleCamionSelection(camionCard);
  }
}

function handleSearchInput(e){
  const term = (e.target.value || '').toLowerCase().trim();
  debouncedFilter(term);
}

function handleBackToIngenios(){
  // Si los datos fueron modificados, recargar desde el servidor
  if (dataWasModified) {
    reloadIngeniosView();
  } else {
    showIngeniosView();
  }
}

/* ========== Estados de UI ========== */
function showIngeniosLoading(){ 
  hideAllIngeniosStates(); 
  elements.ingeniosLoading.style.display='flex';
}

function showCamionesLoading(){ 
  hideAllCamionesStates(); 
  elements.camionesLoading.style.display='flex';
}

function showIngeniosContent(){ 
  hideAllIngeniosStates(); 
  elements.ingeniosContainer.style.display='block';
}

function showCamionesContent(){ 
  hideAllCamionesStates(); 
  elements.camionesContainer.style.display='block';
}

function showIngeniosEmpty(){
  hideAllIngeniosStates();
  elements.ingeniosEmpty.style.display='flex';
}

function showCamionesEmpty(){
  hideAllCamionesStates();
  elements.camionesEmpty.style.display='flex';
}

function showIngeniosError(msg){
  hideAllIngeniosStates();
  elements.ingeniosError.style.display='flex';
  elements.ingeniosErrorMessage.textContent = msg || 'Error';
}

function showCamionesError(msg){
  hideAllCamionesStates();
  elements.camionesError.style.display='flex';
  elements.camionesErrorMessage.textContent = msg || 'Error';
}

function hideAllIngeniosStates(){ 
  ['ingeniosLoading','ingeniosContainer','ingeniosEmpty','ingeniosError'].forEach(k=>elements[k].style.display='none'); 
}

function hideAllCamionesStates(){ 
  ['camionesLoading','camionesContainer','camionesEmpty','camionesError'].forEach(k=>elements[k].style.display='none'); 
}

/* ========== Renderizado y navegación ========== */
function renderIngeniosList(ingenios){
  const cont = elements.ingeniosContainer;
  cont.innerHTML = '';
  if(!ingenios?.length){ 
    showIngeniosEmpty(); 
    return; 
  }
  ingenios.forEach(ing => cont.appendChild(createIngenioCard(ing)));
  showIngeniosContent();
}

function createIngenioCard(ingenio){
  const t = elements.ingenioTemplate.content.cloneNode(true);
  const card = t.querySelector('.brix-ingenio-card');
  card.setAttribute('data-ingenio-code', ingenio.ingenioCode || '');
  card.setAttribute('data-ingenio-name', ingenio.name || '');
  t.querySelector('.brix-ingenio-name').textContent =
    `${(ingenio.name || '').replace('Ingenio_', '').replace(/_/g,' ')}`;
  t.querySelector('.brix-ingenio-units-number').textContent = ingenio.total || 0;
  return t;
}

// Función sincrónica para mostrar ingenios usando datos en cache
function showIngeniosView(){
  currentView = 'ingenios';
  elements.ingeniosView.classList.remove('hidden');
  elements.camionesView.classList.add('hidden');
  
  if (globalFloatingButton) {
    globalFloatingButton.classList.remove('show');
  }
  
  selectedShipments.clear();
  updateSelectionCount();
  updateAsignarButton();
  
  // Usar datos en cache si están disponibles
  if (currentBrixData) {
    const ingenios = currentBrixData.ingenio || [];
    if (ingenios.length > 0) {
      renderIngeniosList(ingenios);
    } else {
      showIngeniosEmpty();
    }
  } else {
    showIngeniosEmpty();
  }
}

// Nueva función para forzar recarga de datos de ingenios
async function reloadIngeniosView(){
  if (isLoadingData) {
    console.log('Ya se están cargando datos, evitando consulta duplicada');
    return;
  }

  currentView = 'ingenios';
  elements.ingeniosView.classList.remove('hidden');
  elements.camionesView.classList.add('hidden');
  
  if (globalFloatingButton) {
    globalFloatingButton.classList.remove('show');
  }
  
  selectedShipments.clear();
  updateSelectionCount();
  updateAsignarButton();

  try {
    isLoadingData = true;
    showIngeniosLoading();
    const json = await fetchJSON('/TiemposMelaza/ObtenerDatosBrix');
    
    if (json?.success && json.data) {
      currentBrixData = json.data;
      lastDataLoad = Date.now();
      dataWasModified = false; // Resetear flag después de cargar datos frescos
      const ingenios = currentBrixData.ingenio || [];
      
      if (ingenios.length > 0) {
        renderIngeniosList(ingenios);
      } else {
        showIngeniosEmpty();
      }
    } else {
      showIngeniosEmpty();
    }
  } catch (error) {
    console.error('Error recargando ingenios:', error);
    showIngeniosError('Error al cargar los ingenios: ' + error.message);
  } finally {
    isLoadingData = false;
  }
}

function showCamionesView(code, name){
  currentView = 'camiones';
  elements.ingeniosView.classList.add('hidden');
  elements.camionesView.classList.remove('hidden');
  elements.ingenioName.textContent = 'Ingenio ' + (name || '').replace('Ingenio_','').replace(/_/g,' ');
  selectedShipments.clear();
  updateAsignarButton();
  updateSelectionCount();

  loadCamionesByIngenio(code);
}

async function loadCamionesByIngenio(ingenioCode){
  try{
    showCamionesLoading();
    const url = `/TiemposMelaza/ObtenerDatosBrix?ingenio=${encodeURIComponent(ingenioCode)}`;
    const json = await fetchJSON(url);
    
    if(json?.success && json.data){
      const ing = json.data.ingenio?.find(i=>i.ingenioCode===ingenioCode);
      if(!ing) throw new Error('Ingenio no encontrado');
      currentIngenioData = ing;
      filteredCamiones = [...ing.data];
      renderCamionesList(filteredCamiones);
    }else{
      showCamionesEmpty();
    }
  }catch(err){
    showCamionesError('Error al cargar los camiones: ' + err.message);
  }
}

function renderCamionesList(camiones){
  const cont = elements.camionesContainer;
  cont.innerHTML = '';
  if(!camiones?.length){ 
    showCamionesEmpty(); 
    updateSelectionCount(); 
    return; 
  }
  camiones.forEach(c => cont.appendChild(createCamionCard(c)));
  showCamionesContent();
  updateSelectionCount();
  updateAsignarButton();
  updateCardStates();
  updateFloatingButton();
}

function createCamionCard(camion){
  const t = elements.camionTemplate.content.cloneNode(true);
  const card = t.querySelector('.brix-camion-card');
  const id = getCamionId(camion);
  
  if (!id) {
    card.classList.add('disabled', 'no-id');
    card.dataset.shipmentId = '';
    card.style.opacity = '0.6';
    card.style.cursor = 'not-allowed';
  } else {
    card.dataset.shipmentId = String(id);
    const isSelected = selectedShipments.has(id);
    const isDisabled = !isSelected && selectedShipments.size >= MAX_SELECTION;
    if(isSelected) card.classList.add('selected');
    if(isDisabled) card.classList.add('disabled');
  }

  const plateText = `Placa Remolque: ${camion?.trailerPlate || camion?.plate || 'N/A'}`;
  const plateElement = t.querySelector('.brix-camion-plate');
  plateElement.textContent = !id ? `${plateText} (Sin ID)` : plateText;

  const fecha = camion?.dateTimeDownload
    ? new Date(camion.dateTimeDownload).toLocaleString('es-ES',{
        day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'
      })
    : 'N/A';
  const dateEl = t.querySelector('.brix-camion-date');
  dateEl.textContent = `Fecha Descarga: ${fecha}`;
  return t;
}

/* ========== Funciones de selección ========== */
function toggleCamionSelection(card){
  const id = getCardId(card);
  if (!id || card.classList.contains('no-id')) return;

  if (selectedShipments.has(id)){
    selectedShipments.delete(id);
    card.classList.remove('selected');
  }else{
    if (selectedShipments.size >= MAX_SELECTION){
      if (typeof Swal !== 'undefined' && Swal?.fire) {
        Swal.fire({
          title:'Límite alcanzado',
          text:`Solo puedes seleccionar un máximo de ${MAX_SELECTION} camiones.`,
          icon:'warning',
          confirmButtonText:'Aceptar',
          confirmButtonColor:'#0F2A62'
        });
      }
      return;
    }
    selectedShipments.add(id);
    card.classList.add('selected');
  }
  updateSelectionCount();
  updateAsignarButton();
  updateCardStates();
  updateFloatingButton();
}

function updateSelectionCount(){
  if(!elements.selectionCount) return;
  elements.selectionCount.textContent = `(${selectedShipments.size}/${MAX_SELECTION})`;
}

function updateAsignarButton(){
  if(elements.btnAsignar) {
    elements.btnAsignar.disabled = selectedShipments.size === 0;
  }
}

function updateFloatingButton(){
  if (!globalFloatingButton) return;
  
  const hasSelections = selectedShipments.size > 0;
  const isInCamionesView = currentView === 'camiones';
  const counter = globalFloatingButton.querySelector('#floatingCounterGlobal');
  
  if (hasSelections && isInCamionesView) {
    globalFloatingButton.classList.add('show');
    if (counter) counter.textContent = selectedShipments.size;
  } else {
    globalFloatingButton.classList.remove('show');
  }
}

function updateCardStates(){
  document.querySelectorAll('.brix-camion-card').forEach(card=>{
    const id = getCardId(card);
    if (card.classList.contains('no-id')) return;
    
    const isSelected = selectedShipments.has(id);
    const shouldDisable = !isSelected && selectedShipments.size >= MAX_SELECTION;
    
    card.classList.remove('disabled');
    if (shouldDisable) card.classList.add('disabled');
    if (isSelected) card.classList.remove('disabled');
  });
}

function filterCamiones(term){
  if(!currentIngenioData) return;
  if(!term){
    filteredCamiones = [...currentIngenioData.data];
  }else{
    filteredCamiones = currentIngenioData.data.filter(c=>{
      const p1 = (c.plate || '').toLowerCase();
      const p2 = (c.trailerPlate || '').toLowerCase();
      return p1.includes(term) || p2.includes(term);
    });
  }
  renderCamionesList(filteredCamiones);
}

/* ========== Función para refrescar después del registro de Brix ========== */
async function refreshAfterBrixRegistration() {
  try {
    // Marcar que los datos fueron modificados
    dataWasModified = true;
    
    // Limpiar selecciones
    selectedShipments.clear();
    updateSelectionCount();
    updateAsignarButton();
    updateFloatingButton();
    
    if (currentView === 'camiones' && currentIngenioData) {
      // Recargar los camiones del ingenio actual
      await loadCamionesByIngenio(currentIngenioData.ingenioCode);
    } else {
      // Recargar la vista de ingenios con datos frescos
      await reloadIngeniosView();
    }
  } catch (error) {
    console.error('Error refreshing after brix registration:', error);
  }
}

/* ========== Modal de Brix ========== */
async function showBrixModal(){
  // Validar que se hayan seleccionado exactamente 3 unidades
  if(selectedShipments.size !== MAX_SELECTION){
    if (typeof Swal !== 'undefined' && Swal?.fire) {
      Swal.fire({
        title:`Debes seleccionar ${MAX_SELECTION} unidades para asignar brix`,
        confirmButtonText:'Aceptar',
        confirmButtonColor:'#0F2A62'
      });
    }
    return;
  }

  const first = await Swal.fire({
    title:'Registro de Brix',
    html:'<p style="font-size:18px;font-weight:600; text-align:center;">Ingrese el valor de brix:</p>',
    input:'number',
    inputAttributes:{min:'0',step:'0.1',inputmode:'decimal',placeholder:'Ejemplo: 38.4'},
    confirmButtonText:'Confirmar',
    confirmButtonColor:'#0F2A62',
    showCancelButton:true,
    cancelButtonText:'Cancelar',
    cancelButtonColor:'#d33'
  });
  if(!first.isConfirmed) return;

  const brix = parseFloat(String(first.value));
  if(isNaN(brix) || brix < 0){
    await Swal.fire({
      title:'Valor inválido',
      text:'El valor de Brix debe ser mayor o igual a 0',
      icon:'error',
      confirmButtonText:'Aceptar',
      confirmButtonColor:'#0F2A62'
    });
    return;
  }

  const shipmentIds = Array.from(selectedShipments);
  const ok = await Swal.fire({
    title:'Confirmación',
    html:`<p style="font-size:18px;font-weight:600;margin-bottom:16px;">¿Desea registrar el valor de brix para los camiones seleccionados?</p>
          <div style="font-size:32px;font-weight:800;color:#28a745;">${brix}</div>`,
    showCancelButton:true,
    confirmButtonText:'Confirmar',
    cancelButtonText:'Cancelar',
    confirmButtonColor:'#0F2A62',
    cancelButtonColor:'#d33'
  }).then(r=>r.isConfirmed);

  if(!ok) return;

  try{
    await registrarBrix(brix, shipmentIds);
    await Swal.fire({
      title:'Brix registrado',
      html:`<p style="font-size:18px;font-weight:600;margin-bottom:12px;">El valor de Brix ha sido registrado exitosamente</p>
            <div style="font-size:24px;font-weight:800;color:#28a745;">${brix}</div>`,
      confirmButtonText:'Aceptar',
      confirmButtonColor:'#0F2A62'
    });

    // Refrescar la interfaz después del registro exitoso
    await refreshAfterBrixRegistration();
  }catch(err){
    Swal.fire({
      title:'Error',
      text:'No se pudo registrar el valor de Brix. Intente nuevamente.',
      icon:'error',
      confirmButtonText:'Aceptar',
      confirmButtonColor:'#0F2A62'
    });
  }
}

async function registrarBrix(brix, shipments){
  const payload = { brix, shipments };
  const json = await fetchJSON('/TiemposMelaza/RegistrarBrix', {
    method:'POST',
    body: JSON.stringify(payload)
  });
  if(json.success === false) throw new Error(json.message || 'Error al registrar Brix');
  return json;
}

/* ========== Event Listeners ========== */
document.addEventListener('menuNavigation', (event) => {
  const { from, to } = event.detail;
  if (to === 'brix-unidades') {
    console.log('🎯 Evento de navegación recibido:', { from, to });
    initBrixUnidades();
  }
});

/* ========== Auto-init ========== */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('component-brix-unidades')?.classList.contains('active')) {
      initBrixUnidades();
    }
  });
} else {
  if (document.getElementById('component-brix-unidades')?.classList.contains('active')) {
    initBrixUnidades();
  }
}

console.log('Módulo Brix Unidades cargado');