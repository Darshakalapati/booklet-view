// A small service worker so the site can be installed on a phone's home screen.
//
// It keeps a copy of the app shell so the site opens quickly, and always asks
// the server first for pages and data, falling back to the copy only when the
// network is unavailable. The API is never cached: tables must be fresh.
const CACHE = 'booklet-shell-v1';
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin/')) return;

  if (request.mode === 'navigate') {
    // A page of the app: the server first, the cached shell when offline.
    event.respondWith(fetch(request).catch(() => caches.match('/')));
    return;
  }
  // Scripts, styles, fonts and icons: cached copy first, then the network.
  event.respondWith(
    caches.match(request).then((cached) => {
      const fresh = fetch(request).then((response) => {
        if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
        return response;
      });
      return cached || fresh;
    })
  );
});
