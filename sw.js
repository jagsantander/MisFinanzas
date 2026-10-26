/* Service worker de MisFinanzas (página estática).
 * - Permite instalar la app y abrirla sin conexión (los datos están en el dispositivo).
 * - Guarda en caché solo archivos de la app; NUNCA respuestas de la planilla (datos financieros).
 * - No ejecuta tareas programadas: la actualización nocturna corre en tu cuenta de Google o de Claude. */
const CACHE = "mf-app-v2";
const BASE = new URL(self.registration.scope).pathname; // p. ej. /MisFinanzas/

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([BASE, BASE + "offline.html", BASE + "icons/icon-192.png"])).catch(() => {}));
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
  if (url.origin !== location.origin || !url.pathname.startsWith(BASE)) return;
  if (url.pathname.startsWith(BASE + "descargas/")) return; // descargas (APK): directo de la red, sin caché
  if (url.pathname.includes("/_next/static/") || url.pathname.includes("/icons/")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })));
    return;
  }
  if (req.mode === "navigate") {
    // Red primero; sin conexión, la última versión guardada de la página o la página sin conexión.
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then((hit) => hit || caches.match(BASE) || caches.match(BASE + "offline.html"))));
  }
});
