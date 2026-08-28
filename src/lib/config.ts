import { decodeShareLink, encodeShareConfig, SHARE_PARAM } from './shareLink.ts';

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

export { decodeShareLink } from './shareLink.ts';

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


export function buildShareLink(config: SupabaseConfig): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#${SHARE_PARAM}=${encodeShareConfig(config)}`;
}

/**
 * Leser oppsett fra lenka appen ble åpnet med, lagrer det, og fjerner
 * fragmentet igjen så nøkkelen ikke blir stående i adressefeltet.
 * Returnerer om noe faktisk ble tatt i bruk.
 */
export function applyShareLink(): boolean {
  return applyShareText(window.location.hash, true);
}

/** Samme, men fra tekst limt inn for hånd på oppsettsskjermen. */
export function applyShareText(text: string, stripHash = false): boolean {
  const config = decodeShareLink(text);
  if (config === null) return false;
  saveConfig(config);
  if (stripHash) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
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

// ---------------------------------------------------------------------------
// Varsler
// ---------------------------------------------------------------------------

const DEVICE_KEY = 'handleliste.telefonId';
const TOPIC_KEY = 'handleliste.varselkanal';

/** Fast id for denne telefonen, så den kjenner igjen sin egen varselkanal. */
export function deviceId(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_KEY);
    if (existing !== null && existing !== '') return existing;
    const fresh = crypto.randomUUID();
    window.localStorage.setItem(DEVICE_KEY, fresh);
    return fresh;
  } catch {
    // Uten lagring får telefonen ny id hver gang. Varsler virker fortsatt,
    // den kan i verste fall komme til å sende til seg selv.
    return crypto.randomUUID();
  }
}

export function pushTopic(): string | null {
  try {
    const topic = window.localStorage.getItem(TOPIC_KEY);
    return topic === null || topic === '' ? null : topic;
  } catch {
    return null;
  }
}

export function setPushTopic(topic: string | null): void {
  try {
    if (topic === null) window.localStorage.removeItem(TOPIC_KEY);
    else window.localStorage.setItem(TOPIC_KEY, topic);
  } catch {
    /* se over */
  }
}
