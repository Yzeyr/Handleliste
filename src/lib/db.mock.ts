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
import { deviceId, deviceName, loadConfig, saveConfig } from './config.ts';
import type { PushTarget } from './push.ts';
import type { Category, Meal, MealDraft, MealIngredient, Quantity, ShoppingItem, WeekPlanItem } from './types.ts';
import type { ChangeEvent } from './changes.ts';

/**
 * Demo-utgaven fyller inn dummy-nøkler ved oppstart, så `npm run dev:mock`
 * åpner en app som virker. `?oppsett=1` slår det av, for da er det nettopp
 * oppsettsskjermen som skal prøves.
 */
if (!new URLSearchParams(window.location.search).has('oppsett') && loadConfig() === null) {
  saveConfig({ url: 'https://demo.supabase.co', anonKey: 'demo-nokkel' });
}

/**
 * Speiler db.ts. Uten dette lot mock-laget appen fortsette uten oppsett i det
 * hele tatt, og skjulte nettopp den feilen delingslenka kan gi.
 */
export function isConfigured(): boolean {
  return loadConfig() !== null;
}

/**
 * Uten nett skal mock-laget oppføre seg som et nettverk som er borte, ikke
 * som en database i lomma. Ellers ville offline-laget aldri blitt prøvd.
 */
