/**
 * Setter sammen vær og himmel til det appen viser: hvert døgn med sine timer,
 * poeng, beste perioder, sol og måne. Ren funksjon av værdata, sted og «nå»,
 * så den kan testes uten nett.
 */
import { skyDay, solunarPeriods, sunAltitude } from './astro.js';
import { bestWindows, dayScore, hourScore } from './score.js';
import { estimateWaterTemp } from './weather.js';

const DAY = 86_400_000;
const HOUR = 3_600_000;

export function buildModel(forecast, place, now = Date.now()) {
  const { lat, lon } = place;
  // Dagene fra og med i dag. Fortiden er bare med for vanntemperaturen.
  const days = forecast.days
    .filter((d) => d.start + DAY > now)
    .map((d) => {
      const sky = skyDay(d.start, lat, lon);
      const periods = solunarPeriods(sky);
      const hours = forecast.hours
        .filter((h) => h.t >= d.start && h.t < d.start + DAY)
        .map((h) => {
          const sunAlt = sunAltitude(h.t + HOUR / 2, lat, lon);
          return { ...h, sunAlt, ...hourScore(h, sky, periods, sunAlt) };
        });
      return {
        ...d,
        sky,
        periods,
        hours,
        score: dayScore(hours),
        windows: bestWindows(hours),
      };
    });

  const today = days[0];
  const nowHour = today?.hours.find((h) => now >= h.t && now < h.t + HOUR) ?? today?.hours[0] ?? null;

  // Neste gode periode som ikke er over ennå, i dag eller i morgen.
  const nextWindow =
    days
      .slice(0, 2)
      .flatMap((d) => d.windows)
      .find((w) => w.end > now) ?? null;

  return {
    days,
    now: nowHour,
    nextWindow,
    waterTemp: estimateWaterTemp(forecast.days, now),
    timezone: forecast.timezone,
  };
}
