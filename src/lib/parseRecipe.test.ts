import { test } from 'node:test';
import assert from 'node:assert/strict';

import { cleanIngredientName, parseRecipe } from './parseRecipe.ts';

const kort = (r: ReturnType<typeof parseRecipe>) =>
  r.draft.ingredients.map((i) => `${i.name} ${i.amount ?? '—'} ${i.unit ?? ''}`.trim());

test('vanlige norske ingredienslinjer', () => {
  const r = parseRecipe(['500 g kjøttdeig', '3 dl helmelk', '2 stk paprika', '1 boks hakkede tomater'].join('\n'));
  assert.deepEqual(kort(r), ['Kjøttdeig 500 g', 'Helmelk 3 dl', 'Paprika 2 stk', 'Hakkede tomater 1 boks']);
});

test('mengde uten enhet blir stk', () => {
  assert.deepEqual(kort(parseRecipe('3 egg')), ['Egg 3 stk']);
});

test('brøker, blandet tall og komma', () => {
  const r = parseRecipe(['½ dl olje', '1 ½ dl fløte', '1,5 kg poteter'].join('\n'));
  assert.deepEqual(kort(r), ['Olje 0.5 dl', 'Fløte 1.5 dl', 'Poteter 1.5 kg']);
});

test('mengdeintervall bruker det laveste', () => {
  assert.deepEqual(kort(parseRecipe('400–600 g kylling')), ['Kylling 400 g']);
});

test('omvendt skrivemåte med komma', () => {
  assert.deepEqual(kort(parseRecipe('Kjøttdeig, 400 g')), ['Kjøttdeig 400 g']);
});

test('kulepunkter og avkrysningsbokser fjernes', () => {
  assert.deepEqual(kort(parseRecipe(['• 200 g bacon', '- 4 dl vann'].join('\n'))), ['Bacon 200 g', 'Vann 4 dl']);
});

test('presiseringer i parentes havner ikke i navnet', () => {
  assert.deepEqual(kort(parseRecipe('1 pk lasagneplater (ca. 250 g)')), ['Lasagneplater 1 pk']);
});

test('linjer uten mengde tas med, men flagges', () => {
  const r = parseRecipe(['500 g torsk', 'Salt og pepper'].join('\n'));
  assert.deepEqual(kort(r), ['Torsk 500 g', 'Salt og pepper —']);
  assert.deepEqual(r.uncertain, ['Salt og pepper']);
});

test('kategori foreslås ut fra navnet', () => {
  const r = parseRecipe(['3 dl helmelk', '400 g kjøttdeig', '2 stk løk', '200 g laks', '1 pk lefser'].join('\n'));
  assert.deepEqual(
    r.draft.ingredients.map((i) => i.category),
    ['meieri', 'kjøtt', 'grønt', 'fisk', 'bakeri'],
  );
});

test('porsjoner leses, og blir ikke en ingrediens', () => {
  const r = parseRecipe(['4 porsjoner', '500 g sei'].join('\n'));
  assert.equal(r.draft.servings, 4);
  assert.deepEqual(kort(r), ['Sei 500 g']);
});

test('framgangsmåte skilles fra ingredienser', () => {
  const r = parseRecipe(
    ['500 g sei', '2 dl makaroni', 'Slik gjør du', '1. Kok makaronien.', '2. Lag hvit saus.'].join('\n'),
  );
  assert.deepEqual(kort(r), ['Sei 500 g', 'Makaroni 2 dl']);
  assert.deepEqual(r.draft.steps, ['Kok makaronien.', 'Lag hvit saus.']);
});

test('nummererte linjer blir framgangsmåte selv uten overskrift', () => {
  const r = parseRecipe(['500 g sei', '1. Kok makaronien.', '2. Lag hvit saus.'].join('\n'));
  assert.deepEqual(kort(r), ['Sei 500 g']);
  assert.equal(r.draft.steps.length, 2);
});

test('overskriften «Ingredienser» hoppes over', () => {
  const r = parseRecipe(['Ingredienser', '500 g sei'].join('\n'));
  assert.deepEqual(kort(r), ['Sei 500 g']);
});

