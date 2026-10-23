/* Service worker de MisFinanzas.
 * - Instalación como PWA y página sin conexión.
 * - NO guarda en caché respuestas de la API (datos financieros) ni páginas autenticadas.
 * - Recibe notificaciones push (el contenido ya viene sin datos sensibles si el usuario lo eligió).
 * - No ejecuta tareas programadas: la actualización nocturna corre en el servidor. */
const CACHE = "mf-static-v1";
const OFFLINE = "/offline.html";

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, "/icons/icon-192.png"])));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })));
    return;
  }
  if (req.mode === "navigate") e.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
});
self.addEventListener("push", (e) => {
  let data = { title: "MisFinanzas", body: "Tienes un aviso nuevo", url: "/notificaciones" };
  try { data = { ...data, ...e.data.json() }; } catch {}
  e.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url: data.url } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  // Solo se abren rutas del propio sitio, aunque el aviso traiga otra URL.
  let url = "/";
  try { const u = new URL(e.notification.data?.url || "/", self.location.origin); if (u.origin === self.location.origin) url = u.pathname + u.search; } catch {}
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((list) => {
    for (const c of list) if ("focus" in c) { c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
