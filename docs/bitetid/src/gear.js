/**
 * Hvilken fiskemåte som passer akkurat nå, og om det er otervær.
 *
 * Som bitepoengene er dette erfaring, ikke fysikk. Hver metode har et
 * utgangspunkt for årstiden, og så flytter været og arten tallet litt:
 *
 * - Sluk kastes langt og går dypere og raskere enn spinner. Best etter
 *   isgang, om høsten og i vind, der den tunge sluken fortsatt når ut.
 * - Spinner går grunt og sakte og blinker godt i overskyet og grumsete vann.
 *   Den er lett, så sterk vind og dypt, kaldt vann gjør den svak.
 * - Wobbler er for rovfisk: gjedde, storørret og abbor, helst i halvlys.
 * - Flue vil ha rolig vær og milde kvelder med klekking. Sterk vind og
 *   kaldt vann ødelegger.
 * - Mark og dupp er det trygge valget når bittet er tregt, og etter regn.
 * - Markdrag er mark som ros sakte etter båten, gjerne bak et spinnerblad.
 *   Klassisk for ørret i fjellvann, og trenger rolig vær for å ro sakte.
 * - Dorging dekker mye vann når fisken står spredt eller dypt om sommeren.
 * - Dypfiske lønner seg når overflaten er varm og sola høy, for da står
 *   røya og abboren dypt.
 * - Oter trenger jevn bris i åpent vann, og er først og fremst for ørret.
 * - Pilk er bare for isen, og isen må være trygg.
 *
 * Metoder som ikke går an der og da, er tatt helt ut i stedet for å få null
 * poeng. Da slipper appen å foreslå oter på isen eller dorging i elva.
 */

export const METHODS = {
  sluk: { name: 'Sluk' },
  spinner: { name: 'Spinner' },
  wobbler: { name: 'Wobbler' },
  flue: { name: 'Flue' },
  mark: { name: 'Mark og dupp' },
  markdrag: { name: 'Markdrag' },
  dorging: { name: 'Dorging' },
  dypfiske: { name: 'Dypfiske' },
  oter: { name: 'Oter' },
  pilk: { name: 'Isfiske med pilk' },
};

/**
 * Utgangspunkt per årstid. Mangler en årstid, går metoden ikke an da.
 * Spinner, wobbler og flue har vintertall bare for åpen elv; på islagte
 * innsjøer tas de ut nedenfor.
 */
const BASE = {
  sluk: { vinter: 15, vaar: 65, forsommer: 55, sommer: 45, host: 60 },
  spinner: { vinter: 12, vaar: 50, forsommer: 52, sommer: 48, host: 45 },
  wobbler: { vinter: 10, vaar: 45, forsommer: 45, sommer: 42, host: 50 },
  flue: { vinter: 10, vaar: 35, forsommer: 60, sommer: 55, host: 40 },
  mark: { vinter: 45, vaar: 55, forsommer: 50, sommer: 45, host: 50 },
  markdrag: { vaar: 52, forsommer: 55, sommer: 42, host: 50 },
  dorging: { vaar: 30, forsommer: 42, sommer: 52, host: 40 },
  dypfiske: { vaar: 15, forsommer: 30, sommer: 48, host: 42 },
  oter: { vaar: 40, forsommer: 50, sommer: 45, host: 45 },
  pilk: { vinter: 75 },
};

/** Det eneste som går an fra isen: pilk, mark i hullet og sluk i råker. */
const WINTER_LAKE = new Set(['pilk', 'mark', 'sluk']);
/** Trenger båt, dyp eller is, og ingen av delene finnes i elva. */
const LAKE_ONLY = new Set(['markdrag', 'dorging', 'dypfiske', 'oter', 'pilk']);

