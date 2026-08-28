/**
 * Det appen vet sikkert om en vare.
 *
 * Bevisst bare fakta, ingen spådommer: «kjøpt 8 ganger, sist 21. aug» blir
 * mer nyttig jo lenger dere bruker appen, mens «du burde kjøpe denne nå» må
 * treffe nesten hver gang for å være annet enn støy.
 */
import { normalizeName } from './normalize.ts';
import { guessCategory } from './parseRecipe.ts';
import type { Category } from './types.ts';
import type { Meal, ShoppingItem } from './types.ts';

/**
 * Hvilke middager som bruker varen. Regnes ut fra oppskriftene som er lastet,
 * ikke lagret noe sted — da stemmer den med synonymene slik de er nå, og med
 * middager dere har endret siden sist.
 */
export function mealsUsing(item: ShoppingItem, meals: readonly Meal[]): string[] {
  const key = item.normalized_name;
  return meals
    .filter((meal) => meal.ingredients.some((row) => normalizeName(row.name) === key))
    .map((meal) => meal.name);
}

const DATE_FORMAT = new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short' });

/**
 * «i dag», «i går», «for 5 dager siden», ellers datoen.
 *
 * Bytter til dato etter en uke: «for 43 dager siden» er et tall man må regne
 * om i hodet, mens «21. aug» kan leses rett av.
 */
export function describeLastBought(iso: string, now: Date = new Date()): string | null {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;

  // Sammenlignes på kalenderdøgn, ikke på timer: noe kjøpt i går kveld skal
  // hete «i går» selv om det er under 24 timer siden.
  const days = Math.round((startOfDay(now).getTime() - startOfDay(then).getTime()) / 86_400_000);

  if (days < 0) return null;
  if (days === 0) return 'i dag';
  if (days === 1) return 'i går';
  if (days < 7) return `for ${days} dager siden`;
  return DATE_FORMAT.format(then);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}


/**
 * Hvilken butikkseksjon en vare hører hjemme i.
 *
 * Har dere kjøpt den før, gjenbrukes kategorien dere allerede har gitt den —
 * det er alltid riktigere enn en gjetning. Ellers gjettes den fra navnet.
 * Poenget er at ingen skal måtte åpne en nedtrekksliste for å legge melk i
 * handlelista.
 */
export function categoryForName(name: string, known: readonly ShoppingItem[]): Category {
  const key = normalizeName(name);
  const seen = known.find((item) => item.normalized_name === key);
  return seen?.category ?? guessCategory(name);
}
