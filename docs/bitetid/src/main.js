/**
 * Bitetid: når og hvor du bør fiske, for vannet du har valgt.
 *
 * Én tilstand, fem visninger. Visningene er funksjoner som gir HTML-tekst;
 * alle klikk fanges av én lytter via data-act. Kartet er unntaket: det lever
 * i sitt eget element og bygges ikke på nytt.
 */
import { fetchForecast, searchPlaces, nameForPoint, describeWeather, compass, distanceKm } from './weather.js?v=2837e4c3b2';
import { buildModel, buildHistory } from './model.js?v=2837e4c3b2';
import { loadArchive, saveArchive, mergeHistory, historyHours, coveredDays, needsBackfill } from './history.js?v=2837e4c3b2';
import { phaseName, daysUntilPhase, sunAltitude, moonAltitude } from './astro.js?v=2837e4c3b2';
import { scoreLabel } from './score.js?v=2837e4c3b2';
import { SPECIES, SEASONS, fishSeason, conditionTips } from './species.js?v=2837e4c3b2';
import * as store from './store.js?v=2837e4c3b2';
import * as ui from './ui.js?v=2837e4c3b2';
import { createMap } from './map.js?v=2837e4c3b2';
import { createSky, weatherKind, weatherSky } from './sky.js?v=2837e4c3b2';
import { gearAdvice, oterWeather } from './gear.js?v=2837e4c3b2';

const DEFAULT_PLACE = { name: 'Salvatnet', detail: 'Innsjø · Namsos', lat: 64.71, lon: 11.5833, example: true };
const STALE_MS = 30 * 60_000;
const TABS = [
  ['idag', 'I dag'],
  ['uke', 'Uke'],
  ['fisk', 'Fisk'],
  ['kart', 'Kart'],
  ['fangst', 'Fangst'],
];

const data = store.load();
if (!SPECIES.some((s) => s.id === data.species)) data.species = 'orret';
data.recent ??= [];

let place = data.place ?? DEFAULT_PLACE;
let forecast = data.forecast && samePlace(data.forecast.place, place) ? data.forecast.data : null;
let model = null;
let tab = TABS.some(([id]) => id === location.hash.slice(1)) ? location.hash.slice(1) : 'idag';
let openDay = 'f0';
let seasonOverride = null;
let loading = false;
let error = null;
let mapView = null;
let archive = loadArchive();
let weekMode = 'fram';
// Dagene fra værarkivet, regnet ut når Uke viser «Siste 30 dager». Heter
// ikke «history»: det navnet tilhører nettleseren, og fanene bruker det.
let archiveDays = null;
/** Timen du har trykket på i en timestripe (starttid), eller null. */
let pickedHour = null;
/** Om «Hvorfor akkurat nå?» er åpent, så det blir stående åpent når siden oppdateres. */
let whyOpen = false;

const $ = (sel) => document.querySelector(sel);
const persist = () => store.save(data);

function samePlace(a, b) {
  return a && b && Math.abs(a.lat - b.lat) < 1e-4 && Math.abs(a.lon - b.lon) < 1e-4;
}

// ---------------------------------------------------------------- data

async function refresh({ quiet = false } = {}) {
  if (loading) return;
  loading = true;
  error = null;
  if (!quiet) renderStatus();
  try {
    const now = Date.now();
    const pastDays = needsBackfill(archive, place, now) ? 92 : 2;
    forecast = await fetchForecast(place.lat, place.lon, { pastDays });
    archive = saveArchive(mergeHistory(archive, place, forecast, now));
    archiveDays = null;
    // Siste kopi av varselet, til appen åpnes uten nett. Fortiden ligger i
    // arkivet, så kopien trenger bare de siste to døgnene bakover.
    const keepFrom = now - 2 * 86_400_000;
    data.forecast = {
      place: { lat: place.lat, lon: place.lon },
      data: { ...forecast, hours: forecast.hours.filter((h) => h.t >= keepFrom), days: forecast.days.filter((d) => d.start >= keepFrom - 86_400_000) },
    };
    persist();
  } catch (e) {
    error = navigator.onLine ? 'Fikk ikke hentet været.' : 'Uten nett.';
  } finally {
    loading = false;
    rebuild();
  }
}

function rebuild() {
  model = forecast ? buildModel(forecast, place, Date.now(), historyHours(archive, place)) : null;
  render();
}

function setPlace(next) {
  place = { name: next.name, detail: next.detail ?? '', lat: next.lat, lon: next.lon };
  data.place = place;
  data.recent = [place, ...data.recent.filter((p) => !samePlace(p, place))].slice(0, 6);
  persist();
  forecast = null;
  model = null;
  archiveDays = null;
  render();
  refresh();
  mapView?.center(place.lat, place.lon);
}

// ---------------------------------------------------------------- ramme

let skyFx = null;

// Forhåndsvisning av himmelen: ?vaer=regn&sol=-10 viser regn om natta.
const preview = new URLSearchParams(location.search);
const forcedKind = preview.get('vaer');
const forcedSun = preview.has('sol') ? Number(preview.get('sol')) : null;

function renderHeader() {
  const sun = forcedSun ?? sunAltitude(Date.now(), place.lat, place.lon);
  const h = model?.now;
  const kind = forcedKind ?? (h ? weatherKind(h.code, h.cloud) : 'klart');
  const sky = weatherSky(sun, kind);
  const root = document.documentElement.style;
  root.setProperty('--sky-top', sky.top);
  root.setProperty('--sky-mid', sky.mid);
  root.setProperty('--sky-low', sky.low);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', sky.top);
  skyFx ??= createSky($('#skyfx'));
  const cloud = forcedKind ? { klart: 5, lettskyet: 45, overskyet: 95 }[forcedKind] ?? 90 : h?.cloud ?? 0;
  const precip = forcedKind ? { regn: 2, sno: 1.5, torden: 5 }[forcedKind] ?? 0 : h?.precip ?? 0;
  skyFx.update({ kind, sunAlt: sun, cloud, wind: h?.wind ?? 3, windDir: h?.windDir ?? 270, precip });
  $('#place-name').textContent = place.name;
  $('#place-detail').textContent = place.example ? 'Eksempel — trykk for å velge ditt vann' : place.detail || `${place.lat.toFixed(3)}, ${place.lon.toFixed(3)}`;
  renderStatus();
}

