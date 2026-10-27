/**
 * Kartbiter: hvilke biter som dekker et område, og hvor de hentes fra.
 *
 * Kartet er delt i kvadratiske biter på 256×256 punkter. På zoomnivå z er
 * jorda 2^z biter bred. Bare Kartverkets topografiske kart lagres for bruk
 * uten nett; OpenStreetMap forbyr nedlasting av kart i store mengder.
 */

export const TOPO_URL = 'https://cache.kartverket.no/v1/wmts/1.0.0/topo/default/webmercator/{z}/{y}/{x}.png';

/** Snitt fra Kartverket-biter rundt Salvatnet (målt): godt nok til et anslag. */
export const AVG_TILE_BYTES = 40 * 1024;

/** Største område én lagring kan være, så ingen ved et uhell laster ned hele fylket. */
export const MAX_TILES = 4000;

/** Detaljnivåene du kan velge mellom. Oversikt fra zoom 10, så du finner fram. */
export const LEVELS = {
  vanlig: { name: 'Vanlig', zmin: 10, zmax: 15, hint: 'Vann, stier og veier, litt mindre zoom' },
  detaljert: { name: 'Detaljert', zmin: 10, zmax: 16, hint: 'Hver bekk og odde, zoom helt inn' },
};

export const tileUrl = (z, x, y) => TOPO_URL.replace('{z}', z).replace('{y}', y).replace('{x}', x);

export function lonToX(lon, z) {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

export function latToY(lat, z) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}

/**
 * Alle biter som dekker området, på alle zoomnivåene fra zmin til zmax.
 * @param bounds { south, west, north, east } i grader
 * @returns [{ z, x, y }]
 */
export function tilesForBounds(bounds, zmin, zmax) {
  const out = [];
  for (let z = zmin; z <= zmax; z += 1) {
    const x1 = lonToX(bounds.west, z);
    const x2 = lonToX(bounds.east, z);
    const y1 = latToY(bounds.north, z); // nord er øverst: lavere y
    const y2 = latToY(bounds.south, z);
    for (let x = x1; x <= x2; x += 1) for (let y = y1; y <= y2; y += 1) out.push({ z, x, y });
  }
  return out;
}

/** Antall biter uten å lage lista, til anslaget før du laster ned. */
export function countTiles(bounds, zmin, zmax) {
  let n = 0;
  for (let z = zmin; z <= zmax; z += 1) {
    const w = lonToX(bounds.east, z) - lonToX(bounds.west, z) + 1;
    const h = latToY(bounds.south, z) - latToY(bounds.north, z) + 1;
    n += w * h;
  }
  return n;
}

export const formatMB = (bytes) => {
  const mb = bytes / (1024 * 1024);
  return mb < 1 ? '< 1 MB' : `${mb < 10 ? mb.toFixed(1).replace('.', ',') : Math.round(mb)} MB`;
};
