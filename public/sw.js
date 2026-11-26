// Service worker: shell offline + Web Push + clique na notificação
const CACHE = 'portaria-v2';
const SHELL = ['/', '/morador', '/seguranca', '/admin', '/css/app.css', '/js/ui.js', '/js/api.js', '/js/shell.js', '/js/history.js', '/js/login.js', '/js/morador.js', '/js/seguranca.js', '/js/admin.js', '/icons/icon.svg', '/icons/icon-192.png', '/manifest.webmanifest'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // network-first: dados sempre frescos, shell disponível offline
  e.respondWith(fetch(e.request).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return res; })
    .catch(() => caches.match(e.request).then((r) => r || caches.match('/'))));
});

self.addEventListener('push', (e) => {
  let data = {}; try { data = e.data.json(); } catch { data = { title: 'Portaria', body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(data.title || 'Portaria', { body: data.body || '', tag: data.tag, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url: data.url || '/' } }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if ('focus' in c) return c.focus();
    return self.clients.openWindow(target);
  }));
});
