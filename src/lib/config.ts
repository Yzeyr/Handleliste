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
