import type { Category, Meal, Quantity, ShoppingItem } from './types.ts';
import { normalizeName } from './normalize.ts';
import { dimensionKey, displayUnit, normalizeUnit, toBase, unitDefinition } from './units.ts';

/**
 * Slår sammen mengder til så få linjer som mulig.
 *
 * Alt som er i samme dimensjon summeres til én mengde. Det som ikke lar seg
 * regne sammen blir liggende som egne elementer i samme array — altså på
 * samme handlelinje, vist som "3 dl + 2 boks". Rekkefølgen følger første
 * gang en dimensjon dukket opp, så eksisterende linjer ikke stokker om seg
 * når det legges til noe nytt.
 */
export function mergeQuantities(...groups: readonly (readonly Quantity[])[]): Quantity[] {
  const buckets = new Map<string, { base: number; unit: string; sameUnit: string | null }>();

  for (const group of groups) {
    for (const raw of group) {
      if (!Number.isFinite(raw.amount) || raw.amount === 0) continue;
      const unit = normalizeUnit(raw.unit);
      const key = dimensionKey(unit);
      const existing = buckets.get(key);
      if (existing === undefined) {
        buckets.set(key, { base: toBase(raw.amount, unit), unit, sameUnit: unit });
      } else {
        existing.base += toBase(raw.amount, unit);
        // Så snart to ulike enheter møtes faller vi tilbake på stigen.
        if (existing.sameUnit !== unit) existing.sameUnit = null;
      }
    }
  }

  const out: Quantity[] = [];
  for (const bucket of buckets.values()) {
    const def = unitDefinition(bucket.unit);
    if (def === null) {
      // Ukjent enhet: ingen omregning, tallet er allerede summert direkte.
      out.push({ amount: round(bucket.base), unit: bucket.unit });
      continue;
    }
    const unit = displayUnit(bucket.base, def.dimension, bucket.sameUnit);
    const factor = unitDefinition(unit)?.toBase ?? 1;
    out.push({ amount: round(bucket.base / factor), unit });
  }
  return out;
}

function round(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

/** Én ferdig sammenslått linje, før den møter databasen. */
export interface PendingItem {
  normalizedName: string;
  name: string;
  quantities: Quantity[];
  category: Category;
  sourceMeals: string[];
}

/**
 * Regner ut hvilke linjer et sett middager gir. Middager som deler en
 * ingrediens ender som én linje med summert mengde.
 *
 * Ingredienser uten mengde ("etter smak") tas med som linje uten mengde, og
 * hindrer ikke at de andre bidragene til samme vare summeres.
 */
/**
 * Slår sammen linjer som viser til samme vare, før de i det hele tatt møter
 * lista. Tre middager med melk skal være én linje allerede her, og det samme
 * gjelder en innlimt liste som nevner løk to ganger.
 */
export function mergePending(items: readonly PendingItem[]): PendingItem[] {
  const byName = new Map<string, PendingItem>();

  for (const item of items) {
    const existing = byName.get(item.normalizedName);
    if (existing === undefined) {
      byName.set(item.normalizedName, {
        ...item,
        quantities: [...item.quantities],
        sourceMeals: [...item.sourceMeals],
      });
      continue;
    }
    existing.quantities = mergeQuantities(existing.quantities, item.quantities);
    for (const meal of item.sourceMeals) {
      if (!existing.sourceMeals.includes(meal)) existing.sourceMeals.push(meal);
    }
  }

  return [...byName.values()];
}

export function itemsFromMeals(meals: readonly Meal[]): PendingItem[] {
  return mergePending(
    meals.flatMap((meal) =>
      meal.ingredients.map((ingredient) => ({
        normalizedName: normalizeName(ingredient.name),
        name: ingredient.name,
        quantities:
          ingredient.amount === null
            ? []
            : [{ amount: ingredient.amount, unit: normalizeUnit(ingredient.unit) }],
        category: ingredient.category,
        sourceMeals: [meal.name],
      })),
    ),
  );
}

/** Resultatet av å møte en ny linje med det som allerede står på lista. */
export interface ListChange {
  updates: { item: ShoppingItem; quantities: Quantity[]; sourceMeals: string[] }[];
  inserts: PendingItem[];
}

/**
 * Fletter nye linjer inn i den eksisterende lista. Treff på normalized_name
 * blir en oppdatering av den raden — aldri en ny rad. Det er dette som gjør
 * at "helmelk" står én gang uansett hvor mange middager som trenger den.
 */
export function planListChange(
  current: readonly ShoppingItem[],
  incoming: readonly PendingItem[],
): ListChange {
  const byName = new Map<string, ShoppingItem>();
  for (const item of current) byName.set(item.normalized_name, item);

  const updates: ListChange['updates'] = [];
  const inserts: PendingItem[] = [];

  for (const pending of incoming) {
    const existing = byName.get(pending.normalizedName);
    if (existing === undefined) {
      inserts.push(pending);
      continue;
    }

    // En arkivert rad står ikke på lista. Mengden den bærer er et minne om
    // sist den ble kjøpt — den skal foreslås i vareregisteret, ikke legges
    // sammen med det som kommer nå. Ellers ville "1 l melk forrige uke" blitt
    // med i denne ukas mengde.
    const base = existing.archived
      ? { quantities: [], sourceMeals: [] as string[] }
      : { quantities: existing.quantities, sourceMeals: [...existing.source_meals] };

    const sourceMeals = base.sourceMeals;
    for (const meal of pending.sourceMeals) {
      if (!sourceMeals.includes(meal)) sourceMeals.push(meal);
    }
    updates.push({
      item: existing,
      quantities: mergeQuantities(base.quantities, pending.quantities),
      sourceMeals,
    });
  }

  return { updates, inserts };
}
