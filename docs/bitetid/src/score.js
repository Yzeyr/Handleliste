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
 * - Litt vind er bra. Krusning gjør fisken mindre sky og fører mat inn mot
 *   land på vindsiden. Storm er dårlig, og farlig i båt.
 * - Overskyet slår stekende sol midt på dagen.
 * - Månen (solunar-perioder) gir et dytt, men mindre enn lyset.
 *
 * Hver del gir en kort grunn, så appen kan forklare tallet i stedet for å
 * bare vise det.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;

/**
 * @param {object} h  timen: { t, temp, wind, gust, cloud, precip, code, pressureTrend }
 *                    pressureTrend er endring i hPa siste 3 timer (null om ukjent)
 * @param {object} sky skyDay() for døgnet timen ligger i
 * @param {Array} periods solunarPeriods() for samme døgn
 * @param {number} sunAlt solhøyde i grader midt i timen
 */
export function hourScore(h, sky, periods, sunAlt) {
  const reasons = [];
  let score = 30;
  const add = (points, text) => {
    score += points;
    if (text) reasons.push({ points, text });
  };

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
    if (dp <= -3) add(-6, 'Trykket faller raskt — uvær på vei');
    else if (dp <= -0.7) add(12, 'Fallende lufttrykk');
    else if (dp < 0.7) add(4, 'Stabilt lufttrykk');
    else if (dp < 2) add(-3, 'Stigende lufttrykk');
    else add(-10, 'Trykket stiger raskt — ofte tregt etter en front');
  }

  // Vind (m/s).
  if (h.wind < 1) add(-2, 'Blikkstille, fisken er sky');
  else if (h.wind < 6) add(8, 'Fin krusning på vannet');
  else if (h.wind < 9) add(0, null);
  else if (h.wind < 12) add(-10, 'Mye vind');
  else add(-20, 'Kuling — farlig i båt');
  if (h.gust >= 15) add(-8, 'Kraftige vindkast');

  // Skyer, når sola er oppe.
  if (sunAlt > 0) {
    if (h.cloud >= 70) add(6, 'Overskyet, fisken tør mer');
    else if (h.cloud < 20 && sunAlt > 25) add(-6, 'Sterk sol');
  }

  // Nedbør og torden.
  if (h.code >= 95) add(-25, 'Torden — hold deg unna vannet');
  else if (h.precip > 4) add(-8, 'Kraftig regn');
  else if (h.precip >= 0.1) add(4, 'Lett regn');

  if (h.temp < -15) add(-8, 'Bitende kaldt');

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons: reasons.sort((a, b) => Math.abs(b.points) - Math.abs(a.points)),
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
