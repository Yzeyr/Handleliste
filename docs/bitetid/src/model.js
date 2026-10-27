/**
 * Setter sammen vær og himmel til det appen viser: hvert døgn med sine timer,
 * poeng, beste perioder, sol og måne. Ren funksjon av værdata, sted og «nå»,
 * så den kan testes uten nett.
 *
 * Hver time får to poengsummer: «erfaring» (score.js, slik fiskere flest
 * tenker) og «forskning» (research.js, vekter etter hva studiene viser). Den
 * du har valgt, ligger direkte på timen (score, reasons, warnings) og styrer
 * kurver og beste tider; den andre ligger under `other`.
 */
import { skyDay, solunarPeriods, sunAltitude } from './astro.js?v=ff2ce435e0';
import { bestWindows, dayScore, hourScore } from './score.js?v=ff2ce435e0';
import { researchScore } from './research.js?v=ff2ce435e0';
import { dailyFromHours, estimateWaterTemp } from './weather.js?v=ff2ce435e0';

const DAY = 86_400_000;
const HOUR = 3_600_000;
/** Fra og med dag 8 er varselet mer usikkert, og appen sier det. */
const CERTAIN_DAYS = 7;

export const MODELS = {
  erfaring: { name: 'Erfaring', short: 'Erfaring' },
  forskning: { name: 'Forskning', short: 'Forskning' },
};

function scoreDay(d, hours, place, opts) {
  const sky = skyDay(d.start, place.lat, place.lon);
  const periods = solunarPeriods(sky);
  // Lyse netter: sola går aldri under −6° (sommer i Namdalen og nordover).
  const lightNights = sky.dawn === null && sky.dusk === null && sky.polar !== 'mørketid';
  const ctx = { speciesId: opts.speciesId, waterTemp: opts.waterTemp, lightNights };
  const scored = hours.map((h) => {
    const sunAlt = sunAltitude(h.t + HOUR / 2, place.lat, place.lon);
    const erfaring = hourScore(h, sky, periods, sunAlt);
    const forskning = researchScore(h, sky, sunAlt, ctx);
    const [main, other] = opts.model === 'forskning' ? [forskning, erfaring] : [erfaring, forskning];
    return { ...h, sunAlt, ...main, other, scores: { erfaring: erfaring.score, forskning: forskning.score } };
  });
  return { ...d, sky, periods, hours: scored, score: dayScore(scored), windows: bestWindows(scored) };
}

/** Timene fra arkivet og varselet, uten doble timer; varselet vinner. */
function mergeHours(a, b) {
  const map = new Map(a.map((h) => [h.t, h]));
  for (const h of b) map.set(h.t, h);
  return [...map.values()].sort((x, y) => x.t - y.t);
}

/**
 * @param history timene fra værarkivet (kan være tomt). Brukes til
 *                vanntemperaturen, som trenger uker bakover.
 * @param opts { model: 'erfaring'|'forskning', speciesId }
 */
export function buildModel(forecast, place, now = Date.now(), history = [], opts = {}) {
  // Vanntemperaturen først: forskningsmodellen trenger den for hver time.
  const pastHours = mergeHours(history, forecast.hours.filter((h) => h.t < now));
  const pastDays = pastHours.length ? dailyFromHours(pastHours, forecast.timezone) : forecast.days;
  const waterTemp = estimateWaterTemp(pastDays, now);
  const o = { model: opts.model ?? 'erfaring', speciesId: opts.speciesId ?? 'orret', waterTemp };

  const days = forecast.days
    .filter((d) => d.start + DAY > now)
    .map((d, i) => ({
      ...scoreDay(d, forecast.hours.filter((h) => h.t >= d.start && h.t < d.start + DAY), place, o),
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

  return { days, now: nowHour, nextWindow, waterTemp, timezone: forecast.timezone, model: o.model };
}

/**
 * De siste dagene fra arkivet, nyeste først, med poeng og beste perioder
 * slik de ville vært regnet ut den dagen. Bare hele døgn, og ikke i dag.
 */
export function buildHistory(hours, place, timezone, now = Date.now(), maxDays = 30, opts = {}) {
  const keyOf = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const todayKey = keyOf.format(now);
  const o = { model: opts.model ?? 'erfaring', speciesId: opts.speciesId ?? 'orret', waterTemp: opts.waterTemp ?? null };
  return dailyFromHours(hours, timezone)
    .filter((d) => keyOf.format(d.start) !== todayKey && d.hours.length >= 20)
    .slice(-maxDays)
    .reverse()
    .map((d) => scoreDay(d, d.hours, place, o));
}
