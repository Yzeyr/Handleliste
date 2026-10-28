/**
 * Offline: selve appen (HTML, CSS, JS, ikoner) lagres på telefonen, så den
 * åpner ved et vann uten dekning. Været lagrer appen selv i localStorage.
 *
 * Nett først, telefonen som reserve: en ny utgave vises med en gang den er
 * lagt ut, og uten nett får du den forrige.
 */
const CACHE = 'bitetid-85190b6441';
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
  './src/gear.js',
  './src/tiles.js',
  './src/offlinemaps.js',
  './src/lakeinfo.js',
  './src/tips.js',
  './src/research.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      // Gamle utgaver av appen ryddes bort, men aldri kartene: de skal
      // overleve hver oppdatering.
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && !k.startsWith('bitetid-kart')).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/**
 * Kartbiter fra Kartverket: fra telefonen først, så nettet.
 *
 * «bitetid-kart» er områdene du har lagret med vilje. «bitetid-kart-sett»
 * er biter du bare har sett på; de tas vare på også, så kartet du nettopp
 * så på virker uten dekning, men den lista holdes under et tak så den ikke
 * vokser for alltid.
 */
const SEEN = 'bitetid-kart-sett';
const SEEN_MAX = 1500;

async function tile(request) {
  const saved = await caches.match(request.url, { cacheName: 'bitetid-kart' });
  if (saved) return saved;
  const seen = await caches.open(SEEN);
  const hit = await seen.match(request.url);
  if (hit) return hit;
  try {
    const res = await fetch(request.url, { mode: 'cors' });
    if (res.ok) {
      await seen.put(request.url, res.clone());
      const keys = await seen.keys();
      for (const old of keys.slice(0, Math.max(0, keys.length - SEEN_MAX))) await seen.delete(old);
    }
    return res;
  } catch {
    return new Response('', { status: 504, statusText: 'Uten nett' });
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.hostname === 'cache.kartverket.no' && event.request.method === 'GET') {
    event.respondWith(tile(event.request));
    return;
  }
  // Bare appens egne filer, og skrift/Leaflet fra CDN. Værdata og kartfliser
  // går rett til nettet.
  const own = url.origin === self.location.origin;
  const cdn = url.hostname === 'cdnjs.cloudflare.com' || url.hostname.endsWith('gstatic.com') || url.hostname === 'fonts.googleapis.com';
  if (event.request.method !== 'GET' || (!own && !cdn)) return;
  // Appens egne filer hentes med «no-cache»: nettleseren må spørre GitHub om
  // fila er endret, i stedet for å bruke sin egen kopi. GitHub ber nettlesere
  // beholde filer i 10 minutter, og uten dette fikk telefonene gammel kode
  // en stund etter hver oppdatering — også kode med feil som var rettet.
  const network = own && event.request.mode !== 'navigate'
    ? fetch(event.request.url, { cache: 'no-cache', credentials: 'same-origin' })
    : fetch(event.request, own ? { cache: 'no-cache' } : undefined);
  event.respondWith(
    network
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        }
        return res;
      })
      .catch(() =>
        caches
          .match(event.request, { ignoreSearch: true })
          .then((hit) => hit ?? caches.match('./index.html')),
      ),
  );
});
