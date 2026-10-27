/**
 * Kart på telefonen: lagrede områder du kan bruke uten dekning.
 *
 * Kartbitene ligger i nettleserens Cache Storage under «bitetid-kart», og
 * offline-laget (sw.js) gir kartet dem derfra før det prøver nettet. Lista
 * over områdene (navn, utstrekning, størrelse) ligger i localStorage.
 *
 * Et område kan dele biter med et annet, for eksempel når Auritjønna og
 * Salvatnet overlapper på de groveste zoomnivåene. Sletter du det ene, blir
 * bitene det andre trenger liggende.
 */
import { tilesForBounds, tileUrl, MAX_TILES } from './tiles.js?v=fd98ec12f6';
import { newId } from './store.js?v=fd98ec12f6';

export const TILE_CACHE = 'bitetid-kart';
const KEY = 'bitetid.kart.v1';
const PARALLEL = 6;

export function loadAreas() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveAreas(areas) {
  try {
    localStorage.setItem(KEY, JSON.stringify(areas));
  } catch {
    /* lista får ikke plass: bitene er lagret, men navnet huskes ikke */
  }
}

export const offlineMapsSupported = () => typeof caches !== 'undefined' && typeof fetch !== 'undefined';

/**
 * Laster ned et område. Biter som allerede ligger på telefonen, hoppes over.
 * onProgress({ done, total, bytes }) kalles underveis; signal kan avbryte.
 * Gir tilbake det lagrede området.
 */
export async function downloadArea({ name, bounds, zmin, zmax }, { onProgress, signal } = {}) {
  const tiles = tilesForBounds(bounds, zmin, zmax);
  if (tiles.length > MAX_TILES) throw new Error(`Området er for stort (${tiles.length} kartbiter). Zoom inn og prøv igjen.`);

  // Be telefonen om å ikke rydde bort kartene når plassen blir trang.
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* ikke støttet: kartene lagres likevel */
  }

  const cache = await caches.open(TILE_CACHE);
  let done = 0;
  let bytes = 0;
  let failed = 0;
  let next = 0;

  async function worker() {
    while (next < tiles.length) {
      if (signal?.aborted) throw new DOMException('Avbrutt', 'AbortError');
      const { z, x, y } = tiles[next];
      next += 1;
      const url = tileUrl(z, x, y);
      try {
        const hit = await cache.match(url);
        if (hit) {
          bytes += Number(hit.headers.get('content-length')) || (await hit.clone().blob()).size;
        } else {
          const res = await fetch(url, { mode: 'cors', signal });
          if (!res.ok) throw new Error(String(res.status));
          const blob = await res.clone().blob();
          bytes += blob.size;
          await cache.put(url, res);
        }
      } catch (error) {
        if (error.name === 'AbortError') throw error;
        failed += 1;
      }
      done += 1;
      onProgress?.({ done, total: tiles.length, bytes });
    }
  }

  await Promise.all(Array.from({ length: PARALLEL }, worker));

  const area = { id: newId(), name, bounds, zmin, zmax, tiles: tiles.length, failed, bytes, savedAt: Date.now() };
  saveAreas([...loadAreas(), area]);
  return area;
}

/** Sletter et område og bitene ingen andre lagrede områder trenger. */
export async function deleteArea(id) {
  const areas = loadAreas();
  const area = areas.find((a) => a.id === id);
  if (!area) return;
  const others = areas.filter((a) => a.id !== id);
  const keep = new Set(others.flatMap((a) => tilesForBounds(a.bounds, a.zmin, a.zmax).map((t) => tileUrl(t.z, t.x, t.y))));
  const cache = await caches.open(TILE_CACHE);
  for (const t of tilesForBounds(area.bounds, area.zmin, area.zmax)) {
    const url = tileUrl(t.z, t.x, t.y);
    if (!keep.has(url)) await cache.delete(url);
  }
  saveAreas(others);
}

/** Hvor mye plass appen bruker, og hvor mye telefonen gir den. Null om ukjent. */
export async function storageUse() {
  try {
    const est = await navigator.storage?.estimate?.();
    return est ? { used: est.usage ?? 0, quota: est.quota ?? 0 } : null;
  } catch {
    return null;
  }
}
