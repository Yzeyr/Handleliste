import { test } from 'node:test';
import assert from 'node:assert/strict';

import { describeLastBought, mealsUsing } from './facts.ts';
import { normalizeName } from './normalize.ts';
import type { Meal, MealIngredient, ShoppingItem } from './types.ts';

function item(name: string): ShoppingItem {
  return {
    id: name,
    name,
    normalized_name: normalizeName(name),
    quantities: [],
    category: 'annet',
    checked: false,
    archived: true,
    use_count: 1,
    manual: false,
    pinned: false,
    last_used_at: '',
    updated_by: null,
    version: 0,
    source_meals: [],
    note: null,
    created_at: '',
    updated_at: '',
  };
}

function meal(name: string, ingredients: string[]): Meal {
  return {
    id: name,
    name,
    emoji: null,
    description: null,
    servings: 4,
    steps: [],
    tags: [],
    ingredients: ingredients.map((ingredient, index): MealIngredient => ({
      id: `${name}-${index}`,
      meal_id: name,
      name: ingredient,
      normalized_name: normalizeName(ingredient),
      amount: 1,
      unit: 'stk',
      category: 'annet',
      sort_order: index,
    })),
  };
}

const meals = [
  meal('Taco', ['Kjøttdeig', 'Revet ost']),
  meal('Lasagne', ['Kjøttdeig', 'Helmelk']),
  meal('Ovnsbakt laks', ['Laksefilet']),
];

test('finner middagene en vare brukes i', () => {
  assert.deepEqual(mealsUsing(item('Kjøttdeig'), meals), ['Taco', 'Lasagne']);
  assert.deepEqual(mealsUsing(item('Laksefilet'), meals), ['Ovnsbakt laks']);
  assert.deepEqual(mealsUsing(item('Bananer'), meals), []);
});

test('bruker samme navnematching som resten av appen', () => {
  // "H-melk" i registeret og "Helmelk" i oppskriften er samme vare.
  assert.deepEqual(mealsUsing(item('H-melk'), meals), ['Lasagne']);
});

const now = new Date(2026, 7, 28, 14, 0);

test('nære datoer skrives med ord', () => {
  assert.equal(describeLastBought(new Date(2026, 7, 28, 9, 0).toISOString(), now), 'i dag');
  assert.equal(describeLastBought(new Date(2026, 7, 27, 22, 0).toISOString(), now), 'i går');
  assert.equal(describeLastBought(new Date(2026, 7, 24, 12, 0).toISOString(), now), 'for 4 dager siden');
});

test('i går gjelder kalenderdøgn, ikke 24 timer', () => {
  // 16 timer siden, men i går kveld.
  assert.equal(describeLastBought(new Date(2026, 7, 27, 22, 0).toISOString(), now), 'i går');
});

test('eldre enn en uke skrives som dato', () => {
  assert.equal(describeLastBought(new Date(2026, 7, 21, 12, 0).toISOString(), now), '21. aug.');
  assert.equal(describeLastBought(new Date(2026, 0, 3, 12, 0).toISOString(), now), '3. jan.');
});

test('tåler tomt og ugyldig', () => {
  assert.equal(describeLastBought('', now), null);
  assert.equal(describeLastBought('tull', now), null);
  // En dato fram i tid gir ingenting heller enn «for -3 dager siden».
  assert.equal(describeLastBought(new Date(2026, 7, 31).toISOString(), now), null);
});

// ---------------------------------------------------------------------------
// Kategori uten at noen må åpne en nedtrekksliste
// ---------------------------------------------------------------------------

import { categoryForName } from './facts.ts';

function kjent(name: string, category: ShoppingItem['category']): ShoppingItem {
  return { ...item(name), category };
}

test('gjenbruker kategorien varen allerede har fått', () => {
  // Gjetningen ville sagt «annet» her; det dere selv har bestemt veier tyngre.
  assert.equal(categoryForName('Kikerter', [kjent('Kikerter', 'grønt')]), 'grønt');
});

test('gjetter fra navnet når varen er ny', () => {
  assert.equal(categoryForName('Helmelk', []), 'meieri');
  assert.equal(categoryForName('Kjøttdeig', []), 'kjøtt');
  assert.equal(categoryForName('Laksefilet', []), 'fisk');
  assert.equal(categoryForName('Rødløk', []), 'grønt');
  assert.equal(categoryForName('Tortillalefser', []), 'bakeri');
});

test('gir annet når den ikke vet', () => {
  assert.equal(categoryForName('Tannkrem', []), 'annet');
});

test('kjenner igjen varen selv om navnet skrives annerledes', () => {
  assert.equal(categoryForName('H-melk', [kjent('Helmelk', 'meieri')]), 'meieri');
});
