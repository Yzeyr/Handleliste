import { test } from 'node:test';
import assert from 'node:assert/strict';

import { itemsFromMeals, mergeQuantities, planListChange } from './merge.ts';
import { normalizeName } from './normalize.ts';
import { formatQuantities } from './units.ts';
import type { Meal, MealIngredient, Quantity, ShoppingItem } from './types.ts';

function ing(
  name: string,
  amount: number | null,
  unit: string | null,
  category: MealIngredient['category'] = 'annet',
): MealIngredient {
  return {
    id: `${name}-${unit}`,
    meal_id: 'm',
    name,
    normalized_name: normalizeName(name),
    amount,
    unit,
    category,
    sort_order: 0,
  };
}

function meal(name: string, ingredients: MealIngredient[]): Meal {
  return {
    id: name,
    name,
    emoji: null,
    description: null,
    servings: 4,
    steps: [],
    tags: [],
    ingredients,
  };
}

function listItem(
  name: string,
  quantities: Quantity[],
  sourceMeals: string[] = [],
  archived = false,
): ShoppingItem {
  return {
    id: `id-${name}`,
    name,
    normalized_name: normalizeName(name),
    quantities,
    category: 'annet',
    checked: false,
    archived,
    use_count: 1,
    last_used_at: '',
    source_meals: sourceMeals,
    note: null,
    created_at: '',
    updated_at: '',
  };
}

const show = (q: Quantity[]) => formatQuantities(q);

// ---------------------------------------------------------------------------
// Navn
// ---------------------------------------------------------------------------

test('normaliserer store bokstaver, mellomrom og aksenter', () => {
  assert.equal(normalizeName('  Crème Fraîche '), 'creme fraiche');
  assert.equal(normalizeName('KJØTTDEIG'), 'kjottdeig');
  assert.equal(normalizeName('Tikka masala-saus'), 'tikka masalasaus');
});

test('H-melk og helmelk er samme vare', () => {
  assert.equal(normalizeName('H-melk'), 'helmelk');
  assert.equal(normalizeName('h melk'), 'helmelk');
  assert.equal(normalizeName('Helmelk'), 'helmelk');
  assert.equal(normalizeName('Melk'), 'helmelk');
});

test('slår ikke sammen varer som bare ligner', () => {
  assert.notEqual(normalizeName('kokosmelk'), normalizeName('helmelk'));
  assert.notEqual(normalizeName('lettmelk'), normalizeName('helmelk'));
  assert.notEqual(normalizeName('kyllingfilet'), normalizeName('kyllinglår'));
});

// ---------------------------------------------------------------------------
// Mengder
// ---------------------------------------------------------------------------

test('kravet fra oppgaven: 3 dl + 2 dl helmelk blir 5 dl', () => {
  assert.equal(show(mergeQuantities([{ amount: 3, unit: 'dl' }], [{ amount: 2, unit: 'dl' }])), '5 dl');
});

test('regner om mellom enheter i samme dimensjon', () => {
  assert.equal(show(mergeQuantities([{ amount: 500, unit: 'g' }], [{ amount: 1, unit: 'kg' }])), '1,5 kg');
  assert.equal(show(mergeQuantities([{ amount: 2, unit: 'dl' }], [{ amount: 1, unit: 'l' }])), '1,2 l');
  assert.equal(show(mergeQuantities([{ amount: 1, unit: 'ss' }], [{ amount: 1, unit: 'ts' }])), '20 ml');
});

test('beholder enheten når alle bidragene brukte samme enhet', () => {
  // 3 ss er 45 ml, men "3 ss" er det man vil lese på en handleliste.
  assert.equal(show(mergeQuantities([{ amount: 2, unit: 'ss' }], [{ amount: 1, unit: 'ss' }])), '3 ss');
  assert.equal(show(mergeQuantities([{ amount: 300, unit: 'g' }], [{ amount: 400, unit: 'g' }])), '700 g');
});

test('ulike dimensjoner blir stående på samme linje, ikke to rader', () => {
  const merged = mergeQuantities(
    [{ amount: 3, unit: 'dl' }],
    [{ amount: 2, unit: 'boks' }],
    [{ amount: 1, unit: 'dl' }],
  );
  assert.equal(merged.length, 2);
  assert.equal(show(merged), '4 dl + 2 boks');
});

test('ukjente enheter summeres bare med seg selv', () => {
  assert.equal(show(mergeQuantities([{ amount: 1, unit: 'pk' }], [{ amount: 2, unit: 'pk' }])), '3 pk');
  assert.equal(
    show(mergeQuantities([{ amount: 1, unit: 'pose' }], [{ amount: 1, unit: 'pk' }])),
    '1 pose + 1 pk',
  );
});

test('normaliserer enhetsskrivemåte før sammenslåing', () => {
  assert.equal(show(mergeQuantities([{ amount: 200, unit: 'gram' }], [{ amount: 300, unit: 'G' }])), '500 g');
  assert.equal(show(mergeQuantities([{ amount: 1, unit: 'stk.' }], [{ amount: 2, unit: 'stykker' }])), '3 stk');
});

test('tom enhet tolkes som stk', () => {
  assert.equal(show(mergeQuantities([{ amount: 2, unit: '' }], [{ amount: 1, unit: 'stk' }])), '3 stk');
});

test('velger største enhet der tallet fortsatt blir minst 1', () => {
  assert.equal(show(mergeQuantities([{ amount: 10, unit: 'ml' }], [{ amount: 5, unit: 'ml' }])), '15 ml');
  assert.equal(show(mergeQuantities([{ amount: 150, unit: 'ml' }], [{ amount: 1, unit: 'dl' }])), '2,5 dl');
  assert.equal(show(mergeQuantities([{ amount: 900, unit: 'ml' }], [{ amount: 2, unit: 'dl' }])), '1,1 l');
});