function renderStatus() {
  const el = $('#status');
  const btn = $('#refresh');
  btn.classList.toggle('spinning', loading);
  if (loading) el.textContent = 'Henter vær…';
  else if (error && forecast) el.textContent = `${error} Viser varselet fra ${ui.time(forecast.fetchedAt, forecast.timezone)}.`;
  else if (error) el.textContent = error;
  else if (forecast) {
    const h = model?.now;
    const wx = h ? `${describeWeather(h.code).text} · ${ui.num(h.temp, 0)} °C · ` : '';
    el.textContent = `${wx}Oppdatert ${ui.time(forecast.fetchedAt, forecast.timezone)}`;
  }
  else el.textContent = '';
}

function render() {
  renderHeader();
  for (const b of document.querySelectorAll('.tab')) b.setAttribute('aria-current', b.dataset.tab === tab ? 'page' : 'false');
  const view = $('#view');
  const mapEl = $('#mapview');
  if (tab === 'kart') {
    view.hidden = true;
    mapEl.hidden = false;
    ensureMap();
    return;
  }
  mapEl.hidden = true;
  view.hidden = false;
  view.innerHTML = VIEWS[tab]();
  scrollStripsToNow();
}

function ensureMap() {
  if (!mapView) {
    mapView = createMap($('#map'), {});
    mapView?.center(place.lat, place.lon);
  }
  mapView?.resize();
  mapView?.show(place, data.spots, data.catches);
  renderSpotList();
}

function renderSpotList() {
  const list = $('#spot-list');
  if (data.spots.length === 0) {
    list.innerHTML = '<p class="hint">Trykk i kartet for å lagre en fiskeplass.</p>';
    return;
  }
  list.innerHTML = data.spots
    .map(
      (s) => `<button type="button" class="spot-chip" data-act="goto-spot" data-id="${ui.esc(s.id)}">★ ${ui.esc(s.name)}</button>`,
    )
    .join('');
}

// ---------------------------------------------------------------- visninger

function loadingView() {
  if (error) {
    return `<section class="card empty-state"><h2>${ui.esc(error)}</h2><p>Bitetid henter været fra Open-Meteo. Sjekk nettet og prøv igjen.</p>
      <button type="button" class="btn" data-act="refresh">Prøv igjen</button></section>`;
  }
  return `<section class="card empty-state"><div class="loader" aria-hidden="true"></div><p>Henter vær for ${ui.esc(place.name)}…</p></section>`;
}

function nextWindowText(now) {
  const w = model.nextWindow;
  const tz = model.timezone;
  if (!w) return 'Ingen tydelige toppperioder de neste to dagene.';
  if (w.start <= now) return `Godt bitt nå, til ${ui.time(w.end, tz)}.`;
  const sameDay = ui.dateShort(w.start, tz) === ui.dateShort(now, tz);
  return `${sameDay ? 'Neste gode periode i dag' : 'Neste gode periode i morgen'}: ${ui.span(w.start, w.end, tz)}.`;
}

