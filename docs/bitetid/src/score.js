/**
 * Bitepoeng: hvor godt det ligger an for fisk i en gitt time, 0–100.
 *
 * Dette er erfaring fra fiskere, ikke fysikk. Vektene speiler det som
 * oftest går igjen hos dem som fisker mye i innsjøer:
 *
 * - Lyset betyr mest. Timene rundt soloppgang og solnedgang er best for
 *   nesten alle arter; fisken jakter i halvlys.
 * - Lufttrykket teller. Svakt fallende trykk før et vær er kjent for godt
 *   bitt; rett etter en front, når trykket stiger raskt, er det ofte tregt.
 * - Vind er bra for fisken. Krusning gjør den mindre sky og fører mat inn
 *   mot land på vindsiden. Sterk vind og kuling er et problem for deg, ikke
 *   fisken, og vises som NB-varsel uten å trekke ned.
 * - Overskyet slår stekende sol midt på dagen.
 * - Månen (solunar-perioder) gir et dytt, men mindre enn lyset.
 *
 * Hver del gir en kort grunn, så appen kan forklare tallet i stedet for å
 * bare vise det.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;

/**
 * Hvorfor hver grunn teller, i én eller to setninger. Vises når du vil vite
 * mer enn «+ Fallende lufttrykk»: hva som skjer i vannet, ikke bare tallet.
 */
export const WHY = {
  'Rundt soloppgang':
    'I halvlyset jakter rovfisken: småfisk og insekter er i bevegelse, og fisken ser byttet uten selv å bli sett så lett.',
  'Rundt solnedgang':
    'Kvelden er ofte dagens beste tid. Lyset blir svakere, insektene kommer, og fisken går inn på grunnere vann for å spise.',
  'Nær skumring': 'Det nærmer seg halvlys. Fisken blir mer aktiv jo nærmere soloppgang eller solnedgang du kommer.',
  Mørkt: 'De fleste arter spiser mindre i mørket. Ørret kan likevel ta i lyse sommernetter.',
  'Stor solunar-periode':
    'Månen står høyest eller lavest. Etter solunar-teorien er fisken mer aktiv da. Den virkningen er mindre enn lyset, men den teller litt.',
  'Liten solunar-periode': 'Månen står opp eller går ned. Ifølge solunar-teorien gir det en kortere og svakere aktivitetstopp.',
  Fullmåne: 'Rundt fullmåne og nymåne er tidevannskreftene størst, og mange fiskere melder om bedre bitt.',
  Nymåne: 'Rundt nymåne og fullmåne er tidevannskreftene størst, og mange fiskere melder om bedre bitt.',
  'Trykket faller raskt': 'Fisken biter ofte godt rett før et uvær, når trykket faller raskt. Følg med på været.',
  'Fallende lufttrykk':
    'Svakt fallende trykk før et værskifte er kjent for godt bitt. Fisken ser ut til å spise før været snur.',
  'Stabilt lufttrykk': 'Stabilt vær gir jevnt og forutsigbart fiske, uten de store toppene.',
  'Stigende lufttrykk': 'Trykket stiger etter et værskifte. Fisken blir ofte litt tregere en stund.',
  'Trykket stiger raskt — ofte tregt etter en front':
    'Rett etter en kaldfront, med klar himmel og raskt stigende trykk, står fisken gjerne dypt og biter dårlig.',
  'Blikkstille, fisken er sky': 'Blankt vann gjør at fisken ser deg, båten og lina. Fisk lenger unna og med tynnere line.',
  'Fin krusning på vannet':
    'Litt vind bryter opp overflata så fisken blir mindre sky, og fører mat inn mot land på vindsiden.',
  Nordavind:
    'Nordavind fører kald luft, ofte rett etter en kaldfront. Fisken trekker gjerne dypere og biter dårlig, særlig et par dager etter fronten.',
  'Kaldt vindskifte':
    'Det har blitt minst 2 grader kaldere de siste seks timene samtidig som vinden har gått i nord. Et brått temperaturfall gjør fisken treg.',
  'Vind driver mat mot land':
    'Vinden fører plankton, insekter og småfisk inn mot land der den blåser. Fisken følger etter, så kast mot vindsiden.',
  'Overskyet, fisken tør mer': 'Uten sterk sol står fisken grunnere og jakter mer, også midt på dagen.',
  'Sterk sol': 'I sterk sol trekker fisken dypere eller inn i skyggen, og blir mer sky.',
  'Kraftig regn': 'Mye regn gjør vannet grumsete, så fisken ser agnet dårligere, og kan få elver til å flomme.',
  'Lett regn': 'Lett regn bryter opp overflata og vasker insekter og mark ut i vannet.',
};

