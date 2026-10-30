// av.livn service worker (F1): app shell cache-first, API network-first with cached fallback.
// Offline spot cards and the catch log queue arrive in F4.
const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;
const API = `api-${VERSION}`;
const SHELL_URLS = ['/', '/mera/', '/manifest.webmanifest', '/favicon.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, API].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/admin')) return;
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) caches.open(API).then((c) => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => caches.match(e.request).then((r) => r || Response.json({ ok: false, error: 'offline' }, { status: 503 }))),
    );
    return;
  }
  e.respondWith(
    caches.match(e.request, { ignoreSearch: url.pathname === '/mera/' }).then(
      (hit) =>
        hit ||
        fetch(e.request).then((res) => {
          if (res.ok && (url.pathname.startsWith('/_astro/') || SHELL_URLS.includes(url.pathname)))
            caches.open(SHELL).then((c) => c.put(e.request, res.clone()));
          return res;
        }),
    ),
  );
});
