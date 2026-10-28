/**
 * Forskningsmodellen: bitepoeng med vekter etter hva studiene faktisk viser.
 *
 * Kildene og evidensgraderingen ligger i reports/«Hva påvirker fiskens
 * bitt.md» og research_notes/. Kort fortalt:
 *
 * - Lyset (halvlys rundt soloppgang og solnedgang) er godt dokumentert, men
 *   betyr ulikt for artene: abbor er dagaktiv og nesten borte i mørket,
 *   ørret og røye spiser også om natta, sjøørret i elv er en nattfisk.
 *   Under midnattssola, når det aldri blir mørkt, er toppene svakere.
 * - Månen har liten effekt (+2 ved ny- og fullmåne). Solunar-periodene er
 *   aldri testet ordentlig og er ikke med.
 * - Lufttrykk har ingen klar effekt i studiene (1 hPa tilsvarer 1 cm
 *   vanndybde), så det teller lite. Det er mest et tegn på vær og lys.
 * - Vind er det best støttede værleddet: krusning gir mer fisk. Ingen
 *   studie støtter at nordavind i seg selv gir dårligere fiske.
 * - Vanntemperatur betyr mye for hvor godt hver art spiser. Kurven har en
 *   topp ved artens beste temperatur og et gulv, så den aldri går til null.
 *
 * Vektene er skjønn ut fra evidensstyrke, ikke tilpasset data. Appens egen
 * fangstlogg er den beste måten å justere dem på over tid.
 */
/** Beste temperatur og hvor bratt kurven faller under og over, per art (°C). */
export const THERMAL = {
  orret: { opt: 13, below: 6, above: 3.5, floor: 0.3 },
  roye: { opt: 11, below: 6, above: 3, floor: 0.4 },
  abbor: { opt: 21, below: 7, above: 4, floor: 0.25 },
  gjedde: { opt: 16, below: 8, above: 6, floor: 0.3 },
  sik: { opt: 12, below: 7, above: 4, floor: 0.4 },
  laks: { opt: 14, below: 5, above: 3, floor: 0.3 },
  sjoorret: { opt: 13, below: 6, above: 3.5, floor: 0.3 },
};

/** Poeng i mørket (sola under −6°), per art. */
const DARK = { abbor: -20, gjedde: -12, roye: 0, sik: 0, orret: 0, sjoorret: 10, laks: -5 };

/**
 * Halvlys-bonusen som en jevn kurve etter solhøyden (grader), 0–20:
 * stiger fra −12° (det første lyset), er på topp fra −3° til +3°
 * (rett før og etter at sola står opp eller går ned), og faller av til 0
 * ved +18°. Tidligere var det en skarp grense ved −6°, så poengene hoppet
 * fra én time til den neste.
 */
export function lightBonus(sunAlt) {
  if (sunAlt <= -12 || sunAlt >= 18) return 0;
  if (sunAlt < -3) return (20 * (sunAlt + 12)) / 9;
  if (sunAlt <= 3) return 20;
  if (sunAlt <= 12) return 20 - (14 * (sunAlt - 3)) / 9;
  return 6 - (6 * (sunAlt - 12)) / 6;
}

/** 0–1: hvor godt arten spiser ved denne vanntemperaturen. */
export function thermalFactor(speciesId, waterTemp) {
  const p = THERMAL[speciesId];
  if (!p || waterTemp == null) return null;
  const spread = waterTemp < p.opt ? p.below : p.above;
  const z = (waterTemp - p.opt) / spread;
  return p.floor + (1 - p.floor) * Math.exp(-(z * z) / 2);
}

