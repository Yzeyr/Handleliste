/**
 * Offline: selve appen (HTML, CSS, JS, ikoner) lagres på telefonen, så den
 * åpner ved et vann uten dekning. Været lagrer appen selv i localStorage.
 *
 * Nett først, telefonen som reserve: en ny utgave vises med en gang den er
 * lagt ut, og uten nett får du den forrige.
 */
const CACHE = 'bitetid-v2';
const SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-512.png',
  './src/main.js',
  './src/astro.js',
  './src/score.js',
  './src/weather.js',
  './src/model.js',
  './src/species.js',
  './src/store.js',
  './src/ui.js',
  './src/map.js',
  './src/sky.js',
  './src/history.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // Bare appens egne filer, og skrift/Leaflet fra CDN. Værdata og kartfliser
  // går rett til nettet.
  const own = url.origin === self.location.origin;
  const cdn = url.hostname === 'cdnjs.cloudflare.com' || url.hostname.endsWith('gstatic.com') || url.hostname === 'fonts.googleapis.com';
  if (event.request.method !== 'GET' || (!own && !cdn)) return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(event.request).then((hit) => hit ?? caches.match('./index.html'))),
  );
});
