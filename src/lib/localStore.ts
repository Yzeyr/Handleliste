/**
 * Handlelista slik den ser ut på denne telefonen.
 *
 * Samme operasjoner som `db.ts`, men mot et objekt i minnet i stedet for mot
 * Supabase. To ting bruker den: offline-laget, som skriver hit først og
 * sender etterpå, og `db.mock.ts`, som er dev-utgaven uten database. Det er
 * med vilje én implementasjon — to ville drevet fra hverandre.
 *
 * Ingen sammenlign-og-bytt her: det er én telefon som skriver til dette
 * objektet. Kappløpet mot den andre telefonen håndteres når køen sendes.
 */
import { planListChange, type PendingItem } from './merge.ts';
import { normalizeName } from './normalize.ts';
import type { Category, Quantity, ShoppingItem, WeekPlanItem } from './types.ts';

export interface LocalState {
  items: ShoppingItem[];
  week: WeekPlanItem[];
}

export const emptyState = (): LocalState => ({ items: [], week: [] });

const now = (): string => new Date().toISOString();

/**
 * Leserne får kopier, aldri radene selv.
 *
 * Delte referanser her er lumske: skjermtilstanden holdt på de samme
 * objektene, så da «angre» skulle skrive tilbake radene fra før en fjerning,
 * var de allerede endret av fjerningen. Feltene byttes ut som helhet ved
 * endring, så en grunn kopi er nok.
 */
export function activeItems(state: LocalState): ShoppingItem[] {
  return state.items
    .filter((item) => !item.archived)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((item) => ({ ...item }));
}

export function registerItems(state: LocalState): ShoppingItem[] {
  return state.items
    .filter((item) => item.archived)
    .sort((a, b) => b.use_count - a.use_count || b.last_used_at.localeCompare(a.last_used_at))
    .map((item) => ({ ...item }));
}

export function applyPendingLocal(
  state: LocalState,
  pending: readonly PendingItem[],
  author: string | null,
  newIds: readonly string[],
): void {
  const { updates, inserts } = planListChange(state.items, pending);

  for (const update of updates) {
    const live = state.items.find((row) => row.id === update.item.id);
    if (live === undefined) continue;
    live.quantities = update.quantities;
    live.source_meals = update.sourceMeals;
    live.checked = false;
    if (live.archived) live.use_count += 1;
    live.archived = false;
    live.last_used_at = now();
    live.updated_by = author;
    live.updated_at = now();
    live.version += 1;
  }

  inserts.forEach((insert, index) => {
    const stamp = now();
    state.items.push({
      // Id-en lages her, ikke av databasen. Da peker en handling som ble
      // gjort offline på samme rad når køen sendes senere.
      id: newIds[index] ?? crypto.randomUUID(),
      name: insert.name,
      normalized_name: insert.normalizedName,
      quantities: insert.quantities,
      category: insert.category,
      checked: false,
      archived: false,
      use_count: 1,
      last_used_at: stamp,
      updated_by: author,
      version: 0,
      source_meals: insert.sourceMeals,
      note: null,
      created_at: stamp,
      updated_at: stamp,
    });
  });
}

export function setCheckedLocal(
  state: LocalState,
  id: string,
  checked: boolean,
  author: string | null,
): void {
  const item = state.items.find((row) => row.id === id);
  if (item === undefined) return;
  item.checked = checked;
  item.updated_by = author;
  item.updated_at = now();
  item.version += 1;
}

export function archiveLocal(state: LocalState, ids: readonly string[], author: string | null): void {
  for (const item of state.items) {
    if (!ids.includes(item.id)) continue;
    item.archived = true;
    item.checked = false;
    item.source_meals = [];
    item.last_used_at = now();
    item.updated_by = author;
    item.updated_at = now();
    item.version += 1;
  }
}

export function reviveLocal(
  state: LocalState,
  id: string,
  quantities: Quantity[],
  author: string | null,
): void {
  const item = state.items.find((row) => row.id === id);
  if (item === undefined) return;
  if (item.archived) item.use_count += 1;
  item.archived = false;
  item.checked = false;
  item.quantities = quantities;
  item.source_meals = [];
  item.last_used_at = now();
  item.updated_by = author;
  item.updated_at = now();
  item.version += 1;
}

export function editLocal(
  state: LocalState,
  id: string,
  patch: { name: string; category: Category; quantities: Quantity[] },
  author: string | null,
): void {
  const item = state.items.find((row) => row.id === id);
  if (item === undefined) return;
  const name = patch.name.trim();
  const key = normalizeName(name);
  if (state.items.some((row) => row.id !== id && row.normalized_name === key)) {
    throw new Error(`«${name}» finnes allerede — gi den et annet navn`);
  }
  item.name = name;
  item.normalized_name = key;
  item.category = patch.category;
  item.quantities = patch.quantities;
  item.updated_by = author;
  item.updated_at = now();
  item.version += 1;
}

export function forgetLocal(state: LocalState, id: string): void {
  state.items = state.items.filter((row) => row.id !== id);
}

export function restoreLocal(state: LocalState, restored: readonly ShoppingItem[]): void {
  for (const item of restored) {
    const index = state.items.findIndex((row) => row.id === item.id);
    if (index === -1) state.items.push({ ...item });
    else state.items[index] = { ...item };
  }
}

export function weekAddLocal(state: LocalState, mealId: string, id: string): void {
  if (state.week.some((entry) => entry.meal_id === mealId)) return;
  state.week.push({ id, meal_id: mealId, added_to_list: false });
}

export function weekRemoveLocal(state: LocalState, mealId: string): void {
  state.week = state.week.filter((entry) => entry.meal_id !== mealId);
}

export function weekMarkAddedLocal(state: LocalState, mealIds: readonly string[]): void {
  for (const entry of state.week) {
    if (mealIds.includes(entry.meal_id)) entry.added_to_list = true;
  }
}

export function weekSetLocal(state: LocalState, entries: readonly WeekPlanItem[]): void {
  state.week = entries.map((entry) => ({ ...entry }));
}
