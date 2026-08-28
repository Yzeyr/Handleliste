/**
 * Koding og lesing av delingslenka.
 *
 * Egen fil fordi den er ren: ingen window, ingen import.meta.env, og dermed
 * mulig å teste utenfor nettleseren. Det er her det er lett å ta feil — en
 * lenke som har vært innom en meldingsapp kan være avkortet, ha fått
 * mellomrom rundt seg, eller mangle fragmentet helt.
 */

export interface ShareConfig {
  url: string;
  anonKey: string;
}

export const SHARE_PARAM = 'k';

function toBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  return atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
}

export function encodeShareConfig(config: ShareConfig): string {
  return toBase64Url(JSON.stringify([config.url, config.anonKey]));
}

/**
 * Tar imot hele lenka, bare fragmentet, eller teksten limt inn fra en melding.
 * Returnerer null på alt som ikke er et gyldig oppsett — det skal føre til
 * oppsettsskjermen, ikke til en app som later som den er koblet til.
 */
export function decodeShareLink(text: string): ShareConfig | null {
  const match = new RegExp(`[#&?]${SHARE_PARAM}=([A-Za-z0-9_-]+)`).exec(text.trim());
  if (match === null || match[1] === undefined) return null;

  try {
    const parsed: unknown = JSON.parse(fromBase64Url(match[1]));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [url, anonKey] = parsed;
    if (typeof url !== 'string' || typeof anonKey !== 'string') return null;
    if (!/^https:\/\/[^\s/]+/.test(url) || anonKey.trim() === '') return null;
    return { url, anonKey };
  } catch {
    return null;
  }
}
