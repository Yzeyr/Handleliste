import { getClient } from './supabase.ts';
import { deviceId, deviceName, loadConfig } from './config.ts';
import type { PushTarget } from './push.ts';
import type { ChangeEvent } from './changes.ts';
import { itemsFromMeals, mergeQuantities, planListChange, type PendingItem } from './merge.ts';
import { normalizeName } from './normalize.ts';
import { normalizeUnit } from './units.ts';
import type { Category, Meal, MealDraft, MealIngredient, Quantity, ShoppingItem, WeekPlanItem } from './types.ts';

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
export async function fetchAllItemsForCache(): Promise<ShoppingItem[]> {
  return fetchAllItems();
}

/**
 * Arkiverte rader slettes aldri, så uten en grense vokser denne lesingen for
 * alltid — og den kjøres ved hver oppfriskning, i en butikk med dårlig
 * dekning. Nyest brukte først, så det som faller utenfor er varer ingen har
 * rørt på lenge.
 *
 * Trygt fordi den unike indeksen fanger opp resten: skulle en gammel arkivert
 * rad ligge utenfor vinduet, feiler innsettingen med 23505, og runden går om
 * igjen mot den raden i stedet for å lage en dublett.
 */
const CACHE_LIMIT = 1000;

async function fetchAllItems(): Promise<ShoppingItem[]> {
  const { data, error } = await sb()
    .from(LIST)
    .select('*')
    .order('archived', { ascending: true })
    .order('last_used_at', { ascending: false })
    .limit(CACHE_LIMIT);
  fail('Klarte ikke å hente handlelista', error);
  return (data ?? []) as ShoppingItem[];
}

export async function fetchWeekPlan(): Promise<WeekPlanItem[]> {
  // `*`, ikke en håndskrevet kolonneliste. Lista her manglet `weekday` da den
  // kolonnen kom til: dagen ble lagret, men aldri lest tilbake, så raden sto
  // tom uten at noe feilet. En liste som må holdes i takt med typen er en
  // felle det ikke er noe å vinne på her.
  const { data, error } = await sb().from('week_plan_items').select('*');
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
    // En vare uten middagsopphav er lagt inn for hånd. Én gang holder —
    // flagget slås aldri av igjen.
    manual: item.manual || sourceMeals.length === 0,
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
    manual: pending.sourceMeals.length === 0,
  };
}

/**
 * Skriver et sett ferdig sammenslåtte linjer til lista.
 *
 * En linje som allerede finnes blir oppdatert, aldri duplisert. Den blir også
 * huket av igjen: trenger dere mer av noe dere alt har krysset ut, må det
 * synes at det står igjen å handle.
 */
export async function applyPendingItems(
  pending: readonly PendingItem[],
  newIds: readonly string[] = [],
): Promise<void> {
  return applyPending(pending, newIds);
}

