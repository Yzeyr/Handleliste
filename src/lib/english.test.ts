import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  convertFahrenheit,
  convertUsUnit,
  looksEnglish,
  readUsUnit,
  translateIngredient,
} from './english.ts';
import { parseIngredientLine, parseRecipe } from './parseRecipe.ts';

test('volum blir volum, ikke vekt', () => {
  // 2 cups mel er 4,7 dl. Å gjøre det til gram krever en tetthet per
  // ingrediens, og bommer man der, er bakingen ødelagt.
  assert.deepEqual(convertUsUnit(2, 'cups'), { amount: 4.7, unit: 'dl' });
  assert.deepEqual(convertUsUnit(0.25, 'cup'), { amount: 0.6, unit: 'dl' });
});

test('vekt blir vekt', () => {
  assert.deepEqual(convertUsUnit(1, 'lb'), { amount: 454, unit: 'g' });
  assert.deepEqual(convertUsUnit(8, 'oz'), { amount: 227, unit: 'g' });
});

test('en stick smør er en vektenhet, ikke et volum', () => {
  assert.deepEqual(convertUsUnit(1, 'stick'), { amount: 113, unit: 'g' });
});

test('halve skjeer overlever omregningen', () => {
  assert.deepEqual(convertUsUnit(0.5, 'tsp'), { amount: 0.5, unit: 'ts' });
  assert.deepEqual(convertUsUnit(1.5, 'teaspoons'), { amount: 1.5, unit: 'ts' });
  assert.deepEqual(convertUsUnit(2, 'tablespoons'), { amount: 2, unit: 'ss' });
});

test('tellemål får norsk ord uten omregning', () => {
  assert.deepEqual(convertUsUnit(2, 'cloves'), { amount: 2, unit: 'fedd' });
  assert.deepEqual(convertUsUnit(1, 'can'), { amount: 1, unit: 'boks' });
});

test('ukjent enhet gir null, så linja kan beholdes slik den var', () => {
  assert.equal(convertUsUnit(1, 'skosnøre'), null);
  assert.equal(readUsUnit('flour'), null);
});

test('enheter på to ord leses før enkeltordene', () => {
  assert.deepEqual(readUsUnit('fl oz milk'), { unit: 'fl oz', rest: 'milk' });
});

test('sammensatte navn slår enkeltord', () => {
  assert.equal(translateIngredient('heavy cream'), 'fløte');
  assert.equal(translateIngredient('sour cream'), 'rømme');
  assert.equal(translateIngredient('ground beef'), 'kjøttdeig');
  assert.equal(translateIngredient('all-purpose flour'), 'hvetemel');
  assert.equal(translateIngredient('baking soda'), 'natron');
});

test('beskrivende ord fjernes bare når oppslaget ellers bommer', () => {
  assert.equal(translateIngredient('finely chopped onions'), 'løk');
  assert.equal(translateIngredient('large eggs'), 'egg');
  // «ground» er beskrivende i «ground pepper», men en del av varen i
  // «ground beef». Fullt oppslag først avgjør det.
  assert.equal(translateIngredient('ground beef'), 'kjøttdeig');
});

test('et ukjent navn kommer uendret tilbake', () => {
  assert.equal(translateIngredient('gochujang'), 'gochujang');
  assert.equal(translateIngredient('Rømme'), 'Rømme');
});

test('ovnstemperatur regnes om til noe en ovn kan stilles inn på', () => {
  assert.equal(convertFahrenheit('Preheat oven to 350°F.'), 'Preheat oven to 175 °C.');
  assert.equal(convertFahrenheit('Bake at 425 degrees F'), 'Bake at 220 °C');
  // Tall som ikke er en ovnstemperatur skal stå i fred.
  assert.equal(convertFahrenheit('Add 2 F cups'), 'Add 2 F cups');
  assert.equal(convertFahrenheit('Chill for 30 minutes'), 'Chill for 30 minutes');
});

test('utskrevne brøker leses', () => {
  assert.deepEqual(parseIngredientLine('1/2 cup sugar'), {
    name: 'Sukker',
    amount: 1.2,
    unit: 'dl',
    category: 'tørrvarer',
  });
  assert.equal(parseIngredientLine('1 1/2 cups milk')?.amount, 3.5);
});

test('en amerikansk oppskrift blir norsk', () => {
  const r = parseRecipe(
    [
      'Pancakes',
      'Serves 4',
      'Ingredients',
      '2 cups all-purpose flour',
      '1 tsp baking soda',
      '1/2 stick butter, melted',
      '8 oz sour cream',
      'Instructions',
      '1. Preheat oven to 400°F.',
    ].join('\n'),
  );
  assert.equal(r.draft.name, 'Pancakes');
  assert.equal(r.draft.servings, 4);
  assert.deepEqual(
    r.draft.ingredients.map((i) => `${i.name} ${i.amount} ${i.unit}`),
    ['Hvetemel 4.7 dl', 'Natron 1 ts', 'Smør 57 g', 'Rømme 227 g'],
  );
  assert.deepEqual(r.draft.steps, ['Preheat oven to 205 °C.']);
});

test('norske oppskrifter er uendret av at engelsk er lagt til', () => {
  const r = parseRecipe(['Vafler', '4 porsjoner', '3 dl melk', '2 ss sukker'].join('\n'));
  assert.equal(r.draft.servings, 4);
  assert.deepEqual(
    r.draft.ingredients.map((i) => `${i.name} ${i.amount} ${i.unit}`),
    ['Melk 3 dl', 'Sukker 2 ss'],
  );
});

test('norske ord språkene deler blir ikke «oversatt»', () => {
  // Norsk paprika er grønnsaken, engelsk paprika er krydderet. Uten
  // terskelen ble «2 stk paprika» i en norsk oppskrift til paprikapulver.
  assert.equal(looksEnglish('2 stk paprika'), false);
  assert.equal(parseIngredientLine('2 stk paprika')?.name, 'Paprika');
  assert.equal(looksEnglish('1 ts salt'), false);
  assert.equal(looksEnglish('200 g bacon'), false);
});

test('entydig engelsk gjenkjennes', () => {
  assert.equal(looksEnglish('1 tsp paprika'), true);
  assert.equal(looksEnglish('2 cups flour'), true);
  assert.equal(looksEnglish('3 large carrots'), true);
  assert.equal(looksEnglish('1 lb ground beef'), true);
  assert.equal(parseIngredientLine('1 tsp paprika')?.name, 'Paprikapulver');
});

test('flerordsnavn er engelsk bevis selv når enkeltordene ikke er det', () => {
  assert.equal(looksEnglish('2 bay leaves'), true);
  assert.equal(parseIngredientLine('2 bay leaves')?.name, 'Laurbærblad');
});
