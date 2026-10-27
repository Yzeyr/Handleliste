/**
 * Været fra Open-Meteo: gratis, uten nøkkel, og bruker MET Norges modeller
 * for Norden. Tider hentes som unix-tid, så sommertid aldri forskyver noe;
 * visningen regner om til stedets tidssone selv.
 */

const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';

const HOURLY = [
  'temperature_2m',
  'precipitation',
  'cloud_cover',
  'pressure_msl',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'weather_code',
];
const DAILY = ['temperature_2m_max', 'temperature_2m_min', 'weather_code', 'precipitation_sum', 'wind_speed_10m_max'];

/** Ti dager fram. Lenger enn det er varselet for usikkert til å fiske etter. */
export const FORECAST_DAYS = 10;

/**
 * pastDays: 92 første gang for et vann (det lengste Open-Meteo gir), så
 * arkivet får tre måneder med en gang; ellers 2, så appen bruker lite data.
 */
export async function fetchForecast(lat, lon, { pastDays = 2, signal } = {}) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    hourly: HOURLY.join(','),
    daily: DAILY.join(','),
    wind_speed_unit: 'ms',
    timezone: 'auto',
    timeformat: 'unixtime',
    past_days: String(pastDays),
    forecast_days: String(FORECAST_DAYS),
  });
  const res = await fetch(`${FORECAST}?${params}`, { signal });
  if (!res.ok) throw new Error(`Værtjenesten svarte ${res.status}`);
  return parseForecast(await res.json());
}

/** Gjør Open-Meteos kolonner om til rader. Ren funksjon, så den kan testes. */
export function parseForecast(json) {
  const h = json.hourly;
  const hours = h.time.map((sec, i) => ({
    t: sec * 1000,
    temp: h.temperature_2m[i],
    precip: h.precipitation[i] ?? 0,
    cloud: h.cloud_cover[i] ?? 0,
    pressure: h.pressure_msl[i],
    wind: h.wind_speed_10m[i] ?? 0,
    windDir: h.wind_direction_10m[i] ?? 0,
    gust: h.wind_gusts_10m[i] ?? 0,
    code: h.weather_code[i] ?? 0,
  }));
  for (let i = 0; i < hours.length; i += 1) {
    const before = hours[i - 3];
    hours[i].pressureTrend =
      before && before.pressure != null && hours[i].pressure != null ? hours[i].pressure - before.pressure : null;
    // Temperaturen seks timer bakover, for å se et kaldt vindskifte.
    const sixBefore = hours[i - 6];
    hours[i].tempTrend = sixBefore && sixBefore.temp != null && hours[i].temp != null ? hours[i].temp - sixBefore.temp : null;
  }

  const d = json.daily;
  const days = d.time.map((sec, i) => ({
    start: sec * 1000,
    tmax: d.temperature_2m_max[i],
    tmin: d.temperature_2m_min[i],
    code: d.weather_code[i] ?? 0,
    precip: d.precipitation_sum[i] ?? 0,
    windMax: d.wind_speed_10m_max[i] ?? 0,
  }));

  return { timezone: json.timezone, fetchedAt: Date.now(), hours, days };
}

/**
 * Grovt anslag på overflatetemperaturen i vannet.
 *
 * En innsjø henger etter lufta: den er kaldere enn lufta om våren og varmere
 * om høsten. Anslaget er et vektet snitt av døgntemperaturen de siste tre
 * ukene (nyeste teller mest), pluss et sesongtillegg. Det er godt nok til å
 * skille «kaldt vår-vann» fra «varmt sommervann», ikke til mer.
 */
/**
 * Døgn med høyeste og laveste temperatur, laget av timene. Brukes for
 * arkivet, der Open-Meteo ikke har levert døgnverdier.
 */