/** NB-varsler: ting som angår deg, ikke fisken. De trekker ikke ned. */
export const WARN = {
  'Mye vind': 'Tungt å kaste og kjenne bitt, og urolig i båt. Fisk fra land på vindsiden.',
  'Kuling — farlig i båt': 'Så mye vind er farlig i båt. Fisk fra land, helst der du har le.',
  'Kraftige vindkast': 'Kraftige kast kan velte en liten båt. Hold deg nær land.',
  'Uvær på vei': 'Trykket faller raskt, og det kommer ofte storm etter. Vær klar til å gå i land.',
  'Torden — hold deg unna vannet': 'Lyn treffer gjerne det høyeste punktet, og på vannet er det deg og stanga. Gå i land.',
  'Bitende kaldt': 'Kle deg godt og pass på fingre og føtter, særlig på isen.',
};

/**
 * @param {object} h  timen: { t, temp, wind, gust, cloud, precip, code, pressureTrend }
 *                    pressureTrend er endring i hPa siste 3 timer (null om ukjent)
 * @param {object} sky skyDay() for døgnet timen ligger i
 * @param {Array} periods solunarPeriods() for samme døgn
 * @param {number} sunAlt solhøyde i grader midt i timen
 */
export function hourScore(h, sky, periods, sunAlt) {
  const reasons = [];
  const warnings = [];
  let score = 30;
  const add = (points, text) => {
    score += points;
    if (text) reasons.push({ points, text, why: WHY[text] ?? '' });
  };
  // Poengene sier hvor godt fisken biter. Det som bare gjør det tungt eller
  // farlig for deg — sterk vind, torden, kulde — er et NB-varsel ved siden
  // av, ikke et minus. Mye vind kan godt være godt fiske.
  const warn = (text) => warnings.push({ text, why: WARN[text] ?? '' });

  // Lys: nærhet til soloppgang og solnedgang.
  const mid = h.t + HOUR / 2;
  const nearest = [sky.sunrise, sky.sunset]
    .filter((t) => t !== null)
    .map((t) => Math.abs(mid - t))
    .sort((a, b) => a - b)[0];
  if (nearest !== undefined && nearest <= 60 * MIN) {
    add(25, mid < (sky.sunrise ?? 0) + HOUR ? 'Rundt soloppgang' : 'Rundt solnedgang');
  } else if (nearest !== undefined && nearest <= 120 * MIN) {
    add(12, 'Nær skumring');
  } else if (sunAlt < -6 && sky.polar !== 'mørketid') {
    add(-10, 'Mørkt');
  }

  // Månen: store og små solunar-perioder.
  for (const p of periods) {
    if (mid < p.start || mid > p.end) continue;
    const half = (p.end - p.start) / 2;
    const closeness = 1 - Math.abs(mid - p.peak) / half;
    if (p.kind === 'stor') add(Math.round(8 + 10 * closeness), 'Stor solunar-periode');
    else add(Math.round(4 + 6 * closeness), 'Liten solunar-periode');
    break;
  }
  if (Math.min(sky.phase, 1 - sky.phase, Math.abs(sky.phase - 0.5)) < 0.05) {
    add(6, sky.phase > 0.25 && sky.phase < 0.75 ? 'Fullmåne' : 'Nymåne');
  }

  // Lufttrykk siste 3 timer.
  const dp = h.pressureTrend;
  if (dp !== null && dp !== undefined) {
    if (dp <= -3) {
      add(6, 'Trykket faller raskt');
      warn('Uvær på vei');
    }
    else if (dp <= -0.7) add(12, 'Fallende lufttrykk');
    else if (dp < 0.7) add(4, 'Stabilt lufttrykk');
    else if (dp < 2) add(-3, 'Stigende lufttrykk');
    else add(-10, 'Trykket stiger raskt — ofte tregt etter en front');
  }

  // Vind (m/s). Varselet måler 10 m over bakken i åpent terreng; på et vann
  // med skog rundt er det som regel mindre. For fisken er vind bra: den
  // bryter overflata og driver mat inn mot vindsiden. Sterk vind er et
  // problem for deg, ikke fisken, og blir et NB-varsel.
  if (h.wind < 1) add(-2, 'Blikkstille, fisken er sky');
  else if (h.wind < 6) add(8, 'Fin krusning på vannet');
  else add(4, 'Vind driver mat mot land');
  // Nordavind: kald luft, ofte rett etter en kaldfront. Det er kulden og
  // fronten som gjør fisken treg, ikke vindretningen i seg selv, men
  // nordavinden er et godt tegn på dem. I stille vær betyr retningen ingenting.
  const dir = ((h.windDir ?? 0) % 360 + 360) % 360;
  if (h.wind >= 2 && (dir >= 315 || dir <= 45)) {
    add(-6, 'Nordavind');
    if (h.tempTrend != null && h.tempTrend <= -2) add(-4, 'Kaldt vindskifte');
  }
  if (h.wind >= 14) warn('Kuling — farlig i båt');
  else if (h.wind >= 10) warn('Mye vind');
  if (h.gust >= 18) warn('Kraftige vindkast');

  // Skyer, når sola er oppe.
  if (sunAlt > 0) {
    if (h.cloud >= 70) add(6, 'Overskyet, fisken tør mer');
    else if (h.cloud < 20 && sunAlt > 25) add(-6, 'Sterk sol');
  }

  // Nedbør og torden.
  if (h.code >= 95) warn('Torden — hold deg unna vannet');
  if (h.precip > 4) add(-8, 'Kraftig regn');
  else if (h.precip >= 0.1) add(4, 'Lett regn');

  if (h.temp < -15) warn('Bitende kaldt');

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons: reasons.sort((a, b) => Math.abs(b.points) - Math.abs(a.points)),
    warnings,
  };
}

