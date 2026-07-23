// Self-destroying service worker to clean up cached assets and unregister
const sw = self as any;

sw.addEventListener('install', () => {
  sw.skipWaiting();
});

sw.addEventListener('activate', (event: any) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => sw.registration.unregister())
      .then(() => sw.clients.matchAll())
      .then((clients: any[]) => {
        clients.forEach((client) => {
          if (client.navigate) {
            client.navigate(client.url);
          }
        });
      })
  );
});
