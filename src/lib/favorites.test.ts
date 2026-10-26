import { test } from 'node:test';
import assert from 'node:assert/strict';

import { rankFavorites, searchRegister } from './favorites.ts';
import { normalizeName } from './normalize.ts';
import type { ShoppingItem } from './types.ts';

const NOW = Date.parse('2026-10-26T12:00:00.000Z');
const daysAgo = (days: number): string => new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();

function item(
  name: string,
  opts: { uses?: number; daysAgo?: number; manual?: boolean } = {},
): ShoppingItem {
  const stamp = daysAgo(opts.daysAgo ?? 1);
  return {
    id: name,
    name,
    normalized_name: normalizeName(name),
    quantities: [],
    category: 'annet',
    checked: false,
    archived: true,
    use_count: opts.uses ?? 1,
    manual: opts.manual ?? true,
    last_used_at: stamp,
    updated_by: null,
    version: 0,
    source_meals: [],
    note: null,
    created_at: stamp,
    updated_at: stamp,
  };
}

const names = (rows: ShoppingItem[]): string[] => rows.map((row) => row.name);

test('mest kjøpte først', () => {
  const ranked = rankFavorites([item('Brød', { uses: 3 }), item('Melk', { uses: 12 }), item('Egg', { uses: 6 })], [], NOW);
  assert.deepEqual(names(ranked), ['Melk', 'Egg', 'Brød']);
});

test('en gammel vane taper mot det dere kjøper nå', () => {
  const ranked = rankFavorites(
    [item('Cola', { uses: 10, daysAgo: 300 }), item('Havremelk', { uses: 4, daysAgo: 2 })],
    [],
    NOW,
  );
  assert.deepEqual(names(ranked), ['Havremelk', 'Cola']);
});

test('det som står på lista, vises ikke', () => {
  const ranked = rankFavorites([item('Melk', { uses: 12 }), item('Egg', { uses: 6 })], [item('melk')], NOW);
  assert.deepEqual(names(ranked), ['Egg']);
});

test('én gang fra en oppskrift er ikke en favoritt, selv når den ble kjøpt', () => {
  // Lagt på lista (1) og haket av (2): én lasagne. Kommet igjen (3): en vane.
  const ranked = rankFavorites(
    [item('Hvitløk', { manual: false, uses: 2 }), item('Tomatpuré', { manual: false, uses: 3 })],
    [],
    NOW,
  );
  assert.deepEqual(names(ranked), ['Tomatpuré']);
});

test('en vare du kjøper hver uke, går forbi en du kjøpte mye av i fjor', () => {
  const ranked = rankFavorites(
    [item('Cola', { uses: 20, daysAgo: 365 }), item('Melk', { uses: 6, daysAgo: 3 })],
    [],
    NOW,
  );
  assert.deepEqual(names(ranked), ['Melk', 'Cola']);
});

test('søk: begynner med kommer før inneholder', () => {
  const hits = searchRegister(
    [item('Karamell', { uses: 20 }), item('Melk', { uses: 2 }), item('Mel', { uses: 1 })],
    [],
    'mel',
    NOW,
  );
  assert.deepEqual(names(hits), ['Melk', 'Mel', 'Karamell']);
});

test('søk: et ord i navnet som begynner med det du skrev, teller', () => {
  const hits = searchRegister([item('Revet ost'), item('Ostehøvel')], [], 'ost', NOW);
  assert.deepEqual(names(hits), ['Ostehøvel', 'Revet ost']);
});

test('søk uten tekst gir ingenting', () => {
  assert.deepEqual(searchRegister([item('Melk')], [], '  ', NOW), []);
});
