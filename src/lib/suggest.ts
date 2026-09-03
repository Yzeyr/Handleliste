/**
 * «Jeg har kylling og fløte — hva kan jeg lage?»
 *
 * Bevisst ikke en beholdning. Et lager over hva dere har hjemme må føres hver
 * gang det går tomt for egg, blir feil i løpet av en uke, og en beholdning man
 * ikke stoler på er verre enn ingen: du sjekker i kjøleskapet likevel, og har
 * i tillegg brukt tid på å føre den. Her ser du i kjøleskapet én gang og
 * skriver det du ser.
 *
 * Sammenligningen går gjennom `normalizeName`, så «H-melk» i kjøleskapet
 * treffer «helmelk» i oppskriften — samme synonymtabell som resten av appen.
 */
import { normalizeName } from './normalize.ts';
import type { Meal, MealIngredient } from './types.ts';

/**
 * Ting man har uansett. Uten denne lista ville hver eneste treff meldt at du
 * «mangler salt», og det er ikke det som avgjør om du kan lage middagen.
 *
 * Holdt kort med vilje: bare det som virkelig alltid står i skapet. Smør og
 * egg står ikke her — det er nettopp dem man går tom for.
 */
const ALWAYS_STOCKED = ['salt', 'pepper', 'sort pepper', 'vann', 'olje', 'matolje', 'olivenolje'];

export interface MealMatch {
  meal: Meal;
  /** Ingrediensene i oppskriften du sa du hadde. */
  matched: MealIngredient[];
  /** Det du må kjøpe. Salt og vann er ikke med. */
  missing: MealIngredient[];
}

const keysOf = (names: readonly string[]): Set<string> =>
  new Set(names.map((name) => normalizeName(name)).filter((key) => key !== ''));

/**
 * Rangerer middagene etter hvor mye av det du har de bruker.
 *
 * Først antall treff, så færrest mangler: en rett som bruker alle tre tingene
 * dine slår en som bruker to, og blant like slår den du er nærmest å kunne
 * lage i kveld. Middager som ikke bruker noe av det du har, faller ut — de er
 * ikke et svar på spørsmålet du stilte.
 */
export function suggestMeals(meals: readonly Meal[], have: readonly string[]): MealMatch[] {
  const mine = keysOf(have);
  if (mine.size === 0) return [];
  const stocked = keysOf(ALWAYS_STOCKED);

  return meals
    .map((meal) => {
      const matched: MealIngredient[] = [];
      const missing: MealIngredient[] = [];
      for (const ingredient of meal.ingredients) {
        const key = normalizeName(ingredient.name);
        if (mine.has(key)) matched.push(ingredient);
        else if (!stocked.has(key)) missing.push(ingredient);
      }
      return { meal, matched, missing };
    })
    .filter((match) => match.matched.length > 0)
    .sort(
      (a, b) =>
        b.matched.length - a.matched.length ||
        a.missing.length - b.missing.length ||
        a.meal.name.localeCompare(b.meal.name, 'nb'),
    );
}
