/**
 * Amerikanske oppskrifter, oversatt til noe man kan handle etter i Norge.
 *
 * To jobber: enheter og navn. Begge er ordbøker, ikke språkforståelse — og
 * det som ikke står i ordboka står urørt igjen. En linje som kommer uendret
 * gjennom er lett å rette i skjemaet; en linje som er gjettet feil ser
 * riktig ut og blir stående.
 *
 * **Volum blir volum, vekt blir vekt.** «2 cups flour» blir 4,7 dl mel, ikke
 * 240 g: å gå fra volum til vekt krever en tetthet per ingrediens (mel ≈ 120
 * g/cup, sukker ≈ 200, smør ≈ 227), og bommer man der, er bakingen ødelagt.
 * Norske oppskrifter måler mel og sukker i dl hele tiden, så dl er et ekte
 * norsk mål her — ikke en snarvei rundt et vanskelig problem.
 *
 * Unntaket er «stick», som per definisjon er en vektenhet: én stick smør er
 * 113 g, uansett hva den fyller.
 */

interface UsUnit {
  /** Norsk enhet resultatet skal havne i. */
  unit: string;
  /** Hvor mange av den norske enheten én amerikansk er. */
  factor: number;
  /** Antall desimaler i svaret. En kopp mel er ikke 2,3659 dl. */
  decimals: number;
}

const US_UNITS: Record<string, UsUnit> = {
  // Volum. 1 cup = 236,59 ml.
  cup: { unit: 'dl', factor: 2.3659, decimals: 1 },
  cups: { unit: 'dl', factor: 2.3659, decimals: 1 },
  c: { unit: 'dl', factor: 2.3659, decimals: 1 },

  // ss og ts er de norske søskenene til tbsp og tsp. Forskjellen er 0,2 ml;
  // å regne den om til 1,97 ss ville vært presist og ubrukelig.
  // To desimaler, ikke null: en halv teskje er et helt vanlig mål, og «1/2
  // tsp» avrundet til 1 ts er dobbelt så mye krydder.
  tablespoon: { unit: 'ss', factor: 1, decimals: 2 },
  tablespoons: { unit: 'ss', factor: 1, decimals: 2 },
  tbsp: { unit: 'ss', factor: 1, decimals: 2 },
  tbs: { unit: 'ss', factor: 1, decimals: 2 },
  teaspoon: { unit: 'ts', factor: 1, decimals: 2 },
  teaspoons: { unit: 'ts', factor: 1, decimals: 2 },
  tsp: { unit: 'ts', factor: 1, decimals: 2 },

  'fl oz': { unit: 'ml', factor: 29.574, decimals: 0 },
  'fluid ounce': { unit: 'ml', factor: 29.574, decimals: 0 },
  'fluid ounces': { unit: 'ml', factor: 29.574, decimals: 0 },
  pint: { unit: 'dl', factor: 4.7318, decimals: 1 },
  pints: { unit: 'dl', factor: 4.7318, decimals: 1 },
  pt: { unit: 'dl', factor: 4.7318, decimals: 1 },
  quart: { unit: 'l', factor: 0.9464, decimals: 2 },
  quarts: { unit: 'l', factor: 0.9464, decimals: 2 },
  qt: { unit: 'l', factor: 0.9464, decimals: 2 },
  gallon: { unit: 'l', factor: 3.7854, decimals: 1 },
  gallons: { unit: 'l', factor: 3.7854, decimals: 1 },

  // Vekt.
  ounce: { unit: 'g', factor: 28.35, decimals: 0 },
  ounces: { unit: 'g', factor: 28.35, decimals: 0 },
  oz: { unit: 'g', factor: 28.35, decimals: 0 },
  pound: { unit: 'g', factor: 453.59, decimals: 0 },
  pounds: { unit: 'g', factor: 453.59, decimals: 0 },
  lb: { unit: 'g', factor: 453.59, decimals: 0 },
  lbs: { unit: 'g', factor: 453.59, decimals: 0 },
  stick: { unit: 'g', factor: 113.4, decimals: 0 },
  sticks: { unit: 'g', factor: 113.4, decimals: 0 },

  // Tellemål. Ingen omregning, bare et norsk ord.
  can: { unit: 'boks', factor: 1, decimals: 0 },
  cans: { unit: 'boks', factor: 1, decimals: 0 },
  package: { unit: 'pk', factor: 1, decimals: 0 },
  packages: { unit: 'pk', factor: 1, decimals: 0 },
  pkg: { unit: 'pk', factor: 1, decimals: 0 },
  clove: { unit: 'fedd', factor: 1, decimals: 2 },
  cloves: { unit: 'fedd', factor: 1, decimals: 2 },
  bunch: { unit: 'bunt', factor: 1, decimals: 0 },
  bunches: { unit: 'bunt', factor: 1, decimals: 0 },
  slice: { unit: 'skive', factor: 1, decimals: 0 },
  slices: { unit: 'skive', factor: 1, decimals: 0 },
  pinch: { unit: 'klype', factor: 1, decimals: 0 },
  pinches: { unit: 'klype', factor: 1, decimals: 0 },
  dash: { unit: 'klype', factor: 1, decimals: 0 },
  piece: { unit: 'stk', factor: 1, decimals: 0 },
  pieces: { unit: 'stk', factor: 1, decimals: 0 },
};

