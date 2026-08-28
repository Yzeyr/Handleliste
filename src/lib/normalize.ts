/**
 * Navn -> nøkkel for sammenslåing.
 *
 * Handlelista har en unik indeks på normalized_name, så denne funksjonen er
 * det som avgjør om to varer er "samme vare". Den er bevisst konservativ:
 * mekaniske forskjeller (store bokstaver, bindestreker, aksenter, ekstra
 * mellomrom) fjernes automatisk, mens ekte navnevarianter må stå i
 * SYNONYMER under. Automatisk stemming/flertallsregler er droppet med vilje
 * — de tar like ofte feil som riktig, og en feil slår sammen to varer som
 * ikke hører sammen.
 */

/** ø/æ/å har ingen Unicode-dekomponering, så de må mappes eksplisitt. */
const NORDIC: Record<string, string> = {
  ø: 'o',
  æ: 'a',
  å: 'a',
};

/**
 * Ekte navnevarianter for samme vare. Nøkkelen er resultatet av
 * baseNormalize(), verdien er den felles nøkkelen. Utvid fritt når dere
 * oppdager en variant som ikke matcher — det er hele poenget med tabellen.
 */
const SYNONYMER: Record<string, string> = {
  // melk
  melk: 'helmelk',
  hmelk: 'helmelk',
  'h melk': 'helmelk',
  'hel melk': 'helmelk',
  'helmelk 3': 'helmelk',
  'helmelk 35': 'helmelk',
  'lettmelk 1': 'lettmelk',
  'lettmelk 05': 'lettmelk',
  'ekstra lettmelk': 'lettmelk',
  'lett melk': 'lettmelk',
  skummetmelk: 'skummet melk',

  // fløte og rømme
  kremflote: 'flote',
  piskeflote: 'flote',
  'flote 38': 'flote',
  'matflote 18': 'matflote',
  seterromme: 'romme',
  lettromme: 'romme',
  'creme fraiche 18': 'creme fraiche',
  cremefraiche: 'creme fraiche',

  // ost
  'revet gulost': 'revet ost',
  revetost: 'revet ost',
  'norvegia revet': 'revet ost',

  // tomater på boks
  tomater: 'hermetiske tomater',
  'hakkede tomater': 'hermetiske tomater',
  'knuste tomater': 'hermetiske tomater',
  'hermetisk tomat': 'hermetiske tomater',
  boksetomater: 'hermetiske tomater',

  // kjøtt
  kyllingbryst: 'kyllingfilet',
  kyllingfileter: 'kyllingfilet',
  kyllingkjott: 'kyllingfilet',
  karbonade: 'karbonadedeig',
  'kjottdeig av storfe': 'kjottdeig',

  // grønt
  loker: 'lok',
  gulrotter: 'gulrot',
  gulerotter: 'gulrot',
  poteter: 'potet',
  hvitloksfedd: 'hvitlok',

  // tørrvarer
  hveitemel: 'hvetemel',
  mel: 'hvetemel',
};

/** Mekanisk opprydding, uten synonymoppslag. Eksportert for testing. */
export function baseNormalize(raw: string): string {
  let s = raw.toLowerCase().trim();
  s = s.replace(/[øæå]/g, (c) => NORDIC[c] ?? c);
  // Fjerner diakritiske tegn: crème -> creme, jalapeño -> jalapeno
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Bindestrek og punktum blir borte helt ("H-melk" -> "hmelk"),
  // alt annet rart blir mellomrom.
  s = s.replace(/[-.]/g, '');
  s = s.replace(/[^a-z0-9]+/g, ' ');
  return s.trim().replace(/\s+/g, ' ');
}

/**
 * Synonymer dere har lagt inn selv, hentet fra databasen ved oppstart.
 * Tabellen over dekker det vanlige; denne finnes for at dere skal slippe å
 * be noen endre kode for å legge til «Q-melk».
 */
let egneSynonymer: Record<string, string> = {};

/** Kalles én gang ved oppstart. Nøkler og verdier normaliseres her. */
export function setRuntimeAliases(pairs: readonly { alias: string; canonical: string }[]): void {
  const next: Record<string, string> = {};
  for (const pair of pairs) {
    const from = baseNormalize(pair.alias);
    const to = baseNormalize(pair.canonical);
    if (from === '' || to === '' || from === to) continue;
    next[from] = to;
  }
  egneSynonymer = next;
}

/** Full nøkkel: mekanisk opprydding + synonymoppslag. */
export function normalizeName(raw: string): string {
  let key = baseNormalize(raw);
  // Egne synonymer går foran de innebygde, og får lov å peke videre inn i
  // dem ("qmelk" -> "melk" -> "helmelk"). Begrenset antall hopp, ellers ville
  // et par som peker på hverandre snurret i ring.
  const seen = new Set<string>();
  for (let hop = 0; hop < 3; hop += 1) {
    if (seen.has(key)) break;
    seen.add(key);
    const next = egneSynonymer[key] ?? SYNONYMER[key];
    if (next === undefined || next === key) break;
    key = next;
  }
  return key;
}

/** Om to navn regnes som samme vare. */
export function isSameIngredient(a: string, b: string): boolean {
  return normalizeName(a) === normalizeName(b);
}
