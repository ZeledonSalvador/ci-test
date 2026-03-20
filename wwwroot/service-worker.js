/**
 * Service Worker:
 * Caché de app shell estático (online-first estricto)
 *
 * Estrategia: cache-first SOLO para recursos estáticos del propio origen.
 * Librerías externas (Bootstrap, jQuery, Chart.js, etc.) se sirven por CDN —
 * el navegador las gestiona con su caché HTTP nativo, el SW no interviene.
 * Navegación MVC, sesión, API siempre van a la red.
 * Sin offline fallback. Sin caché de datos de las graficas.
 */

const CACHE_NAME = 'static-shell-v9';
// Lista explícita de recursos locales a precargar.
// Solo archivos del propio origen (wwwroot/). Las librerías externas se cargan por CDN
// y el navegador las gestiona con su caché HTTP nativo — no se precachean aquí.
// Cada que modifico el contenido del PRECACHE_URLS también actualizo el CACHE_NAME.
// Para cuando escribi este comentario el CACHE_NAME estaba en v9

const PRECACHE_URLS = [
  // Manifest excluido intencionalmente del precaché, porque si este se queda en caché
  // el SW nunca debe cachear el manifest para que el navegador
  // siempre lea display_override y theme_color actualizados.

  '/favicon.ico',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-192-maskable.png',
  '/icons/icon-512-maskable.png',

  // CSS locales
  '/css/site.css',
  '/css/dashboard.css',
  '/css/login.css',

  // JS locales
  '/js/site.js',
  '/js/dash-core.js',
  '/js/dashboard.js',
  '/js/dash-historico.js',
  '/js/dash-historico-diario-horas.js',
  '/js/dash-historico-pesos.js',
  '/js/dash-hoy-horas.js',
  '/js/dash-placas.js',
  '/js/permission-helper.js',

  // Assets — imágenes y logos
  '/assets/almapac.png',
  '/assets/almapac-logo.png',
  '/assets/Quickpass.png',
  '/assets/fondo-login.webp',
];

//Extensiones estáticas elegibles para cache-first 
const STATIC_EXTENSIONS = new Set([
  '.css', '.js',
  '.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico',
  '.woff', '.woff2', '.ttf'
]);

/**
 * Determina si una request debe ser atendida con cache-first.
 * Reglas de exclusión explícitas:
 *   - origen distinto (CDNs, APIs externas)
 *   - el propio service-worker.js
 *   - navegación MVC (mode === 'navigate')
 *   - métodos distintos de GET
 *   - sin extensión estática reconocida
 */

function shouldServeFromCache(request) {
  if (request.method !== 'GET') return false;
  if (request.mode === 'navigate') return false;

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return false;
  if (url.pathname === '/service-worker.js') return false;
  if (url.pathname === '/manifest.webmanifest') return false;

  const lastDot = url.pathname.lastIndexOf('.');
  if (lastDot === -1) return false;
  const ext = url.pathname.slice(lastDot);

  return STATIC_EXTENSIONS.has(ext);
}

//Install 
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

//Activate
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

//Fetch — cache-first para estáticos locales
self.addEventListener('fetch', (event) => {
  if (!shouldServeFromCache(event.request)) {
    // Navegación MVC, API, CDNs y todo lo demás: red directa sin intervención
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      // No estaba en caché (ej. archivo añadido después del install):
      // fetch en red y guarda para la próxima
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      });
    })
  );
});