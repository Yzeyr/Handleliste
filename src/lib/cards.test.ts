import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addCard, dataUrlBytes, removeCard, type Card } from './cards.ts';

const card = (id: string, name: string): Card => ({ id, name, image: 'data:,', number: '' });

test('kort legges bakerst, så rekkefølgen er den du la dem inn i', () => {
  const one = addCard([], card('a', 'Coop'));
  const two = addCard(one, card('b', 'Trumf'));
  assert.deepEqual(two.map((c) => c.name), ['Coop', 'Trumf']);
});

test('sletting tar bare det ene kortet', () => {
  const cards = [card('a', 'Coop'), card('b', 'Trumf'), card('c', 'Rema')];
  assert.deepEqual(removeCard(cards, 'b').map((c) => c.name), ['Coop', 'Rema']);
});

test('sletting av noe som ikke finnes lar lista være', () => {
  const cards = [card('a', 'Coop')];
  assert.deepEqual(removeCard(cards, 'x'), cards);
});

test('byte-tellingen treffer den ekte størrelsen på en data-URL', () => {
  // 3 byte blir 4 base64-tegn uten padding.
  assert.equal(dataUrlBytes('data:image/png;base64,' + Buffer.from('abc').toString('base64')), 3);
  assert.equal(dataUrlBytes('data:image/png;base64,' + Buffer.from('ab').toString('base64')), 2);
  assert.equal(dataUrlBytes('data:image/png;base64,' + Buffer.from('a').toString('base64')), 1);
  const big = Buffer.alloc(50_000, 7);
  assert.equal(dataUrlBytes('data:image/png;base64,' + big.toString('base64')), 50_000);
});
