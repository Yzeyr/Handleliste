/**
 * Enheter, omregning og visning.
 *
 * Enheter grupperes i dimensjoner. To mengder kan bare summeres hvis de er i
 * samme dimensjon. Enheter som ikke er i tabellen (pk, boks, pose, fedd ...)
 * får hver sin egen dimensjon, altså summeres de bare med seg selv — "2 boks
 * + 1 boks = 3 boks", men aldri boks + dl.
 */

import type { Quantity } from './types.ts';

export type Dimension = 'vekt' | 'volum' | 'antall';

interface UnitDef {
  dimension: Dimension;
  /** Hvor mange basisenheter én av denne er. Basis: g, ml, stk. */
  toBase: number;
}

const UNITS: Record<string, UnitDef> = {
  g: { dimension: 'vekt', toBase: 1 },
  hg: { dimension: 'vekt', toBase: 100 },
  kg: { dimension: 'vekt', toBase: 1000 },

  ml: { dimension: 'volum', toBase: 1 },
  cl: { dimension: 'volum', toBase: 10 },
  dl: { dimension: 'volum', toBase: 100 },
  l: { dimension: 'volum', toBase: 1000 },
  ts: { dimension: 'volum', toBase: 5 },
  ss: { dimension: 'volum', toBase: 15 },

  stk: { dimension: 'antall', toBase: 1 },
};

/**
 * Visningsstige per dimensjon, minste først. Brukes bare når bidragene hadde
 * ulike enheter — da velges største enhet der tallet fortsatt blir >= 1.
 * ss/ts er med vilje ikke i stigen: ingen vil se "3,33 ss melk".
 */
const LADDERS: Record<Dimension, string[]> = {
  vekt: ['g', 'kg'],
  volum: ['ml', 'dl', 'l'],
  antall: ['stk'],
};

const UNIT_ALIASES: Record<string, string> = {
  gram: 'g',
  gr: 'g',
  kilo: 'kg',
  kilogram: 'kg',
  hekto: 'hg',
  liter: 'l',
  desiliter: 'dl',
  centiliter: 'cl',
  milliliter: 'ml',
  spiseskje: 'ss',
  spiseskjeer: 'ss',
  teskje: 'ts',
  teskjeer: 'ts',
  stykk: 'stk',
  stykker: 'stk',
  pakke: 'pk',
  pakker: 'pk',
  pk: 'pk',
  bokser: 'boks',
  poser: 'pose',
  fedd: 'fedd',
  never: 'neve',
  bunter: 'bunt',
};

/** Forslagene i enhetsfeltet. Samme liste overalt den vises. */
export const COMMON_UNITS = ['stk', 'g', 'kg', 'dl', 'l', 'ml', 'ss', 'ts', 'pk', 'boks', 'pose', 'fedd'];

/** Rydder opp i enhetsskrivemåte. Ukjente enheter beholdes som de er. */
export function normalizeUnit(raw: string | null | undefined): string {
  const s = (raw ?? '').toLowerCase().trim().replace(/\.$/, '');
  if (s === '') return 'stk';
  return UNIT_ALIASES[s] ?? s;
}

export function unitDefinition(unit: string): UnitDef | null {
  return UNITS[normalizeUnit(unit)] ?? null;
}

/**
 * Nøkkelen som avgjør hva som kan summeres med hva. Kjente enheter deler
 * dimensjonsnavn; ukjente får sin egen bøtte per enhet.
 */
export function dimensionKey(unit: string): string {
  const u = normalizeUnit(unit);
  const def = UNITS[u];
  return def ? def.dimension : `enhet:${u}`;
}

export function canCombine(a: string, b: string): boolean {
  return dimensionKey(a) === dimensionKey(b);
}

export function toBase(amount: number, unit: string): number {
  const def = unitDefinition(unit);
  return def ? amount * def.toBase : amount;
}

export function fromBase(baseAmount: number, unit: string): number {
  const def = unitDefinition(unit);
  return def ? baseAmount / def.toBase : baseAmount;
}

/**
 * Velger visningsenhet for en ferdig summert mengde.
 *
 * `keepUnit` settes når alle bidragene brukte samme enhet. Den beholdes bare
 * hvis enheten står utenfor visningsstigen — da finnes det ikke noe bedre
 * alternativ, og "2 ss + 1 ss" skal bli "3 ss", ikke "45 ml". Står enheten i
 * stigen velges stigen uansett, slik at "5 dl + 5 dl" blir "1 l" og ikke
 * "10 dl".
 */
export function displayUnit(baseAmount: number, dimension: Dimension, keepUnit: string | null): string {
  const ladder = LADDERS[dimension];
  if (keepUnit !== null && !ladder.includes(keepUnit)) return keepUnit;
  let chosen = ladder[0] ?? 'stk';
  for (const unit of ladder) {
    if (fromBase(baseAmount, unit) >= 1) chosen = unit;
  }
  return chosen;
}

/**
 * Ganger opp eller ned en mengde, og runder slik varen faktisk kjøpes.
 *
 * Tellbare ting rundes **opp til hele**: en halv løk er ikke noe man kjøper,
 * og trenger oppskriften halvannen, må du ha to. Vekt og volum rundes til noe
 * som er lesbart ved kjøttdisken — 400 g, ikke 399,84 g.
 *
 * Faktoren 1 slipper igjennom urørt. Da skal ingenting endre seg, heller ikke
 * en mengde som allerede sto med desimaler.
 */
export function scaleQuantity(quantity: Quantity, factor: number): Quantity {
  if (factor === 1 || !Number.isFinite(factor) || factor <= 0) return quantity;

  const scaled = quantity.amount * factor;
  const def = unitDefinition(quantity.unit);

  if (def === null || def.dimension === 'antall') {
    return { ...quantity, amount: Math.max(1, Math.ceil(scaled)) };
  }
  // Under 10 av basisenheten er det snakk om skjeer og desiliter, der én
  // desimal er poenget. Over det er hele enheter presist nok.
  const base = scaled * def.toBase;
  const rounded = base < 10 ? Math.round(scaled * 10) / 10 : Math.round(scaled * 100) / 100;
  return { ...quantity, amount: rounded === 0 ? quantity.amount : rounded };
}

/** Maks 2 desimaler, norsk desimalkomma, ingen etterslepende nuller. */
export function formatAmount(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return String(rounded).replace('.', ',');
}

/**
 * Leser et tall en person har skrevet: «1,5» og «1.5» er samme mengde.
 *
 * Mengdefeltene er <input type="text"> med inputmode="decimal", ikke
 * type="number". Et talfelt forkaster «1,5» som ugyldig, og da kommer verdien
 * aldri fram til koden — feltet ser bare tomt ut. Norsk tastatur gir komma, så
 * det er komma folk skriver.
 */
export function parseAmount(raw: string): number | null {
  const text = raw.trim().replace(',', '.');
  if (text === '') return null;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function formatQuantity(quantity: { amount: number; unit: string }): string {
  return `${formatAmount(quantity.amount)} ${quantity.unit}`;
}

/** Hele mengdefeltet på en handlelinje: "3 dl + 2 boks". */
export function formatQuantities(quantities: readonly { amount: number; unit: string }[]): string {
  return quantities.map(formatQuantity).join(' + ');
}
