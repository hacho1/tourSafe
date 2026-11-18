// Static shell only. Timestamped API snapshots are managed explicitly by offline.ts.
const CACHE = 'toursafe-shell-v18';
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const response = await fetch('/offline-assets.json', { cache: 'reload' });
    if (!response.ok) throw new Error('Offline asset manifest unavailable');
    const assets = await response.json();
    if (!Array.isArray(assets) || !assets.length || assets.some(path => typeof path !== 'string' || !path.startsWith('/assets/'))) throw new Error('Invalid offline manifest');
    // Lazy chunks must be available on a cold offline start, too.
    await cache.addAll(['/', '/icon.svg', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest', ...assets]);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', (event) => {
  // Only delete old shells. Keep personal offline packs across app upgrades.
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('toursafe-shell-') && key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/__offline/') || event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(async () => (await (await caches.open(CACHE)).match('/')) || Response.error()));
  } else if (url.pathname.startsWith('/assets/') || ['/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png'].includes(url.pathname)) {
    event.respondWith((async () => (await (await caches.open(CACHE)).match(event.request)) || fetch(event.request))());
  }
});
