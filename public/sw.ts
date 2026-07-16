const sw = self as any;

const CACHE_NAME = 'televault-cache-v7';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/favicon.ico'
];

sw.addEventListener('install', (event: any) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  sw.skipWaiting();
});

sw.addEventListener('activate', (event: any) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Service Worker] Deleting old cache:', cache);
            return caches.delete(cache);
          }
        })
      );
    })
  );
  sw.clients.claim();
});

sw.addEventListener('fetch', (event: any) => {
  const requestUrl = new URL(event.request.url);

  // Do not intercept or cache any API endpoints
  if (requestUrl.pathname.startsWith('/api/')) {
    return;
  }

  // Do not intercept external database and Telegram API requests (bypasses CORS blocks)
  if (
    requestUrl.hostname === 'api.telegram.org' ||
    requestUrl.hostname.includes('supabase.co')
  ) {
    return;
  }

  if (event.request.method !== 'GET') return;

  const request = event.request;
  const url = requestUrl;

  // Only handle requests to our own origin
  if (url.origin !== sw.location.origin) return;

  // For HTML navigation requests, implement a network-first strategy falling back to cached index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => {
          return caches.match('/index.html').then((cached) => cached || Response.error());
        })
    );
    return;
  }

  // Cache-first strategy for versioned expo bundles (e.g. assets containing hashes)
  const isVersionedAsset = url.pathname.includes('/_expo/static/') || url.pathname.match(/\.[a-f0-9]{8,32}\./);

  if (isVersionedAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      })
    );
    return;
  }

  // Stale-While-Revalidate strategy for other static assets
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return networkResponse;
      }).catch(() => {
        return null;
      });

      return cachedResponse || fetchPromise.then((res) => res || Response.error());
    })
  );
});