export function scoreLabel(score) {
  if (score >= 70) return 'Toppforhold';
  if (score >= 50) return 'Bra';
  if (score >= 30) return 'Middels';
  return 'Tregt';
}

/**
 * De beste periodene i et døgn: timer som ligger nær dagens beste, slått
 * sammen når de henger sammen. Høyst tre, i tidsrekkefølge.
 *
 * @param {{t:number, score:number}[]} hours
 */
export function bestWindows(hours, max = 3) {
  if (hours.length === 0) return [];
  const top = Math.max(...hours.map((h) => h.score));
  const cutoff = Math.max(50, top - 10);
  const windows = [];
  for (const h of hours) {
    if (h.score < cutoff) continue;
    const last = windows[windows.length - 1];
    if (last && last.end === h.t) {
      last.end = h.t + HOUR;
      last.peak = Math.max(last.peak, h.score);
    } else {
      windows.push({ start: h.t, end: h.t + HOUR, peak: h.score });
    }
  }
  return windows
    .sort((a, b) => b.peak - a.peak || a.start - b.start)
    .slice(0, max)
    .sort((a, b) => a.start - b.start);
}

/** Dagens tall: snittet av de fem beste timene. En god kveld redder dagen. */
export function dayScore(hours) {
  if (hours.length === 0) return 0;
  const best = hours.map((h) => h.score).sort((a, b) => b - a).slice(0, 5);
  return Math.round(best.reduce((sum, s) => sum + s, 0) / best.length);
}