export const RWHY = {
  Halvlys: 'Studier av ørret, abbor og gjedde viser mest aktivitet rundt soloppgang og solnedgang. Det er godt dokumentert.',
  'Halvlys (lyse netter)': 'Når det aldri blir mørkt, flater døgnrytmen ut. Røye og sik viser nesten ingen døgnrytme under midnattssola.',
  'Nær halvlys': 'Det lysner eller mørkner. Aktiviteten øker gradvis jo nærmere soloppgang eller solnedgang du kommer.',
  'Mørkt — abboren hviler': 'Abbor er en dagfisk og spiser nesten ikke i mørket i klare vann.',
  'Mørkt — gjedda er lite aktiv': 'Gjedda jakter mest i dagslys og halvlys.',
  'Mørkt — laksen biter dårligere': 'Laks tas mest i lys, selv om noen fisker den om natta.',
  'Mørkt — sjøørretens tid': 'Sjøørret i elv er en nattfisk; skumring og natt er klassisk sjøørrettid.',
  'Ny- eller fullmåne': 'Store datasett viser en liten effekt av månefase, mest om natta. Den er reell, men liten.',
  'Fallende lufttrykk': 'Studiene finner ingen klar effekt av lufttrykk. Det teller litt, mest fordi det følger med skyer og vind.',
  'Trykket faller raskt': 'Et lite pluss: værskiftet gir ofte skyer og vind, som hjelper.',
  'Stigende lufttrykk': 'Litt minus: høytrykk gir ofte klar himmel og sterkt lys.',
  'Trykket stiger raskt': 'Etter en front blir det ofte klart og kaldt. Effekten i studiene er liten.',
  'Krusning på vannet': 'Vind er det best dokumenterte værleddet: gjedda tas oftere i vind, og vind samler plankton og småfisk mot vindsiden.',
  'Vind driver mat mot land': 'Vinden fører plankton og småfisk mot vindsiden. Effekten flater ut ved sterk vind.',
  'Blankt vann i sterkt lys': 'Uten krusning og med mye lys er fisken mest sky.',
  Overskyet: 'Mindre lys gjør at fisken jakter mer og er mindre sky. Bedre fangst i dempet lys er dokumentert for flere arter.',
  'Sterk sol': 'Sterkt lys gjør laksefisk og abbor skyere, og de trekker dypere.',
  'Lett regn': 'Lett regn demper lyset og bryter overflata. Liten effekt.',
  'Kraftig regn': 'Mye regn gjør vannet grumsete. Liten effekt i innsjø, større i elv.',
  'Kaldt vindskifte': 'Et brått temperaturfall kan gjøre fisken tregere, særlig abbor og ørret i grunt vann om våren. Effekten er liten og usikker.',
};

/**
 * @param ctx { speciesId, waterTemp, lightNights } — lightNights er true når
 *            sola ikke går under −6° i løpet av døgnet (lyse sommernetter).
 */
