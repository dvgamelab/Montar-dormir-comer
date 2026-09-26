// Service worker: app sin conexión + datos con «red primero».
const V = "mdc-v1";
const SHELL = ["./", "index.html", "app.css", "vendor-leaflet.css", "app.js", "manifest.webmanifest", "icon.svg", "logo-mark.svg", "icon-192.png", "icon-512.png", "data/spain.geo.json", "data/municipios.json", "fonts/fonts.css", "fonts/SairaCondensed-700.woff2", "fonts/SairaCondensed-800.woff2", "fonts/Manrope.woff2"];
self.addEventListener("install", e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  const netFirst = u.pathname.endsWith("rides.json") || u.pathname.endsWith(".js") || u.pathname.endsWith(".css") || e.request.mode === "navigate";
  e.respondWith(netFirst
    ? fetch(e.request).then(r => { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true }))
    : caches.match(e.request).then(m => m || fetch(e.request).then(r => { if (r.ok && u.pathname.includes("/tracks/")) { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); } return r; })));
});
