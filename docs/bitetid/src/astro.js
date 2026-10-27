/**
 * Sol og måne, regnet ut på telefonen. Ingen nettverkskall: dette virker også
 * ved et vann uten dekning.
 *
 * Formlene er de samme som i SunCalc (Vladimir Agafonkin, BSD), skrevet på
 * nytt i kort form. Nøyaktigheten er et par minutter, langt bedre enn det
 * fisken bryr seg om.
 *
 * Opp- og nedgang finnes ved å se på høyden hvert femte minutt gjennom døgnet
 * i stedet for med lukkede formler. Det er tregere, men det tåler det norske
 * tilfellet formlene sliter med: midnattssol og mørketid, der sola aldri
 * krysser horisonten.
 */

const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQUITY = RAD * 23.4397;

const toDays = (ms) => ms / DAY_MS - 0.5 + J1970 - J2000;

const rightAscension = (l, b) =>
  Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY), Math.cos(l));
const declination = (l, b) =>
  Math.asin(Math.sin(b) * Math.cos(OBLIQUITY) + Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l));
const altitudeOf = (H, phi, dec) =>
  Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
const siderealTime = (d, lw) => RAD * (280.16 + 360.9856235 * d) - lw;

function refraction(h) {
  const a = h < 0 ? 0 : h;
  return 0.0002967 / Math.tan(a + 0.00312536 / (a + 0.08901179));
}

function sunCoords(d) {
  const M = RAD * (357.5291 + 0.98560028 * d);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  return { dec: declination(L, 0), ra: rightAscension(L, 0) };
}

function moonCoords(d) {
  const L = RAD * (218.316 + 13.176396 * d);
  const M = RAD * (134.963 + 13.064993 * d);
  const F = RAD * (93.272 + 13.22935 * d);
  const l = L + RAD * 6.289 * Math.sin(M);
  const b = RAD * 5.128 * Math.sin(F);
  return { ra: rightAscension(l, b), dec: declination(l, b), dist: 385001 - 20905 * Math.cos(M) };
}

/** Solhøyde i grader. */
export function sunAltitude(ms, lat, lon) {
  const d = toDays(ms);
  const c = sunCoords(d);
  const H = siderealTime(d, RAD * -lon) - c.ra;
  return altitudeOf(H, RAD * lat, c.dec) / RAD;
}

/** Månehøyde i grader, med lysbrytning. */
export function moonAltitude(ms, lat, lon) {
  const d = toDays(ms);
  const c = moonCoords(d);
  const H = siderealTime(d, RAD * -lon) - c.ra;
  const h = altitudeOf(H, RAD * lat, c.dec);
  return (h + refraction(h)) / RAD;
}

/**
 * Månefase. `phase` går 0 → 1: 0 nymåne, 0,25 første kvarter, 0,5 fullmåne,
 * 0,75 siste kvarter. `fraction` er hvor stor del av skiva som er opplyst.
 */
export function moonIllumination(ms) {
  const d = toDays(ms);
  const s = sunCoords(d);
  const m = moonCoords(d);
  const sunDist = 149598000;
  const phi = Math.acos(
    Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra),
  );
  const inc = Math.atan2(sunDist * Math.sin(phi), m.dist - sunDist * Math.cos(phi));
  const angle = Math.atan2(
    Math.cos(s.dec) * Math.sin(s.ra - m.ra),
    Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra),
  );
  return {
    fraction: (1 + Math.cos(inc)) / 2,
    phase: 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI,
  };
}

const PHASE_NAMES = [
  [0.03, 'Nymåne'],
  [0.22, 'Voksende månesigd'],
  [0.28, 'Første kvarter'],
  [0.47, 'Voksende måne'],
  [0.53, 'Fullmåne'],
  [0.72, 'Minkende måne'],
  [0.78, 'Siste kvarter'],
  [0.97, 'Minkende månesigd'],
  [1.01, 'Nymåne'],
];

export function phaseName(phase) {
  return PHASE_NAMES.find(([limit]) => phase < limit)[1];
}

