/**
 * Små byggeklosser for skjermen: formatering, ikoner og tegninger (poengskive,
 * døgnkurve, måne). Alt returnerer HTML-tekst. Tekst fra brukeren går alltid
 * gjennom esc(), så et notat aldri tolkes som markup.
 */
import { sunAltitude } from './astro.js?v=3546145457';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const fmtCache = new Map();
function fmt(tz, opts) {
  const key = tz + JSON.stringify(opts);
  if (!fmtCache.has(key)) fmtCache.set(key, new Intl.DateTimeFormat('nb-NO', { timeZone: tz, ...opts }));
  return fmtCache.get(key);
}

export const time = (ms, tz) => (ms == null ? '–' : fmt(tz, { hour: '2-digit', minute: '2-digit' }).format(ms));
export const hourOnly = (ms, tz) => fmt(tz, { hour: '2-digit' }).format(ms);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
export const weekday = (ms, tz) => cap(fmt(tz, { weekday: 'long' }).format(ms));
export const weekdayShort = (ms, tz) => fmt(tz, { weekday: 'short' }).format(ms).replace('.', '');
export const dateShort = (ms, tz) => fmt(tz, { day: 'numeric', month: 'short' }).format(ms).replace('.', '');
export const dateLong = (ms, tz) => fmt(tz, { weekday: 'long', day: 'numeric', month: 'long' }).format(ms);
export const span = (a, b, tz) => `${time(a, tz)}–${time(b, tz)}`;

export const num = (n, digits = 0) =>
  n == null || Number.isNaN(n) ? '–' : n.toLocaleString('nb-NO', { maximumFractionDigits: digits, minimumFractionDigits: digits });

/** Fargetrinn for et poeng, brukt som klasse: lav, mid, bra, topp. */
export function tier(score) {
  if (score >= 70) return 'topp';
  if (score >= 50) return 'bra';
  if (score >= 30) return 'mid';
  return 'lav';
}

// ---------------------------------------------------------------- ikoner

const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';

const WEATHER_ICONS = {
  sun: `<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>`,
  partly: `<path d="M8.5 4.2v1.6M3.6 9.1h1.6M5 5.6l1.1 1.1M12 5.6l-1.1 1.1"/><path d="M6.2 11a3 3 0 0 1 5.4-2.3"/><path d="M8 19h9a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.6 1.2A2.9 2.9 0 0 0 8 19z"/>`,
  cloud: `<path d="M7 18.5h10a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6 1.4A3.3 3.3 0 0 0 7 18.5z"/>`,
  fog: `<path d="M7 13.5h10a3.6 3.6 0 0 0 .3-7.2 5 5 0 0 0-9.6 1.3A3 3 0 0 0 7 13.5z"/><path d="M4 17h16M6 20.5h12"/>`,
  rain: `<path d="M7 14.5h10a3.8 3.8 0 0 0 .3-7.6 5.2 5.2 0 0 0-10 1.3A3.2 3.2 0 0 0 7 14.5z"/><path d="M8.5 17.5l-1 2.5M12.5 17.5l-1 2.5M16.5 17.5l-1 2.5"/>`,
  sleet: `<path d="M7 14.5h10a3.8 3.8 0 0 0 .3-7.6 5.2 5.2 0 0 0-10 1.3A3.2 3.2 0 0 0 7 14.5z"/><path d="M8.5 17.5l-1 2.5M15.5 18.5h.01M12 19.5h.01"/>`,
  snow: `<path d="M7 14.5h10a3.8 3.8 0 0 0 .3-7.6 5.2 5.2 0 0 0-10 1.3A3.2 3.2 0 0 0 7 14.5z"/><path d="M8.5 18.5h.01M12 20h.01M15.5 18.5h.01M10.2 21.5h.01M13.8 21.5h.01"/>`,
  thunder: `<path d="M7 14h10a3.8 3.8 0 0 0 .3-7.6 5.2 5.2 0 0 0-10 1.3A3.2 3.2 0 0 0 7 14z"/><path d="M12.5 14.5l-2 3.5h3l-2 3.5"/>`,
};

export const weatherIcon = (name, size = 24) =>
  `<svg class="wx" viewBox="0 0 24 24" width="${size}" height="${size}" ${STROKE} aria-hidden="true">${WEATHER_ICONS[name] ?? WEATHER_ICONS.cloud}</svg>`;

