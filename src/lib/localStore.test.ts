import { test } from 'node:test';
import assert from 'node:assert/strict';

import { countPurchase, setCheckedLocal, type LocalState } from './localStore.ts';
import { normalizeName } from './normalize.ts';
import type { ShoppingItem } from './types.ts';

const BEFORE = '2026-10-01T10:00:00.000Z';

function state(uses = 1): LocalState {
  const row: ShoppingItem = {
    id: 'melk',
    name: 'Melk',
    normalized_name: normalizeName('Melk'),
    quantities: [],
    category: 'meieri',
    checked: false,
    archived: false,
    use_count: uses,
    manual: true,
    last_used_at: BEFORE,
    updated_by: null,
    version: 0,
    source_meals: [],
    note: null,
    created_at: BEFORE,
    updated_at: BEFORE,
  };
  return { items: [row], week: [] };
}

const melk = (s: LocalState): ShoppingItem => s.items[0]!;

test('en avhuking teller som et kjøp og flytter datoen', () => {
  const s = state(4);
  setCheckedLocal(s, 'melk', true, null, 1);
  assert.equal(melk(s).checked, true);
  assert.equal(melk(s).use_count, 5);
  assert.notEqual(melk(s).last_used_at, BEFORE);
});

test('angre trekker kjøpet fra igjen', () => {
  const s = state(4);
  setCheckedLocal(s, 'melk', true, null, 1);
  setCheckedLocal(s, 'melk', false, null, -1);
  assert.equal(melk(s).checked, false);
  assert.equal(melk(s).use_count, 4);
});

test('opprydding etter handleturen rører ikke tellingen', () => {
  const s = state(4);
  setCheckedLocal(s, 'melk', true, null, 1);
  setCheckedLocal(s, 'melk', false, null);
  assert.equal(melk(s).use_count, 5);
});

test('tellingen går aldri under 1', () => {
  assert.equal(countPurchase({ use_count: 1, last_used_at: BEFORE }, -1, 'nå').use_count, 1);
});

test('et angret kjøp lar datoen stå', () => {
  assert.equal(countPurchase({ use_count: 3, last_used_at: BEFORE }, -1, 'nå').last_used_at, BEFORE);
});
