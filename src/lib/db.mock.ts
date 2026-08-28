/**
 * Demo-utgave av db.ts som holder alt i minnet.
 *
 * Brukes av `npm run dev:mock`, så appen kan prøves før Supabase er satt opp
 * — og så UI-et kan testes uten nettverk. Samme signaturer som db.ts, og den
 * bruker de samme merge-funksjonene, så oppførselen er ekte selv om lagringen
 * ikke er det. Utvalget av middager er en liten smakebit; de ekte 19 ligger i
 * supabase/02_seed_meals.sql.
 */
import { itemsFromMeals, mergeQuantities, planListChange, type PendingItem } from './merge.ts';
import { normalizeName } from './normalize.ts';
import { normalizeUnit } from './units.ts';
import { deviceName } from './config.ts';
import type { Category, Meal, MealIngredient, Quantity, ShoppingItem, WeekPlanItem } from './types.ts';
import type { ChangeEvent } from './changes.ts';

export function isConfigured(): boolean {
  return true;
}

let nextId = 0;
const id = (): string => `mock-${(nextId += 1)}`;

function ing(
  meal: string,
  name: string,
  amount: number | null,
  unit: string | null,
  category: Category,
  sort: number,
): MealIngredient {
  return {
    id: id(),
    meal_id: meal,
    name,
    normalized_name: normalizeName(name),
    amount,
    unit,
    category,
    sort_order: sort,
  };
}

const MEALS: Meal[] = [
  {
    id: 'taco',
    name: 'Taco',
    emoji: '🌮',
    description: 'Fredagstaco med kjøttdeig og alt tilbehøret.',
    servings: 4,
    tags: ['fredag', 'rask'],
    steps: ['Stek kjøttdeigen løs.', 'Ha i krydder og vann, la småkoke.', 'Skjær opp grønnsakene.'],
    ingredients: [
      ing('taco', 'Kjøttdeig', 400, 'g', 'kjøtt', 0),
      ing('taco', 'Tacokrydder', 1, 'pk', 'tørrvarer', 1),
      ing('taco', 'Mais', 1, 'boks', 'tørrvarer', 2),
      ing('taco', 'Revet ost', 150, 'g', 'meieri', 3),
      ing('taco', 'Rømme', 3, 'dl', 'meieri', 4),
      ing('taco', 'Tomat', 2, 'stk', 'grønt', 5),
    ],
  },
  {
    id: 'fiskegrateng',
    name: 'Fiskegrateng',
    emoji: '🥘',
    description: 'Gammeldags fiskegrateng med makaroni.',
    servings: 4,
    tags: ['klassiker', 'ovn'],
    steps: ['Kok makaronien.', 'Lag hvit saus av smør, mel og helmelk.', '35 min på 200 grader.'],
    ingredients: [
      ing('fiskegrateng', 'Seifilet', 500, 'g', 'fisk', 0),
      ing('fiskegrateng', 'Makaroni', 200, 'g', 'tørrvarer', 1),
      ing('fiskegrateng', 'Helmelk', 5, 'dl', 'meieri', 2),
      ing('fiskegrateng', 'Smør', 40, 'g', 'meieri', 3),
      ing('fiskegrateng', 'Revet ost', 100, 'g', 'meieri', 4),
    ],
  },
  {
    id: 'lasagne',
    name: 'Lasagne',
    emoji: '🍲',
    description: 'Kjøttsaus, hvit saus og plater i lag.',
    servings: 4,
    tags: ['ovn', 'familie'],
    steps: ['Lag kjøttsaus.', 'Lag hvit saus.', 'Legg lagvis, 45 min på 200 grader.'],
    ingredients: [
      ing('lasagne', 'Kjøttdeig', 400, 'g', 'kjøtt', 0),
      ing('lasagne', 'Lasagneplater', 1, 'pk', 'tørrvarer', 1),
      ing('lasagne', 'Helmelk', 5, 'dl', 'meieri', 2),
      ing('lasagne', 'Revet ost', 200, 'g', 'meieri', 3),
      ing('lasagne', 'Løk', 1, 'stk', 'grønt', 4),
    ],
  },
  {
    id: 'kjottkaker',
    name: 'Kjøttkaker i brun saus',
    emoji: '🍽️',
    description: 'Kjøttkaker med ertestuing og poteter.',
    servings: 4,
    tags: ['klassiker'],
    steps: ['Elt deigen.', 'Stek kakene gyllne.', 'La dem trekke i sausen.'],
    ingredients: [
      ing('kjottkaker', 'Kjøttdeig', 500, 'g', 'kjøtt', 0),
      ing('kjottkaker', 'Potetmel', 2, 'ss', 'tørrvarer', 1),
      ing('kjottkaker', 'H-melk', 1, 'dl', 'meieri', 2),
      ing('kjottkaker', 'Potet', 800, 'g', 'grønt', 3),
      ing('kjottkaker', 'Salt', null, null, 'tørrvarer', 4),
    ],
  },
  {
    id: 'ovnsbakt-laks',
    name: 'Ovnsbakt laks',
    emoji: '🐟',
    description: 'Laks i ovn med poteter og brokkoli.',
    servings: 4,
    tags: ['sunt', 'ovn'],
    steps: ['180 grader.', 'Laks med smør og sitron, 20-25 min.', 'Kok poteter, damp brokkoli.'],
    ingredients: [
      ing('ovnsbakt-laks', 'Laksefilet', 500, 'g', 'fisk', 0),
      ing('ovnsbakt-laks', 'Potet', 800, 'g', 'grønt', 1),
      ing('ovnsbakt-laks', 'Brokkoli', 1, 'stk', 'grønt', 2),
      ing('ovnsbakt-laks', 'Smør', 50, 'g', 'meieri', 3),
    ],
  },
  {
    id: 'pasta-carbonara',
    name: 'Pasta carbonara',
    emoji: '🥓',
    description: 'Ekte carbonara med egg og bacon.',
    servings: 3,
    tags: ['rask'],
    steps: ['Kok spaghettien.', 'Stek bacon sprøtt.', 'Bland utenfor varmen.'],
    ingredients: [
      ing('pasta-carbonara', 'Spaghetti', 300, 'g', 'tørrvarer', 0),
      ing('pasta-carbonara', 'Bacon', 200, 'g', 'kjøtt', 1),
      ing('pasta-carbonara', 'Egg', 3, 'stk', 'meieri', 2),
      ing('pasta-carbonara', 'Parmesan', 100, 'g', 'meieri', 3),
    ],
  },
];