export function dailyFromHours(hours, timezone) {
  const key = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const days = new Map();
  for (const h of hours) {
    if (h.temp == null) continue;
    const k = key.format(h.t);
    const d = days.get(k) ?? { start: h.t, tmax: -Infinity, tmin: Infinity, precip: 0, code: 0, windMax: 0, hours: [] };
    d.start = Math.min(d.start, h.t);
    d.tmax = Math.max(d.tmax, h.temp);
    d.tmin = Math.min(d.tmin, h.temp);
    d.precip += h.precip ?? 0;
    d.code = Math.max(d.code, h.code ?? 0);
    d.windMax = Math.max(d.windMax, h.wind ?? 0);
    d.hours.push(h);
    days.set(k, d);
  }
  return [...days.values()].sort((a, b) => a.start - b.start);
}

export function estimateWaterTemp(days, now) {
  const past = days.filter((d) => d.start <= now && d.tmax != null && d.tmin != null);
  if (past.length === 0) return null;
  let sum = 0;
  let weight = 0;
  past.forEach((d) => {
    const ageDays = (now - d.start) / 86_400_000;
    const w = Math.pow(0.5, ageDays / 7);
    sum += w * ((d.tmax + d.tmin) / 2);
    weight += w;
  });
  // Hvor mye vannet ligger over (+) eller under (−) lufta, måned for måned.
  // Størst om våren (isvann) og tidlig høst (sommervarme lagret i dypet).
  const OFFSET = [0, 0, 0, -2, -2.5, -1.5, 0, 1, 2, 1, 0.5, 0];
  const offset = OFFSET[new Date(now).getUTCMonth()];
  return Math.max(0.5, Math.min(25, sum / weight + offset));
}

/** Navnetyper i Kartverkets stedsnavnregister som er vann man kan fiske i. */
const WATER_TYPES = new Set(['Innsjø', 'Vann', 'Tjern', 'Pytt', 'Elv', 'Bekk', 'Gruppe av vann', 'Gruppe av tjern', 'Lon', 'Kanal', 'Os']);

/**
 * Søk etter et vann. Kartverkets stedsnavnregister kjenner hvert norske vann
 * og tjern ved navn; Open-Meteos søk kjenner bare byer og tettsteder. Derfor
 * Kartverket først, med vann øverst, og Open-Meteo for steder utenfor Norge.
 */
