import { test } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeName } from './normalize.ts';

test('ferske tomater og bokstomater er ikke samme vare', () => {
  // Sto de begge som «hermetiske tomater», ble to tomater til salaten slått
  // sammen med en boks hakkede — én linje som var feil uansett hvordan man
  // leste den.
  assert.equal(normalizeName('tomater'), normalizeName('tomat'));
  assert.notEqual(normalizeName('tomater'), normalizeName('hakkede tomater'));
  assert.equal(normalizeName('hakkede tomater'), normalizeName('knuste tomater'));
  assert.equal(normalizeName('boksetomater'), normalizeName('hermetiske tomater'));
});

test('flertall slås sammen med entall for ferskvarer', () => {
  assert.equal(normalizeName('løker'), normalizeName('løk'));
  assert.equal(normalizeName('gulrøtter'), normalizeName('gulrot'));
  assert.equal(normalizeName('Tomater'), normalizeName('tomat'));
});

test('skrivemåte og aksenter spiller ingen rolle', () => {
  assert.equal(normalizeName('H-melk'), normalizeName('helmelk'));
  assert.equal(normalizeName('  HELMELK '), normalizeName('helmelk'));
  assert.equal(normalizeName('crème fraîche'), normalizeName('creme fraiche'));
});
