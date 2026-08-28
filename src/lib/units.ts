/**
 * Enheter, omregning og visning.
 *
 * Enheter grupperes i dimensjoner. To mengder kan bare summeres hvis de er i
 * samme dimensjon. Enheter som ikke er i tabellen (pk, boks, pose, fedd ...)
 * får hver sin egen dimensjon, altså summeres de bare med seg selv — "2 boks
 * + 1 boks = 3 boks", men aldri boks + dl.
 */

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

/** Maks 2 desimaler, norsk desimalkomma, ingen etterslepende nuller. */
export function formatAmount(amount: number): string {
  const rounded = Math.round(amount * 100) / 100;
  return String(rounded).replace('.', ',');
}

/**
 * Verdien et <input type="number"> godtar. Må ha punktum som desimaltegn —
 * "1,5" gjør feltet ugyldig, og da vises det tomt uten at noe sier fra.
 * Til visning brukes formatAmount, som skriver norsk komma.
 */
export function amountForInput(amount: number): string {
  return String(amount);
}

export function formatQuantity(quantity: { amount: number; unit: string }): string {
  return `${formatAmount(quantity.amount)} ${quantity.unit}`;
}

/** Hele mengdefeltet på en handlelinje: "3 dl + 2 boks". */
export function formatQuantities(quantities: readonly { amount: number; unit: string }[]): string {
  return quantities.map(formatQuantity).join(' + ');
}