/** Dager til neste fullmåne og nymåne, så forsiden kan si «fullmåne om 3 dager». */
export function daysUntilPhase(phase, target) {
  const SYNODIC = 29.530588;
  const diff = (((target - phase) % 1) + 1) % 1;
  return diff * SYNODIC;
}

const STEP_MS = 5 * 60_000;

/** Første tidspunkt i [from, to) der f(t) - level skifter fortegn, i gitt retning. */
function crossings(f, level, from, to) {
  const ups = [];
  const downs = [];
  let prevT = from;
  let prev = f(from) - level;
  for (let t = from + STEP_MS; t <= to; t += STEP_MS) {
    const cur = f(t) - level;
    if (prev < 0 && cur >= 0) ups.push(prevT + (STEP_MS * -prev) / (cur - prev));
    if (prev >= 0 && cur < 0) downs.push(prevT + (STEP_MS * prev) / (prev - cur));
    prev = cur;
    prevT = t;
  }
  return { ups, downs };
}

/** Topper og bunner i høyden: månen øverst og nederst på himmelen. */
function extremes(f, from, to) {
  const highs = [];
  const lows = [];
  let a = f(from - STEP_MS);
  let b = f(from);
  for (let t = from; t < to; t += STEP_MS) {
    const c = f(t + STEP_MS);
    if (b > a && b >= c) highs.push(refine(t, a, b, c));
    if (b < a && b <= c) lows.push(refine(t, a, b, c));
    a = b;
    b = c;
  }
  return { highs, lows };
}

/** Toppunktet på en parabel gjennom tre punkter, for minuttnøyaktighet. */
function refine(t, a, b, c) {
  const denom = a - 2 * b + c;
  if (denom === 0) return t;
  return t + (STEP_MS * (a - c)) / (2 * denom);
}

/**
 * Alt som skjer på himmelen i ett døgn, fra `dayStart` (lokal midnatt, som
 * millisekunder) og 24 timer fram. Tider er null når de ikke skjer — sola
 * går ikke ned i juni i Tromsø.
 */
export function skyDay(dayStart, lat, lon) {
  const dayEnd = dayStart + DAY_MS;
  const sun = (t) => sunAltitude(t, lat, lon);
  const moon = (t) => moonAltitude(t, lat, lon);

  const sunTimes = crossings(sun, -0.833, dayStart, dayEnd);
  const civil = crossings(sun, -6, dayStart, dayEnd);
  const moonTimes = crossings(moon, 0.133, dayStart, dayEnd);
  const transits = extremes(moon, dayStart, dayEnd);

  const noonAlt = sun(dayStart + DAY_MS / 2);
  const illum = moonIllumination(dayStart + DAY_MS / 2);

  return {
    sunrise: sunTimes.ups[0] ?? null,
    sunset: sunTimes.downs[0] ?? null,
    dawn: civil.ups[0] ?? null,
    dusk: civil.downs[0] ?? null,
    polar: sunTimes.ups.length === 0 && sunTimes.downs.length === 0 ? (noonAlt > 0 ? 'midnattssol' : 'mørketid') : null,
    moonrise: moonTimes.ups[0] ?? null,
    moonset: moonTimes.downs[0] ?? null,
    moonOverhead: transits.highs,
    moonUnderfoot: transits.lows,
    phase: illum.phase,
    fraction: illum.fraction,
  };
}

/**
 * Solunar-periodene etter John Alden Knights teori: «store» perioder rundt
 * når månen står høyest og lavest (±1 time), «små» rundt opp- og nedgang
 * (±30 min). Om fisken bryr seg om månen er omdiskutert; tiden rundt
 * soloppgang og solnedgang betyr mer, og vektes tyngre i poengsummen.
 */
export function solunarPeriods(sky) {
  const major = [...sky.moonOverhead, ...sky.moonUnderfoot].map((t) => ({
    kind: 'stor',
    start: t - 60 * 60_000,
    end: t + 60 * 60_000,
    peak: t,
  }));
  const minor = [sky.moonrise, sky.moonset]
    .filter((t) => t !== null)
    .map((t) => ({ kind: 'liten', start: t - 30 * 60_000, end: t + 30 * 60_000, peak: t }));
  return [...major, ...minor].sort((a, b) => a.start - b.start);
}
