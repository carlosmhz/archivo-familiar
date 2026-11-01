const CACHE_NAME = 'archivo-familiar-v5';

// Instalar — sin bloquear en errores de caché
self.addEventListener('install', e => {
  self.skipWaiting();
});

// Activar — limpiar caches antiguos
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network first, cache fallback para assets estáticos
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);

  // API calls — siempre red, nunca cache
  if (url.pathname.includes('api.php')) return;

  // Vídeos (stream.php, MP4 y HLS) — nunca cachear
  if (url.pathname.includes('stream.php') || /\.(mp4|m3u8|ts)$/i.test(url.pathname)) return;

  // Resto — network first con fallback a cache
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