/** Enheter skrevet som to ord må prøves før enkeltordene. */
const TWO_WORD_UNITS = ['fluid ounces', 'fluid ounce', 'fl oz'];

export interface Converted {
  amount: number;
  unit: string;
}

/**
 * Regner om en amerikansk mengde. Ukjent enhet gir null, og da skal linja
 * beholdes slik den var.
 */
export function convertUsUnit(amount: number, rawUnit: string): Converted | null {
  const key = rawUnit.toLowerCase().trim().replace(/\.$/, '');
  const def = US_UNITS[key];
  if (def === undefined) return null;
  const value = amount * def.factor;
  const factor = 10 ** def.decimals;
  return { amount: Math.round(value * factor) / factor, unit: def.unit };
}

/** Leser en enhet i starten av en tekst: «fl oz sugar» → fl oz. */
export function readUsUnit(text: string): { unit: string; rest: string } | null {
  const lower = text.toLowerCase();
  for (const two of TWO_WORD_UNITS) {
    if (lower.startsWith(`${two} `) || lower === two) {
      return { unit: two, rest: text.slice(two.length).trim() };
    }
  }
  const word = /^([a-zA-Z]+)\.?(\s+|$)/.exec(text);
  if (word === null || word[1] === undefined) return null;
  if (US_UNITS[word[1].toLowerCase()] === undefined) return null;
  return { unit: word[1], rest: text.slice(word[0].length).trim() };
}

/**
 * Ord som beskriver hvordan varen er behandlet, ikke hvilken vare det er.
 * Fjernes bare når oppslaget ellers ikke treffer — «ground beef» er kjøttdeig
 * og skal aldri bli «beef».
 */
const QUALIFIERS = [
  'fresh', 'freshly', 'finely', 'coarsely', 'roughly', 'thinly', 'lightly',
  'chopped', 'minced', 'diced', 'sliced', 'grated', 'shredded', 'crushed',
  'melted', 'softened', 'beaten', 'peeled', 'seeded', 'rinsed', 'drained',
  'large', 'medium', 'small', 'extra', 'ripe', 'boneless', 'skinless',
  'unsalted', 'salted', 'whole', 'raw', 'cooked', 'frozen', 'canned',
  'dried', 'ground', 'granulated', 'plain', 'organic', 'low-fat', 'nonfat',
  'warm', 'cold', 'hot', 'room', 'temperature', 'optional', 'divided',
];

/**
 * Engelske ingrediensnavn. Sammensatte navn står først i oppslaget, fordi
 * «heavy cream» ikke er en tung «cream».
 */
