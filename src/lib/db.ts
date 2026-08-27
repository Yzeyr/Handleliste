import { getClient } from './supabase.ts';
import { loadConfig } from './config.ts';
import { itemsFromMeals, mergeQuantities, planListChange, type PendingItem } from './merge.ts';
import { normalizeName } from './normalize.ts';
import { normalizeUnit } from './units.ts';
import type { Category, Meal, MealIngredient, Quantity, ShoppingItem, WeekPlanItem } from './types.ts';

const LIST = 'shopping_list_items';

/** Om appen har det den trenger for å snakke med databasen. */
export function isConfigured(): boolean {
  return loadConfig() !== null;
}

/** Klienten hentes per kall, så nye nøkler tas i bruk uten omlasting. */
const sb = getClient;

function fail(context: string, error: { message: string } | null): void {
  if (error !== null) throw new Error(`${context}: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Lesing
// ---------------------------------------------------------------------------

export async function fetchMeals(): Promise<Meal[]> {
  const { data, error } = await sb()
    .from('meals')
    .select(
      'id,name,emoji,description,servings,steps,tags,' +
        'ingredients:meal_ingredients(id,meal_id,name,normalized_name,amount,unit,category,sort_order)',
    )
    .order('name');
  fail('Klarte ikke å hente middager', error);

  return (data ?? []).map((row: unknown) => ({
    ...(row as unknown as Meal),
    // Sorteres i klienten framfor i spørringen, så vi ikke er avhengige av
    // hvordan nøstet order() staves i den til enhver tid gjeldende klienten.
    ingredients: [...((row as unknown as Meal).ingredients ?? [])].sort(
      (a: MealIngredient, b: MealIngredient) => a.sort_order - b.sort_order,
    ),
  }));
}

export async function fetchList(): Promise<ShoppingItem[]> {
  const { data, error } = await sb().from(LIST).select('*').order('created_at');
  fail('Klarte ikke å hente handlelista', error);
  return (data ?? []) as ShoppingItem[];
}

export async function fetchWeekPlan(): Promise<WeekPlanItem[]> {
  const { data, error } = await sb().from('week_plan_items').select('id,meal_id,added_to_list');
  fail('Klarte ikke å hente ukemenyen', error);
  return (data ?? []) as WeekPlanItem[];
}

// ---------------------------------------------------------------------------
// Skriving til handlelista
// ---------------------------------------------------------------------------

function insertPayload(pending: PendingItem): Record<string, unknown> {
  return {
    name: pending.name,
    normalized_name: pending.normalizedName,
    quantities: pending.quantities,
    category: pending.category,
    source_meals: pending.sourceMeals,
  };
}

/**
 * Skriver et sett ferdig sammenslåtte linjer til lista.
 *
 * En linje som allerede finnes blir oppdatert, aldri duplisert. Den blir også
 * huket av igjen: trenger dere mer av noe dere alt har krysset ut, må det
 * synes at det står igjen å handle.
 */
async function applyPending(pending: readonly PendingItem[]): Promise<void> {
  if (pending.length === 0) return;

  const current = await fetchList();
  const { updates, inserts } = planListChange(current, pending);

  for (const update of updates) {
    const { error } = await sb()
      .from(LIST)
      .update({
        quantities: update.quantities,
        source_meals: update.sourceMeals,
        checked: false,
      })
      .eq('id', update.item.id);
    fail(`Klarte ikke å oppdatere ${update.item.name}`, error);
  }

  if (inserts.length > 0) {
    const { error } = await sb().from(LIST).insert(inserts.map(insertPayload));
    // 23505 = brudd på den unike indeksen: noen andre la inn samme vare i
    // mellomtiden. Da er svaret å lese på nytt og slå sammen mot deres rad.
    if (error !== null && error.code === '23505') {
      const retry = planListChange(await fetchList(), inserts);
      for (const update of retry.updates) {
        const { error: retryError } = await sb()
          .from(LIST)
          .update({ quantities: update.quantities, source_meals: update.sourceMeals, checked: false })
          .eq('id', update.item.id);
        fail(`Klarte ikke å oppdatere ${update.item.name}`, retryError);
      }
      if (retry.inserts.length > 0) {
        const { error: insertError } = await sb().from(LIST).insert(retry.inserts.map(insertPayload));
        fail('Klarte ikke å legge til varer', insertError);
      }
      return;
    }
    fail('Klarte ikke å legge til varer', error);
  }
}

export async function addMealsToList(meals: readonly Meal[]): Promise<PendingItem[]> {
  const pending = itemsFromMeals(meals);
  await applyPending(pending);
  return pending;
}

export async function addManualItem(input: {
  name: string;
  amount: number | null;
  unit: string;
  category: Category;
}): Promise<void> {
  const name = input.name.trim();
  if (name === '') return;
  const quantities: Quantity[] =
    input.amount === null ? [] : mergeQuantities([{ amount: input.amount, unit: normalizeUnit(input.unit) }]);

  await applyPending([
    {
      normalizedName: normalizeName(name),
      name,
      quantities,
      category: input.category,
      sourceMeals: [],
    },
  ]);
}

export async function setChecked(id: string, checked: boolean): Promise<void> {
  const { error } = await sb().from(LIST).update({ checked }).eq('id', id);
  fail('Klarte ikke å hake av varen', error);
}

export async function removeItem(id: string): Promise<void> {
  const { error } = await sb().from(LIST).delete().eq('id', id);
  fail('Klarte ikke å fjerne varen', error);
}

export async function removeCheckedItems(): Promise<void> {
  const { error } = await sb().from(LIST).delete().eq('checked', true);
  fail('Klarte ikke å fjerne avhukede varer', error);
}

export async function clearList(): Promise<void> {
  const { error } = await sb().from(LIST).delete().not('id', 'is', null);
  fail('Klarte ikke å tømme lista', error);
}

// ---------------------------------------------------------------------------
// Ukemeny
// ---------------------------------------------------------------------------

export async function addMealToWeek(mealId: string): Promise<void> {
  const { error } = await sb().from('week_plan_items').insert({ meal_id: mealId });
  if (error !== null && error.code === '23505') return; // alt i menyen
  fail('Klarte ikke å legge middagen i ukemenyen', error);
}

export async function removeMealFromWeek(mealId: string): Promise<void> {
  const { error } = await sb().from('week_plan_items').delete().eq('meal_id', mealId);
  fail('Klarte ikke å fjerne middagen fra ukemenyen', error);
}

export async function markWeekMealsAdded(mealIds: readonly string[]): Promise<void> {
  if (mealIds.length === 0) return;
  const { error } = await sb()
    .from('week_plan_items')
    .update({ added_to_list: true })
    .in('meal_id', [...mealIds]);
  fail('Klarte ikke å oppdatere ukemenyen', error);
}

export async function clearWeek(): Promise<void> {
  const { error } = await sb().from('week_plan_items').delete().not('id', 'is', null);
  fail('Klarte ikke å tømme ukemenyen', error);
}

// ---------------------------------------------------------------------------
// Realtime
// ---------------------------------------------------------------------------

/**
 * Varsler ved enhver endring på lista eller ukemenyen. Vi sender ikke selve
 * raden videre — kalleren henter alt på nytt. Lista er liten, og "hent på
 * nytt" er umulig å få ut av synk, i motsetning til å flette inn deltaer.
 */
export function subscribeToChanges(onChange: () => void): () => void {
  const channel = sb()
    .channel('handleliste-endringer')
    .on('postgres_changes', { event: '*', schema: 'public', table: LIST }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'week_plan_items' }, onChange)
    .subscribe();

  return () => {
    void sb().removeChannel(channel);
  };
}
