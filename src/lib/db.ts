import { getClient } from './supabase.ts';
import { deviceName, loadConfig } from './config.ts';
import type { ChangeEvent } from './changes.ts';
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
  const { data, error } = await sb().from(LIST).select('*').eq('archived', false).order('created_at');
  fail('Klarte ikke å hente handlelista', error);
  return (data ?? []) as ShoppingItem[];
}

/**
 * Vareregisteret: varer som har vært på lista før, mest brukte først. Det er
 * de samme radene som lista — de er bare arkivert i stedet for slettet.
 */
export async function fetchRegister(): Promise<ShoppingItem[]> {
  const { data, error } = await sb()
    .from(LIST)
    .select('*')
    .eq('archived', true)
    .order('use_count', { ascending: false })
    .order('last_used_at', { ascending: false })
    .limit(200);
  fail('Klarte ikke å hente vareregisteret', error);
  return (data ?? []) as ShoppingItem[];
}

/** Alt, arkivert eller ikke — sammenslåing må se de arkiverte radene også. */
async function fetchAllItems(): Promise<ShoppingItem[]> {
  const { data, error } = await sb().from(LIST).select('*');
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

/**
 * Feltene en eksisterende rad får når den legges på lista igjen. En arkivert
 * rad hentes fram og teller én gang til; en rad som allerede står på lista
 * teller ikke på nytt, den får bare mer mengde.
 */
function revivePayload(
  item: ShoppingItem,
  quantities: PendingItem['quantities'],
  sourceMeals: string[],
): Record<string, unknown> {
  return {
    quantities,
    source_meals: sourceMeals,
    checked: false,
    archived: false,
    use_count: item.archived ? item.use_count + 1 : item.use_count,
    last_used_at: new Date().toISOString(),
    updated_by: deviceName(),
  };
}

function insertPayload(pending: PendingItem): Record<string, unknown> {
  return {
    name: pending.name,
    normalized_name: pending.normalizedName,
    quantities: pending.quantities,
    category: pending.category,
    source_meals: pending.sourceMeals,
    updated_by: deviceName(),
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

  // Arkiverte rader må være med: den unike indeksen gjør at en ny "helmelk"
  // ikke kan settes inn ved siden av en arkivert "helmelk" — den skal vekkes
  // til live igjen.
  const current = await fetchAllItems();
  const { updates, inserts } = planListChange(current, pending);

  for (const update of updates) {
    const { error } = await sb()
      .from(LIST)
      .update(revivePayload(update.item, update.quantities, update.sourceMeals))
      .eq('id', update.item.id);
    fail(`Klarte ikke å oppdatere ${update.item.name}`, error);
  }

  if (inserts.length > 0) {
    const { error } = await sb().from(LIST).insert(inserts.map(insertPayload));
    // 23505 = brudd på den unike indeksen: noen andre la inn samme vare i
    // mellomtiden. Da er svaret å lese på nytt og slå sammen mot deres rad.
    if (error !== null && error.code === '23505') {
      const retry = planListChange(await fetchAllItems(), inserts);
      for (const update of retry.updates) {
        const { error: retryError } = await sb()
          .from(LIST)
          .update(revivePayload(update.item, update.quantities, update.sourceMeals))
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
  const { error } = await sb().from(LIST).update({ checked, updated_by: deviceName() }).eq('id', id);
  fail('Klarte ikke å hake av varen', error);
}

/**
 * Å fjerne en vare arkiverer den i stedet for å slette den, så den blir
 * liggende i vareregisteret. Mengden blir stående som et minne om sist —
 * registeret foreslår den neste gang. Den regnes ikke med i noen sum; se
 * planListChange, som ser bort fra mengden på arkiverte rader.
 * Middagsopphavet slippes, for det gjaldt den gangen.
 */
function archivePatch(): Record<string, unknown> {
  return {
    archived: true,
    checked: false,
    source_meals: [],
    last_used_at: new Date().toISOString(),
    updated_by: deviceName(),
  };
}

export async function removeItem(id: string): Promise<void> {
  const { error } = await sb().from(LIST).update(archivePatch()).eq('id', id);
  fail('Klarte ikke å fjerne varen', error);
}

export async function removeCheckedItems(): Promise<void> {
  const { error } = await sb()
    .from(LIST)
    .update(archivePatch())
    .eq('checked', true)
    .eq('archived', false);
  fail('Klarte ikke å fjerne avhukede varer', error);
}

export async function clearList(): Promise<void> {
  const { error } = await sb().from(LIST).update(archivePatch()).eq('archived', false);
  fail('Klarte ikke å tømme lista', error);
}

/** Legger en vare fra registeret på lista, med den mengden som ble valgt. */
export async function addFromRegister(item: ShoppingItem, quantities: Quantity[]): Promise<void> {
  const { error } = await sb()
    .from(LIST)
    .update(revivePayload(item, quantities, []))
    .eq('id', item.id);
  fail(`Klarte ikke å legge til ${item.name}`, error);
}

/** Sletter en vare for godt. Det eneste stedet noe faktisk fjernes. */
export async function forgetItem(id: string): Promise<void> {
  const { error } = await sb().from(LIST).delete().eq('id', id);
  fail('Klarte ikke å slette varen', error);
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
 * Varsler ved enhver endring på lista eller ukemenyen.
 *
 * Kalleren henter fortsatt alt på nytt — lista er liten, og "hent på nytt" er
 * umulig å få ut av synk, i motsetning til å flette inn deltaer. Men raden
 * sendes med, slik at appen kan si HVA som skjedde og hvem som gjorde det.
 */
export function subscribeToChanges(onChange: (event: ChangeEvent | null) => void): () => void {
  const channel = sb()
    .channel('handleliste-endringer')
    .on('postgres_changes', { event: '*', schema: 'public', table: LIST }, (payload) => {
      onChange({
        type: payload.eventType as ChangeEvent['type'],
        next: isRow(payload.new) ? payload.new : null,
        previous: isRow(payload.old) ? payload.old : null,
      });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'week_plan_items' }, () => {
      onChange(null);
    })
    .subscribe();

  return () => {
    void sb().removeChannel(channel);
  };
}

/** Supabase sender {} for `old` når det ikke finnes noe å sende. */
function isRow(value: unknown): value is Partial<ShoppingItem> {
  return typeof value === 'object' && value !== null && Object.keys(value).length > 0;
}
