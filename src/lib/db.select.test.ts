import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * Vakt mot en feil som faktisk skjedde: `weekday` ble lagt til i skjemaet og i
 * typen, men ikke i den håndskrevne kolonnelista i `fetchWeekPlan`. Dagen ble
 * lagret og lest tilbake som tom — uten at noe feilet, og uten at noen test
 * merket det, fordi mock-laget returnerer hele objekter.
 *
 * Regelen her: en lesing henter enten `*`, eller navngir hvert felt typen har.
 */
const KREVES: Record<string, string[]> = {
  week_plan_items: ['id', 'meal_id', 'added_to_list', 'weekday'],
  ingredient_aliases: ['alias', 'canonical'],
  push_targets: ['device_id', 'label', 'topic'],
};

const kilde = readFileSync(new URL('./db.ts', import.meta.url), 'utf8');

for (const [tabell, felter] of Object.entries(KREVES)) {
  test(`lesing fra ${tabell} henter alle feltene typen har`, () => {
    const treff = [...kilde.matchAll(new RegExp(`from\\('${tabell}'\\)([\\s\\S]{0,240})`, 'g'))];
    assert.ok(treff.length > 0, `fant ingen lesing fra ${tabell}`);

    const lesninger = treff
      .map((m) => /\.select\(\s*'([^']*)'/.exec(m[1] ?? ''))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => m[1] ?? '');
    assert.ok(lesninger.length > 0, `fant ingen select mot ${tabell}`);

    for (const kolonner of lesninger) {
      if (kolonner.trim() === '*') continue;
      const navngitt = kolonner.split(',').map((s) => s.trim());
      // En select som bare henter én nøkkel tilbake etter en skriving
      // («.select('id')») er ikke en lesing av raden, og skal ikke telle.
      if (navngitt.length === 1 && navngitt[0] === 'id') continue;
      for (const felt of felter) {
        assert.ok(navngitt.includes(felt), `select mot ${tabell} mangler «${felt}»: ${kolonner}`);
      }
    }
  });
}