function krevNett(): void {
  if (!navigator.onLine) throw new Error('Failed to fetch');
  pullServer();
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

let MEALS: Meal[] = [
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

/**
 * «Serveren» lagres i localStorage under sin egen nøkkel, ikke bare i minnet.
 *
 * To grunner: npm run dev:mock mister ellers alt ved hver omlasting, og —
 * viktigere — en test kan nå tømme appens egne nøkler for å simulere en fersk
 * telefon mens «databasen» står igjen. Uten det er delingslenka og første
 * henting umulig å teste.
 */
const SERVER_KEY = 'handleliste.mockserver';

interface ServerState {
  items: ShoppingItem[];
  week: WeekPlanItem[];
  meals: Meal[] | null;
  aliases: { alias: string; canonical: string }[];
  pushTargets: PushTarget[];
}

function readServer(): ServerState | null {
  try {
    const raw = window.localStorage.getItem(SERVER_KEY);
    return raw === null ? null : (JSON.parse(raw) as ServerState);
  } catch {
    return null;
  }
}

function writeServer(): void {
  try {
    window.localStorage.setItem(
      SERVER_KEY,
      JSON.stringify({ items, week, meals: MEALS, aliases, pushTargets }),
    );
  } catch {
    /* full lagring: da oppfører den seg som før, bare i minnet */
  }
}

let items: ShoppingItem[] = [];
let week: WeekPlanItem[] = [];
let aliases: { alias: string; canonical: string }[] = [];
let pushTargets: PushTarget[] = [];
const listeners = new Set<(event: ChangeEvent | null) => void>();

function notify(event: ChangeEvent | null = null): void {
  writeServer();
  for (const listener of listeners) listener(event);
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/**
 * To faner er to telefoner. Uten dette leser hver fane bare kopien den lastet
 * ved oppstart, og en test av «kom endringen fram til den andre?» kan aldri
 * feile — som er nettopp den klassen feil mock-laget har skjult før.
 */
function pullServer(): void {
  const stored = readServer();
  if (stored === null) return;
  items = stored.items ?? [];
  week = stored.week ?? [];
  if (stored.meals !== null && stored.meals !== undefined) MEALS = stored.meals;
  aliases = stored.aliases ?? [];
  pushTargets = stored.pushTargets ?? [];
}

pullServer();

export async function fetchMeals(): Promise<Meal[]> {
  krevNett();
  return clone(MEALS);
}

export async function fetchList(): Promise<ShoppingItem[]> {
  krevNett();
  return clone(items.filter((item) => !item.archived));
}

export async function fetchRegister(): Promise<ShoppingItem[]> {
  krevNett();
  return clone(
    items
      .filter((item) => item.archived)
      .sort((a, b) => b.use_count - a.use_count || b.last_used_at.localeCompare(a.last_used_at)),
  );
}

export async function fetchWeekPlan(): Promise<WeekPlanItem[]> {
  krevNett();
  return clone(week);
}

function applyPending(pending: readonly PendingItem[]): void {
  // Samme sammenlign-og-bytt-løkke som db.ts, så en test kan bumpe versjonen
  // under føttene på oss og se at runden går om igjen i stedet for å skrive
  // over det som skjedde i mellomtiden.
  let remaining = [...pending];

  for (let attempt = 0; attempt < 4 && remaining.length > 0; attempt += 1) {
    const byName = new Map(remaining.map((item) => [item.normalizedName, item]));
    const { updates, inserts } = planListChange(clone(items), remaining);
    const retry: PendingItem[] = [];

    for (const update of updates) {
      const live = items.find((row) => row.id === update.item.id);
      if (live === undefined || live.version !== update.item.version) {
        const missed = byName.get(update.item.normalized_name);
        if (missed !== undefined) retry.push(missed);
        continue;
      }
      live.quantities = update.quantities;
      live.source_meals = update.sourceMeals;
      if (update.sourceMeals.length === 0) live.manual = true;
      live.checked = false;
      if (live.archived) live.use_count += 1;
      live.archived = false;
      live.last_used_at = new Date().toISOString();
      live.updated_by = deviceName();
      live.version += 1;
    }

    const now = new Date().toISOString();
    for (const insert of inserts) {
      if (items.some((row) => row.normalized_name === insert.normalizedName)) {
        retry.push(insert);
        continue;
      }
      items.push({
        id: id(),
        name: insert.name,
        normalized_name: insert.normalizedName,
        quantities: insert.quantities,
        category: insert.category,
        checked: false,
        archived: false,
        use_count: 1,
        manual: insert.sourceMeals.length === 0,
        pinned: false,
        last_used_at: now,
        updated_by: deviceName(),
        version: 0,
        source_meals: insert.sourceMeals,
        note: null,
        created_at: now,
        updated_at: now,
      });
    }

    remaining = retry;
  }

  if (remaining.length > 0) {
    throw new Error('Lista endret seg raskere enn vi rakk å skrive. Prøv en gang til.');
  }
  notify();
}

export async function addMealsToList(meals: readonly Meal[]): Promise<PendingItem[]> {
  krevNett();
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
  krevNett();
  const name = input.name.trim();
  if (name === '') return;
  const quantities: Quantity[] =
    input.amount === null ? [] : mergeQuantities([{ amount: input.amount, unit: normalizeUnit(input.unit) }]);
  applyPending([
    { normalizedName: normalizeName(name), name, quantities, category: input.category, sourceMeals: [] },
  ]);
}

export async function setChecked(itemId: string, checked: boolean): Promise<void> {
  krevNett();
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
  item.version += 1;
}

export async function removeItem(itemId: string): Promise<void> {
  krevNett();
  const found = items.find((item) => item.id === itemId);
  if (found !== undefined) archive(found);
  notify();
}

export async function removeCheckedItems(): Promise<void> {
  krevNett();
  for (const item of items) if (item.checked) archive(item);
  notify();
}

export async function clearList(): Promise<void> {
  krevNett();
  for (const item of items) if (!item.archived) archive(item);
  notify();
}

export async function addFromRegister(item: ShoppingItem, quantities: Quantity[]): Promise<void> {
  krevNett();
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
  krevNett();
  items = items.filter((item) => item.id !== itemId);
  notify();
}

export async function addMealToWeek(mealId: string, entryId?: string): Promise<void> {
  krevNett();
  if (week.some((entry) => entry.meal_id === mealId)) return;
  week.push({ id: entryId ?? id(), meal_id: mealId, added_to_list: false });
  notify();
}

export async function removeMealFromWeek(mealId: string): Promise<void> {
  krevNett();
  week = week.filter((entry) => entry.meal_id !== mealId);
  notify();
}

export async function markWeekMealsAdded(mealIds: readonly string[]): Promise<void> {
  krevNett();
  for (const entry of week) {
    if (mealIds.includes(entry.meal_id)) entry.added_to_list = true;
  }
  notify();
}

export async function clearWeek(): Promise<void> {
  krevNett();
  week = [];
  notify();
}

export async function restoreWeek(entries: readonly WeekPlanItem[]): Promise<void> {
  krevNett();
  week = entries.map((entry) => ({ ...entry }));
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
    manual: true,
    pinned: false,
    last_used_at: now,
    updated_by: hvem,
    version: 0,
    source_meals: [],
    note: null,
    created_at: now,
    updated_at: now,
  };
  items.push(item);
  notify({ type: 'INSERT', next: item, previous: null });
};

// ---------------------------------------------------------------------------
// Redigering, angre, synonymer og egne middager — samme signaturer som db.ts
// ---------------------------------------------------------------------------

export async function updateItem(
  item: ShoppingItem,
  patch: { name: string; category: Category; quantities: Quantity[] },
): Promise<void> {
  krevNett();
  const name = patch.name.trim();
  if (name === '') throw new Error('Varen må ha et navn');
  const key = normalizeName(name);
  if (items.some((row) => row.id !== item.id && row.normalized_name === key)) {
    throw new Error(`«${name}» finnes allerede — gi den et annet navn`);
  }
  const found = items.find((row) => row.id === item.id);
  if (found !== undefined) {
    found.name = name;
    found.normalized_name = key;
    found.category = patch.category;
    found.quantities = patch.quantities;
    found.updated_by = deviceName();
    found.version += 1;
  }
  notify();
}

export async function restoreItems(restored: readonly ShoppingItem[]): Promise<void> {
  krevNett();
  for (const item of restored) {
    const index = items.findIndex((row) => row.id === item.id);
    if (index === -1) items.push({ ...item });
    else items[index] = { ...item };
  }
  notify();
}

export async function fetchAliases(): Promise<{ alias: string; canonical: string }[]> {
  return clone(aliases);
}

export async function addAlias(alias: string, canonical: string): Promise<void> {
  krevNett();
  const from = alias.trim();
  const to = canonical.trim();
  if (from === '' || to === '') throw new Error('Begge feltene må fylles ut');
  aliases = [...aliases.filter((row) => row.alias !== from), { alias: from, canonical: to }];
  notify();
}

export async function removeAlias(alias: string): Promise<void> {
  krevNett();
  aliases = aliases.filter((row) => row.alias !== alias);
  notify();
}

export async function saveMeal(draft: MealDraft): Promise<string> {
  krevNett();
  const name = draft.name.trim();
  if (name === '') throw new Error('Middagen må ha et navn');
  if (MEALS.some((m) => m.id !== draft.id && m.name === name)) {
    throw new Error(`Du har allerede en middag som heter «${name}»`);
  }
  const mealId = draft.id ?? id();
  const meal: Meal = {
    id: mealId,
    name,
    emoji: draft.emoji?.trim() || null,
    description: draft.description?.trim() || null,
    servings: draft.servings,
    steps: draft.steps,
    tags: [],
    ingredients: draft.ingredients
      .filter((row) => row.name.trim() !== '')
      .map((row, index) =>
        ing(mealId, row.name.trim(), row.amount, row.amount === null ? null : row.unit, row.category, index),
      ),
  };
  const index = MEALS.findIndex((m) => m.id === mealId);
  if (index === -1) MEALS = [...MEALS, meal].sort((a, b) => a.name.localeCompare(b.name, 'no'));
  else MEALS[index] = meal;
  notify();
  return mealId;
}

export async function deleteMeal(mealId: string): Promise<void> {
  krevNett();
  MEALS = MEALS.filter((m) => m.id !== mealId);
  week = week.filter((entry) => entry.meal_id !== mealId);
  notify();
}

/** Testkrok: later som den andre telefonen rørte raden, uten å endre noe. */
(window as unknown as Record<string, unknown>).__bumpVersjon = (varenavn: string): void => {
  const found = items.find((row) => row.name === varenavn);
  if (found !== undefined) found.version += 1;
};

// --- Speiler de id-baserte variantene i db.ts, som offline-køen bruker ---

export async function fetchAllItemsForCache(): Promise<ShoppingItem[]> {
  krevNett();
  return clone(items);
}

export async function applyPendingItems(
  pending: readonly PendingItem[],
  newIds: readonly string[] = [],
): Promise<void> {
  krevNett();
  const before = items.length;
  applyPending(pending);
  // Id-ene fra telefonen skal følge med, så en vare lagt til offline peker
  // på samme rad etterpå.
  items.slice(before).forEach((item, index) => {
    const id = newIds[index];
    if (id !== undefined) item.id = id;
  });
}

export async function archiveItems(ids: readonly string[]): Promise<void> {
  krevNett();
  for (const item of items) if (ids.includes(item.id)) archive(item);
  notify();
}

export async function reviveItem(itemId: string, quantities: Quantity[]): Promise<void> {
  krevNett();
  const found = items.find((row) => row.id === itemId);
  if (found === undefined) return;
  await addFromRegister(found, quantities);
}

export async function setPinned(itemId: string, pinned: boolean): Promise<void> {
  krevNett();
  const found = items.find((row) => row.id === itemId);
  if (found === undefined) return;
  found.pinned = pinned;
  found.updated_by = deviceName();
  found.updated_at = new Date().toISOString();
  found.version += 1;
  notify();
}

export async function updateItemById(
  itemId: string,
  patch: { name: string; category: Category; quantities: Quantity[] },
): Promise<void> {
  krevNett();
  const found = items.find((row) => row.id === itemId);
  if (found === undefined) return;
  await updateItem(found, patch);
}

// --- Varselkanaler, samme API som db.ts ---

export async function fetchPushTargets(): Promise<PushTarget[]> {
  krevNett();
  return clone(pushTargets);
}

export async function registerPushTarget(topic: string): Promise<void> {
  krevNett();
  const id = deviceId();
  pushTargets = [...pushTargets.filter((t) => t.device_id !== id), { device_id: id, label: deviceName(), topic }];
  notify();
}

export async function removePushTarget(): Promise<void> {
  krevNett();
  const id = deviceId();
  pushTargets = pushTargets.filter((t) => t.device_id !== id);
  notify();
}
