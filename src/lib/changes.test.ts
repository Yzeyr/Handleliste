import { test } from 'node:test';
import assert from 'node:assert/strict';

import { describeChange, summarizeChanges, type ChangeEvent } from './changes.ts';
import type { ShoppingItem } from './types.ts';

function row(over: Partial<ShoppingItem>): Partial<ShoppingItem> {
  return { name: 'Helmelk', archived: false, checked: false, quantities: [], ...over };
}

const ev = (
  type: ChangeEvent['type'],
  next: Partial<ShoppingItem> | null,
  previous: Partial<ShoppingItem> | null = null,
): ChangeEvent => ({ type, next, previous });

test('egne endringer varsles ikke tilbake til en selv', () => {
  assert.equal(describeChange(ev('INSERT', row({ updated_by: 'Emil' })), 'Emil'), null);
});

test('den andres endringer navngis', () => {
  assert.equal(
    describeChange(ev('INSERT', row({ updated_by: 'Kari' })), 'Emil'),
    'Kari la til Helmelk',
  );
});

test('uten navn blir det «Noen»', () => {
  assert.equal(describeChange(ev('INSERT', row({})), 'Emil'), 'Noen la til Helmelk');
});

test('mengde tas med når varen legges til', () => {
  assert.equal(
    describeChange(ev('INSERT', row({ updated_by: 'Kari', quantities: [{ amount: 1, unit: 'l' }] })), null),
    'Kari la til Helmelk (1 l)',
  );
});

test('avhuking er ikke det samme som fjerning', () => {
  const before = row({ checked: false });
  assert.equal(
    describeChange(ev('UPDATE', row({ updated_by: 'Kari', checked: true }), before), 'Emil'),
    'Kari handlet Helmelk',
  );
  assert.equal(
    describeChange(ev('UPDATE', row({ updated_by: 'Kari', archived: true }), before), 'Emil'),
    'Kari fjernet Helmelk',
  );
});

test('angret avhuking', () => {
  assert.equal(
    describeChange(ev('UPDATE', row({ updated_by: 'Kari' }), row({ checked: true })), 'Emil'),
    'Kari angret Helmelk',
  );
});

test('vare hentet fram fra registeret leses som lagt til', () => {
  assert.equal(
    describeChange(
      ev('UPDATE', row({ updated_by: 'Kari', quantities: [{ amount: 2, unit: 'l' }] }), row({ archived: true })),
      'Emil',
    ),
    'Kari la til Helmelk (2 l)',
  );
});

test('endret mengde', () => {
  assert.equal(
    describeChange(
      ev(
        'UPDATE',
        row({ updated_by: 'Kari', quantities: [{ amount: 2, unit: 'l' }] }),
        row({ quantities: [{ amount: 1, unit: 'l' }] }),
      ),
      'Emil',
    ),
    'Kari endret Helmelk til 2 l',
  );
});

test('en oppdatering uten synlig forskjell varsles ikke', () => {
  assert.equal(describeChange(ev('UPDATE', row({ updated_by: 'Kari' }), row({})), 'Emil'), null);
});

test('mangler forrige tilstand blir det et vagt, men sant, utsagn', () => {
  assert.equal(
    describeChange(ev('UPDATE', row({ updated_by: 'Kari', checked: true }), null), 'Emil'),
    'Kari handlet Helmelk',
  );
});

test('sletting', () => {
  assert.equal(
    describeChange(ev('DELETE', null, row({ updated_by: 'Kari' })), 'Emil'),
    'Kari slettet Helmelk',
  );
});

test('flere endringer slås sammen til én linje', () => {
  assert.equal(summarizeChanges([]), null);
  assert.equal(summarizeChanges(['Kari la til Melk']), 'Kari la til Melk');
  assert.equal(summarizeChanges(['a', 'b', 'c']), '3 endringer på lista');
});
