/**
 * Hvor Supabase-nøklene kommer fra.
 *
 * To kilder, i denne rekkefølgen: en .env ved bygging (vanlig dev-flyt), og
 * ellers localStorage på den enkelte telefonen. Det siste er poenget med
 * enkeltfil-utgaven: HTML-fila kan lastes opp før dere har et Supabase-
 * prosjekt, og nøklene limes inn i appen etterpå uten å bygge på nytt.
 *
 * Å lagre anon-nøkkelen i localStorage er ikke dårligere enn å bake den inn i
 * bundelen — den er offentlig uansett, se sikkerhetsavsnittet i README.
 */

const STORAGE_KEY = 'handleliste.supabase';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

const envConfig: SupabaseConfig | null = (() => {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return url && anonKey ? { url, anonKey } : null;
})();

export function loadConfig(): SupabaseConfig | null {
  if (envConfig !== null) return envConfig;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<SupabaseConfig>;
    if (typeof parsed.url !== 'string' || typeof parsed.anonKey !== 'string') return null;
    if (parsed.url === '' || parsed.anonKey === '') return null;
    return { url: parsed.url, anonKey: parsed.anonKey };
  } catch {
    // Privat modus eller blokkerte cookies: da er det bare å be om nøklene på nytt.
    return null;
  }
}

/** Om nøklene er låst ved bygging, og altså ikke kan endres i appen. */
export function isConfigFixed(): boolean {
  return envConfig !== null;
}

export function saveConfig(config: SupabaseConfig): void {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ url: config.url.trim().replace(/\/+$/, ''), anonKey: config.anonKey.trim() }),
  );
}

export function clearConfig(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// Deling mellom telefoner
//
// Å taste inn en anon-nøkkel for hånd på mobil er ikke aktuelt, så nøklene kan
// sendes som en lenke: den som allerede har satt opp appen kopierer en lenke
// med oppsettet i fragmentet, den andre åpner den, og appen lagrer det.
//
// Fragmentet (#...) sendes aldri til serveren, så nøkkelen havner ikke i noen
// tjenerlogg. Den ligger derimot i meldingen dere sender den i, og i
// nettleserhistorikken — men det er samme nøkkel som uansett ligger i
// nettverkstrafikken til appen, se sikkerhetsavsnittet i README.
// ---------------------------------------------------------------------------

const HASH_PARAM = 'k';

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  return atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
}

export function buildShareLink(config: SupabaseConfig): string {
  const payload = toBase64Url(JSON.stringify([config.url, config.anonKey]));
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#${HASH_PARAM}=${payload}`;
}

/**
 * Leser oppsett fra lenka appen ble åpnet med, lagrer det, og fjerner
 * fragmentet igjen så nøkkelen ikke blir stående i adressefeltet.
 * Returnerer om noe faktisk ble tatt i bruk.
 */
export function applyShareLink(): boolean {
  const match = new RegExp(`[#&]${HASH_PARAM}=([A-Za-z0-9_-]+)`).exec(window.location.hash);
  if (match === null || match[1] === undefined) return false;

  try {
    const parsed: unknown = JSON.parse(fromBase64Url(match[1]));
    if (!Array.isArray(parsed) || parsed.length !== 2) return false;
    const [url, anonKey] = parsed;
    if (typeof url !== 'string' || typeof anonKey !== 'string') return false;
    if (!/^https:\/\/[^\s/]+/.test(url) || anonKey === '') return false;
    saveConfig({ url, anonKey });
  } catch {
    return false;
  }

  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  return true;
}

// ---------------------------------------------------------------------------
// Hvem er dette, og hva har jeg sett?
// Begge deler er per telefon, ikke per konto — appen har ingen innlogging.
// ---------------------------------------------------------------------------

const NAME_KEY = 'handleliste.navn';
const SEEN_KEY = 'handleliste.sistSett';

export function deviceName(): string | null {
  try {
    const name = window.localStorage.getItem(NAME_KEY);
    return name === null || name.trim() === '' ? null : name.trim();
  } catch {
    return null;
  }
}

export function setDeviceName(name: string): void {
  try {
    const trimmed = name.trim();
    if (trimmed === '') window.localStorage.removeItem(NAME_KEY);
    else window.localStorage.setItem(NAME_KEY, trimmed);
  } catch {
    // Uten lagring blir endringene bare umerkede. Ikke verdt å feile på.
  }
}

/** Da appen sist var åpen her. Null første gang. */
export function lastSeenAt(): string | null {
  try {
    return window.localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}

export function markSeenNow(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, new Date().toISOString());
  } catch {
    // se over
  }
}
