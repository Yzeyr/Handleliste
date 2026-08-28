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

/** Utsnitt av kildebildet, som andeler 0-1 — uavhengig av visningsstørrelse. */
export interface Crop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const FULL_IMAGE: Crop = { x: 0, y: 0, w: 1, h: 1 };

/**
 * Gjør to punkter fra en fingerdrag om til et utsnitt.
 *
 * Andeler, ikke piksler: dragningen skjer på et bilde som er skalert til
 * skjermbredden, mens beskjæringen skal skje i kildebildets egen oppløsning.
 * Et for lite utsnitt er nesten alltid et feiltrykk, ikke en hensikt — da er
 * hele bildet et bedre svar enn en tom firkant.
 */
export const MIN_CROP = 0.05;

export function cropFromDrag(
  a: { x: number; y: number },
  b: { x: number; y: number },
  width: number,
  height: number,
): Crop {
  if (width <= 0 || height <= 0) return FULL_IMAGE;
  const clamp = (value: number): number => Math.min(1, Math.max(0, value));
  const x1 = clamp(Math.min(a.x, b.x) / width);
  const x2 = clamp(Math.max(a.x, b.x) / width);
  const y1 = clamp(Math.min(a.y, b.y) / height);
  const y2 = clamp(Math.max(a.y, b.y) / height);
  const crop = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  return crop.w < MIN_CROP || crop.h < MIN_CROP ? FULL_IMAGE : crop;
}

/**
 * Skalerer ned til noe en kasse fortsatt leser, men som får plass i
 * localStorage. PNG først: en strekkode er skarpe kanter, og JPEG-artefakter
 * treffer nettopp dem. Blir den for stor, er JPEG bedre enn ingen kort.
 *
 * Beskjæringen skjer før nedskaleringen, så MAX_IMAGE_SIDE gjelder utsnittet.
 * En QR-kode midt i et skjermbilde beholder dermed oppløsningen sin i stedet
 * for å bli et lite felt i et nedskalert helbilde.
 */
export async function shrinkImage(file: File, crop: Crop = FULL_IMAGE): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const sx = Math.round(crop.x * bitmap.width);
  const sy = Math.round(crop.y * bitmap.height);
  const sw = Math.max(1, Math.round(crop.w * bitmap.width));
  const sh = Math.max(1, Math.round(crop.h * bitmap.height));

  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);

  const context = canvas.getContext('2d');
  if (context === null) throw new Error('Klarte ikke å lese bildet');
  context.drawImage(bitmap, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
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
