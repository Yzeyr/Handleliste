/**
 * Leser en oppskrift limt inn som tekst.
 *
 * Hvorfor tekst og ikke en URL: en nettside i nettleseren får ikke lov å
 * hente innhold fra andre domener (CORS). En URL-import ville krevd en server
 * i mellom. Å kopiere teksten fra oppskriftssida og lime den inn her gir det
 * samme resultatet uten noe serverledd.
 *
 * Resultatet er et *utkast*. Det åpnes i middagsskjemaet så du kan rette før
 * du lagrer — tolkningen treffer det vanlige, men ikke alt, og da er det
 * bedre å vise hva den fant enn å lagre noe du ikke har sett.
 */
import { normalizeUnit, unitDefinition } from './units.ts';
import type { Category, MealDraft } from './types.ts';

/** Enheter uten omregning, men som fortsatt er enheter i en oppskrift. */
const EXTRA_UNITS = new Set([
  'pk',
  'boks',
  'pose',
  'fedd',
  'neve',
  'bunt',
  'klype',
  'krm',
  'porsjon',
  'porsjoner',
  'stk',
]);

const FRACTIONS: Record<string, number> = {
  '½': 0.5,
  '¼': 0.25,
  '¾': 0.75,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
};

/** Overskrifter som skiller ingredienser fra framgangsmåte. */
const STEP_HEADINGS = /^(slik\s+(gj(ø|o)r|lager)\s+du|fram?gangsm(å|a)te|tilberedning|slik\s+gj(ø|o)r\s+man|metode)\b/i;
const SKIP_HEADINGS = /^(ingredienser|du\s+trenger|tilbeh(ø|o)r|dette\s+trenger\s+du)\s*:?\s*$/i;
const SERVINGS = /(\d+)\s*porsjon/i;

/** Grovsortering til butikk-kategori. Et forslag, ikke en fasit. */
const CATEGORY_HINTS: [Category, RegExp][] = [
  ['meieri', /melk|fl(ø|o)te|r(ø|o)mme|sm(ø|o)r|ost|yoghurt|egg|creme fraiche|crème fraîche|kesam|parmesan|mozzarella|cheddar|feta|brie/i],
  ['fisk', /laks|torsk|sei|fisk|reker|skalldyr|makrell|(ø|o)rret|tunfisk/i],
  ['kjøtt', /kj(ø|o)ttdeig|kylling|bacon|p(ø|o)lse|biff|svin|lam|skinke|karbonade|kj(ø|o)tt/i],
  ['grønt', /l(ø|o)k|potet|tomat|gulrot|paprika|salat|agurk|brokkoli|blomk(å|a)l|spinat|sopp|hvitl(ø|o)k|sitron|ingef(æ|a)r|k(å|a)l|purre|selleri|banan|eple/i],
  ['bakeri', /br(ø|o)d|lefse|tortilla|naan|bolle|baguette|pita/i],
  ['frys', /frossen|fryst|ertestuing|wokgr(ø|o)nnsaker/i],
  ['tørrvarer', /mel|ris|pasta|spaghetti|makaroni|nudler|sukker|salt|pepper|krydder|buljong|kraft|hermetisk|tomatpur(é|e)|olje|eddik|gj(æ|a)r|kokosmelk|bønner|linser/i],
];

export interface ParseResult {
  draft: MealDraft;
  /** Linjer som ble tolket som ingredienser uten mengde. */
  uncertain: string[];
}

