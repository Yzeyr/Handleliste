/**
 * Service worker: gjør at selve appen laster uten nett.
 *
 * Dataene ligger i localStorage og håndteres av offlineStore.ts — denne
 * fila handler bare om at HTML-en, ikonet og manifestet finnes på telefonen.
 *
 * Strategi: nett først, med telefonen som reserve. Motsatt vei (cache først)
 * ville gjort at en ny utgave av appen ikke dukket opp før andre gang du
 * åpnet den, og det er en forvirrende måte å oppdatere på.
 */
// Byttes ut av scripts/build-single.mjs med innholdssummen til bygget.
// Uten det ville denne fila vært identisk fra bygg til bygg, og nettleseren
// ville aldri sett at det finnes en ny utgave å installere.
const BUILD = 'DzMltT0y';
const CACHE = `handleliste-${BUILD}`;
const SHELL = ['./', './index.html', './icon-180.png', './icon-512.png', './manifest.webmanifest'];

self.addEventListener('install', (event) => {
  // Ingen skipWaiting her med vilje: den nye utgaven skal stå og vente til
  // brukeren sier fra. Å bytte kode under føttene på noen som står midt i
  // butikken er ikke en oppdatering, det er et avbrudd.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

// Appen sier fra når brukeren har trykket «Last inn».
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'taOver') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Bare appens egne filer. Kall til Supabase skal aldri serveres fra cache —
  // en gammel handleliste er verre enn en feilmelding.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached !== undefined) return cached;
        // Dyplenke uten treff: gi appen, den finner ut av resten selv.
        const shell = await caches.match('./index.html');
        if (shell !== undefined) return shell;
        return new Response('Uten nett', { status: 503, statusText: 'Uten nett' });
      }),
  );
});
