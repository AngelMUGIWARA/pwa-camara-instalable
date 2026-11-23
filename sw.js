/* =========================================================================
   PWA Inspección Visual — sw.js (Service Worker)
   Estrategia: Cache First (App Shell) con rutas relativas (./)
   para funcionar en el subdirectorio de GitHub Pages.
   100% Vanilla JS — asincronía solo con .then() / .catch().
   ========================================================================= */

const CACHE_NAME = 'static-camara-v2';

const STATIC_FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

/* INSTALAR: precachear el App Shell completo */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_FILES))
      .then(() => self.skipWaiting())
      .catch((error) => {
        console.error('[SW] Falló el precacheo:', error);
        throw error;
      })
  );
});

/* ACTIVAR: eliminar cachés de versiones anteriores */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((nombres) =>
        Promise.all(
          nombres
            .filter((nombre) => nombre !== CACHE_NAME)
            .map((nombre) => caches.delete(nombre))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* FETCH: Cache First con respaldo en red y en caché */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((respuestaCache) => {
      if (respuestaCache) {
        return respuestaCache;
      }

      return fetch(event.request)
        .then((respuestaRed) => {
          // Guardar en caché los recursos nuevos solicitados por la red
          if (respuestaRed && respuestaRed.ok) {
            const copia = respuestaRed.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, copia))
              .catch(() => undefined);
          }
          return respuestaRed;
        })
        .catch(() => {
          // Sin conexión: las navegaciones caen al App Shell precacheado
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
          return new Response('Recurso no disponible sin conexión', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        });
    })
  );
});