/** Pil som peker dit vinden blåser, med retningen den kommer fra i teksten ved siden av. */
export const windArrow = (deg, size = 18) =>
  `<svg class="wind-arrow" viewBox="0 0 24 24" width="${size}" height="${size}" style="transform:rotate(${deg + 180}deg)" ${STROKE} aria-hidden="true"><path d="M12 20V4M6 10l6-6 6 6"/></svg>`;

export const TAB_ICONS = {
  idag: `<circle cx="12" cy="13" r="3.6"/><path d="M12 4.5v2M4.5 13h2M17.5 13h2M6.7 7.7l1.4 1.4M17.3 7.7l-1.4 1.4M3 19.5h18"/>`,
  uke: `<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4M7.5 13.5h2M11 13.5h2M14.5 13.5h2M7.5 16.8h2M11 16.8h2"/>`,
  fisk: `<path d="M2.8 12c2.8-4.2 7.7-5.6 11.6-3.6 1.6.8 2.8 2 3.6 3.6-.8 1.6-2 2.8-3.6 3.6C10.5 17.6 5.6 16.2 2.8 12z"/><path d="M18 12l3.2-3.2v6.4L18 12z"/><circle cx="7.4" cy="11.2" r=".9" fill="currentColor" stroke="none"/>`,
  kart: `<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>`,
  fangst: `<path d="M5 8h14l-1.4 11.2a2 2 0 0 1-2 1.8H8.4a2 2 0 0 1-2-1.8L5 8z"/><path d="M8.5 8a3.5 3.5 0 0 1 7 0"/><path d="M9 13.5c1.4-1.6 3.6-1.8 5.3-.6-.5 1.1-1.3 1.8-2.4 2.1"/>`,
};

export const tabIcon = (name) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" ${STROKE} aria-hidden="true">${TAB_ICONS[name]}</svg>`;

// ---------------------------------------------------------------- tegninger

/**
 * Poengskiva: en bue på 240 grader. Fargen glir fra blågrønt (tregt) til
 * morgenrødt (topp), som himmelen over et vann fra natt til soloppgang.
 */