function todayView() {
  if (!model) return loadingView();
  const now = Date.now();
  const tz = model.timezone;
  const h = model.now;
  const today = model.days[0];
  const wx = describeWeather(h.code);
  const species = SPECIES.find((s) => s.id === data.species);
  const season = fishSeason(Number(new Intl.DateTimeFormat('en', { timeZone: tz, month: 'numeric' }).format(now)), model.waterTemp);
  const advice = species.seasons[season];

  const reasons = h.reasons
    .slice(0, 4)
    .map((r) => `<li class="${r.points > 0 ? 'up' : 'down'}"><span aria-hidden="true">${r.points > 0 ? '+' : '−'}</span>${ui.esc(r.text)}</li>`)
    .join('');

  const windows = today.windows.length
    ? today.windows
        .map(
          (w) => `<li class="window tier-${ui.tier(w.peak)} ${w.end <= now ? 'past' : ''}">
            <span class="window-time">${ui.span(w.start, w.end, tz)}</span>
            <span class="window-score">${w.peak}</span></li>`,
        )
        .join('')
    : '<li class="hint">Ingen tydelige topper i dag.</li>';

  const trend = h.pressureTrend;
  const trendText =
    trend == null ? '' : trend <= -0.7 ? 'Fallende' : trend >= 0.7 ? 'Stigende' : 'Stabilt';
  const trendArrow = trend == null ? '' : trend <= -0.7 ? '↘' : trend >= 0.7 ? '↗' : '→';

  const sky = today.sky;
  const toFull = daysUntilPhase(sky.phase, 0.5);
  const toNew = daysUntilPhase(sky.phase, 0);
  const nextPhase =
    toFull < 1 || toNew < 1
      ? ''
      : toFull < toNew
        ? `Fullmåne om ${Math.round(toFull)} ${Math.round(toFull) === 1 ? 'dag' : 'dager'}`
        : `Nymåne om ${Math.round(toNew)} ${Math.round(toNew) === 1 ? 'dag' : 'dager'}`;

  const sunRows = sky.polar
    ? `<p class="polar">${sky.polar === 'mørketid' ? 'Mørketid: sola står ikke opp i dag.' : 'Midnattssol: sola går ikke ned i dag.'}</p>`
    : `<dl class="pairs">
        <dt>Soloppgang</dt><dd>${ui.time(sky.sunrise, tz)}</dd>
        <dt>Solnedgang</dt><dd>${ui.time(sky.sunset, tz)}</dd>
        <dt>Gry</dt><dd>${ui.time(sky.dawn, tz)}</dd>
        <dt>Skumring</dt><dd>${ui.time(sky.dusk, tz)}</dd>
      </dl>`;

  return `
  ${place.example ? `<button type="button" class="banner" data-act="place">Viser Salvatnet som eksempel. <strong>Velg ditt vann</strong></button>` : ''}
  <section class="hero card">
    <div class="hero-dial">${ui.dial(h.score)}</div>
    <div class="hero-text">
      <p class="eyebrow">Akkurat nå · ${ui.time(now, tz)}</p>
      <h2 class="verdict tier-${ui.tier(h.score)}">${scoreLabel(h.score)}</h2>
      <p class="next">${nextWindowText(now)}</p>
      <ul class="reasons">${reasons}</ul>
    </div>
  </section>

  <details class="card why-card" ${whyOpen ? "open" : ""}>
    <summary><span><strong>Hvorfor akkurat nå?</strong><span class="why-summary">${ui.esc(whySummary(h.score, h.reasons))}</span></span><span class="why-more" aria-hidden="true">Vis</span></summary>
    ${reasonList(h.reasons)}
    <p class="hint">Poengene starter på 30 og justeres opp eller ned av hver ting over. Lyset og lufttrykket teller mest.</p>
  </details>

  <section class="card">
    <div class="card-head"><h3>Beste tider i dag</h3><span class="meta">${ui.dateLong(today.start, tz)}</span></div>
    <ul class="windows">${windows}</ul>
    <div class="chart-wrap">${ui.dayChart(today, place, tz, now, 'today')}</div>
    <ul class="legend">
      <li><span class="key key-curve"></span>Bitepoeng</li>
      <li><span class="key key-major"></span>Måne høyest/lavest</li>
      <li><span class="key key-minor"></span>Måne opp/ned</li>
      <li><span class="key key-night"></span>Mørkt</li>
    </ul>
    ${hourStrip(today.hours, tz, now)}
  </section>

  <section class="card">
    <div class="card-head"><h3>Været nå</h3><span class="meta">${ui.weatherIcon(wx.icon, 20)} ${wx.text}</span></div>
    <div class="tiles">
      <div class="tile"><span class="tile-label">Luft</span><span class="tile-value">${ui.num(h.temp, 1)}<small>°C</small></span></div>
      <div class="tile"><span class="tile-label">Vind</span><span class="tile-value">${ui.windArrow(h.windDir)}${ui.num(h.wind, 1)}<small>m/s</small></span><span class="tile-sub">fra ${compass(h.windDir)}, kast ${ui.num(h.gust, 0)}</span></div>
      <div class="tile"><span class="tile-label">Lufttrykk</span><span class="tile-value">${ui.num(h.pressure, 0)}<small>hPa</small></span><span class="tile-sub">${trendArrow} ${trendText}${trend == null ? '' : ` ${trend > 0 ? '+' : ''}${ui.num(trend, 1)} på 3 t`}</span></div>
      <div class="tile"><span class="tile-label">Skyer</span><span class="tile-value">${ui.num(h.cloud, 0)}<small>%</small></span></div>
      <div class="tile"><span class="tile-label">Nedbør</span><span class="tile-value">${ui.num(h.precip, 1)}<small>mm/t</small></span></div>
      <div class="tile"><span class="tile-label">Vann (anslag)</span><span class="tile-value">${ui.num(model.waterTemp, 0)}<small>°C</small></span><span class="tile-sub">fra lufta siste uker</span></div>
    </div>
  </section>

  <section class="card sky-card">
    <div class="sky-col">
      <h3>Sola</h3>
      ${sunRows}
    </div>
    <div class="sky-col">
      <h3>Månen</h3>
      <div class="moon-row">${ui.moonDisc(sky.phase, 64)}
        <div><p class="moon-name">${phaseName(sky.phase)}</p><p class="meta">${Math.round(sky.fraction * 100)} % opplyst</p></div>
      </div>
      <dl class="pairs">
        <dt>Måne opp</dt><dd>${ui.time(sky.moonrise, tz)}</dd>
        <dt>Måne ned</dt><dd>${ui.time(sky.moonset, tz)}</dd>
      </dl>
      ${nextPhase ? `<p class="meta">${nextPhase}</p>` : ''}
    </div>
  </section>

  <section class="card fish-now">
    <div class="card-head"><h3>${species.name} nå</h3><span class="meta">${SEASONS[season].name}</span></div>
    <p>${ui.esc(advice.where)}</p>
    <p class="depth"><span>Dybde</span> ${ui.esc(advice.depth)}</p>
    ${(() => {
      const ctx = { season, waterTemp: model.waterTemp, speciesId: species.id, water: species.water === 'elv' ? 'elv' : 'innsjo' };
      const month = Number(new Intl.DateTimeFormat('en', { timeZone: tz, month: 'numeric' }).format(now));
      if (species.openMonths && !species.openMonths.includes(month)) {
        return '<p class="depth"><span>Redskap</span> Sesongen er normalt stengt nå</p>';
      }
      const best = gearAdvice(h, ctx)[0];
      const oter = ctx.water === 'elv' ? null : oterWeather(h, season);
      return best
        ? `<p class="depth"><span>Redskap</span> ${ui.esc(best.name)}${oter?.good ? ' <span class="oter-badge good">Otervær</span>' : ''}</p>`
        : '';
    })()}
    <button type="button" class="btn ghost" data-act="tab" data-tab="fisk">Redskap, dybde og agn for alle arter</button>
  </section>`;
}