const INGREDIENTS: Record<string, string> = {
  // Meieri og egg
  'heavy cream': 'fløte', 'heavy whipping cream': 'fløte', 'whipping cream': 'fløte',
  'half and half': 'fløte', 'sour cream': 'rømme', 'cream cheese': 'kremost',
  'cottage cheese': 'cottage cheese', 'cream': 'fløte', 'buttermilk': 'kefir',
  'whole milk': 'helmelk', 'skim milk': 'skummet melk', 'milk': 'melk',
  'butter': 'smør', 'margarine': 'margarin', 'yogurt': 'yoghurt',
  'greek yogurt': 'gresk yoghurt', 'egg': 'egg', 'eggs': 'egg',
  'egg yolk': 'eggeplomme', 'egg yolks': 'eggeplomme', 'egg white': 'eggehvite',
  'egg whites': 'eggehvite', 'cheddar cheese': 'cheddar', 'cheddar': 'cheddar',
  'parmesan cheese': 'parmesan', 'parmesan': 'parmesan', 'mozzarella': 'mozzarella',
  'feta cheese': 'fetaost', 'feta': 'fetaost', 'cheese': 'ost',
  'shredded cheese': 'revet ost', 'ice cream': 'iskrem',

  // Mel, korn og baking
  'all-purpose flour': 'hvetemel', 'all purpose flour': 'hvetemel',
  'plain flour': 'hvetemel', 'bread flour': 'hvetemel', 'whole wheat flour': 'sammalt hvete',
  'flour': 'hvetemel', 'cornstarch': 'maisenna', 'corn starch': 'maisenna',
  'baking soda': 'natron', 'baking powder': 'bakepulver', 'yeast': 'gjær',
  'active dry yeast': 'tørrgjær', 'vanilla extract': 'vaniljeekstrakt',
  'vanilla': 'vanilje', 'brown sugar': 'brunt sukker',
  'powdered sugar': 'melis', 'confectioners sugar': 'melis', 'icing sugar': 'melis',
  'sugar': 'sukker', 'honey': 'honning', 'maple syrup': 'lønnesirup',
  'corn syrup': 'lys sirup', 'molasses': 'mørk sirup', 'oats': 'havregryn',
  'rolled oats': 'havregryn', 'breadcrumbs': 'griljermel', 'bread crumbs': 'griljermel',
  'panko': 'panko', 'cocoa powder': 'kakaopulver', 'chocolate chips': 'sjokoladebiter',
  'dark chocolate': 'mørk sjokolade', 'chocolate': 'sjokolade',
  'rice': 'ris', 'pasta': 'pasta', 'spaghetti': 'spaghetti', 'noodles': 'nudler',
  'bread': 'brød', 'tortillas': 'tortillalefser', 'cornmeal': 'maismel',

  // Kjøtt og fisk
  'ground beef': 'kjøttdeig', 'ground chuck': 'kjøttdeig', 'minced beef': 'kjøttdeig',
  'ground pork': 'svinekjøttdeig', 'ground turkey': 'kalkunkjøttdeig',
  'ground lamb': 'lammekjøttdeig', 'ground chicken': 'kyllingkjøttdeig',
  'chicken breast': 'kyllingfilet', 'chicken breasts': 'kyllingfilet',
  'chicken thighs': 'kyllinglår', 'chicken thigh': 'kyllinglår',
  'whole chicken': 'hel kylling', 'chicken': 'kylling', 'turkey': 'kalkun',
  'beef': 'storfekjøtt', 'steak': 'biff', 'chuck roast': 'høyrygg',
  'pork': 'svinekjøtt', 'pork chops': 'svinekoteletter', 'pork loin': 'svinefilet',
  'bacon': 'bacon', 'ham': 'skinke', 'sausage': 'pølse', 'sausages': 'pølser',
  'lamb': 'lammekjøtt', 'salmon': 'laks', 'cod': 'torsk', 'tuna': 'tunfisk',
  'shrimp': 'reker', 'prawns': 'reker', 'white fish': 'hvit fisk',

  // Grønnsaker
  'onion': 'løk', 'onions': 'løk', 'yellow onion': 'gul løk', 'red onion': 'rødløk',
  'green onion': 'vårløk', 'green onions': 'vårløk', 'scallion': 'vårløk',
  'scallions': 'vårløk', 'shallot': 'sjalottløk', 'shallots': 'sjalottløk',
  'garlic': 'hvitløk', 'leek': 'purre', 'leeks': 'purre',
  'carrot': 'gulrot', 'carrots': 'gulrot', 'potato': 'potet', 'potatoes': 'potet',
  'sweet potato': 'søtpotet', 'celery': 'selleri', 'celery root': 'sellerirot',
  'parsnip': 'pastinakk', 'rutabaga': 'kålrot', 'turnip': 'nepe',
  'bell pepper': 'paprika', 'bell peppers': 'paprika', 'red pepper': 'rød paprika',
  'jalapeno': 'jalapeño', 'chili': 'chili', 'chile': 'chili',
  'mushroom': 'sopp', 'mushrooms': 'sopp', 'spinach': 'spinat', 'kale': 'grønnkål',
  'lettuce': 'salat', 'cabbage': 'kål', 'broccoli': 'brokkoli',
  'cauliflower': 'blomkål', 'zucchini': 'squash', 'eggplant': 'aubergine',
  'cucumber': 'agurk', 'tomato': 'tomat', 'tomatoes': 'tomat',
  'cherry tomatoes': 'cherrytomater', 'diced tomatoes': 'hermetiske tomater',
  'crushed tomatoes': 'hermetiske tomater', 'tomato paste': 'tomatpuré',
  'tomato sauce': 'tomatsaus', 'corn': 'mais', 'peas': 'erter',
  'green beans': 'grønne bønner', 'black beans': 'sorte bønner',
  'kidney beans': 'kidneybønner', 'chickpeas': 'kikerter', 'lentils': 'linser',
  'avocado': 'avokado', 'olives': 'oliven', 'pumpkin': 'gresskar',

  // Frukt og nøtter
  'lemon': 'sitron', 'lemon juice': 'sitronsaft', 'lemon zest': 'sitronskall',
  'lime': 'lime', 'lime juice': 'limesaft', 'orange': 'appelsin',
  'apple': 'eple', 'apples': 'eple', 'banana': 'banan', 'bananas': 'banan',
  'strawberries': 'jordbær', 'blueberries': 'blåbær', 'raspberries': 'bringebær',
  'raisins': 'rosiner', 'walnuts': 'valnøtter', 'almonds': 'mandler',
  'pecans': 'pekannøtter', 'cashews': 'cashewnøtter', 'peanuts': 'peanøtter',
  'peanut butter': 'peanøttsmør',

  // Krydder og smak
  'salt': 'salt', 'kosher salt': 'salt', 'sea salt': 'havsalt',
  'black pepper': 'sort pepper', 'pepper': 'pepper', 'paprika': 'paprikapulver',
  'cumin': 'spisskummen', 'coriander': 'koriander', 'cilantro': 'frisk koriander',
  'parsley': 'persille', 'basil': 'basilikum', 'oregano': 'oregano',
  'thyme': 'timian', 'rosemary': 'rosmarin', 'sage': 'salvie', 'dill': 'dill',
  'bay leaf': 'laurbærblad', 'bay leaves': 'laurbærblad', 'chives': 'gressløk',
  'cinnamon': 'kanel', 'nutmeg': 'muskat', 'cloves': 'nellik', 'ginger': 'ingefær',
  'cayenne': 'cayennepepper', 'chili powder': 'chilipulver',
  'red pepper flakes': 'chiliflak', 'curry powder': 'karri', 'turmeric': 'gurkemeie',

  // Væsker og annet
  'olive oil': 'olivenolje', 'extra virgin olive oil': 'olivenolje',
  'vegetable oil': 'matolje', 'canola oil': 'rapsolje', 'sesame oil': 'sesamolje',
  'oil': 'olje', 'vinegar': 'eddik', 'balsamic vinegar': 'balsamicoeddik',
  'apple cider vinegar': 'eplecidereddik', 'white wine': 'hvitvin',
  'red wine': 'rødvin', 'beer': 'øl', 'water': 'vann',
  'chicken broth': 'kyllingkraft', 'chicken stock': 'kyllingkraft',
  'beef broth': 'oksekraft', 'beef stock': 'oksekraft',
  'vegetable broth': 'grønnsakskraft', 'stock': 'kraft', 'broth': 'kraft',
  'bouillon cube': 'buljongterning', 'soy sauce': 'soyasaus',
  'worcestershire sauce': 'worcestershiresaus', 'hot sauce': 'chilisaus',
  'ketchup': 'ketsjup', 'mustard': 'sennep', 'dijon mustard': 'dijonsennep',
  'mayonnaise': 'majones', 'salsa': 'salsa', 'coconut milk': 'kokosmelk',
};

