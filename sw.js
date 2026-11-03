// Service worker: precache del shell y cache-first. Sube VERSION al cambiar cualquier archivo.
const VERSION = 'muestras-campo-v5';
const SHELL = [
  './', 'index.html', 'app.js', 'nucleo.js', 'lista.js', 'estilos.css', 'manifest.webmanifest',
  'icono-192.png', 'icono-512.png', 'icono-maskable-512.png', 'apple-touch-icon.png',
  'vendor/leaflet.js', 'vendor/leaflet.css', 'vendor/xlsx.full.min.js',
  'vendor/images/layers.png', 'vendor/images/layers-2x.png', 'vendor/images/marker-icon.png',
  'vendor/images/marker-icon-2x.png', 'vendor/images/marker-shadow.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return; // teselas: red directa
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).catch(() =>
      req.mode === 'navigate' ? caches.match('index.html') : Response.error()))
  );
});