/** «Gode forhold fordi …, men …»: én setning som sier hvorfor tallet er som det er. */
function whySummary(score, reasons) {
  const pos = reasons.filter((r) => r.points > 0).map((r) => r.text.toLowerCase());
  const neg = reasons.filter((r) => r.points < 0).map((r) => r.text.toLowerCase());
  const list = (xs) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} og ${xs.at(-1)}`);
  // Samme trinn som poengskiva: under 30 tregt, 30–49 middels, 50+ godt.
  if (score >= 50) {
    if (pos.length === 0) return 'Gode forhold uten noe som trekker ned.';
    return `Gode forhold: ${list(pos.slice(0, 3))}.${neg.length ? ` Det som trekker ned: ${list(neg.slice(0, 2))}.` : ''}`;
  }
  if (score >= 30) {
    if (pos.length === 0 && neg.length === 0) return 'Middels: ingenting spesielt som hjelper eller trekker ned.';
    const helps = pos.length ? `${list(pos.slice(0, 2))} hjelper` : 'lite som hjelper';
    return `Middels: ${helps}${neg.length ? `, men ${list(neg.slice(0, 2))} trekker ned` : ''}.`;
  }
  if (neg.length === 0) return 'Ingenting spesielt som hjelper akkurat nå. Vent på skumringen.';
  return `Tregt: ${list(neg.slice(0, 3))}.${pos.length ? ` Det som hjelper: ${list(pos.slice(0, 2))}.` : ''}`;
}

/** Alle grunnene med poeng og forklaring. */
function reasonList(reasons) {
  if (reasons.length === 0) return '<p class="hint">Ingen spesielle forhold denne timen.</p>';
  return `<ul class="why-list">${reasons
    .map(
      (r) => `<li class="${r.points > 0 ? 'up' : 'down'}">
        <span class="why-points">${r.points > 0 ? '+' : '−'}${Math.abs(r.points)}</span>
        <div><strong>${ui.esc(r.text)}</strong>${r.why ? `<p>${ui.esc(r.why)}</p>` : ''}</div>
      </li>`,
    )
    .join('')}</ul>`;
}

/** Sol og måne for ett døgn, på to korte linjer. */
function skyLine(sky, tz) {
  const sun = sky.polar
    ? sky.polar === 'mørketid' ? 'Mørketid, sola står ikke opp' : 'Midnattssol, sola går ikke ned'
    : `Sol opp ${ui.time(sky.sunrise, tz)}, ned ${ui.time(sky.sunset, tz)}`;
  const moonTimes = [
    sky.moonrise !== null ? `opp ${ui.time(sky.moonrise, tz)}` : null,
    sky.moonset !== null ? `ned ${ui.time(sky.moonset, tz)}` : null,
  ].filter(Boolean);
  // Langt nord kan månen stå over (eller under) horisonten hele døgnet.
  if (moonTimes.length === 0) {
    moonTimes.push(moonAltitude(sky.noon, place.lat, place.lon) > 0 ? 'oppe hele døgnet' : 'under horisonten hele døgnet');
  }
  return `<div class="sky-line">
    <span>${sun}</span>
    <span class="sky-moon">${ui.moonDisc(sky.phase, 18)} ${phaseName(sky.phase)}, ${Math.round(sky.fraction * 100)} % · måne ${moonTimes.join(', ')}</span>
  </div>`;
}

/**
 * Været time for time som en stripe du blar sidelengs i. Hver time viser
 * poeng, vær, temperatur, vind, nedbør og lufttrykk. Timen som pågår, er
 * markert, og stripa starter der (se scrollStripsToNow).
 */
function hourStrip(hours, tz, now) {
  const picked = hours.find((h) => h.t === pickedHour);
  const cells = hours
    .map((h) => {
      const wx = describeWeather(h.code);
      const isNow = now >= h.t && now < h.t + 3_600_000;
      return `<li class="hour ${isNow ? 'now' : ''} ${h.sunAlt < -6 ? 'dark' : ''} ${h.t === pickedHour ? 'picked' : ''}" ${isNow ? 'data-now' : ''} data-act="hour" data-t="${h.t}" role="button" tabindex="0" aria-pressed="${h.t === pickedHour}" aria-label="Kl. ${ui.hourOnly(h.t, tz)}, ${h.score} poeng. Vis hvorfor.">
        <span class="hour-time">${isNow ? 'Nå' : ui.hourOnly(h.t, tz)}</span>
        <span class="hour-score tier-${ui.tier(h.score)}">${h.score}</span>
        ${ui.weatherIcon(wx.icon, 22)}
        <span class="hour-temp">${ui.num(h.temp, 0)}°</span>
        <span class="hour-wind">${ui.windArrow(h.windDir, 13)}${ui.num(h.wind, 0)}</span>
        <span class="hour-rain ${h.precip >= 0.1 ? 'wet' : ''}">${h.precip >= 0.1 ? ui.num(h.precip, 1) : '–'}</span>
        <span class="hour-pres">${h.pressure == null ? '–' : Math.round(h.pressure)}</span>
      </li>`;
    })
    .join('');
  return `<div class="hour-wrap">
    <div class="hour-legend" aria-hidden="true"><span>Kl.</span><span>Poeng</span><span></span><span>°C</span><span>m/s</span><span>mm</span><span>hPa</span></div>
    <ol class="hours" aria-label="Været time for time">${cells}</ol>
  </div>
  ${
    picked
      ? `<div class="hour-why">
          <div class="card-head"><h4>Kl. ${ui.span(picked.t, picked.t + 3_600_000, tz)} · <span class="tier-${ui.tier(picked.score)}">${picked.score} ${scoreLabel(picked.score).toLowerCase()}</span></h4>
          <button type="button" class="icon-btn" data-act="hour" data-t="${picked.t}" aria-label="Lukk">×</button></div>
          <p class="why-summary">${ui.esc(whySummary(picked.score, picked.reasons))}</p>
          ${reasonList(picked.reasons)}
        </div>`
      : '<p class="hint">Trykk på en time for å se hvorfor den er god eller dårlig.</p>'
  }`;
}

/** Ruller hver timestripe til timen som pågår, så du slipper å bla. */
function scrollStripsToNow() {
  for (const strip of document.querySelectorAll('.hours')) {
    const cell = strip.querySelector('[data-now]');
    if (cell) strip.scrollLeft = Math.max(0, cell.offsetLeft - strip.offsetLeft - 8);
  }
}

function dayRows(days, { past, tz, now, prefix }) {
  return days
    .map((d, i) => {
      const wx = describeWeather(d.code);
      const id = `${prefix}${i}`;
      const open = id === openDay;
      const best = d.windows[0];
      const label = past
        ? i === 0 ? 'I går' : ui.weekday(d.start, tz)
        : i === 0 ? 'I dag' : i === 1 ? 'I morgen' : ui.weekday(d.start, tz);
      return `<li class="day ${open ? 'open' : ''} ${d.uncertain ? 'uncertain' : ''}">
        <button type="button" class="day-row" data-act="day" data-i="${id}" aria-expanded="${open}">
          <span class="day-name">${label}<small>${ui.dateShort(d.start, tz)}${d.uncertain ? ' · usikkert' : ''}</small></span>
          <span class="day-wx">${ui.weatherIcon(wx.icon, 26)}<span>${ui.num(d.tmax, 0)}° <small>${ui.num(d.tmin, 0)}°</small></span></span>
          <span class="day-score tier-${ui.tier(d.score)}">
            <span class="bar"><span style="width:${d.score}%"></span></span>
            <span class="day-score-num">${d.score}</span>
          </span>
          <span class="day-best">${best ? ui.span(best.start, best.end, tz) : '–'}</span>
        </button>
        ${
          open
            ? `<div class="day-detail">
                <p class="meta">${wx.text} · vind opptil ${ui.num(d.windMax, 0)} m/s · ${ui.num(d.precip, 1)} mm · ${phaseName(d.sky.phase).toLowerCase()}</p>
                ${d.uncertain ? '<p class="meta">Så langt fram er varselet usikkert. Sjekk igjen nærmere dagen.</p>' : ''}
                ${skyLine(d.sky, tz)}
                ${(() => {
                  // Dagens beste time sier mest om hvorfor dagen er god eller dårlig.
                  const top = [...d.hours].sort((a, b) => b.score - a.score)[0];
                  return top ? `<p class="why-day"><strong>Derfor:</strong> ${ui.esc(whySummary(d.score, top.reasons))}</p>` : '';
                })()}
                <div class="chart-wrap">${ui.dayChart(d, place, tz, now, `d${id}`)}</div>
                <ul class="windows">${d.windows.map((w) => `<li class="window tier-${ui.tier(w.peak)}"><span class="window-time">${ui.span(w.start, w.end, tz)}</span><span class="window-score">${w.peak}</span></li>`).join('')}</ul>
                ${hourStrip(d.hours, tz, now)}
              </div>`
            : ''
        }
      </li>`;
    })
    .join('');
}

function weekView() {
  if (!model) return loadingView();
  const tz = model.timezone;
  const now = Date.now();
  const toggle = `<div class="segmented" role="group" aria-label="Periode">
      <button type="button" data-act="week-mode" data-mode="fram" aria-pressed="${weekMode === 'fram'}">Neste ${model.days.length} dager</button>
      <button type="button" data-act="week-mode" data-mode="bak" aria-pressed="${weekMode === 'bak'}">Siste 30 dager</button>
    </div>`;

  if (weekMode === 'bak') {
    archiveDays ??= buildHistory(historyHours(archive, place), place, tz, now, 30);
    const stored = coveredDays(archive, place);
    if (archiveDays.length === 0) {
      return `${toggle}<section class="card empty-state"><h2>Ingen historikk ennå</h2><p>Været lagres på telefonen hver gang appen henter nytt varsel.</p></section>`;
    }
    const best = [...archiveDays].sort((a, b) => b.score - a.score)[0];
    return `${toggle}
      <section class="card week-summary">
        <p class="eyebrow">Beste dag siste ${archiveDays.length} dager</p>
        <h2>${ui.weekday(best.start, tz)} ${ui.dateShort(best.start, tz)}</h2>
        <p class="next">${scoreLabel(best.score)}${best.windows[0] ? `, best ${ui.span(best.windows[0].start, best.windows[0].end, tz)}` : ''}.</p>
      </section>
      <ul class="days">${dayRows(archiveDays, { past: true, tz, now, prefix: 'b' })}</ul>
      <p class="hint">Lagret vær for ${ui.esc(place.name)}: ${stored} dager. Arkivet ligger på telefonen og holder inntil ett år.</p>`;
  }

  const certain = model.days.filter((d) => !d.uncertain);
  const best = [...certain].sort((a, b) => b.score - a.score)[0];
  return `${toggle}
    <section class="card week-summary">
      <p class="eyebrow">Beste dag den neste uka</p>
      <h2>${model.days.indexOf(best) === 0 ? 'I dag' : ui.weekday(best.start, tz)}</h2>
      <p class="next">${scoreLabel(best.score)}${best.windows[0] ? `, best ${ui.span(best.windows[0].start, best.windows[0].end, tz)}` : ''}.</p>
    </section>
    <ul class="days">${dayRows(model.days, { past: false, tz, now, prefix: 'f' })}</ul>
    <p class="hint">Poengene er snittet av dagens fem beste timer. Trykk på en dag for døgnkurven.</p>`;
}

/**
 * «Redskap nå»: de tre beste metodene akkurat nå, med grunnene, og om det er
 * otervær. Bygger på gear.js, som ser på vær, årstid, art og vanntype.
 */
function gearCard(hour, ctx, species, month) {
  if (species.openMonths && !species.openMonths.includes(month)) {
    return `<section class="card gear-card">
      <div class="card-head"><h3>Redskap nå</h3><span class="oter-badge">Stengt</span></div>
      <p>Fisket etter ${species.name.toLowerCase()} i elv er normalt stengt nå. Sesongen er vanligvis juni–august, i noen elver litt ut i september.</p>
      <p class="hint">Fisketidene settes hvert år. Sjekk reglene for elva under «Før du drar».</p>
    </section>`;
  }
  const list = gearAdvice(hour, ctx).slice(0, 3);
  // Uten værdata vet vi ikke om det er otervær, og da sier vi ingenting.
  const oter = ctx.water === 'elv' || !hour ? null : oterWeather(hour, ctx.season);
  const items = list
    .map(
      (g, i) => `<li class="gear ${i === 0 ? 'gear-first' : ''}">
        <div class="gear-head"><strong>${ui.esc(g.name)}</strong><span class="gear-score tier-${ui.tier(g.score)}">${g.score}</span></div>
        <span class="bar tier-${ui.tier(g.score)}"><span style="width:${g.score}%"></span></span>
        ${g.reasons.length ? `<p class="gear-why">${g.reasons.map(ui.esc).join(' · ')}</p>` : ''}
      </li>`,
    )
    .join('');
  return `<section class="card gear-card">
    <div class="card-head"><h3>Redskap nå</h3>${
      oter ? `<span class="oter-badge ${oter.good ? 'good' : ''}">${ui.esc(oter.label)}</span>` : ''
    }</div>
    <ol class="gear-list">${items}</ol>
    ${oter ? `<p class="hint">${ui.esc(oter.text)}</p>` : ''}
  </section>`;
}

function fishView() {
  const tz = model?.timezone ?? 'Europe/Oslo';
  const month = Number(new Intl.DateTimeFormat('en', { timeZone: tz, month: 'numeric' }).format(Date.now()));
  const autoSeason = fishSeason(month, model?.waterTemp);
  const season = seasonOverride ?? autoSeason;
  const species = SPECIES.find((s) => s.id === data.species);
  const advice = species.seasons[season];
  const tips = conditionTips(model?.now, season);

  const river = species.water === 'elv';
  const speciesChips = SPECIES.map(
    (s) =>
      `<button type="button" class="chip ${s.id === species.id ? 'on' : ''}" data-act="species" data-id="${s.id}" aria-pressed="${s.id === species.id}">${s.name}${s.water === 'elv' ? '<small class="chip-tag">elv</small>' : ''}</button>`,
  ).join('');
  const seasonChips = Object.entries(SEASONS)
    .map(
      ([id, s]) =>
        `<button type="button" class="chip small ${id === season ? 'on' : ''}" data-act="season" data-id="${id}" aria-pressed="${id === season}">${s.short}${id === autoSeason ? ' ·' : ''}</button>`,
    )
    .join('');

  return `
    <section class="card season-card">
      <p class="eyebrow">Fisken nå</p>
      <h2>${SEASONS[autoSeason].name}</h2>
      <p class="next">${model?.waterTemp != null ? `Vannet er rundt ${ui.num(model.waterTemp, 0)} °C (grovt anslag fra lufttemperaturen).` : 'Henter vær for å anslå vanntemperaturen.'}</p>
    </section>

    <div class="chips" role="group" aria-label="Art">${speciesChips}</div>

    ${gearCard(model?.now ?? null, { season, waterTemp: model?.waterTemp ?? null, speciesId: species.id, water: river ? 'elv' : 'innsjo' }, species, month)}

    <section class="card species-card">
      <div class="species-head">
        <span class="species-icon" aria-hidden="true">${ui.tabIcon('fisk')}</span>
        <div><h2>${species.name}${river ? ' <span class="water-tag">Elv</span>' : ''}</h2><p class="latin">${species.latin}</p></div>
      </div>
      <p class="blurb">${species.blurb}</p>
      ${species.presence ? `<p class="presence">${species.presence}</p>` : ''}
      ${river ? '<p class="presence">I elv betyr vannføring og vanntemperatur mer enn bitepoengene, som er laget for innsjøer. Sjekk vannføringen før du drar.</p>' : ''}
      <div class="chips season-chips" role="group" aria-label="Årstid">${seasonChips}</div>
      <dl class="advice">
        <dt>Hvor</dt><dd>${advice.where}</dd>
        <dt>Dybde</dt><dd class="mono">${advice.depth}</dd>
        <dt>Agn</dt><dd>${advice.bait}</dd>
        <dt>Best</dt><dd>${species.best}</dd>
        <dt>Utstyr</dt><dd>${species.gear}</dd>
      </dl>
      ${season !== autoSeason ? `<p class="hint">Viser ${SEASONS[season].name.toLowerCase()}. Punktet markerer årstiden nå.</p>` : ''}
      ${species.rules ? `<p class="rules"><strong>Regler.</strong> ${species.rules}</p>` : ''}
    </section>

    ${
      tips.length
        ? `<section class="card"><h3>Akkurat nå</h3><ul class="tips">${tips.map((t) => `<li>${t}</li>`).join('')}</ul></section>`
        : ''
    }

    <section class="card links">
      <h3>Før du drar</h3>
      ${(species.links ?? [])
        .map((l) => `<a class="link-row" href="${ui.esc(l.href)}" target="_blank" rel="noopener">${ui.esc(l.label)} <span aria-hidden="true">↗</span></a>`)
        .join('')}
      <a class="link-row" href="https://www.inatur.no/fiske" target="_blank" rel="noopener">Fiskekort og regler for vannet <span aria-hidden="true">↗</span></a>
      <a class="link-row" href="https://atlas.nve.no/" target="_blank" rel="noopener">Dybdekart over innsjøer (NVE Atlas) <span aria-hidden="true">↗</span></a>
      <a class="link-row" href="https://www.yr.no/nb/s%C3%B8k?q=${encodeURIComponent(place.name)}" target="_blank" rel="noopener">Været for ${ui.esc(place.name)} på yr <span aria-hidden="true">↗</span></a>
    </section>`;
}

function catchView() {
  const insights = store.catchInsights(data.catches);
  const tz = model?.timezone ?? 'Europe/Oslo';
  const list = [...data.catches]
    .sort((a, b) => b.time - a.time)
    .map(
      (c) => `<li class="catch">
        <div class="catch-main">
          <strong>${ui.esc(c.species)}</strong>
          <span>${[c.weight ? `${ui.esc(c.weight)} kg` : '', c.length ? `${ui.esc(c.length)} cm` : '', c.bait ? ui.esc(c.bait) : ''].filter(Boolean).join(' · ')}</span>
          <span class="meta">${ui.weekdayShort(c.time, tz)} ${ui.dateShort(c.time, tz)} ${ui.time(c.time, tz)} · ${ui.esc(c.placeName ?? '')}</span>
          ${c.note ? `<span class="note">${ui.esc(c.note)}</span>` : ''}
          ${
            c.conditions
              ? `<span class="cond">${c.conditions.score != null ? `<i class="tier-${ui.tier(c.conditions.score)}">${c.conditions.score}</i>` : ''}${ui.esc(c.conditions.moon ?? '')}${c.conditions.pressureTrend != null ? ` · trykk ${c.conditions.pressureTrend > 0 ? '+' : ''}${ui.num(c.conditions.pressureTrend, 1)}` : ''}${c.conditions.wind != null ? ` · ${ui.num(c.conditions.wind, 0)} m/s` : ''}</span>`
              : ''
          }
        </div>
        <button type="button" class="icon-btn" data-act="catch-del" data-id="${ui.esc(c.id)}" aria-label="Slett fangsten">×</button>
      </li>`,
    )
    .join('');
  return `
    <button type="button" class="btn big" data-act="catch-new">+ Registrer fangst</button>
    ${
      insights.length
        ? `<section class="card"><h3>Dine mønstre</h3><ul class="tips">${insights.map((t) => `<li>${ui.esc(t)}</li>`).join('')}</ul></section>`
        : `<section class="card"><h3>Dine mønstre</h3><p class="hint">Etter tre fangster viser Bitetid hva de har til felles: trykk, tid på døgnet, måne og agn. Været lagres med hver fangst.</p></section>`
    }
    ${list ? `<ul class="catches">${list}</ul>` : '<p class="hint center">Ingen fangster ennå. Skitt fiske!</p>'}`;
}

const VIEWS = { idag: todayView, uke: weekView, fisk: fishView, fangst: catchView };

// ---------------------------------------------------------------- ark (skjema)

function openSheet(html, focusSel) {
  const sheet = $('#sheet');
  $('#sheet-body').innerHTML = html;
  sheet.hidden = false;
  document.body.classList.add('sheet-open');
  if (focusSel) setTimeout(() => $(focusSel)?.focus(), 50);
}

function closeSheet() {
  $('#sheet').hidden = true;
  document.body.classList.remove('sheet-open');
}

let searchTimer = 0;
let searchAbort = null;
let lastResults = [];

function placeSheet() {
  const recent = data.recent
    .map(
      (p, i) =>
        `<li><button type="button" class="result" data-act="pick-recent" data-i="${i}"><strong>${ui.esc(p.name)}</strong><span>${ui.esc(p.detail || '')}</span></button></li>`,
    )
    .join('');
  openSheet(
    `<h2>Velg vann</h2>
     <label class="field"><span>Søk etter vann, tjern eller sted</span>
       <input id="place-q" type="search" autocomplete="off" placeholder="Salvatnet, Namsen, Namsos …" enterkeyhint="search"></label>
     <button type="button" class="btn ghost" data-act="gps">◎ Bruk min posisjon</button>
     <ul id="results" class="results"></ul>
     ${recent ? `<h3 class="sheet-sub">Nylig brukt</h3><ul class="results">${recent}</ul>` : ''}`,
    '#place-q',
  );
}

async function runSearch(q) {
  const box = $('#results');
  if (!box) return;
  if (q.trim().length < 2) {
    box.innerHTML = '';
    return;
  }
  searchAbort?.abort();
  searchAbort = new AbortController();
  box.innerHTML = '<li class="hint">Søker…</li>';
  try {
    lastResults = await searchPlaces(q, searchAbort.signal, place);
    box.innerHTML = lastResults.length
      ? lastResults
          .map(
            (r, i) =>
              `<li><button type="button" class="result" data-act="pick-place" data-i="${i}"><strong>${r.isLake ? '<span class="water-dot" aria-label="vann"></span>' : ''}${ui.esc(r.name)}</strong><span>${ui.esc(r.detail)}${place && !place.example ? ` · ${ui.num(distanceKm(place, r), 0)} km unna` : ''}</span></button></li>`,
          )
          .join('')
      : '<li class="hint">Fant ingenting. Prøv et annet navn, eller velg et punkt i kartet.</li>';
  } catch (e) {
    if (e.name !== 'AbortError') box.innerHTML = '<li class="hint">Søket virket ikke. Har du nett?</li>';
  }
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Telefonen deler ikke posisjon.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => reject(new Error('Fikk ikke posisjonen. Sjekk at stedstjenester er på.')),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 120_000 },
    );
  });
}

function catchSheet() {
  const baits = [...new Set(data.catches.map((c) => c.bait).filter(Boolean))];
  const where = [
    `<option value="place">${ui.esc(place.name)}</option>`,
    `<option value="gps">Min posisjon nå</option>`,
    ...data.spots.map((s) => `<option value="spot:${ui.esc(s.id)}">★ ${ui.esc(s.name)}</option>`),
  ].join('');
  openSheet(
    `<h2>Ny fangst</h2>
     <form id="catch-form" class="form">
       <fieldset class="chips"><legend>Art</legend>
         ${[...SPECIES.map((s) => s.name), 'Annet']
           .map((n) => {
             const checked = n === SPECIES.find((s) => s.id === data.species)?.name;
             return `<label class="chip"><input type="radio" name="species" value="${n}" ${checked ? 'checked' : ''}><span>${n}</span></label>`;
           })
           .join('')}
       </fieldset>
       <div class="row">
         <label class="field"><span>Vekt (kg)</span><input id="c-weight" name="weight" inputmode="decimal" placeholder="0,8"></label>
         <label class="field"><span>Lengde (cm)</span><input id="c-length" name="length" inputmode="numeric" placeholder="38"></label>
       </div>
       <label class="field"><span>Agn</span><input id="c-bait" name="bait" list="baits" placeholder="Sluk, mark, flue …" autocomplete="off"></label>
       <datalist id="baits">${baits.map((b) => `<option value="${ui.esc(b)}">`).join('')}</datalist>
       <label class="field"><span>Hvor</span><select id="c-where" name="where">${where}</select></label>
       <label class="field"><span>Notat</span><input id="c-note" name="note" placeholder="Vindsiden ved odden, 4 m" autocomplete="off"></label>
       <p class="hint">Været, månen og bitepoenget akkurat nå lagres sammen med fangsten.</p>
       <p id="c-error" class="error" role="alert"></p>
       <button class="btn big" type="submit">Lagre fangst</button>
     </form>`,
  );
}

function conditionsNow() {
  const h = model?.now;
  if (!h) return null;
  const day = model.days[0];
  return {
    score: h.score,
    moon: phaseName(day.sky.phase),
    pressureTrend: h.pressureTrend,
    wind: h.wind,
    temp: h.temp,
    twilight: h.reasons.some((r) => /soloppgang|solnedgang|skumring/i.test(r.text)),
    solunar: h.reasons.some((r) => /solunar/i.test(r.text)),
  };
}

async function saveCatch(form) {
  const f = new FormData(form);
  const species = f.get('species');
  const err = $('#c-error');
  if (!species) {
    err.textContent = 'Velg en art.';
    return;
  }
  const parse = (v) => {
    const s = String(v ?? '').trim().replace(',', '.');
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) && n > 0 ? String(n).replace('.', ',') : NaN;
  };
  const weight = parse(f.get('weight'));
  const length = parse(f.get('length'));
  if (Number.isNaN(weight) || Number.isNaN(length)) {
    err.textContent = 'Vekt og lengde må være tall, for eksempel 0,8.';
    return;
  }
  let lat = place.lat;
  let lon = place.lon;
  let placeName = place.name;
  const where = String(f.get('where'));
  if (where === 'gps') {
    try {
      ({ lat, lon } = await getPosition());
      placeName = 'Min posisjon';
    } catch (e) {
      err.textContent = `${e.message} Lagrer på ${place.name} i stedet.`;
    }
  } else if (where.startsWith('spot:')) {
    const spot = data.spots.find((s) => s.id === where.slice(5));
    if (spot) ({ lat, lon, name: placeName } = spot);
  }
  data.catches.push({
    id: store.newId(),
    time: Date.now(),
    species,
    weight,
    length,
    bait: String(f.get('bait') ?? '').trim() || null,
    note: String(f.get('note') ?? '').trim() || null,
    lat,
    lon,
    placeName,
    conditions: conditionsNow(),
  });
  persist();
  closeSheet();
  toast(`${species} lagret. Skitt fiske!`);
  render();
}

function spotSheet(lat, lon) {
  openSheet(
    `<h2>Ny fiskeplass</h2>
     <form id="spot-form" class="form" data-lat="${lat}" data-lon="${lon}">
       <label class="field"><span>Navn</span><input id="s-name" name="name" required placeholder="Odden ved innløpet" autocomplete="off"></label>
       <label class="field"><span>Notat</span><input id="s-note" name="note" placeholder="Stup fra 2 til 8 m, best i sørvest" autocomplete="off"></label>
       <p class="meta mono">${lat.toFixed(5)}, ${lon.toFixed(5)}</p>
       <p id="s-error" class="error" role="alert"></p>
       <button class="btn big" type="submit">Lagre plass</button>
     </form>`,
    '#s-name',
  );
}

// ---------------------------------------------------------------- varsel

let toastTimer = 0;
let undoFn = null;
function toast(text, undo = null) {
  const el = $('#toast');
  undoFn = undo;
  el.innerHTML = `<span>${ui.esc(text)}</span>${undo ? '<button type="button" data-act="undo">Angre</button>' : ''}`;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), undo ? 6000 : 3000);
}

// ---------------------------------------------------------------- hendelser

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) {
    if (e.target.id === 'sheet') closeSheet();
    return;
  }
  const act = el.dataset.act;
  switch (act) {
    case 'tab':
      tab = el.dataset.tab;
      window.history.replaceState(null, '', `#${tab}`);
      render();
      window.scrollTo({ top: 0 });
      break;
    case 'place':
      placeSheet();
      break;
    case 'refresh':
      refresh();
      break;
    case 'close':
      closeSheet();
      break;
    case 'pick-place':
      closeSheet();
      setPlace(lastResults[Number(el.dataset.i)]);
      break;
    case 'pick-recent':
      closeSheet();
      setPlace(data.recent[Number(el.dataset.i)]);
      break;
    case 'gps': {
      el.textContent = 'Finner posisjonen…';
      try {
        const pos = await getPosition();
        const name = (await nameForPoint(pos.lat, pos.lon)) ?? 'Min posisjon';
        closeSheet();
        setPlace({ ...pos, name, detail: 'Fra GPS' });
      } catch (err) {
        el.textContent = err.message;
      }
      break;
    }
    case 'day':
      openDay = openDay === el.dataset.i ? null : el.dataset.i;
      render();
      break;
    case 'hour': {
      const t = Number(el.dataset.t);
      pickedHour = pickedHour === t ? null : t;
      const strip = el.closest('.hours');
      const scroll = strip?.scrollLeft ?? 0;
      const y = window.scrollY;
      render();
      // Behold der du var: både stripa og siden skal stå stille.
      const again = document.querySelector(`.hour[data-t="${t}"]`)?.closest('.hours');
      if (again) again.scrollLeft = scroll;
      window.scrollTo({ top: y });
      break;
    }
    case 'week-mode':
      weekMode = el.dataset.mode;
      openDay = weekMode === 'fram' ? 'f0' : null;
      render();
      break;
    case 'species':
      data.species = el.dataset.id;
      persist();
      render();
      break;
    case 'season':
      seasonOverride = el.dataset.id;
      render();
      break;
    case 'catch-new':
      catchSheet();
      break;
    case 'catch-del': {
      const i = data.catches.findIndex((c) => c.id === el.dataset.id);
      if (i < 0) break;
      const [removed] = data.catches.splice(i, 1);
      persist();
      render();
      toast(`${removed.species} slettet`, () => {
        data.catches.push(removed);
        persist();
        render();
      });
      break;
    }
    case 'undo':
      undoFn?.();
      undoFn = null;
      $('#toast').classList.remove('show');
      break;
    case 'spot-new':
      spotSheet(Number(el.dataset.lat), Number(el.dataset.lon));
      break;
    case 'spot-del': {
      const i = data.spots.findIndex((s) => s.id === el.dataset.id);
      if (i < 0) break;
      const [removed] = data.spots.splice(i, 1);
      persist();
      mapView?.map.closePopup();
      ensureMap();
      toast(`${removed.name} slettet`, () => {
        data.spots.push(removed);
        persist();
        ensureMap();
      });
      break;
    }
    case 'use-point': {
      const lat = Number(el.dataset.lat);
      const lon = Number(el.dataset.lon);
      const name = el.dataset.name || (await nameForPoint(lat, lon)) || 'Valgt punkt';
      mapView?.clearPick();
      setPlace({ name, detail: 'Fra kartet', lat, lon });
      break;
    }
    case 'goto-spot': {
      const s = data.spots.find((x) => x.id === el.dataset.id);
      if (s) mapView?.center(s.lat, s.lon, 14);
      break;
    }
    case 'locate': {
      try {
        const pos = await getPosition();
        mapView?.center(pos.lat, pos.lon, 14);
      } catch (err) {
        toast(err.message);
      }
      break;
    }
    default:
      break;
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'place-q') {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(e.target.value), 300);
  }
});

