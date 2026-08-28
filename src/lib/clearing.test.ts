import { test } from 'node:test';
import assert from 'node:assert/strict';

import { clearLabel, planClear } from './clearing.ts';
import { normalizeName } from './normalize.ts';
import type { ShoppingItem } from './types.ts';

function item(name: string, opts: { checked?: boolean; pinned?: boolean } = {}): ShoppingItem {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: name,
    name,
    normalized_name: normalizeName(name),
    quantities: [],
    category: 'annet',
    checked: opts.checked ?? false,
    archived: false,
    use_count: 1,
    manual: true,
    pinned: opts.pinned ?? false,
    last_used_at: now,
    updated_by: null,
    version: 0,
    source_meals: [],
    note: null,
    created_at: now,
    updated_at: now,
  };
}

const names = (rows: ShoppingItem[]): string[] => rows.map((row) => row.name);

test('vanlige varer fjernes', () => {
  const plan = planClear([item('Melk'), item('Brød')]);
  assert.deepEqual(names(plan.remove), ['Melk', 'Brød']);
  assert.deepEqual(names(plan.uncheck), []);
});

test('en fast vare fjernes aldri', () => {
  const plan = planClear([item('Melk', { pinned: true }), item('Kake')]);
  assert.deepEqual(names(plan.remove), ['Kake']);
});

test('en fast vare som er haket av, hakes av igjen', () => {
  const plan = planClear([item('Melk', { pinned: true, checked: true })]);
  assert.deepEqual(names(plan.remove), []);
  assert.deepEqual(names(plan.uncheck), ['Melk']);
});

test('en fast vare uten hake røres ikke, men telles som stående', () => {
  const plan = planClear([item('Melk', { pinned: true, checked: false })]);
  assert.deepEqual(names(plan.remove), []);
  assert.deepEqual(names(plan.uncheck), []);
  assert.deepEqual(names(plan.kept), ['Melk']);
});

test('kvitteringen teller alle faste som ble stående, ikke bare de avhukede', () => {
  const plan = planClear([
    item('Kake'),
    item('Melk', { pinned: true, checked: true }),
    item('Kaffe', { pinned: true }),
  ]);
  assert.deepEqual(names(plan.remove), ['Kake']);
  assert.deepEqual(names(plan.uncheck), ['Melk']);
  assert.equal(clearLabel(plan.remove.length, plan.kept.length), '1 vare fjernet · 2 faste varer står igjen');
});

test('en liste med bare faste, uhakede varer gir ingenting å gjøre', () => {
  const plan = planClear([item('Melk', { pinned: true }), item('Kaffe', { pinned: true })]);
  assert.equal(plan.remove.length + plan.uncheck.length, 0);
});

test('kvitteringen teller begge deler', () => {
  assert.equal(clearLabel(0, 0), 'Ingen varer fjernet');
  assert.equal(clearLabel(1, 0), '1 vare fjernet');
  assert.equal(clearLabel(4, 0), '4 varer fjernet');
  assert.equal(clearLabel(4, 1), '4 varer fjernet · 1 fast vare står igjen');
  assert.equal(clearLabel(4, 2), '4 varer fjernet · 2 faste varer står igjen');
  assert.equal(clearLabel(0, 2), 'Ingen varer fjernet · 2 faste varer står igjen');
});