// ---------------------------------------------------------------------------
// Middager -> linjer
// ---------------------------------------------------------------------------

test('to middager med helmelk gir én linje med summert mengde', () => {
  const items = itemsFromMeals([
    meal('Fiskegrateng', [ing('Helmelk', 5, 'dl', 'meieri'), ing('Makaroni', 200, 'g', 'tørrvarer')]),
    meal('Kjøttkaker', [ing('Helmelk', 1, 'dl', 'meieri'), ing('Potet', 800, 'g', 'grønt')]),
  ]);

  const melk = items.find((i) => i.normalizedName === 'helmelk');
  assert.ok(melk);
  assert.equal(show(melk.quantities), '6 dl');
  assert.deepEqual(melk.sourceMeals, ['Fiskegrateng', 'Kjøttkaker']);
  assert.equal(items.length, 3, 'makaroni og potet skal fortsatt være egne linjer');
});

test('samme vare skrevet ulikt i to oppskrifter blir én linje', () => {
  const items = itemsFromMeals([
    meal('A', [ing('Helmelk', 3, 'dl', 'meieri')]),
    meal('B', [ing('H-melk', 2, 'dl', 'meieri')]),
  ]);
  assert.equal(items.length, 1);
  assert.equal(show(items[0]!.quantities), '5 dl');
});

test('ingrediens uten mengde blokkerer ikke summering av de andre', () => {
  const items = itemsFromMeals([
    meal('A', [ing('Salt', null, null)]),
    meal('B', [ing('Salt', null, null)]),
    meal('C', [ing('Smør', 50, 'g', 'meieri')]),
  ]);
  const salt = items.find((i) => i.normalizedName === 'salt');
  assert.ok(salt);
  assert.deepEqual(salt.quantities, []);
  assert.deepEqual(salt.sourceMeals, ['A', 'B']);
});

test('mengde uten tall pluss mengde med tall gir mengden', () => {
  const items = itemsFromMeals([
    meal('A', [ing('Pepper', null, null)]),
    meal('B', [ing('Pepper', 2, 'ts')]),
  ]);
  assert.equal(show(items[0]!.quantities), '2 ts');
});

// ---------------------------------------------------------------------------
// Møtet med lista som allerede finnes
// ---------------------------------------------------------------------------

test('treff på eksisterende linje blir oppdatering, ikke ny rad', () => {
  const current = [listItem('Helmelk', [{ amount: 3, unit: 'dl' }], ['Lasagne'])];
  const incoming = itemsFromMeals([meal('Fiskesuppe', [ing('Helmelk', 2, 'dl', 'meieri')])]);

  const change = planListChange(current, incoming);
  assert.equal(change.inserts.length, 0);
  assert.equal(change.updates.length, 1);
  assert.equal(show(change.updates[0]!.quantities), '5 dl');
  assert.deepEqual(change.updates[0]!.sourceMeals, ['Lasagne', 'Fiskesuppe']);
});

test('manuelt lagt inn vare slås sammen med middagsingrediens', () => {
  const current = [listItem('melk', [{ amount: 1, unit: 'l' }])];
  const incoming = itemsFromMeals([meal('Lasagne', [ing('Helmelk', 5, 'dl', 'meieri')])]);

  const change = planListChange(current, incoming);
  assert.equal(change.inserts.length, 0);
  assert.equal(show(change.updates[0]!.quantities), '1,5 l');
});

test('ny vare blir insert', () => {
  const change = planListChange([], itemsFromMeals([meal('Taco', [ing('Mais', 1, 'boks')])]));
  assert.equal(change.updates.length, 0);
  assert.equal(change.inserts.length, 1);
  assert.equal(change.inserts[0]!.normalizedName, 'mais');
});

test('hele ukemenyen gir ingen duplikate linjer', () => {
  const meals = [
    meal('Lasagne', [ing('Helmelk', 5, 'dl'), ing('Kjøttdeig', 400, 'g'), ing('Revet ost', 200, 'g')]),
    meal('Fiskegrateng', [ing('Helmelk', 5, 'dl'), ing('Revet ost', 100, 'g')]),
    meal('Taco', [ing('Kjøttdeig', 400, 'g'), ing('Revet ost', 150, 'g'), ing('Mais', 1, 'boks')]),
  ];
  const items = itemsFromMeals(meals);
  const names = items.map((i) => i.normalizedName);
  assert.equal(new Set(names).size, names.length, 'ingen normalisert navn skal gå igjen');
  assert.equal(show(items.find((i) => i.normalizedName === 'helmelk')!.quantities), '1 l');
  assert.equal(show(items.find((i) => i.normalizedName === 'revet ost')!.quantities), '450 g');
  assert.equal(show(items.find((i) => i.normalizedName === 'kjottdeig')!.quantities), '800 g');
});

test('en arkivert vare vekkes til live i stedet for å bli duplisert', () => {
  const arkivert = listItem('Helmelk', [], [], true);
  const change = planListChange([arkivert], itemsFromMeals([meal('Lasagne', [ing('Helmelk', 5, 'dl')])]));

  assert.equal(change.inserts.length, 0, 'skal ikke lage en ny rad ved siden av den arkiverte');
  assert.equal(change.updates.length, 1);
  assert.equal(change.updates[0]!.item.id, arkivert.id);
  assert.equal(show(change.updates[0]!.quantities), '5 dl');
});
