const CACHE = 'mansion-abi-v2';
const STATIC = ['/manifest.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(STATIC).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Skip: non-GET, API calls, HTML navigation (let Next.js handle these fresh)
  if (e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;
  if (e.request.headers.get('accept')?.includes('text/html')) return;

  // Cache-first for static assets (_next/static, images, manifest)
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request).then((res) => {
        if (res.ok) {
          caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
        }
        return res;
      });
      return cached ?? network;
    })
  );
});