export function parseRecipe(text: string): ParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => cleanLine(line))
    .filter((line) => line !== '');

  const draft: MealDraft = {
    id: null,
    name: '',
    emoji: null,
    description: null,
    servings: 4,
    steps: [],
    ingredients: [],
  };
  const uncertain: string[] = [];

  let inSteps = false;
  let sawIngredient = false;

  for (const [index, line] of lines.entries()) {
    if (STEP_HEADINGS.test(line)) {
      inSteps = true;
      continue;
    }
    if (SKIP_HEADINGS.test(line)) continue;

    const servings = SERVINGS.exec(line);
    if (servings !== null && servings[1] !== undefined) {
      draft.servings = Math.max(1, Number(servings[1]));
      // "4 porsjoner" på egen linje er ikke en ingrediens.
      if (/^\s*\d+\s*porsjon\w*\s*$/i.test(line)) continue;
    }

    if (inSteps) {
      draft.steps.push(line.replace(/^\d+[.)]\s*/, ''));
      continue;
    }

    // Nummererte linjer er framgangsmåte selv uten overskrift.
    if (/^\d+[.)]\s+\D/.test(line) && sawIngredient) {
      inSteps = true;
      draft.steps.push(line.replace(/^\d+[.)]\s*/, ''));
      continue;
    }

    const ingredient = parseIngredientLine(line);
    if (ingredient !== null) {
      sawIngredient = true;
      draft.ingredients.push(ingredient);
      if (ingredient.amount === null) uncertain.push(line);
      continue;
    }

    // Første linje uten mengde, før noen ingrediens: antatt tittel.
    if (index === 0 && draft.name === '') {
      draft.name = line;
      continue;
    }

    draft.ingredients.push({ name: line, amount: null, unit: null, category: guessCategory(line) });
    uncertain.push(line);
  }

  return { draft, uncertain };
}

function cleanLine(raw: string): string {
  return raw
    .replace(/ /g, ' ')
    // Kulepunkter, avkrysningsbokser og liknende fra nettsider.
    .replace(/^\s*[•·*–—\-•□☐●]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "500 g kjøttdeig", "1 ½ dl fløte", "2 egg", "Kjøttdeig, 400 g". */
export function parseIngredientLine(line: string): MealDraft['ingredients'][number] | null {
  // "Kjøttdeig, 400 g". Tegnet før kommaet må ikke være et siffer, ellers
  // ville desimalkommaet i "1,5 kg poteter" blitt lest som et skille.
  const reversed = /^(.*[^\d\s]),\s*([\d½¼¾⅓⅔].*)$/.exec(line);
  const candidate = reversed !== null ? `${reversed[2]} ${reversed[1]}` : line;

  const match = /^((?:\d+(?:[.,]\d+)?|[½¼¾⅓⅔])(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?(?:\s+[½¼¾⅓⅔])?)\s+(.*)$/.exec(
    candidate,
  );
  if (match === null || match[1] === undefined || match[2] === undefined) return null;

  const amount = readAmount(match[1]);
  if (amount === null) return null;

  let rest = match[2].trim();
  let unit = 'stk';

  const firstWord = /^([a-zA-ZæøåÆØÅ]+)\.?\s*/.exec(rest);
  if (firstWord !== null && firstWord[1] !== undefined && isUnit(firstWord[1])) {
    unit = normalizeUnit(firstWord[1]);
    rest = rest.slice(firstWord[0].length).trim();
  }

  // "(ca. 400 g)" og liknende presiseringer hører ikke hjemme i navnet.
  const name = rest
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/^(av|med)\s+/i, '')
    .trim();
  if (name === '') return null;

  return {
    name: capitalise(name),
    amount,
    unit,
    category: guessCategory(name),
  };
}

/** "500", "1,5", "½", "1 ½", "400–600" (laveste tall brukes). */
function readAmount(raw: string): number | null {
  const first = raw.split(/\s*[-–]\s*/)[0] ?? raw;
  let total = 0;
  let found = false;

  for (const token of first.trim().split(/\s+/)) {
    const fraction = FRACTIONS[token];
    if (fraction !== undefined) {
      total += fraction;
      found = true;
      continue;
    }
    const value = Number(token.replace(',', '.'));
    if (Number.isFinite(value)) {
      total += value;
      found = true;
    }
  }

  if (!found || total <= 0) return null;
  return Math.round(total * 1000) / 1000;
}

function isUnit(word: string): boolean {
  const normalized = normalizeUnit(word);
  return unitDefinition(normalized) !== null || EXTRA_UNITS.has(normalized);
}

export function guessCategory(name: string): Category {
  for (const [category, pattern] of CATEGORY_HINTS) {
    if (pattern.test(name)) return category;
  }
  return 'annet';
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
