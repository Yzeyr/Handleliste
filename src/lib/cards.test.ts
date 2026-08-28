import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addCard, cropFromDrag, dataUrlBytes, FULL_IMAGE, removeCard, type Card } from './cards.ts';

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

test('en dragning blir til andeler av bildet, ikke piksler', () => {
  const crop = cropFromDrag({ x: 100, y: 50 }, { x: 300, y: 250 }, 400, 400);
  assert.deepEqual(crop, { x: 0.25, y: 0.125, w: 0.5, h: 0.5 });
});

test('dragning bakover gir samme utsnitt som forover', () => {
  const fram = cropFromDrag({ x: 100, y: 50 }, { x: 300, y: 250 }, 400, 400);
  const bak = cropFromDrag({ x: 300, y: 250 }, { x: 100, y: 50 }, 400, 400);
  assert.deepEqual(bak, fram);
});

test('dragning utenfor bildet klippes til kanten', () => {
  assert.deepEqual(cropFromDrag({ x: -80, y: -80 }, { x: 900, y: 900 }, 400, 400), FULL_IMAGE);
});

test('et trykk uten dragning gir hele bildet, ikke en tom firkant', () => {
  assert.deepEqual(cropFromDrag({ x: 200, y: 200 }, { x: 202, y: 203 }, 400, 400), FULL_IMAGE);
});

test('et utsnitt like over minstemålet beholdes', () => {
  const crop = cropFromDrag({ x: 0, y: 0 }, { x: 40, y: 40 }, 400, 400);
  assert.deepEqual(crop, { x: 0, y: 0, w: 0.1, h: 0.1 });
});

test('et bilde uten størrelse gir hele bildet i stedet for deling på null', () => {
  assert.deepEqual(cropFromDrag({ x: 0, y: 0 }, { x: 10, y: 10 }, 0, 0), FULL_IMAGE);
});