export function researchScore(h, sky, sunAlt, ctx = {}) {
  const reasons = [];
  const warnings = [];
  let score = 30;
  const add = (points, text) => {
    if (points === 0) return;
    score += points;
    reasons.push({ points, text, why: RWHY[text] ?? '' });
  };
  const species = ctx.speciesId ?? 'orret';

  // Lys: halvlys etter solhøyde, ikke klokkeslett, så det virker også i nord.
  // En jevn kurve i stedet for en skarp grense: lyset øker gradvis, og
  // aktiviteten med det.
  // Snitt over hele timen når modellen har solhøyden flere ganger i timen:
  // om morgenen stiger sola mange grader på en time.
  const alts = ctx.sunAlts?.length ? ctx.sunAlts : [sunAlt];
  const light = alts.reduce((sum, a) => sum + lightBonus(a), 0) / alts.length;
  if (light > 0) {
    const points = ctx.lightNights ? light / 2 : light;
    const text = ctx.lightNights ? 'Halvlys (lyse netter)' : light >= 15 ? 'Halvlys' : 'Nær halvlys';
    add(Math.round(points * 10) / 10, text);
  } else if (sunAlt <= -12) {
    const dark = DARK[species] ?? 0;
    const text = { abbor: 'Mørkt — abboren hviler', gjedde: 'Mørkt — gjedda er lite aktiv', laks: 'Mørkt — laksen biter dårligere', sjoorret: 'Mørkt — sjøørretens tid' }[species];
    if (text) add(dark, text);
  }

  // Månen: bare fasen, og lite.
  if (Math.min(sky.phase, 1 - sky.phase, Math.abs(sky.phase - 0.5)) < 0.05) add(2, 'Ny- eller fullmåne');

  // Lufttrykk: liten vekt.
  const dp = h.pressureTrend;
  if (dp != null) {
    if (dp <= -3) {
      add(2, 'Trykket faller raskt');
      warnings.push({ text: 'Uvær på vei', why: 'Trykket faller raskt, og det kommer ofte storm etter. Vær klar til å gå i land.' });
    } else if (dp <= -0.7) add(3, 'Fallende lufttrykk');
    else if (dp >= 2) add(-3, 'Trykket stiger raskt');
    else if (dp >= 0.7) add(-1, 'Stigende lufttrykk');
  }

  // Vind: det best støttede værleddet.
  if (h.wind < 1) {
    if (sunAlt > 15 && h.cloud < 50) add(-3, 'Blankt vann i sterkt lys');
  } else if (h.wind < 6) add(6, 'Krusning på vannet');
  else if (h.wind < 12) add(3, 'Vind driver mat mot land');

  // Skyer og sol når sola er oppe; sterkest når sola står høyt.
  if (sunAlt > 0) {
    const strength = sunAlt > 15 ? 1 : 0.5;
    if (h.cloud >= 70) add(Math.round(5 * strength), 'Overskyet');
    else if (h.cloud < 20 && sunAlt > 25) add(-6, 'Sterk sol');
  }

  // Regn.
  if (h.precip > 4) add(-2, 'Kraftig regn');
  else if (h.precip >= 0.1) add(2, 'Lett regn');

  // Brått temperaturfall, uansett vindretning. Ikke for gjedde: kaldt vær
  // ga tvert imot høyere gjeddefangst i to studier, én av dem norsk.
  if (h.tempTrend != null && h.tempTrend <= -2 && species !== 'gjedde') add(-2, 'Kaldt vindskifte');

  // Vanntemperatur for arten: −10 til +10.
  const f = thermalFactor(species, ctx.waterTemp);
  if (f != null) {
    const points = Math.round(-10 + 20 * f);
    const p = THERMAL[species];
    // Teksten følger fortegnet: et pluss skal aldri hete «for kaldt».
    const colder = ctx.waterTemp < p.opt;
    // Alltid anslaget først, så ingen leser artens beste temperatur som
    // vanntemperaturen («nær 13 °C» når vannet var 10).
    const now = Math.round(ctx.waterTemp);
    const text =
      f > 0.85
        ? `Vannet ca. ${now} °C, godt for arten (best rundt ${p.opt})`
        : points > 0
          ? `Vannet ca. ${now} °C, greit for arten`
          : colder
            ? `Vannet ca. ${now} °C, kaldere enn arten liker`
            : `Vannet ca. ${now} °C, varmere enn arten liker`;
    score += points;
    reasons.push({
      points,
      text,
      why: `Hver art spiser best ved en bestemt temperatur. For denne arten er det rundt ${p.opt} °C, og vannet er anslått til ${Math.round(ctx.waterTemp)} °C. Anslaget er grovt (±2–3 °C).`,
    });
  }

  // Sikkerhet som i erfaringsmodellen: varsler, ikke minus.
  if (h.wind >= 14) warnings.push({ text: 'Kuling — farlig i båt', why: 'Så mye vind er farlig i båt. Fisk fra land, helst der du har le.' });
  else if (h.wind >= 10) warnings.push({ text: 'Mye vind', why: 'Tungt å kaste og kjenne bitt, og urolig i båt. Fisk fra land på vindsiden.' });
  if (h.gust >= 18) warnings.push({ text: 'Kraftige vindkast', why: 'Kraftige kast kan velte en liten båt. Hold deg nær land.' });
  if (h.code >= 95) warnings.push({ text: 'Torden — hold deg unna vannet', why: 'Lyn treffer gjerne det høyeste punktet, og på vannet er det deg og stanga. Gå i land.' });
  if (h.temp < -15) warnings.push({ text: 'Bitende kaldt', why: 'Kle deg godt og pass på fingre og føtter, særlig på isen.' });

  // Samme skala som erfaringsmodellen: de beste forholdene modellen kan gi,
  // blir 100. Uten dette stoppet den på 76, og så alltid «dårligere» ut.
  // Grunnenes poeng skaleres likt, så de fortsatt forklarer tallet.
  const k = 100 / RAW_MAX;
  return {
    score: Math.max(0, Math.min(100, Math.round(score * k))),
    reasons: reasons
      .map((r) => ({ ...r, points: Math.round(r.points * k) || Math.sign(r.points) }))
      .sort((a, b) => Math.abs(b.points) - Math.abs(a.points)),
    warnings,
  };
}

/**
 * Høyeste råsum modellen kan gi: start 30, halvlys 20, vanntemperatur ved
 * artens beste 10, krusning 6, fallende trykk 3, overskyet i halvlys 3,
 * ny- eller fullmåne 2 og lett regn 2. En test sjekker at dette stemmer.
 */
export const RAW_MAX = 76;