export function dial(score, size = 150) {
  const r = 70;
  const cx = 90;
  const cy = 92;
  // Buen går fra nede til venstre (210°), over toppen, til nede til høyre
  // (-30°). Med gradienten fra venstre mot høyre blir lavt blågrønt og
  // høyt morgenrødt.
  const point = (deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy - r * Math.sin((deg * Math.PI) / 180)];
  const arcPath = (fromDeg, toDeg) => {
    const [x1, y1] = point(fromDeg);
    const [x2, y2] = point(toDeg);
    const large = fromDeg - toDeg > 180 ? 1 : 0;
    return `M${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
  };
  const end = 210 - 240 * Math.max(0.005, score / 100);
  return `<svg class="dial" viewBox="0 0 180 168" width="${size}" height="${(size * 168) / 180}" role="img" aria-label="Bitepoeng ${score} av 100">
    <defs><linearGradient id="dialGrad" gradientUnits="userSpaceOnUse" x1="20" y1="0" x2="160" y2="0">
      <stop offset="0" stop-color="var(--water)"/><stop offset="0.5" stop-color="var(--dusk)"/><stop offset="1" stop-color="var(--ember)"/>
    </linearGradient></defs>
    <path d="${arcPath(210, -30)}" fill="none" stroke="var(--track)" stroke-width="13" stroke-linecap="round"/>
    <path class="dial-value" d="${arcPath(210, end)}" fill="none" stroke="url(#dialGrad)" stroke-width="13" stroke-linecap="round"/>
    <text x="${cx}" y="${cy + 10}" text-anchor="middle" class="dial-num">${score}</text>
    <text x="${cx}" y="${cy + 36}" text-anchor="middle" class="dial-unit">av 100</text>
  </svg>`;
}

/** Glatt kurve gjennom punktene (Catmull–Rom til Bézier). */
function smoothPath(points) {
  if (points.length < 2) return '';
  let d = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

/**
 * Døgnkurven: bitepoeng time for time over 24 timer, med natt og skumring i
 * bakgrunnen og månens perioder som felt. Det er her du ser når du skal dra.
 */
export function dayChart(day, place, tz, now, id = 'c') {
  const W = 360;
  const H = 168;
  const top = 18;
  const bottom = 128;
  const DAY = 86_400_000;
  const x = (t) => ((t - day.start) / DAY) * W;
  const y = (s) => bottom - (s / 100) * (bottom - top);

  // Himmelen bak: mørk natt, lysere skumring, ingenting om dagen.
  // Bitene slås sammen til sammenhengende felt; mange smale felt ved siden
  // av hverandre gir striper der kantene møtes.
  let sky = '';
  const step = 10 * 60_000;
  let runCls = null;
  let runStart = day.start;
  const flush = (end) => {
    if (runCls) sky += `<rect class="sky-${runCls}" x="${x(runStart).toFixed(1)}" y="0" width="${(x(end) - x(runStart)).toFixed(1)}" height="${bottom}"/>`;
  };
  for (let t = day.start; t < day.start + DAY; t += step) {
    const alt = sunAltitude(t + step / 2, place.lat, place.lon);
    const cls = alt < -6 ? 'night' : alt < 0 ? 'twilight' : null;
    if (cls !== runCls) {
      flush(t);
      runCls = cls;
      runStart = t;
    }
  }
  flush(day.start + DAY);

  const bands = day.periods
    .filter((p) => p.end > day.start && p.start < day.start + DAY)
    .map((p) => {
      const x1 = Math.max(0, x(p.start));
      const x2 = Math.min(W, x(p.end));
      return `<rect class="band band-${p.kind === 'stor' ? 'major' : 'minor'}" x="${x1.toFixed(1)}" y="${top - 12}" width="${(x2 - x1).toFixed(1)}" height="${bottom - top + 12}" rx="3"/>
        <text class="band-label" x="${((x1 + x2) / 2).toFixed(1)}" y="${top - 3}" text-anchor="middle">${p.kind === 'stor' ? '☾' : '·☾·'}</text>`;
    })
    .join('');

  const pts = day.hours.map((h) => [x(h.t + 1_800_000), y(h.score)]);
  const line = smoothPath([[0, pts[0]?.[1] ?? bottom], ...pts, [W, pts.at(-1)?.[1] ?? bottom]]);
  const area = `${line} L${W},${bottom} L0,${bottom} Z`;

  const grid = [25, 50, 75]
    .map((s) => `<line class="grid" x1="0" x2="${W}" y1="${y(s)}" y2="${y(s)}"/>`)
    .join('');

  const ticks = [0, 6, 12, 18]
    .map((hh) => {
      const t = day.start + hh * 3_600_000;
      return `<text class="tick" x="${x(t) + (hh === 0 ? 2 : 0)}" y="${bottom + 15}" text-anchor="${hh === 0 ? 'start' : 'middle'}">${String(hh).padStart(2, '0')}</text>`;
    })
    .join('');

  const sunMarks = [
    [day.sky.sunrise, 'opp'],
    [day.sky.sunset, 'ned'],
  ]
    .filter(([t]) => t !== null)
    .map(
      ([t, what]) =>
        `<g class="sunmark" transform="translate(${x(t).toFixed(1)},${bottom})"><path d="M-6,0 a6,6 0 0 1 12,0" /><line x1="0" y1="-10" x2="0" y2="-14"/></g>
        <text class="sun-label" x="${x(t).toFixed(1)}" y="${bottom + 30}" text-anchor="middle">Sol ${what} ${time(t, tz)}</text>`,
    )
    .join('');

  let nowMark = '';
  if (now >= day.start && now < day.start + DAY) {
    const nx = x(now);
    const hour = day.hours.find((h) => now >= h.t && now < h.t + 3_600_000);
    const ny = hour ? y(hour.score) : bottom;
    nowMark = `<line class="now-line" x1="${nx}" x2="${nx}" y1="${top - 12}" y2="${bottom}"/><circle class="now-dot" cx="${nx}" cy="${ny}" r="5"/>`;
  }

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Bitepoeng gjennom døgnet">
    <defs><linearGradient id="area-${id}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="var(--ember)" stop-opacity="0.55"/><stop offset="1" stop-color="var(--water)" stop-opacity="0.04"/>
    </linearGradient></defs>
    ${sky}${grid}${bands}
    <path class="area" d="${area}" fill="url(#area-${id})"/>
    <path class="curve" d="${line}"/>
    <line class="baseline" x1="0" x2="${W}" y1="${bottom}" y2="${bottom}"/>
    ${sunMarks}${ticks}${nowMark}
  </svg>`;
}

/**
 * Månen slik den ser ut på himmelen herfra (nordlige halvkule): opplyst på
 * høyre side når den vokser, venstre når den minker.
 */
export function moonDisc(phase, size = 72) {
  const r = 30;
  const cx = 36;
  const cy = 36;
  const rx = Math.abs(Math.cos(2 * Math.PI * phase)) * r;
  const waxing = phase < 0.5;
  const outerSweep = waxing ? 1 : 0;
  const crescent = phase < 0.25 || phase > 0.75;
  const innerSweep = waxing ? (crescent ? 0 : 1) : crescent ? 1 : 0;
  const lit =
    phase < 0.01 || phase > 0.99
      ? ''
      : `<path class="moon-lit" d="M${cx},${cy - r} A${r},${r} 0 0 ${outerSweep} ${cx},${cy + r} A${rx.toFixed(2)},${r} 0 0 ${innerSweep} ${cx},${cy - r} Z"/>`;
  return `<svg class="moon" viewBox="0 0 72 72" width="${size}" height="${size}" aria-hidden="true">
    <circle class="moon-dark" cx="${cx}" cy="${cy}" r="${r}"/>${lit}
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--moon-rim)" stroke-width="1"/>
  </svg>`;
}

/**
 * Granskog mot vannkanten, nederst i himmelen øverst på siden. Tegnes én gang
 * med faste «tilfeldige» høyder, så den ser lik ut hver gang.
 */
export function treeline(width = 420, height = 54) {
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const back = [];
  const front = [];
  for (let xPos = -6; xPos < width + 12; xPos += 7 + rand() * 9) {
    const h = 14 + rand() * 26 + Math.sin(xPos / 70) * 8;
    back.push(spruce(xPos, height - 10, h * 0.8, rand));
  }
  for (let xPos = -4; xPos < width + 12; xPos += 9 + rand() * 13) {
    const h = 18 + rand() * 30 + Math.cos(xPos / 55) * 7;
    front.push(spruce(xPos, height, h, rand));
  }
  return `<svg class="treeline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
    <path class="trees-back" d="${back.join('')} M0,${height} L${width},${height} L${width},${height - 10} L0,${height - 10} Z"/>
    <path class="trees-front" d="${front.join('')} M0,${height} L${width},${height} L${width},${height - 3} L0,${height - 3} Z"/>
  </svg>`;
}

/** Ei gran: tre trekanter oppå hverandre, smalere oppover, og en kort stamme. */
function spruce(x, base, h, rand) {
  const w = h * (0.34 + rand() * 0.08);
  const f = (n) => n.toFixed(1);
  let d = `M${f(x - 1)},${f(base)} L${f(x - 1)},${f(base - h * 0.12)} L${f(x + 1)},${f(base - h * 0.12)} L${f(x + 1)},${f(base)} Z`;
  const tiers = [
    [0.1, 0.55, 1],
    [0.38, 0.8, 0.74],
    [0.62, 1, 0.48],
  ];
  for (const [from, to, width] of tiers) {
    const yb = base - h * from;
    const yt = base - h * to;
    const half = (w / 2) * width;
    d += ` M${f(x - half)},${f(yb)} L${f(x)},${f(yt)} L${f(x + half)},${f(yb)} Z`;
  }
  return d;
}

/**
 * Himmelfargen øverst ut fra hvor sola står. Settes som CSS-variabler, så
 * appen ser ut som himmelen over vannet akkurat nå.
 */
export function skyColors(sunAlt) {
  if (sunAlt < -12) return { top: '#07111f', mid: '#0e2236', low: '#173246' };
  if (sunAlt < -4) return { top: '#141b3a', mid: '#4a3a66', low: '#c4627a' };
  if (sunAlt < 6) return { top: '#24406b', mid: '#b5607a', low: '#f3a25d' };
  if (sunAlt < 20) return { top: '#3b6fa0', mid: '#7fa9c9', low: '#f2c48e' };
  return { top: '#2f73b5', mid: '#6aa6d6', low: '#b9dcef' };
}
