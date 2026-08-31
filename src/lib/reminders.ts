/**
 * «Husk før du går inn» — handlenett, pant, det du glemmer.
 *
 * Ligger på den ene telefonen, ikke i den delte basen. Om *du* har nettet med
 * er ikke noe samboeren skal se haket av; det er to forskjellige lommer.
 *
 * Vises bare når det står noe uhaket på lista. Har du ingenting å handle, skal
 * ingen linje minne deg på handlenett — og den regelen fjerner mesteparten av
 * støyen uten at appen trenger å gjette om du er på vei ut.
 *
 * Kvitteringen varer én dag. Du åpner appen mange ganger daglig; å bli minnet
 * på det samme etter at du har svart, er nettopp det som gjør at man slutter å
 * lese. Neste dag er den tilbake, uten at appen må forstå hva en handletur er.
 */
const LIST_KEY = 'handleliste.husk';
const DONE_KEY = 'handleliste.huskKvittert';

export const DEFAULT_REMINDERS = ['Handlenett'];

export function today(now: Date = new Date()): string {
  return now.toLocaleDateString('sv-SE'); // ÅÅÅÅ-MM-DD, lokal dato
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* full lagring: husk-lista er ikke verdt en feilmelding */
  }
}

export function loadReminders(): string[] {
  const stored = readJson<string[] | null>(LIST_KEY, null);
  if (stored === null) return [...DEFAULT_REMINDERS];
  return stored.filter((row): row is string => typeof row === 'string');
}

export function saveReminders(list: readonly string[]): void {
  writeJson(LIST_KEY, [...list]);
}

interface Acknowledged {
  date: string;
  names: string[];
}

export function loadAcknowledged(): Acknowledged {
  const stored = readJson<Acknowledged | null>(DONE_KEY, null);
  if (stored === null || typeof stored.date !== 'string' || !Array.isArray(stored.names)) {
    return { date: '', names: [] };
  }
  return stored;
}

/** Haker av én for i dag. En kvittering fra i går teller ikke. */
export function acknowledge(name: string, now: Date = new Date()): void {
  const stamp = today(now);
  const current = loadAcknowledged();
  const names = current.date === stamp ? current.names : [];
  if (!names.includes(name)) names.push(name);
  writeJson(DONE_KEY, { date: stamp, names });
}

/**
 * Hva som fortsatt skal vises. Ren funksjon, så regelen kan prøves uten en
 * nettleser og uten å vente på at klokka passerer midnatt.
 */
export function pendingReminders(
  reminders: readonly string[],
  acknowledged: Acknowledged,
  stamp: string,
): string[] {
  const done = acknowledged.date === stamp ? acknowledged.names : [];
  return reminders.filter((name) => name.trim() !== '' && !done.includes(name));
}
