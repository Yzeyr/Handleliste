/**
 * Laget som gjør at appen virker i en butikk uten dekning.
 *
 * Reglene, i rekkefølge:
 *
 * 1. Alt som vises kommer fra en lokal kopi. Den ligger i localStorage, så
 *    lista er der med en gang appen åpnes — også uten nett.
 * 2. Enhver handling skrives til den lokale kopien først, og legges i en kø.
 * 3. Køen sendes til Supabase så snart det er nett. Hver handling utføres på
 *    nytt mot lista slik den faktisk er da, gjennom de samme funksjonene som
 *    en vanlig handling — så sammenslåing og sammenlign-og-bytt gjelder også
 *    for noe som ble gjort offline.
 * 4. Så lenge køen har noe i seg, er den lokale kopien fasit. Først når køen
 *    er tom lar vi serveren overskrive den.
 *
 * Punkt 4 er det som hindrer at en handling du nettopp gjorde offline blir
 * borte fordi en oppfriskning kom først.
 */
import * as db from './db.ts';
import { deviceName } from './config.ts';
import * as local from './localStore.ts';
import { describeIntent, type Intent, type QueuedIntent } from './intent.ts';
import { notifyOthers, type PushTarget } from './push.ts';
import type { Meal, ShoppingItem, WeekPlanItem } from './types.ts';

const SNAPSHOT_KEY = 'handleliste.kopi';
const QUEUE_KEY = 'handleliste.ko';
const MEALS_KEY = 'handleliste.middager';
const ALIAS_KEY = 'handleliste.synonymer';
const TARGET_KEY = 'handleliste.varselmottakere';

export interface Snapshot {
  state: local.LocalState;
  meals: Meal[];
  savedAt: string;
}

export interface SyncStatus {
  online: boolean;
  queued: number;
  lastError: string | null;
  savedAt: string | null;
}

let state: local.LocalState = local.emptyState();
let meals: Meal[] = [];
let queue: QueuedIntent[] = [];
let aliases: { alias: string; canonical: string }[] = [];
let pushTargets: PushTarget[] = [];
let savedAt: string | null = null;
let lastError: string | null = null;
let flushing = false;

const listeners = new Set<() => void>();

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function announce(): void {
  for (const listener of listeners) listener();
}

// ---------------------------------------------------------------------------
// Lagring på telefonen
// ---------------------------------------------------------------------------

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Full lagring eller privat modus. Appen virker fortsatt, den husker
    // bare ikke til neste gang — ikke verdt å stoppe noe for.
  }
}

function persist(): void {
  savedAt = new Date().toISOString();
  writeJson(SNAPSHOT_KEY, { state, savedAt });
  writeJson(QUEUE_KEY, queue);
  writeJson(MEALS_KEY, meals);
  writeJson(ALIAS_KEY, aliases);
  writeJson(TARGET_KEY, pushTargets);
}

// ---------------------------------------------------------------------------
// Er vi på nett?
// ---------------------------------------------------------------------------

export function isOnline(): boolean {
  return navigator.onLine;
}

/**
 * Skiller «nettet er borte» fra «databasen sa nei».
 * Det første skal beholde handlingen i køen; det andre skal kaste den, ellers
 * blir køen stående og prøve på noe som aldri kommer til å gå.
 */
function looksLikeNetworkTrouble(error: unknown): boolean {
  if (!navigator.onLine) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /failed to fetch|networkerror|load failed|fetch failed|timeout|offline/i.test(message);
}

// ---------------------------------------------------------------------------
// Oppstart
// ---------------------------------------------------------------------------

export function loadFromDevice(): void {
  const snapshot = readJson<{ state: local.LocalState; savedAt: string } | null>(SNAPSHOT_KEY, null);
  if (snapshot !== null) {
    state = { items: snapshot.state.items ?? [], week: snapshot.state.week ?? [] };
    savedAt = snapshot.savedAt;
  }
  meals = readJson<Meal[]>(MEALS_KEY, []);
  aliases = readJson<{ alias: string; canonical: string }[]>(ALIAS_KEY, []);
  pushTargets = readJson<PushTarget[]>(TARGET_KEY, []);
  queue = readJson<QueuedIntent[]>(QUEUE_KEY, []);
}