/** Kort grunn som fyller opp når været ikke sier så mye. */
const SEASON_NOTE = {
  sluk: {
    vinter: 'Bare i åpne råker og elveoser',
    vaar: 'Etter isgang jakter fisken småfisk',
    forsommer: 'Fisken jakter yngel langs land',
    sommer: 'Best morgen og kveld om sommeren',
    host: 'Høstfisken jakter aktivt før vinteren',
  },
  spinner: {
    vinter: 'Bare i åpen elv: sveiv svært sakte',
    vaar: 'Langs land og ved innløp etter isgang',
    forsommer: 'Spinner langs land der fisken jakter',
    sommer: 'Grunt og sakte morgen og kveld',
    host: 'Langs land før vannet blir kaldt',
  },
  wobbler: {
    vinter: 'Bare i åpen elv, og svært sakte',
    vaar: 'Storfisken jakter småfisk etter isgang',
    forsommer: 'Rovfisken jakter yngel på grunna',
    sommer: 'Best i halvlyset morgen og kveld',
    host: 'Rovfisken eter seg opp før vinteren',
  },
  flue: {
    vinter: 'Vinterflue i elva er tregt',
    vaar: 'Lite insekter så tidlig på året',
    forsommer: 'Klekketid: insekter på vannet',
    sommer: 'Insekter og vak på stille kvelder',
    host: 'Fortsatt vak på milde dager',
  },
  mark: {
    vinter: 'Mark under isen eller i åpne råker',
    vaar: 'Mark ved innløp og langs land',
    forsommer: 'Mark under dupp er et trygt valg',
    sommer: 'Mark fungerer når annet er tregt',
    host: 'Pålitelig når bittet er tregt',
  },
  markdrag: {
    vaar: 'Ørreten går grunt etter isgang',
    forsommer: 'God tid for markdrag etter ørret',
    sommer: 'Ro litt dypere når vannet er varmt',
    host: 'Høstørreten tar gjerne mark på drag',
  },
  dorging: {
    vaar: 'Dorg grunt langs land etter isgang',
    forsommer: 'Dorg langs kanter og over grunner',
    sommer: 'Dorg dypt for å finne spredt fisk',
    host: 'Dorg langs land når vannet kjøles',
  },
  dypfiske: {
    vaar: 'Fisken står grunt om våren',
    forsommer: 'Røye og storfisk trekker dypere',
    sommer: 'Om sommeren står fisken dypt på dagen',
    host: 'Fisken samler seg dypt når vannet kjøles',
  },
  oter: {
    vaar: 'Ørreten går grunt etter isgang',
    forsommer: 'Klekketid: fluer på oteren tas godt',
    sommer: 'Best morgen og kveld om sommeren',
    host: 'Høstørret tar gjerne fluer på oter',
  },
  pilk: {
    vinter: 'Bor flere hull og flytt deg til fisken',
  },
};

/** Grunner som alltid skal med, fordi de handler om sikkerhet eller regler. */
const ICE_SAFETY = 'Minst 10 cm stålis før du går ut';
const OTER_LICENCE = 'Oter krever ofte egen tillatelse';
const SALMON_RIVER = 'Ikke tillatt i alle lakseelver';
const THUNDER = 'Torden — hold deg unna vannet';

const ORDER = Object.keys(METHODS);

/**
 * Fiskemåtene som passer nå, best først.
 *
 * @param hour  null, eller { t, temp, wind, gust, cloud, precip, code, pressureTrend, sunAlt }
 * @param ctx   { season, waterTemp, speciesId, water: 'innsjo'|'elv', mountain }
 * @returns {{id:string, name:string, score:number, reasons:string[]}[]}
 */
