import { test } from 'node:test';
import assert from 'node:assert/strict';

import { clearLabel, planClear } from './clearing.ts';
import { normalizeName } from './normalize.ts';
import type { ShoppingItem } from './types.ts';

function item(name: string, opts: { checked?: boolean; manual?: boolean } = {}): ShoppingItem {
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
    // Fra en middag med mindre noe annet er sagt: det er varene regelen fjerner.
    manual: opts.manual ?? false,
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

test('varer fra en middag ryddes bort', () => {
  const plan = planClear([item('Taco-krydder'), item('Lompe')]);
  assert.deepEqual(names(plan.remove), ['Taco-krydder', 'Lompe']);
  assert.deepEqual(names(plan.uncheck), []);
});

test('en vare du la inn selv fjernes aldri', () => {
  const plan = planClear([item('Monster', { manual: true }), item('Taco-krydder')]);
  assert.deepEqual(names(plan.remove), ['Taco-krydder']);
});

test('en egen vare som er haket av, hakes av igjen', () => {
  const plan = planClear([item('Monster', { manual: true, checked: true })]);
  assert.deepEqual(names(plan.remove), []);
  assert.deepEqual(names(plan.uncheck), ['Monster']);
});

test('en egen vare uten hake røres ikke, men telles som stående', () => {
  const plan = planClear([item('Monster', { manual: true })]);
  assert.deepEqual(names(plan.remove), []);
  assert.deepEqual(names(plan.uncheck), []);
  assert.deepEqual(names(plan.kept), ['Monster']);
});

test('en liste med bare egne, uhakede varer gir ingenting å gjøre', () => {
  const plan = planClear([item('Monster', { manual: true }), item('Snus', { manual: true })]);
  assert.equal(plan.remove.length + plan.uncheck.length, 0);
});

test('kvitteringen teller alle egne som ble stående, ikke bare de avhukede', () => {
  const plan = planClear([
    item('Taco-krydder'),
    item('Monster', { manual: true, checked: true }),
    item('Snus', { manual: true }),
  ]);
  assert.deepEqual(names(plan.remove), ['Taco-krydder']);
  assert.deepEqual(names(plan.uncheck), ['Monster']);
  assert.equal(clearLabel(plan.remove.length, plan.kept.length), '1 vare fjernet · 2 egne varer står igjen');
});

test('kvitteringen teller begge deler', () => {
  assert.equal(clearLabel(0, 0), 'Ingen varer fjernet');
  assert.equal(clearLabel(1, 0), '1 vare fjernet');
  assert.equal(clearLabel(4, 0), '4 varer fjernet');
  assert.equal(clearLabel(4, 1), '4 varer fjernet · 1 egen vare står igjen');
  assert.equal(clearLabel(0, 2), 'Ingen varer fjernet · 2 egne varer står igjen');
});