async function applyPending(
  pending: readonly PendingItem[],
  newIds: readonly string[] = [],
): Promise<void> {
  // Sammenlign-og-bytt. Sammenslåingen regnes ut i klienten, så mellom lesing
  // og skriving kan den andre telefonen ha rukket å endre raden. Da treffer
  // oppdateringen ingen rader — fordi versjonen ikke stemmer lenger — og vi
  // leser på nytt og regner om, i stedet for å skrive over det de gjorde.
  let remaining = [...pending];

  for (let attempt = 0; attempt < 4 && remaining.length > 0; attempt += 1) {
    const byName = new Map(remaining.map((item) => [item.normalizedName, item]));
    const { updates, inserts } = planListChange(await fetchAllItems(), remaining);
    const retry: PendingItem[] = [];

    for (const update of updates) {
      const { data, error } = await sb()
        .from(LIST)
        .update(revivePayload(update.item, update.quantities, update.sourceMeals))
        .eq('id', update.item.id)
        .eq('version', update.item.version)
        .select('id');
      fail(`Klarte ikke å oppdatere ${update.item.name}`, error);

      if ((data ?? []).length === 0) {
        const missed = byName.get(update.item.normalized_name);
        if (missed !== undefined) retry.push(missed);
      }
    }

    if (inserts.length > 0) {
      const positions = new Map(pending.map((item, index) => [item.normalizedName, index]));
      const { error } = await sb()
        .from(LIST)
        .insert(
          inserts.map((insert) => {
            const index = positions.get(insert.normalizedName);
            const id = index === undefined ? undefined : newIds[index];
            return id === undefined ? insertPayload(insert) : { id, ...insertPayload(insert) };
          }),
        );
      // 23505: den unike indeksen slo til fordi noen andre satte inn samme
      // vare i mellomtiden. Neste runde finner raden og slår sammen mot den.
      if (error !== null && error.code === '23505') retry.push(...inserts);
      else fail('Klarte ikke å legge til varer', error);
    }

    remaining = retry;
  }

  if (remaining.length > 0) {
    throw new Error('Lista endret seg raskere enn vi rakk å skrive. Prøv en gang til.');
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
  return archiveItems([id]);
}

/** Arkiverer et sett varer. Køen lagrer id-er, ikke hele rader. */
export async function archiveItems(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await sb().from(LIST).update(archivePatch()).in('id', [...ids]);
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
  return reviveItem(item.id, quantities);
}

/**
 * Sammenlign-og-bytt, som alle de andre skriveveiene: les raden, skriv bare
 * hvis versjonen fortsatt er den vi leste. Uten det var dette den ene veien
 * som kunne overskrive det den andre telefonen rakk å gjøre mellom lesingen
 * og skrivingen.
 */
export async function reviveItem(id: string, quantities: Quantity[]): Promise<void> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await sb().from(LIST).select('*').eq('id', id).maybeSingle();
    fail('Klarte ikke å hente varen', error);
    if (data === null) return;
    const item = data as ShoppingItem;

    const { data: written, error: updateError } = await sb()
      .from(LIST)
      .update(revivePayload(item, quantities, []))
      .eq('id', id)
      .eq('version', item.version)
      .select('id');
    fail(`Klarte ikke å legge til ${item.name}`, updateError);
    if ((written ?? []).length > 0) return;
  }
  throw new Error('Klarte ikke å legge til varen — prøv igjen');
}

/** Sletter en vare for godt. Det eneste stedet noe faktisk fjernes. */
export async function forgetItem(id: string): Promise<void> {
  const { error } = await sb().from(LIST).delete().eq('id', id);
  fail('Klarte ikke å slette varen', error);
}

// ---------------------------------------------------------------------------
// Ukemeny
// ---------------------------------------------------------------------------

export async function addMealToWeek(
  mealId: string,
  id?: string,
  weekday: number | null = null,
): Promise<void> {
  const row: Record<string, unknown> = { meal_id: mealId, weekday };
  if (id !== undefined) row.id = id;
  const { error } = await sb().from('week_plan_items').insert(row);
  // Middagen sto der alt. Da er dette en flytting til en annen dag.
  if (error !== null && error.code === '23505') return setMealWeekday(mealId, weekday);
  fail('Klarte ikke å legge middagen i ukemenyen', error);
}