test('første linje uten mengde blir navnet', () => {
  const r = parseRecipe(['Fiskegrateng', 'Ingredienser', '500 g sei'].join('\n'));
  assert.equal(r.draft.name, 'Fiskegrateng');
  assert.deepEqual(kort(r), ['Sei 500 g']);
});

test('en hel oppskrift limt inn fra en nettside', () => {
  const r = parseRecipe(`Fiskegrateng

4 porsjoner

Ingredienser
• 500 g seifilet
• 2 dl makaroni
• 5 dl melk
• 40 g smør
• 40 g hvetemel
• 1 ts salt
• 100 g revet ost
• 2 egg

Slik gjør du
1. Kok makaronien etter anvisning.
2. Lag hvit saus av smør, mel og melk.
3. Bland inn fisk, egg og makaroni.
4. Stek på 200 grader i 35 minutter.`);

  assert.equal(r.draft.name, 'Fiskegrateng');
  assert.equal(r.draft.servings, 4);
  assert.equal(r.draft.ingredients.length, 8);
  assert.equal(r.draft.steps.length, 4);
  assert.deepEqual(r.uncertain, []);
  assert.deepEqual(kort(r).slice(0, 3), ['Seifilet 500 g', 'Makaroni 2 dl', 'Melk 5 dl']);
});

test('tom tekst gir et tomt utkast, ikke et krasj', () => {
  const r = parseRecipe('   \n\n  ');
  assert.equal(r.draft.ingredients.length, 0);
  assert.equal(r.draft.name, '');
});

// ---------------------------------------------------------------------------
// Samme tolkning brukes av «Legg til vare»-feltet
// ---------------------------------------------------------------------------

import { parseIngredientLine } from './parseRecipe.ts';

const linje = (t: string) => {
  const r = parseIngredientLine(t);
  return r === null ? null : `${r.name} ${r.amount ?? '—'} ${r.unit ?? ''}`.trim();
};

test('feltet forstår mengde skrevet foran navnet', () => {
  assert.equal(linje('2 l melk'), 'Melk 2 l');
  assert.equal(linje('500 g kjøttdeig'), 'Kjøttdeig 500 g');
  assert.equal(linje('3 stk paprika'), 'Paprika 3 stk');
});

test('feltet forstår tall uten enhet', () => {
  assert.equal(linje('6 egg'), 'Egg 6 stk');
});

test('bare et navn gir ingen tolkning, og skal brukes som det er', () => {
  assert.equal(linje('Melk'), null);
  assert.equal(linje('Toalettpapir'), null);
});

test('tilberedning hører ikke hjemme i et varenavn', () => {
  assert.equal(cleanIngredientName('smør , til steking'), 'smør');
  assert.equal(cleanIngredientName('benfri høyrygg av storfekjøtt , evt. bog'), 'benfri høyrygg av storfekjøtt');
  assert.equal(cleanIngredientName('potet i terninger'), 'potet');
  assert.equal(cleanIngredientName('gulrot i små terninger'), 'gulrot');
  assert.equal(cleanIngredientName('løk finhakket'), 'løk');
  assert.equal(cleanIngredientName('kjøttdeig (ca. 400 g)'), 'kjøttdeig');
});

test('et varenavn som bare ser ut som tilberedning står urørt', () => {
  // «makrell i tomat» er en vare i seg selv, ikke makrell som er tilberedt.
  assert.equal(cleanIngredientName('makrell i tomat'), 'makrell i tomat');
  assert.equal(cleanIngredientName('revet ost'), 'revet ost');
  assert.equal(cleanIngredientName('hakkede tomater'), 'hakkede tomater');
});

test('tilberedningen fjernes også når linja tolkes som ingrediens', () => {
  assert.deepEqual(parseIngredientLine('2 ss smør , til steking'), {
    name: 'Smør',
    amount: 2,
    unit: 'ss',
    category: 'meieri',
  });
  assert.equal(parseIngredientLine('800 g potet i terninger')?.name, 'Potet');
});