// ---------------------------------------------------------------------------
// Lesing
// ---------------------------------------------------------------------------

export const listItems = (): ShoppingItem[] => local.activeItems(state);
export const registerItems = (): ShoppingItem[] => local.registerItems(state);
export const weekItems = (): WeekPlanItem[] => state.week.map((entry) => ({ ...entry }));
export const allMeals = (): Meal[] => meals;
export const allAliases = (): { alias: string; canonical: string }[] => aliases;
export const allPushTargets = (): PushTarget[] => pushTargets;

/**
 * Leser og tømmer den siste feilen. Tømmes ved lesing, ellers ville den blitt
 * stående på skjermen lenge etter at den var håndtert.
 */
/**
 * Feilen tømmes bare ved lesing — aldri av at noe annet gikk bra.
 *
 * Første forsøk nullstilte den i refreshFromServer, og da rakk en vellykket
 * oppfriskning å viske ut feilen før skjermen fikk se den. At en lesing går
 * bra sier ingenting om at en skriving ble avvist.
 */
export function takeLastError(): string | null {
  const error = lastError;
  lastError = null;
  return error;
}

export async function refreshPushTargets(): Promise<PushTarget[]> {
  pushTargets = await db.fetchPushTargets();
  persist();
  announce();
  return pushTargets;
}

/** Middagene ligger også på telefonen, så oppskriftene er der uten nett. */
export async function refreshMeals(): Promise<Meal[]> {
  meals = await db.fetchMeals();
  persist();
  announce();
  return meals;
}

/** Synonymene må ligge på telefonen også, ellers slår appen sammen feil offline. */
export async function refreshAliases(): Promise<{ alias: string; canonical: string }[]> {
  aliases = await db.fetchAliases();
  persist();
  return aliases;
}

export function status(): SyncStatus {
  return { online: isOnline(), queued: queue.length, lastError, savedAt };
}

export function pendingSummary(): string | null {
  if (queue.length === 0) return null;
  if (queue.length === 1) return `1 endring venter på nett (${describeIntent(queue[0]!.intent)})`;
  return `${queue.length} endringer venter på nett`;
}

/** Henter alt på nytt fra serveren. Rører ikke den lokale kopien om køen har noe i seg. */
export async function refreshFromServer(options: { meals?: boolean } = {}): Promise<void> {
  const [items, week] = await Promise.all([db.fetchAllItemsForCache(), db.fetchWeekPlan()]);
  if (options.meals === true) {
    meals = await db.fetchMeals();
  }
  if (queue.length > 0) {
    // Serveren vet ennå ikke om det som ligger i køen. Å ta imot den nå ville
    // slette endringene dine fra skjermen til køen er sendt.
    persist();
    announce();
    return;
  }
  state = { items, week };
  persist();
  announce();
}

// ---------------------------------------------------------------------------
// Handlinger
// ---------------------------------------------------------------------------

/** Skriver lokalt, legger i kø, og prøver å sende. */
export function apply(intent: Intent): void {
  const author = deviceName();
  applyLocally(intent, author);
  queue.push({ id: crypto.randomUUID(), intent, queuedAt: new Date().toISOString() });
  persist();
  announce();
  void flush();
}

function applyLocally(intent: Intent, author: string | null): void {
  switch (intent.kind) {
    case 'addPending':
      local.applyPendingLocal(state, intent.pending, author, intent.newIds);
      local.weekMarkAddedLocal(state, intent.mealIds);
      break;
    case 'setChecked':
      local.setCheckedLocal(state, intent.id, intent.checked, author);
      break;
    case 'archive':
      local.archiveLocal(state, intent.ids, author);
      break;
    case 'revive':
      local.reviveLocal(state, intent.id, intent.quantities, author);
      break;
    case 'edit':
      local.editLocal(state, intent.id, intent.patch, author);
      break;
    case 'forget':
      local.forgetLocal(state, intent.id);
      break;
    case 'restore':
      local.restoreLocal(state, intent.items);
      break;
    case 'weekAdd':
      local.weekAddLocal(state, intent.mealId, intent.id);
      break;
    case 'weekRemove':
      local.weekRemoveLocal(state, intent.mealId);
      break;
    case 'weekSet':
      local.weekSetLocal(state, intent.entries);
      break;
  }
}