export function gearAdvice(hour, ctx) {
  const season = ctx?.season ?? 'sommer';
  const river = ctx?.water === 'elv';
  const species = ctx?.speciesId ?? null;
  const wt = ctx?.waterTemp ?? null;
  const thunder = hour ? hour.code >= 95 : false;

  const mountain = ctx?.mountain === true;

  const out = [];
  for (const id of ORDER) {
    const base = BASE[id][season];
    if (base === undefined) continue;
    // Elva har verken is å pilke på, dyp å dorge i eller plass til båt og oter.
    if (river && LAKE_ONLY.has(id)) continue;
    // Under isen går bare pilk, mark og sluk i råker; resten holder seg i åpen elv.
    if (season === 'vinter' && !river && !WINTER_LAKE.has(id)) continue;

    const adj = [];
    const add = (points, text) => adj.push({ points, text });

    weather(id, hour, season, river, add);
    water(id, wt, add);
    nudge(id, species, season, river, add);
    // Den lette spinneren er laget for strøm og små bekker.
    if (river && id === 'spinner') add(6, 'Spinner fisker fint i strøm');
    // Fjellvann: oter og markdrag er klassiske fjellvannsredskap, og flue
    // på vakende fisk i stille kvelder er typisk etter isgangen.
    if (mountain && id === 'oter') add(6, 'Klassisk i fjellvann');
    if (mountain && id === 'markdrag') add(6, 'Klassisk i fjellvann');
    if (mountain && id === 'flue' && (season === 'vaar' || season === 'forsommer')) add(4, 'Fjellvann etter isgang: flue på vak');

    let score = base + adj.reduce((sum, a) => sum + a.points, 0);
    if (thunder) score = Math.min(score - 50, 25);

    const pinned = [];
    if (thunder) pinned.push(THUNDER);
    if (id === 'pilk') pinned.push(ICE_SAFETY);
    if (id === 'oter') pinned.push(OTER_LICENCE);
    if (id === 'mark' && river) pinned.push(SALMON_RIVER);

    const slots = 3 - pinned.length;
    const told = adj
      .filter((a) => a.text && a.points !== 0)
      .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
      .map((a) => a.text)
      // Samme tekst fra to kilder (f.eks. «Klassisk i fjellvann») skal bare stå én gang.
      .filter((text, i, all) => all.indexOf(text) === i)
      .slice(0, slots);
    if (told.length < slots) told.push(SEASON_NOTE[id][season]);
    // Torden først, så det står øverst; resten av de faste grunnene sist.
    const reasons = thunder ? [THUNDER, ...told, ...pinned.slice(1)] : [...told, ...pinned];

    out.push({
      id,
      name: METHODS[id].name,
      score: Math.max(0, Math.min(100, Math.round(score))),
      reasons: reasons.slice(0, 3),
    });
  }

  // Lik poengsum: rekkefølgen i METHODS avgjør, så svaret er det samme hver gang.
  return out.sort((a, b) => b.score - a.score || ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
}

/** Været akkurat nå. Uten time finnes bare årstiden å gå etter. */
function weather(id, h, season, river, add) {
  if (!h) return;
  const wind = h.wind ?? 0;
  const gust = h.gust ?? wind;
  const cloud = h.cloud ?? 50;
  const precip = h.precip ?? 0;
  const sunAlt = h.sunAlt ?? 0;
  const brightSun = sunAlt > 25 && cloud < 25;
  const overcast = sunAlt > 0 && cloud >= 70;
  const dusk = sunAlt > -6 && sunAlt < 6;
  const openWater = season !== 'vinter';
  // Båtfiske: kuling og harde kast gjør det både tungt og utrygt å ro.
  const gale = wind >= 10 || gust >= 14;

  switch (id) {
    case 'sluk':
      if (wind >= 2 && wind < 9) add(8, 'Vind og krusning: fisken jakter');
      else if (wind >= 9 && wind < 12) add(4, 'Tung sluk kaster godt i vind');
      if (wind < 1 && brightSun) add(-12, 'Blikkstille og sterk sol');
      else if (brightSun) add(-6, 'Sterk sol gjør fisken sky');
      if (overcast) add(6, 'Overskyet: fisken tør mer');
      if (dusk && openWater) add(5, 'Halvlys: fisken jakter');
      if (river && precip >= 1) add(8, 'Farget elv: større og blankere sluk');
      else if (precip >= 0.1 && precip <= 4) add(3, 'Lett regn demper lyset');
      if (wind >= 12) add(-8, 'Kuling gjør det tungt å kaste');
      break;

    case 'spinner':
      // Spinneren er lett: den kaster kort og blir borte i vind.
      if (wind >= 1 && wind < 6) add(4, 'Lite vind: spinneren går fint');
      else if (wind >= 12) add(-14, 'For mye vind for lett spinner');
      else if (wind >= 8) add(-8, 'Mye vind: spinneren kaster kort');
      if (wind < 1 && brightSun) add(-10, 'Blikkstille og sterk sol');
      else if (brightSun) add(-6, 'Sterk sol gjør fisken sky');
      if (overcast) add(6, 'Overskyet: bladet blinker godt');
      if (dusk && openWater) add(3, 'Halvlys: fisken går grunt');
      if (river && precip >= 1) add(8, 'Farget elv: bladet lager trykk');
      else if (precip >= 0.1 && precip <= 4) add(3, 'Lett regn demper lyset');
      break;

    case 'wobbler':
      if (dusk && openWater) add(8, 'Halvlys: rovfisken jakter');
      if (overcast) add(6, 'Overskyet: rovfisken tør mer');
      if (brightSun) add(-8, 'Sterk sol: rovfisken står skjult');
      if (wind >= 2 && wind < 9) add(3, 'Krusning skjuler lina');
      if (wind >= 12) add(-8, 'Kuling gjør det tungt å kaste');
      if (river && precip >= 1) add(5, 'Farget elv: wobbler som rister');
      break;

    case 'flue':
      if (wind < 1.5) add(8, 'Stille vann: du ser vakene');
      else if (wind < 5) add(4, 'Lite vind, greit å kaste');
      else if (wind < 8) add(-10, 'Mye vind for presise kast');
      else add(-25, 'For mye vind for flue');
      if (dusk && (season === 'forsommer' || season === 'sommer')) {
        add((h.temp ?? 0) >= 10 ? 23 : 18, 'Skumring: klekking og vak');
      } else if (dusk && openWater) {
        add(6, 'Halvlys: fisken går opp');
      }
      if (brightSun) add(-6, 'Sterk sol midt på dagen');
      if (river && precip >= 1) add(-8, 'Farget elv er vanskelig for flue');
      else if (precip > 4) add(-6, 'Kraftig regn');
      break;

    case 'mark':
      if (precip >= 0.1) add(8, 'Regn vasker mark ut i vannet');
      if ((h.pressureTrend ?? 0) >= 2) add(5, 'Tregt etter front: mark er trygt');
      if (wind >= 10) add(-5, 'Mye vind: duppen er vanskelig å se');
      break;

    case 'markdrag':
      // Marken skal gå sakte og jevnt, og det klarer du bare å ro i rolig vær.
      if (gale) add(-25, 'For mye vind til å ro sakte');
      else if (wind > 6) add(-8, 'Frisk vind: vanskelig å ro sakte');
      else add(8, 'Rolig vær: lett å ro sakte');
      if (overcast) add(6, 'Overskyet: ørreten går høyt');
      else if (brightSun) add(-6, 'Sterk sol: fisken går dypere');
      else if (sunAlt > 25) add(3, 'Markdrag går fint midt på dagen');
      if (precip >= 0.1 && precip <= 4) add(3, 'Lett regn: ørreten tar godt');
      break;

    case 'dorging':
      if (gale) add(-25, 'Kuling: for mye vind for båt');
      else if (wind >= 8) add(-10, 'Mye vind: krevende i båt');
      else if (wind < 3) add(3, 'Rolig vær for båt');
      if (brightSun) add(8, 'Sterk sol: dorg dypere');
      break;

    case 'dypfiske':
      if (brightSun) add(12, 'Sterk sol presser fisken dypt');
      else if (overcast) add(-5, 'Overskyet: fisken kan stå grunnere');
      if (dusk) add(-10, 'I skumringen kommer fisken mot land');
      if (wind < 3) add(3, 'Rolig vær for båt');
      else if (wind >= 10) add(-15, 'Mye vind: båten driver for fort');
      else if (wind >= 8) add(-10, 'Mye vind: krevende i båt');
      break;

    case 'oter': {
      if (wind >= 10 || gust >= 14) add(-40, 'For mye vind: utrygt med oter');
      else if (wind < 1.5) add(-25, 'Blikkstille: oteren går ikke ut');
      else if (wind < 3) add(5, 'Svak bris, oteren går så vidt');
      else if (wind <= 8) add(20, 'Jevn bris: oteren går fint ut');
      else add(-5, 'Frisk vind: oteren blir tung');
      if (overcast && wind >= 3 && wind <= 8) add(4, 'Overskyet: fisken tør mer');
      break;
    }

    case 'pilk':
      if (wind >= 10) add(-10, 'Kald vind på isen: kle deg godt');
      if (dusk) add(5, 'Halvlys: fisken går på');
      if ((h.temp ?? 0) < -15) add(-8, 'Bitende kaldt');
      break;
  }
}

/** Vanntemperaturen, når den er kjent. */
function water(id, wt, add) {
  if (wt === null) return;
  if (wt < 6) {
    if (id === 'flue') add(-15, 'For kaldt vann for flue');
    if (id === 'mark') add(6, 'Kaldt vann: sakte agn som mark');
    if (id === 'markdrag') add(3, 'Kaldt vann: sakte mark er riktig');
    if (id === 'sluk') add(-4, 'Kaldt vann: sveiv sakte');
    // Spinneren går grunt og trenger fart for å snurre; i kaldt vann står fisken dypere og tregere.
    if (id === 'spinner') add(-8, 'Kaldt vann: spinneren går for grunt');
    if (id === 'wobbler') add(-6, 'Kaldt vann: rovfisken er treg');
  }
  if (wt >= 16) {
    if (id === 'dypfiske') add(15, 'Varm overflate: fisken står dypt');
    if (id === 'dorging') add(10, 'Varm overflate: dorg dypt');
    if (id === 'markdrag') add(-8, 'Varm overflate: fisken står dypt');
    // Sluken går dypere enn spinneren, så den taper mindre på varmt vann.
    if (id === 'sluk') add(-4, 'Varmt vann: fisken står dypere');
    if (id === 'spinner') add(-8, 'Varmt vann: spinneren går for grunt');
    if (id === 'flue') add(-4, null);
  }
}

/** Arten skyver litt på rekkefølgen. */
function nudge(id, species, season, river, add) {
  switch (species) {
    case 'gjedde':
      if (id === 'wobbler') add(15, 'Gjedde: stor wobbler og stålfortom');
      if (id === 'sluk') add(12, 'Gjedde: store sluk og stålfortom');
      // Gjedde på flue finnes, men krever tungt utstyr; for de fleste er det et dårlig råd.
      if (id === 'flue') add(-20, null);
      if (id === 'markdrag') add(-12, null);
      // Gjedda står grunt ved vegetasjon, så dyp dorg etter spredt fisk treffer dårlig.
      if (id === 'dorging') add(-6, null);
      if (id === 'dypfiske') add(-10, 'Gjedda står grunt ved vegetasjon');
      if (id === 'oter') add(-15, 'Oter er laget for ørret');
      break;
    case 'roye':
      if (id === 'pilk') add(8, 'Røya tar godt på pilk');
      if (id === 'dypfiske') add(season === 'sommer' ? 15 : 10, 'Røya står dypt og kaldt');
      if (id === 'flue') add(6, 'Røya tar små fluer i vaket');
      if (id === 'dorging') add(4, null);
      if (id === 'sluk') add(-10, null);
      if (id === 'spinner') add(-6, null);
      if (id === 'wobbler') add(-10, null);
      break;
    case 'sik':
      if (id === 'pilk') add(8, 'Sik tar små pilker med maggot');
      if (id === 'dypfiske') add(6, null);
      if (id === 'flue') add(6, 'Sik tar små fluer og nymfer');
      if (id === 'mark') add(4, null);
      if (id === 'sluk') add(-12, 'Sik tar sjelden sluk');
      if (id === 'wobbler') add(-12, null);
      if (id === 'spinner') add(-10, null);
      if (id === 'oter') add(-8, null);
      break;
    case 'abbor':
      if (id === 'spinner') add(8, 'Abboren tar gjerne spinner');
      if (id === 'dypfiske' && season === 'host') add(12, 'Abboren samler seg dypt om høsten');
      if (id === 'mark') add(4, null);
      if (id === 'wobbler') add(4, null);
      if (id === 'flue') add(-8, null);
      if (id === 'markdrag') add(-8, null);
      if (id === 'oter') add(-15, 'Oter er laget for ørret');
      break;
    case 'orret':
      if (id === 'oter') add(10, 'Oter er laget for ørret');
      if (id === 'markdrag') add(6, 'Markdrag er klassisk for ørret');
      if (id === 'flue') add(4, null);
      if (id === 'sluk') add(4, null);
      break;
    case 'laks':
    case 'sjoorret':
      if (id === 'sluk' || id === 'flue') add(10, river ? 'Klassisk i elva' : null);
      if (id === 'spinner' || id === 'wobbler') add(8, null);
      if (id === 'mark') add(-5, null);
      break;
  }
}

/**
 * Er det otervær? Oteren trenger jevn bris for å gå ut fra land, og
 * krusningen skjuler lina. Blikkstille går ikke, og for mye vind er utrygt.
 *
 * @returns {{good:boolean, label:string, text:string}}
 */
export function oterWeather(hour, season) {
  const no = (text) => ({ good: false, label: 'Ikke otervær', text });
  if (season === 'vinter') return no('Isen ligger: oter brukes bare i åpent vann.');
  if (!hour) return { good: false, label: 'Ukjent', text: 'Mangler vær for timen, så otervær kan ikke vurderes.' };

  const wind = hour.wind ?? 0;
  const gust = hour.gust ?? wind;
  if (hour.code >= 95) return no('Torden: hold deg unna vannet.');
  if (wind >= 10 || gust >= 14) return no('For mye vind og kast: oteren blir vanskelig å styre og det er utrygt.');
  if (wind < 1.5) return no('Blikkstille: oteren går ikke ut, og fisken ser lina i blankt vann.');
  if (wind < 3) return no('For svak bris: oteren går dårlig ut fra land.');
  if (wind > 8) return no('Frisk vind: oteren blir tung og krevende å holde.');

  const why = (hour.cloud ?? 0) >= 60
    ? 'Jevn bris og overskyet: oteren går fint ut og fisken tør mer'
    : 'Jevn bris og krusning: oteren går fint ut';
  return { good: true, label: 'Otervær', text: `${why}, men oter krever ofte egen tillatelse.` };
}
