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
const CACHE = 'handleliste-v1';
const SHELL = ['./', './index.html', './icon-180.png', './icon-512.png', './manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
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
