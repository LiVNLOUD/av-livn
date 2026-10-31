// av.livn service worker. VERSION is stamped at build time (scripts/stamp-sw.mjs) from a hash of the
// built files, so every deploy installs a new worker that takes over at once (skipWaiting + claim).
// HTML: network-first (never stuck on an old page). Hashed /_astro/*: cache-first. API: network-first.
const VERSION = '__BUILD__';
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

function networkFirst(req, cacheName, fallbackKey) {
  return fetch(req, { cache: 'no-cache' })
    .then((res) => {
      if (res.ok) caches.open(cacheName).then((c) => c.put(fallbackKey || req, res.clone()));
      return res;
    })
    .catch(() => caches.match(fallbackKey || req));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/admin')) return;
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(networkFirst(req, API).then((r) => r || Response.json({ ok: false, error: 'offline' }, { status: 503 })));
    return;
  }
  if (req.mode === 'navigate') {
    // Spot pages differ only by ?id, so they share one cached shell.
    e.respondWith(networkFirst(req, SHELL, url.pathname === '/mera/' ? '/mera/' : undefined).then((r) => r || caches.match('/')));
    return;
  }
  if (url.pathname.startsWith('/_astro/')) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) caches.open(SHELL).then((c) => c.put(req, res.clone()));
        return res;
      })),
    );
  }
});

// D9 web push: payload {title, body, url, tag}. Tapping opens the spot card at that hour (or focuses a tab).
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(
    self.registration.showNotification(d.title || 'av.livn', {
      body: d.body || '',
      tag: d.tag || 'av-livn',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: d.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin);
  if (target.origin !== self.location.origin) return;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('navigate' in c) return c.focus().then(() => c.navigate(target.href));
      return self.clients.openWindow(target.href);
    }),
  );
});