let items: ShoppingItem[] = [];
let week: WeekPlanItem[] = [];
const listeners = new Set<(event: ChangeEvent | null) => void>();

function notify(event: ChangeEvent | null = null): void {
  for (const listener of listeners) listener(event);
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export async function fetchMeals(): Promise<Meal[]> {
  return clone(MEALS);
}

export async function fetchList(): Promise<ShoppingItem[]> {
  return clone(items.filter((item) => !item.archived));
}

export async function fetchRegister(): Promise<ShoppingItem[]> {
  return clone(
    items
      .filter((item) => item.archived)
      .sort((a, b) => b.use_count - a.use_count || b.last_used_at.localeCompare(a.last_used_at)),
  );
}

export async function fetchWeekPlan(): Promise<WeekPlanItem[]> {
  return clone(week);
}

function applyPending(pending: readonly PendingItem[]): void {
  const { updates, inserts } = planListChange(items, pending);
  for (const update of updates) {
    update.item.quantities = update.quantities;
    update.item.source_meals = update.sourceMeals;
    update.item.checked = false;
    if (update.item.archived) update.item.use_count += 1;
    update.item.archived = false;
    update.item.last_used_at = new Date().toISOString();
    update.item.updated_by = deviceName();
  }
  const now = new Date().toISOString();
  for (const insert of inserts) {
    items.push({
      id: id(),
      name: insert.name,
      normalized_name: insert.normalizedName,
      quantities: insert.quantities,
      category: insert.category,
      checked: false,
      archived: false,
      use_count: 1,
      last_used_at: now,
      updated_by: deviceName(),
      source_meals: insert.sourceMeals,
      note: null,
      created_at: now,
      updated_at: now,
    });
  }
  notify();
}

export async function addMealsToList(meals: readonly Meal[]): Promise<PendingItem[]> {
  const pending = itemsFromMeals(meals);
  applyPending(pending);
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
  applyPending([
    { normalizedName: normalizeName(name), name, quantities, category: input.category, sourceMeals: [] },
  ]);
}

export async function setChecked(itemId: string, checked: boolean): Promise<void> {
  const found = items.find((item) => item.id === itemId);
  if (found !== undefined) found.checked = checked;
  notify();
}

function archive(item: ShoppingItem): void {
  item.archived = true;
  item.checked = false;
  item.source_meals = [];
  item.last_used_at = new Date().toISOString();
  item.updated_by = deviceName();
}

export async function removeItem(itemId: string): Promise<void> {
  const found = items.find((item) => item.id === itemId);
  if (found !== undefined) archive(found);
  notify();
}

export async function removeCheckedItems(): Promise<void> {
  for (const item of items) if (item.checked) archive(item);
  notify();
}

export async function clearList(): Promise<void> {
  for (const item of items) if (!item.archived) archive(item);
  notify();
}

export async function addFromRegister(item: ShoppingItem, quantities: Quantity[]): Promise<void> {
  const found = items.find((row) => row.id === item.id);
  if (found !== undefined) {
    found.archived = false;
    found.checked = false;
    found.quantities = quantities;
    found.source_meals = [];
    found.use_count += 1;
    found.last_used_at = new Date().toISOString();
  }
  notify();
}

export async function forgetItem(itemId: string): Promise<void> {
  items = items.filter((item) => item.id !== itemId);
  notify();
}

export async function addMealToWeek(mealId: string): Promise<void> {
  if (week.some((entry) => entry.meal_id === mealId)) return;
  week.push({ id: id(), meal_id: mealId, added_to_list: false });
  notify();
}

export async function removeMealFromWeek(mealId: string): Promise<void> {
  week = week.filter((entry) => entry.meal_id !== mealId);
  notify();
}

export async function markWeekMealsAdded(mealIds: readonly string[]): Promise<void> {
  for (const entry of week) {
    if (mealIds.includes(entry.meal_id)) entry.added_to_list = true;
  }
  notify();
}

export async function clearWeek(): Promise<void> {
  week = [];
  notify();
}

export function subscribeToChanges(onChange: (event: ChangeEvent | null) => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/**
 * Testkrok: lar en test opptre som den andre telefonen, som er den eneste
 * måten å utløse et varsel på når alt kjører i én nettleser. Finnes bare i
 * denne mock-utgaven, som aldri er med i produksjonsbygget.
 */
(window as unknown as Record<string, unknown>).__somDenAndre = (
  hvem: string,
  varenavn: string,
): void => {
  const now = new Date().toISOString();
  const item: ShoppingItem = {
    id: id(),
    name: varenavn,
    normalized_name: normalizeName(varenavn),
    quantities: [{ amount: 1, unit: 'stk' }],
    category: 'annet',
    checked: false,
    archived: false,
    use_count: 1,
    last_used_at: now,
    updated_by: hvem,
    source_meals: [],
    note: null,
    created_at: now,
    updated_at: now,
  };
  items.push(item);
  notify({ type: 'INSERT', next: item, previous: null });
};
