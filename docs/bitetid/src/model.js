/**
 * Setter sammen vær og himmel til det appen viser: hvert døgn med sine timer,
 * poeng, beste perioder, sol og måne. Ren funksjon av værdata, sted og «nå»,
 * så den kan testes uten nett.
 */
import { skyDay, solunarPeriods, sunAltitude } from './astro.js?v=4783c5f96f';
import { bestWindows, dayScore, hourScore } from './score.js?v=4783c5f96f';
import { dailyFromHours, estimateWaterTemp } from './weather.js?v=4783c5f96f';

const DAY = 86_400_000;
const HOUR = 3_600_000;
/** Fra og med dag 8 er varselet mer usikkert, og appen sier det. */
const CERTAIN_DAYS = 7;

function scoreDay(d, hours, place) {
  const sky = skyDay(d.start, place.lat, place.lon);
  const periods = solunarPeriods(sky);
  const scored = hours.map((h) => {
    const sunAlt = sunAltitude(h.t + HOUR / 2, place.lat, place.lon);
    return { ...h, sunAlt, ...hourScore(h, sky, periods, sunAlt) };
  });
  return { ...d, sky, periods, hours: scored, score: dayScore(scored), windows: bestWindows(scored) };
}

/**
 * @param history timene fra værarkivet (kan være tomt). Brukes til
 *                vanntemperaturen, som trenger uker bakover.
 */
export function buildModel(forecast, place, now = Date.now(), history = []) {
  const days = forecast.days
    .filter((d) => d.start + DAY > now)
    .map((d, i) => ({
      ...scoreDay(d, forecast.hours.filter((h) => h.t >= d.start && h.t < d.start + DAY), place),
      uncertain: i >= CERTAIN_DAYS,
    }));

  const today = days[0];
  const nowHour = today?.hours.find((h) => now >= h.t && now < h.t + HOUR) ?? today?.hours[0] ?? null;

  // Neste gode periode som ikke er over ennå, i dag eller i morgen.
  const nextWindow =
    days
      .slice(0, 2)
      .flatMap((d) => d.windows)
      .find((w) => w.end > now) ?? null;

  // Vanntemperaturen fra arkivet og varselets passerte timer sammen.
  const pastHours = mergeHours(history, forecast.hours.filter((h) => h.t < now));
  const pastDays = pastHours.length ? dailyFromHours(pastHours, forecast.timezone) : forecast.days;

  return {
    days,
    now: nowHour,
    nextWindow,
    waterTemp: estimateWaterTemp(pastDays, now),
    timezone: forecast.timezone,
  };
}

/** Timene fra arkivet og varselet, uten doble timer; varselet vinner. */
function mergeHours(a, b) {
  const map = new Map(a.map((h) => [h.t, h]));
  for (const h of b) map.set(h.t, h);
  return [...map.values()].sort((x, y) => x.t - y.t);
}

/**
 * De siste dagene fra arkivet, nyeste først, med poeng og beste perioder
 * slik de ville vært regnet ut den dagen. Bare hele døgn, og ikke i dag.
 */
export function buildHistory(hours, place, timezone, now = Date.now(), maxDays = 30) {
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const keyOf = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return dailyFromHours(hours, timezone)
    .filter((d) => keyOf.format(d.start) !== todayKey && d.hours.length >= 20)
    .slice(-maxDays)
    .reverse()
    .map((d) => scoreDay(d, d.hours, place));
}