async function send(intent: Intent): Promise<void> {
  switch (intent.kind) {
    case 'addPending':
      await db.applyPendingItems(intent.pending, intent.newIds);
      await db.markWeekMealsAdded(intent.mealIds);
      return;
    case 'setChecked':
      return db.setChecked(intent.id, intent.checked);
    case 'archive':
      return db.archiveItems(intent.ids);
    case 'revive':
      return db.reviveItem(intent.id, intent.quantities);
    case 'edit':
      return db.updateItemById(intent.id, intent.patch);
    case 'forget':
      return db.forgetItem(intent.id);
    case 'restore':
      return db.restoreItems(intent.items);
    case 'weekAdd':
      return db.addMealToWeek(intent.mealId, intent.id);
    case 'weekRemove':
      return db.removeMealFromWeek(intent.mealId);
    case 'weekSet':
      return db.restoreWeek(intent.entries);
  }
}

/**
 * Sender køen, én handling om gangen og i rekkefølge. Rekkefølgen betyr noe:
 * «legg til melk» før «hak av melk» gir et annet resultat enn omvendt.
 */
export async function flush(): Promise<void> {
  if (flushing || queue.length === 0 || !isOnline()) return;
  flushing = true;

  try {
    while (queue.length > 0) {
      const next = queue[0]!;
      try {
        await send(next.intent);
        // Først nå finnes endringen for den andre telefonen. Å varsle når
        // handlingen ble lagt i køen ville betydd et varsel om noe som ennå
        // ikke var der — og som kanskje aldri kom fram.
        void announceToOthers(next.intent);
      } catch (error) {
        if (looksLikeNetworkTrouble(error)) return;
        // Databasen sa nei av en grunn som ikke går over av seg selv.
        // Handlingen kastes, ellers står køen fast for alltid.
        lastError = error instanceof Error ? error.message : 'En endring kunne ikke lagres';
        queue.shift();
        persist();
        continue;
      }
      queue.shift();
      persist();
      announce();
    }
    await refreshFromServer();
  } finally {
    flushing = false;
    announce();
  }
}

async function announceToOthers(intent: Intent): Promise<void> {
  const message = announcement(intent);
  if (message === null) return;
  await notifyOthers(pushTargets, message);
}

const nameOf = (id: string): string | null =>
  state.items.find((row) => row.id === id)?.name ?? null;

/**
 * Varsler bare det som gjør lista lengre. Avhuking og fjerning skjer i
 * dusinvis i én butikk, og et varsel per hake er mas man skrur av.
 *
 * Å hake av en allerede avhuket vare hører derimot til den første gruppa: det
 * betyr «denne trenger vi likevel», altså nøyaktig samme nyhet som et tillegg,
 * og det gjøres sjelden.
 */
function announcement(intent: Intent): string | null {
  switch (intent.kind) {
    case 'addPending':
      return intent.pending.length > 1
        ? `la til ${intent.pending.length} varer`
        : describeIntent(intent);
    case 'revive':
      return `la til ${nameOf(intent.id) ?? 'en vare'}`;
    case 'setChecked':
      if (intent.checked || intent.quiet === true) return null;
      return `la ${nameOf(intent.id) ?? 'en vare'} tilbake på lista`;
    default:
      return null;
  }
}

/** Kobles på ved oppstart: send køen så snart telefonen har nett igjen. */
export function watchConnection(): void {
  window.addEventListener('online', () => {
    announce();
    void flush();
  });
  window.addEventListener('offline', () => announce());
}
