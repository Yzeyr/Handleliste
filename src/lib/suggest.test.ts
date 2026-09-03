import { test } from 'node:test';
import assert from 'node:assert/strict';

import { suggestMeals } from './suggest.ts';
import type { Meal, MealIngredient } from './types.ts';

const ing = (name: string): MealIngredient => ({
  id: name,
  meal_id: 'm',
  name,
  normalized_name: name,
  amount: 1,
  unit: 'stk',
  category: 'annet',
  sort_order: 0,
});

const meal = (name: string, names: string[]): Meal => ({
  id: name,
  name,
  emoji: null,
  description: null,
  servings: 4,
  steps: [],
  tags: [],
  ingredients: names.map(ing),
});

const MEALS = [
  meal('Kylling i form', ['Kylling', 'Fløte', 'Brokkoli', 'Ris']),
  meal('Kremet pasta', ['Fløte', 'Pasta', 'Parmesan']),
  meal('Taco', ['Kjøttdeig', 'Tortilla', 'Rømme', 'Salat']),
  meal('Kyllingwok', ['Kylling', 'Nudler', 'Soyasaus']),
];

test('flest treff først', () => {
  const treff = suggestMeals(MEALS, ['kylling', 'fløte']);
  assert.deepEqual(treff.map((t) => t.meal.name), ['Kylling i form', 'Kremet pasta', 'Kyllingwok']);
  assert.equal(treff[0]?.matched.length, 2);
});

test('blant like treff vinner den med færrest mangler', () => {
  const treff = suggestMeals(MEALS, ['fløte', 'kylling']);
  // Begge bruker én av dine: Kremet pasta mangler 2, Kyllingwok mangler 2 —
  // begge etter Kylling i form, som bruker begge to.
  assert.equal(treff[0]?.meal.name, 'Kylling i form');
  assert.equal(treff[0]?.missing.length, 2);
});

test('middager som ikke bruker noe av det du har, faller ut', () => {
  const treff = suggestMeals(MEALS, ['kylling']);
  assert.ok(!treff.some((t) => t.meal.name === 'Taco'));
});

test('synonymer gjelder her også', () => {
  const meals = [meal('Grøt', ['Helmelk', 'Havregryn'])];
  assert.equal(suggestMeals(meals, ['H-melk']).length, 1);
  assert.equal(suggestMeals(meals, ['h melk'])[0]?.matched[0]?.name, 'Helmelk');
});

test('salt og vann telles ikke som noe du mangler', () => {
  const meals = [meal('Pasta', ['Pasta', 'Salt', 'Vann', 'Parmesan'])];
  const treff = suggestMeals(meals, ['pasta']);
  assert.deepEqual(treff[0]?.missing.map((i) => i.name), ['Parmesan']);
});

test('ingenting inn gir ingenting ut', () => {
  assert.deepEqual(suggestMeals(MEALS, []), []);
  assert.deepEqual(suggestMeals(MEALS, ['   ']), []);
});
