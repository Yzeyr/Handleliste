/**
 * Værarkivet: timene som har vært, lagret på telefonen over tid.
 *
 * Hver gang appen henter vær, legges timene som er passert inn her. Første
 * gang for et vann hentes tre måneder bakover (det Open-Meteo gir); etter det
 * bare de siste dagene, så appen bruker lite data. Arkivet holder ett år per
 * vann og høyst fem vann. Det lagres kompakt — én liten talliste per time —
 * fordi telefonens lagringsplass for nettsider er begrenset og deles med
 * handlelista på samme adresse.
 */

const KEY = 'bitetid.vaerarkiv.v1';
const HOUR = 3_600_000;
export const MAX_DAYS = 366;
export const MAX_PLACES = 5;

export const placeKey = (p) => `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;

/** Én time som tall: [time siden 1970, temp×10, nedbør×10, skyer, trykk×10, vind×10, retning, kast×10, værkode]. */
export function encodeHour(h) {
  const r = (v, f = 10) => (v == null ? null : Math.round(v * f));
  return [Math.round(h.t / HOUR), r(h.temp), r(h.precip), r(h.cloud, 1), r(h.pressure), r(h.wind), r(h.windDir, 1), r(h.gust), h.code ?? 0];
}

export function decodeHour(row) {
  const d = (v, f = 10) => (v == null ? null : v / f);
  return {
    t: row[0] * HOUR,
    temp: d(row[1]),
    precip: d(row[2]) ?? 0,
    cloud: row[3] ?? 0,
    pressure: d(row[4]),
    wind: d(row[5]) ?? 0,
    windDir: row[6] ?? 0,
    gust: d(row[7]) ?? 0,
    code: row[8] ?? 0,
  };
}

/**
 * Legger de passerte timene fra et nytt varsel inn i arkivet for vannet.
 * Nyere data vinner over eldre for samme time. Ren funksjon: gir et nytt
 * arkiv tilbake og rører ikke det gamle.
 */
export function mergeHistory(archive, place, forecast, now) {
  const key = placeKey(place);
  const old = archive.places[key];
  const byHour = new Map((old?.rows ?? []).map((row) => [row[0], row]));
  for (const h of forecast.hours) {
    if (h.t + HOUR > now) continue;
    if (h.temp == null && h.pressure == null) continue;
    const row = encodeHour(h);
    byHour.set(row[0], row);
  }
  const oldest = Math.round(now / HOUR) - MAX_DAYS * 24;
  const rows = [...byHour.values()].filter((row) => row[0] >= oldest).sort((a, b) => a[0] - b[0]);

  const places = {
    ...archive.places,
    [key]: { name: place.name, lat: place.lat, lon: place.lon, timezone: forecast.timezone, updated: now, rows },
  };
  // For mange vann: det som er brukt minst nylig, ryker først.
  const keys = Object.keys(places).sort((a, b) => places[b].updated - places[a].updated);
  for (const k of keys.slice(MAX_PLACES)) delete places[k];
  return { places };
}

/** Timene for et vann, med trykkutvikling over tre timer, klare for poengsetting. */
export function historyHours(archive, place) {
  const entry = archive.places[placeKey(place)];
  if (!entry) return [];
  const hours = entry.rows.map(decodeHour);
  for (let i = 0; i < hours.length; i += 1) {
    const before = hours[i - 3];
    const contiguous = before && hours[i].t - before.t === 3 * HOUR;
    hours[i].pressureTrend =
      contiguous && before.pressure != null && hours[i].pressure != null ? hours[i].pressure - before.pressure : null;
  }
  return hours;
}

/** Hvor mange hele dager arkivet dekker for vannet. */
export function coveredDays(archive, place) {
  const rows = archive.places[placeKey(place)]?.rows ?? [];
  return Math.floor(rows.length / 24);
}

/** Trengs det et langt tilbakeblikk? Ja, hvis arkivet mangler noe av de siste tre ukene. */
export function needsBackfill(archive, place, now) {
  const rows = archive.places[placeKey(place)]?.rows ?? [];
  if (rows.length === 0) return true;
  const want = Math.round(now / HOUR) - 21 * 24;
  const have = new Set(rows.map((r) => r[0]));
  let missing = 0;
  for (let h = want; h < Math.round(now / HOUR) - 48; h += 1) if (!have.has(h)) missing += 1;
  return missing > 24;
}

export function loadArchive() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : { places: {} };
  } catch {
    return { places: {} };
  }
}

/**
 * Lagrer arkivet. Er lagringen full, kuttes det eldste halvåret i alle vann
 * før neste forsøk — appen skal heller glemme gammelt vær enn slutte å virke.
 */
export function saveArchive(archive) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      localStorage.setItem(KEY, JSON.stringify(archive));
      return archive;
    } catch {
      for (const entry of Object.values(archive.places)) entry.rows = entry.rows.slice(Math.floor(entry.rows.length / 2));
    }
  }
  return archive;
}