/**
 * Ord som skrives likt på begge språk. De teller ikke som bevis på at en
 * linje er engelsk — og «paprika» er grunnen til at dette må finnes: på norsk
 * er det grønnsaken, på engelsk krydderet. Uten denne lista ble «2 stk
 * paprika» i en norsk oppskrift til paprikapulver.
 */
const AMBIGUOUS = new Set([
  'paprika', 'salt', 'pepper', 'dill', 'chili', 'salsa', 'bacon', 'ketchup',
  'mozzarella', 'parmesan', 'feta', 'cheddar', 'panko', 'pasta', 'spaghetti',
  'ris', 'basilikum', 'oregano', 'timian', 'koriander', 'ingefær', 'vanilje',
  'avocado', 'brokkoli', 'kefir', 'yoghurt', 'margarin', 'gjær',
]);

const NORMALISE = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[.,;:!?()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Slår opp et engelsk ingrediensnavn. Finner den ingenting, kommer navnet
 * uendret tilbake — det er det ærlige svaret, og det er lett å rette i
 * skjemaet etterpå.
 */
export function translateIngredient(raw: string): string {
  const text = NORMALISE(raw);
  if (text === '') return raw;

  const direct = INGREDIENTS[text];
  if (direct !== undefined) return direct;

  // Sammensatte navn før enkeltord: lengste treff vinner, så «heavy cream»
  // aldri blir til «cream».
  const words = text.split(' ');
  for (let start = 0; start < words.length; start += 1) {
    for (let end = words.length; end > start; end -= 1) {
      const phrase = words.slice(start, end).join(' ');
      if (phrase === text) continue;
      const hit = INGREDIENTS[phrase];
      if (hit !== undefined && end - start > 1) return hit;
    }
  }

  // Så uten beskrivende ord: «finely chopped onions» → «onions».
  const stripped = words.filter((word) => !QUALIFIERS.includes(word)).join(' ');
  if (stripped !== text && stripped !== '') {
    const hit = INGREDIENTS[stripped];
    if (hit !== undefined) return hit;
    const single = stripped.split(' ').map((word) => INGREDIENTS[word]).find((w) => w !== undefined);
    if (single !== undefined) return single;
  }

  for (const word of words) {
    const hit = INGREDIENTS[word];
    if (hit !== undefined) return hit;
  }

  return raw;
}

/**
 * Er linja engelsk nok til at det er trygt å oversette den?
 *
 * Beviset må være entydig: en amerikansk enhet, eller et ingrediensord som
 * ikke også er norsk. Uten den terskelen ville en norsk oppskrift blitt
 * «oversatt» på ordene språkene deler.
 */
const PHRASES = Object.keys(INGREDIENTS).filter((key) => key.includes(' '));

export function looksEnglish(text: string): boolean {
  const normalised = NORMALISE(text);
  const words = normalised.split(' ');
  if (words.some((word) => US_UNITS[word] !== undefined)) return true;
  if (TWO_WORD_UNITS.some((unit) => normalised.includes(unit))) return true;
  if (words.some((word) => INGREDIENTS[word] !== undefined && !AMBIGUOUS.has(word))) return true;
  // Flerordsnavn som «bay leaves» har ingen av ordene sine i ordboka hver for
  // seg, men er like entydig engelske.
  return PHRASES.some((phrase) => normalised.includes(phrase));
}

/**
 * «Preheat oven to 350°F» → «Preheat oven to 175 °C». Rundes til nærmeste 5
 * grader: en ovn på 176,7 °C er et tall ingen ovn kan stilles inn på.
 */
export function convertFahrenheit(text: string): string {
  return text.replace(/(\d{2,3})\s*(?:°\s*F\b|degrees\s+F(?:ahrenheit)?\b|F\b(?=\s|$|\.))/gi, (whole, raw: string) => {
    const f = Number(raw);
    if (!Number.isFinite(f) || f < 150 || f > 600) return whole;
    return `${Math.round(((f - 32) * 5) / 9 / 5) * 5} °C`;
  });
}
