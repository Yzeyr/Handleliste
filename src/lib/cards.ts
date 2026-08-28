/**
 * Medlemskort: bildene av kodene du viser i kassa.
 *
 * Lagres bare på denne telefonen, aldri i den delte basen. Et medlemsnummer
 * er ikke en handleliste — det hører til én person, og en delt tabell med
 * anon-tilgang er feil sted for det. Prisen er at hver telefon legger inn
 * sine egne, og det er riktig pris.
 *
 * Bildet, ikke nummeret: appen tegner ikke strekkoden selv, fordi hvilken
 * kodetype hver kjede forventer ikke er noe vi kan slå fast — og en kode som
 * er gjettet feil oppdager du først i kassa. Et skjermbilde fra kjedens egen
 * app er nøyaktig det som virket sist.
 */
const KEY = 'handleliste.kort';

/** localStorage tar rundt 5 MB i alt. Ett kort skal ikke spise det opp. */
export const MAX_CARD_BYTES = 900_000;
/** Nok til at en strekkode leses av en kasse, uten å lagre en hel skjermdump. */
export const MAX_IMAGE_SIDE = 1400;

export interface Card {
  id: string;
  name: string;
  /** data:-URL. Bildet er hele poenget; nummeret er en reserve. */
  image: string;
  /** Skrives med store tall under bildet, for kasser som taster det inn. */
  number: string;
}

export function loadCards(): Card[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.flatMap(toCard) : [];
  } catch {
    return [];
  }
}

/** Leser defensivt: en rad uten nummer skal bli tom tekst, ikke «undefined». */
function toCard(value: unknown): Card[] {
  if (typeof value !== 'object' || value === null) return [];
  const row = value as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.name !== 'string' || typeof row.image !== 'string') {
    return [];
  }
  return [
    { id: row.id, name: row.name, image: row.image, number: typeof row.number === 'string' ? row.number : '' },
  ];
}

export function saveCards(cards: readonly Card[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cards));
  } catch {
    // Nesten alltid full lagring. Beskjeden må si hva man gjør med det, ikke
    // gjenta nettleserens engelske unntak.
    throw new Error('Det er ikke plass til flere kort på telefonen. Slett et du ikke bruker.');
  }
}

/**
 * Skalerer ned til noe en kasse fortsatt leser, men som får plass i
 * localStorage. PNG først: en strekkode er skarpe kanter, og JPEG-artefakter
 * treffer nettopp dem. Blir den for stor, er JPEG bedre enn ingen kort.
 */
export async function shrinkImage(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const context = canvas.getContext('2d');
  if (context === null) throw new Error('Klarte ikke å lese bildet');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  const png = canvas.toDataURL('image/png');
  if (dataUrlBytes(png) <= MAX_CARD_BYTES) return png;

  for (const quality of [0.92, 0.8, 0.65]) {
    const jpeg = canvas.toDataURL('image/jpeg', quality);
    if (dataUrlBytes(jpeg) <= MAX_CARD_BYTES) return jpeg;
  }
  throw new Error('Bildet er for stort. Prøv et beskåret utsnitt av bare koden.');
}

/** Base64 bærer 3 byte per 4 tegn, minus padding. */
export function dataUrlBytes(url: string): number {
  const comma = url.indexOf(',');
  if (comma === -1) return url.length;
  const body = url.slice(comma + 1);
  const padding = body.endsWith('==') ? 2 : body.endsWith('=') ? 1 : 0;
  return Math.floor((body.length * 3) / 4) - padding;
}

export function addCard(cards: readonly Card[], card: Card): Card[] {
  return [...cards, card];
}

export function removeCard(cards: readonly Card[], id: string): Card[] {
  return cards.filter((card) => card.id !== id);
}