export async function searchPlaces(query, signal, near = null) {
  const results = [];
  for (const variant of spellings(query)) {
    try {
      const params = new URLSearchParams({ sok: variant, fuzzy: 'true', utkoordsys: '4258', treffPerSide: '15', side: '1' });
      const res = await fetch(`https://api.kartverket.no/stedsnavn/v1/sted?${params}`, { signal });
      if (res.ok) results.push(...parseKartverket(await res.json()));
    } catch (error) {
      if (error.name === 'AbortError') throw error;
    }
  }
  if (results.filter((r) => r.isLake).length < 2) {
    try {
      const params = new URLSearchParams({ name: query, count: '6', language: 'no', format: 'json' });
      const res = await fetch(`${GEOCODE}?${params}`, { signal });
      if (res.ok) {
        const json = await res.json();
        for (const r of json.results ?? []) {
          results.push({
            name: r.name,
            detail: [r.admin2, r.admin1, r.country_code !== 'NO' ? r.country : null].filter(Boolean).join(', '),
            lat: r.latitude,
            lon: r.longitude,
            isLake: r.feature_code === 'LK',
          });
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') throw error;
    }
  }
  const seen = new Set();
  return results
    .filter((r) => {
      const key = `${r.name}|${r.lat.toFixed(3)}|${r.lon.toFixed(3)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => rankPlace(a, query, near) - rankPlace(b, query, near))
    .slice(0, 10);
}

/**
 * Lavere er bedre. Eksakt navn først (i begge skrivemåter), så navn som
 * begynner med det du skrev, og vann foran alt annet. Innenfor samme trinn:
 * nærmest det vannet du har valgt, så Salvatnet i Namsos kommer foran
 * Salvatnet i Time når du fisker i Namdalen.
 */
export function rankPlace(place, query, near) {
  const name = place.name.toLowerCase();
  const variants = spellings(query).map((v) => v.toLowerCase());
  const match = variants.includes(name) ? 0 : variants.some((v) => name.startsWith(v)) ? 1 : 2;
  const water = place.isLake ? 0 : 1;
  const km = near ? distanceKm(near, place) : 0;
  return match * 100_000 + water * 50_000 + Math.min(km, 49_999);
}

export function distanceKm(a, b) {
  const R = 6371;
  const toRad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toRad;
  const dLon = (b.lon - a.lon) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * «Salvannet» og «Salvatnet» er samme vann; kartet bruker den lokale
 * skrivemåten, folk skriver den de er vant til. Søk på begge.
 */
export function spellings(query) {
  const q = query.trim();
  const out = [q];
  const swaps = [
    [/vannet\b/i, 'vatnet'],
    [/vatnet\b/i, 'vannet'],
    [/vann\b/i, 'vatn'],
    [/vatn\b/i, 'vann'],
  ];
  for (const [pattern, replacement] of swaps) {
    if (pattern.test(q)) {
      out.push(q.replace(pattern, replacement));
      break;
    }
  }
  return out;
}

/** Ren funksjon for Kartverkets svar, så den kan testes uten nett. */
export function parseKartverket(json) {
  return (json.navn ?? [])
    .filter((n) => n.representasjonspunkt && n.stedsnavn?.[0]?.skrivemåte)
    .filter((n) => n.navneobjekttype !== 'Adressenavn')
    .map((n) => {
      // «Namsos - Nåavmesjenjaelmie»: det samiske navnet står i registeret
      // etter en strek. I en kort linje holder det norske.
      const kommuner = (n.kommuner ?? []).map((k) => k.kommunenavn.split(' - ')[0]);
      return {
        name: n.stedsnavn[0].skrivemåte,
        detail: [n.navneobjekttype, kommuner.slice(0, 3).join(', ') + (kommuner.length > 3 ? ' m.fl.' : '')]
          .filter(Boolean)
          .join(' · '),
        lat: n.representasjonspunkt.nord,
        lon: n.representasjonspunkt['øst'],
        isLake: WATER_TYPES.has(n.navneobjekttype),
      };
    });
}

/**
 * Navn på et punkt fra GPS. OpenStreetMap sin tjeneste, brukt sparsomt:
 * én gang når du trykker «Min posisjon». Feiler den, heter stedet bare det.
 */
export async function nameForPoint(lat, lon) {
  try {
    const params = new URLSearchParams({ format: 'jsonv2', lat: String(lat), lon: String(lon), zoom: '14', 'accept-language': 'no' });
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${params}`);
    if (!res.ok) return null;
    const json = await res.json();
    const a = json.address ?? {};
    return a.water ?? a.natural ?? json.name ?? a.village ?? a.town ?? a.municipality ?? null;
  } catch {
    return null;
  }
}

/** WMO-værkoder til norsk tekst og et ikon-navn. */
export function describeWeather(code) {
  if (code === 0) return { text: 'Klarvær', icon: 'sun' };
  if (code <= 2) return { text: 'Lettskyet', icon: 'partly' };
  if (code === 3) return { text: 'Overskyet', icon: 'cloud' };
  if (code <= 48) return { text: 'Tåke', icon: 'fog' };
  if (code <= 57) return { text: 'Yr', icon: 'rain' };
  if (code <= 65) return { text: code === 65 ? 'Kraftig regn' : 'Regn', icon: 'rain' };
  if (code <= 67) return { text: 'Underkjølt regn', icon: 'sleet' };
  if (code <= 77) return { text: 'Snø', icon: 'snow' };
  if (code <= 82) return { text: 'Regnbyger', icon: 'rain' };
  if (code <= 86) return { text: 'Snøbyger', icon: 'snow' };
  return { text: 'Torden', icon: 'thunder' };
}

const COMPASS = ['N', 'NØ', 'Ø', 'SØ', 'S', 'SV', 'V', 'NV'];
/** Vindretning er der vinden kommer fra, som på yr. */
export const compass = (deg) => COMPASS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
