/**
 * Ser etter nye utgaver av appen, og sier fra i stedet for å bytte selv.
 *
 * Service workeren installerer den nye utgaven i bakgrunnen og blir stående
 * og vente. Først når brukeren trykker «Last inn» får den ta over, og siden
 * lastes på nytt. Å bytte kode uten å spørre ville betydd at noen som står
 * midt i butikken plutselig ser noe annet enn det de gjorde for et sekund
 * siden.
 */

/**
 * Registreres uten versjon i URL-en, med vilje.
 *
 * Nettleseren oppdager en ny utgave ved å sammenligne innholdet i sw.js —
 * og byggeskriptet stempler byggets innholdssum inn i den fila, så den
 * endrer seg når koden gjør det. Å versjonere URL-en i tillegg lager en helt
 * ny registrering hver gang, og da dukker «Appen er oppdatert» opp på nytt
 * med en gang du har oppdatert.
 */
const SW_URL = 'sw.js';

/** Hvor ofte vi spør etter en ny utgave mens appen står åpen. */
const CHECK_INTERVAL_MS = 30 * 60 * 1000;

export interface UpdateWatcher {
  /** Kalles når en ny utgave står klar. */
  onAvailable: (install: () => void) => void;
}

export function watchForAppUpdate(watcher: UpdateWatcher): void {
  if (!('serviceWorker' in navigator)) return;
  if (!window.location.protocol.startsWith('http')) return;
  if (import.meta.env.DEV) return;

  // Ved aller første installasjon tar service workeren også over, og da fyrer
  // controllerchange uten at noe er oppdatert. Vi laster derfor bare når
  // brukeren faktisk har bedt om det — ikke basert på om det fantes en
  // kontroller da vi startet, for på første besøk er svaret alltid nei, og da
  // ville en ekte oppdatering senere i samme økt aldri fått lastet siden.
  let ventPåOmlasting = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!ventPåOmlasting) return;
    ventPåOmlasting = false;
    window.location.reload();
  });

  void navigator.serviceWorker
    .register(SW_URL)
    .then((registration) => {
      const offer = (worker: ServiceWorker | null): void => {
        if (worker === null) return;
        // Uten en kontroller er dette første installasjon, ikke en oppdatering.
        if (navigator.serviceWorker.controller === null) return;
        watcher.onAvailable(() => {
          ventPåOmlasting = true;
          worker.postMessage({ type: 'taOver' });
          // Skulle beskjeden gå tapt, laster vi likevel. Da kommer baren
          // eventuelt tilbake, og knappen kan trykkes på nytt — bedre enn en
          // knapp som ikke gjør noe.
          window.setTimeout(() => {
            if (ventPåOmlasting) window.location.reload();
          }, 3000);
        });
      };

      offer(registration.waiting);

      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (installing === null) return;
        installing.addEventListener('statechange', () => {
          if (installing.state === 'installed') offer(installing);
        });
      });

      // Appen kan bli liggende åpen i dagevis på en hjem-skjerm, så vi ser
      // etter nye utgaver når den kommer fram igjen, og med jevne mellomrom.
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) void registration.update();
      });
      window.setInterval(() => void registration.update(), CHECK_INTERVAL_MS);
    })
    .catch(() => undefined);
}