document.addEventListener('submit', (e) => {
  e.preventDefault();
  if (e.target.id === 'catch-form') saveCatch(e.target);
  if (e.target.id === 'spot-form') {
    const f = new FormData(e.target);
    const name = String(f.get('name') ?? '').trim();
    if (!name) {
      $('#s-error').textContent = 'Gi plassen et navn.';
      return;
    }
    data.spots.push({
      id: store.newId(),
      name,
      note: String(f.get('note') ?? '').trim() || null,
      lat: Number(e.target.dataset.lat),
      lon: Number(e.target.dataset.lon),
    });
    persist();
    closeSheet();
    mapView?.clearPick();
    ensureMap();
    toast(`${name} lagret`);
  }
});

document.addEventListener('toggle', (e) => {
  if (e.target.classList?.contains('why-card')) whyOpen = e.target.open;
}, true);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet();
});

// Oppdater «nå» hvert minutt, og hent nytt vær når det er gammelt.
setInterval(() => {
  const typing = document.activeElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName);
  if (!$('#sheet').hidden || typing) return;
  if (forecast && Date.now() - forecast.fetchedAt > STALE_MS) refresh({ quiet: true });
  else if (forecast) rebuild();
}, 60_000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (!forecast || Date.now() - forecast.fetchedAt > STALE_MS)) refresh({ quiet: true });
});

// ---------------------------------------------------------------- start

function buildChrome() {
  $('#treeline').innerHTML = ui.treeline();
  $('#tabs').innerHTML = TABS.map(
    ([id, label]) =>
      `<button type="button" class="tab" data-act="tab" data-tab="${id}">${ui.tabIcon(id)}<span>${label}</span></button>`,
  ).join('');
}

buildChrome();
rebuild();
if (!forecast || Date.now() - forecast.fetchedAt > STALE_MS) refresh();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  // Når en ny utgave tar over, lastes siden på nytt én gang. Uten dette
  // kjørte appen på hjemskjermen gammel kode til den ble lukket helt.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('sw.js')
      .then((reg) => {
        // Se etter ny utgave hver gang appen kommer fram igjen, ikke bare
        // ved oppstart: appen på hjemskjermen startes sjelden helt på nytt.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {});
        });
      })
      .catch(() => {});
  });
}