export async function setMealWeekday(mealId: string, weekday: number | null): Promise<void> {
  const { error } = await sb().from('week_plan_items').update({ weekday }).eq('meal_id', mealId);
  fail('Klarte ikke å flytte middagen', error);
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

/** Angre for ukemenyen: setter den tilbake slik den var. */
export async function restoreWeek(entries: readonly WeekPlanItem[]): Promise<void> {
  const { error: clearError } = await sb().from('week_plan_items').delete().not('id', 'is', null);
  fail('Klarte ikke å angre ukemenyen', clearError);
  if (entries.length === 0) return;
  const { error } = await sb()
    .from('week_plan_items')
    .insert(
      entries.map((entry) => ({
        id: entry.id,
        meal_id: entry.meal_id,
        added_to_list: entry.added_to_list,
        weekday: entry.weekday,
      })),
    );
  fail('Klarte ikke å angre ukemenyen', error);
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

// ---------------------------------------------------------------------------
// Redigering av en vare som står på lista
// ---------------------------------------------------------------------------

export async function updateItem(
  item: ShoppingItem,
  patch: { name: string; category: Category; quantities: Quantity[] },
): Promise<void> {
  return updateItemById(item.id, patch);
}

export async function updateItemById(
  id: string,
  patch: { name: string; category: Category; quantities: Quantity[] },
): Promise<void> {
  const name = patch.name.trim();
  if (name === '') throw new Error('Varen må ha et navn');

  const { error } = await sb()
    .from(LIST)
    .update({
      name,
      normalized_name: normalizeName(name),
      category: patch.category,
      quantities: patch.quantities,
      updated_by: deviceName(),
    })
    .eq('id', id);

  // Den unike indeksen: navnet peker nå på en vare som allerede finnes.
  // Å slå dem sammen her ville vært å gjette; be heller om et annet navn.
  if (error !== null && error.code === '23505') {
    throw new Error(`«${name}» finnes allerede — gi den et annet navn`);
  }
  fail('Klarte ikke å lagre endringen', error);
}

// ---------------------------------------------------------------------------
// Angre
// ---------------------------------------------------------------------------

/**
 * Setter rader tilbake slik de var. Brukes av angre-knappen, som holder på
 * radene fra før handlingen. En rad som er slettet settes inn igjen med sin
 * gamle id, så alt som pekte på den fortsatt stemmer.
 */
export async function restoreItems(items: readonly ShoppingItem[]): Promise<void> {
  for (const item of items) {
    const patch = {
      name: item.name,
      normalized_name: item.normalized_name,
      quantities: item.quantities,
      category: item.category,
      checked: item.checked,
      archived: item.archived,
      use_count: item.use_count,
      manual: item.manual,
      source_meals: item.source_meals,
      last_used_at: item.last_used_at,
      updated_by: item.updated_by,
    };

    const { data, error } = await sb().from(LIST).update(patch).eq('id', item.id).select('id');
    fail(`Klarte ikke å angre ${item.name}`, error);
    if ((data ?? []).length > 0) continue;

    const { error: insertError } = await sb().from(LIST).insert({ id: item.id, ...patch });
    if (insertError !== null && insertError.code === '23505') {
      throw new Error(`Kan ikke angre ${item.name} — en vare med samme navn finnes nå`);
    }
    fail(`Klarte ikke å angre ${item.name}`, insertError);
  }

  await unlogUndonePurchases(items);
}

/**
 * Angrer også kjøpsloggen.
 *
 * Triggeren i databasen har allerede skrevet «kjøpt» i det øyeblikket den
 * avhukede varen ble arkivert. Angrer du så, står raden igjen som et kjøp
 * som aldri skjedde — og siden loggen skal brukes til å regne ut hvor ofte
 * noe kjøpes, ville det ene falske kjøpet halvert et intervall den dagen
 * noen leser den.
 *
 * Bare den nyeste raden per vare fjernes, og bare når varen faktisk er
 * tilbake på lista.
 */
async function unlogUndonePurchases(items: readonly ShoppingItem[]): Promise<void> {
  const revived = items.filter((item) => !item.archived).map((item) => item.id);
  if (revived.length === 0) return;

  const { data, error } = await sb()
    .from('purchases')
    .select('id,item_id,bought_at')
    .in('item_id', revived)
    .order('bought_at', { ascending: false });
  // Loggen er ikke verdt en feilmelding foran brukeren: angre lyktes uansett.
  if (error !== null || data === null) return;

  const newest = new Map<string, string>();
  for (const row of data as { id: string; item_id: string }[]) {
    if (!newest.has(row.item_id)) newest.set(row.item_id, row.id);
  }
  if (newest.size === 0) return;

  await sb().from('purchases').delete().in('id', [...newest.values()]);
}

// ---------------------------------------------------------------------------
// Egne synonymer
// ---------------------------------------------------------------------------

export interface Alias {
  alias: string;
  canonical: string;
}

export async function fetchAliases(): Promise<Alias[]> {
  const { data, error } = await sb().from('ingredient_aliases').select('alias,canonical').order('alias');
  fail('Klarte ikke å hente synonymer', error);
  return (data ?? []) as Alias[];
}

export async function addAlias(alias: string, canonical: string): Promise<void> {
  const from = alias.trim();
  const to = canonical.trim();
  if (from === '' || to === '') throw new Error('Begge feltene må fylles ut');
  const { error } = await sb()
    .from('ingredient_aliases')
    .upsert({ alias: from, canonical: to }, { onConflict: 'alias' });
  fail('Klarte ikke å lagre synonymet', error);
}

export async function removeAlias(alias: string): Promise<void> {
  const { error } = await sb().from('ingredient_aliases').delete().eq('alias', alias);
  fail('Klarte ikke å slette synonymet', error);
}

// ---------------------------------------------------------------------------
// Egne middager
// ---------------------------------------------------------------------------

/**
 * Lagrer en middag. Ingrediensene skrives om i sin helhet i stedet for å
 * flettes rad for rad — en oppskrift er liten, og "slett alt og skriv nytt"
 * kan ikke etterlate en ingrediens som ble fjernet i skjemaet.
 */
export async function saveMeal(draft: MealDraft): Promise<string> {
  const name = draft.name.trim();
  if (name === '') throw new Error('Middagen må ha et navn');

  const row = {
    name,
    emoji: draft.emoji?.trim() || null,
    description: draft.description?.trim() || null,
    servings: draft.servings,
    steps: draft.steps,
  };

  let mealId = draft.id;
  if (mealId === null) {
    const { data, error } = await sb().from('meals').insert(row).select('id').single();
    if (error !== null && error.code === '23505') {
      throw new Error(`Du har allerede en middag som heter «${name}»`);
    }
    fail('Klarte ikke å lagre middagen', error);
    mealId = (data as { id: string }).id;
  } else {
    const { error } = await sb().from('meals').update(row).eq('id', mealId);
    if (error !== null && error.code === '23505') {
      throw new Error(`Du har allerede en middag som heter «${name}»`);
    }
    fail('Klarte ikke å lagre middagen', error);

    const { error: clearError } = await sb().from('meal_ingredients').delete().eq('meal_id', mealId);
    fail('Klarte ikke å lagre ingrediensene', clearError);
  }

  const ingredients = draft.ingredients
    .filter((ingredient) => ingredient.name.trim() !== '')
    .map((ingredient, index) => ({
      meal_id: mealId,
      name: ingredient.name.trim(),
      normalized_name: normalizeName(ingredient.name),
      amount: ingredient.amount,
      unit: ingredient.amount === null ? null : ingredient.unit,
      category: ingredient.category,
      sort_order: index,
    }));

  if (ingredients.length > 0) {
    const { error } = await sb().from('meal_ingredients').insert(ingredients);
    fail('Klarte ikke å lagre ingrediensene', error);
  }

  return mealId;
}

export async function deleteMeal(id: string): Promise<void> {
  const { error } = await sb().from('meals').delete().eq('id', id);
  fail('Klarte ikke å slette middagen', error);
}

// ---------------------------------------------------------------------------
// Varselkanaler
// ---------------------------------------------------------------------------

export async function fetchPushTargets(): Promise<PushTarget[]> {
  const { data, error } = await sb().from('push_targets').select('device_id,label,topic');
  fail('Klarte ikke å hente varselkanaler', error);
  return (data ?? []) as PushTarget[];
}

export async function registerPushTarget(topic: string): Promise<void> {
  const { error } = await sb()
    .from('push_targets')
    .upsert({ device_id: deviceId(), label: deviceName(), topic }, { onConflict: 'device_id' });
  fail('Klarte ikke å registrere varselkanalen', error);
}

export async function removePushTarget(): Promise<void> {
  const { error } = await sb().from('push_targets').delete().eq('device_id', deviceId());
  fail('Klarte ikke å slå av varsler', error);
}
