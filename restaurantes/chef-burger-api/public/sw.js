/* Service worker da receção: cache do quadro + Web Push. */
const CACHE = "cb-rececao-v11";
const PRECACHE = [
  "/recepcao/recepcao.css",
  "/recepcao/icon.svg",
  "/recepcao/icon-192.png",
  "/recepcao/icon-512.png",
  "/recepcao/manifest.webmanifest",
  "/recepcao/fonts/archivo-latin.woff2",
];

function isShell(url) {
  const p = url.pathname;
  return (
    /\/recepcao\/?$/.test(p) ||
    p.endsWith("/recepcao.html") ||
    p.endsWith("/recepcao.js") ||
    p.endsWith("/sw.js") ||
    p.endsWith("/config.js")
  );
}

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()).catch(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) return;
  const fresh = isShell(url);
  e.respondWith((async () => {
    try {
      const net = await fetch(e.request, fresh ? { cache: "no-store" } : undefined);
      if (net.ok && url.pathname.startsWith("/recepcao") && !fresh) {
        const copy = net.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      }
      return net;
    } catch (err) {
      const hit = await caches.match(e.request);
      if (hit) return hit;
      if (url.pathname.startsWith("/recepcao")) {
        const fallback = await caches.match("/recepcao/");
        if (fallback) return fallback;
      }
      throw err;
    }
  })());
});

self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) {
    try { data = { body: e.data && e.data.text() }; } catch (e2) { data = {}; }
  }
  const title = data.title || "Novo pedido · Chef Burger";
  e.waitUntil(self.registration.showNotification(title, {
    body: data.body || "Há um pedido novo na receção.",
    icon: "/recepcao/icon-192.png",
    badge: "/recepcao/icon-192.png",
    tag: data.tag || "cb-pedido",
    data: { url: data.url || "/recepcao/" },
    vibrate: [80, 40, 80],
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = (e.notification.data && e.notification.data.url) || "/recepcao/";
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of list) {
      if (c.url.includes("/recepcao") && "focus" in c) {
        await c.focus();
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
