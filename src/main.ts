import { el, replaceChildren } from './dom.ts';
import * as db from './lib/db.ts';
import { isCategory, type Meal, type MealDraft, type Quantity, type ShoppingItem } from './lib/types.ts';
import type { Actions, AppState } from './state.ts';
import { createListView } from './views/list.ts';
import { createMealsView } from './views/meals.ts';
import { createWeekView } from './views/week.ts';
import { createRegisterView } from './views/register.ts';
import { createMealEditor } from './views/mealEditor.ts';
import { setRuntimeAliases } from './lib/normalize.ts';
import { createSetupView } from './views/setup.ts';
import { applyShareLink, clearConfig, deviceName, isConfigFixed, lastSeenAt, markSeenNow } from './lib/config.ts';
import { describeChange, summarizeChanges, type ChangeEvent } from './lib/changes.ts';
import { createSettingsButton, createSettingsView } from './views/settings.ts';
import { resetClient } from './lib/supabase.ts';

type TabId = 'liste' | 'middager' | 'uke' | 'varer';

const TABS: { id: TabId; label: string }[] = [
  { id: 'liste', label: 'Liste' },
  { id: 'middager', label: 'Middager' },
  { id: 'uke', label: 'Uke' },
  { id: 'varer', label: 'Varer' },
];

const root = document.querySelector<HTMLDivElement>('#app');
if (root === null) throw new Error('Fant ikke #app');

// En delingslenke fra den andre telefonen setter opp appen før noe annet.
applyShareLink();
boot(root);

function boot(container: HTMLElement): void {
  if (!db.isConfigured()) {
    replaceChildren(container, [
      el('header', { class: 'app-header' }, [el('h1', { text: 'Handleliste' })]),
      el('main', { class: 'content' }, [
        createSetupView(() => {
          resetClient();
          boot(container);
        }),
      ]),
    ]);
    return;
  }
  void start(container);
}

async function start(container: HTMLElement): Promise<void> {
  const state: AppState = { items: [], meals: [], week: [], register: [], unseen: new Set(), aliases: [] };
  let tab: TabId = 'liste';

  const actions: Actions = {
    addManual: (input) =>
      run(() =>
        db.addManualItem({
          name: input.name,
          amount: input.amount,
          unit: input.unit,
          category: isCategory(input.category) ? input.category : 'annet',
        }),
      ),
    toggleChecked: (item: ShoppingItem) => run(() => db.setChecked(item.id, !item.checked)),
    removeItem: (item: ShoppingItem) =>
      runUndoable(`${item.name} fjernet`, () => db.removeItem(item.id), () => db.restoreItems([item])),
    removeChecked: () => {
      const affected = state.items.filter((item) => item.checked);
      runUndoable(
        affected.length === 1 ? `1 vare fjernet` : `${affected.length} varer fjernet`,
        () => db.removeCheckedItems(),
        () => db.restoreItems(affected),
      );
    },
    addFromRegister: (item: ShoppingItem, quantities: Quantity[]) =>
      run(() => db.addFromRegister(item, quantities)),
    forgetItem: (item: ShoppingItem) =>
      runUndoable(`${item.name} slettet`, () => db.forgetItem(item.id), () => db.restoreItems([item])),
    clearList: () => {
      const affected = [...state.items];
      if (affected.length === 0) return;
      runUndoable('Lista tømt', () => db.clearList(), () => db.restoreItems(affected));
    },
    toggleWeekMeal: (meal: Meal) => {
      const inWeek = state.week.some((entry) => entry.meal_id === meal.id);
      run(() => (inWeek ? db.removeMealFromWeek(meal.id) : db.addMealToWeek(meal.id)));
    },
    addWeekToList: () =>
      run(async () => {
        const byId = new Map(state.meals.map((meal) => [meal.id, meal]));
        const pending = state.week
          .filter((entry) => !entry.added_to_list)
          .map((entry) => byId.get(entry.meal_id))
          .filter((meal): meal is Meal => meal !== undefined);
        if (pending.length === 0) return;

        const added = await db.addMealsToList(pending);
        await db.markWeekMealsAdded(pending.map((meal) => meal.id));
        setTab('liste');
        showStatus(`${added.length} varer lagt til fra ${pending.length} middager`);
      }),
    clearWeek: () => {
      const affected = [...state.week];
      if (affected.length === 0) return;
      runUndoable('Ukemenyen tømt', () => db.clearWeek(), () => db.restoreWeek(affected));
    },
    editItem: (item, patch) =>
      run(async () => {
        await db.updateItem(item, patch);
        setTab(tab);
      }),
    addAlias: (alias: string, canonical: string) =>
      run(async () => {
        await db.addAlias(alias, canonical);
        await refreshAliases();
        showSettings();
      }),
    removeAlias: (alias: string) =>
      run(async () => {
        await db.removeAlias(alias);
        await refreshAliases();
        showSettings();
      }),
    editMeal: (meal: Meal | null) => showMealEditor(meal),
    saveMeal: (draft: MealDraft) =>
      run(async () => {
        await db.saveMeal(draft);
        state.meals = await db.fetchMeals();
        setTab('middager');
        showStatus('Middagen er lagret');
      }),
    deleteMeal: (meal: Meal) =>
      run(async () => {
        await db.deleteMeal(meal.id);
        state.meals = await db.fetchMeals();
        setTab('middager');
        showStatus(`${meal.name} slettet`);
      }),
    goToList: () => setTab('liste'),
  };

  const views = {
    liste: createListView(actions),
    middager: createMealsView(actions),
    uke: createWeekView(actions),
    varer: createRegisterView(actions),
  } as const;

  const status = el('div', { class: 'status', attrs: { role: 'status' } });
  const toast = el('div', { class: 'toast', attrs: { role: 'status', 'aria-live': 'polite' } });

  // Frosset ved oppstart: alt som er endret av den andre etter dette
  // tidspunktet markeres helt til appen lukkes igjen.
  const seenBefore = lastSeenAt();
  const content = el('main', { class: 'content' });
  const settingsButton = createSettingsButton(() => showSettings());
  const tabBar = el(
    'nav',
    { class: 'tabs' },
    TABS.map((entry) =>
      el('button', {
        class: 'tab',
        text: entry.label,
        attrs: { type: 'button', 'data-tab': entry.id },
        on: { click: () => setTab(entry.id) },
      }),
    ),
  );

  replaceChildren(container, [
    el('header', { class: 'app-header' }, [
      el('h1', { text: 'Handleliste' }),
      status,
      settingsButton,
    ]),
    content,
    toast,
    tabBar,
  ]);

  function showSettings(): void {
    for (const button of tabBar.querySelectorAll('.tab')) button.classList.remove('active');
    replaceChildren(content, [
      createSettingsView({
        changeKeys: () => {
          clearConfig();
          resetClient();
          boot(container);
        },
        close: () => setTab(tab),
        aliases: state.aliases,
        addAlias: actions.addAlias,
        removeAlias: actions.removeAlias,
      }),
    ]);
  }

  let toastTimer: number | undefined;
  let pending: string[] = [];

  /**
   * Kjører noe som kan angres. Radene fra før handlingen holdes på til
   * varselet forsvinner; trykker du «Angre» skrives de tilbake.
   */
  function runUndoable(
    label: string,
    action: () => Promise<unknown>,
    undo: () => Promise<unknown>,
  ): void {
    void (async () => {
      try {
        await action();
        await reload();
        offerUndo(label, undo);
      } catch (error) {
        showStatus(error instanceof Error ? error.message : 'Noe gikk galt', true);
      }
    })();
  }

  function offerUndo(label: string, undo: () => Promise<unknown>): void {
    window.clearTimeout(toastTimer);
    pending = [];
    replaceChildren(toast, [
      el('span', { class: 'toast-text', text: label }),
      el('button', {
        class: 'toast-undo',
        text: 'Angre',
        attrs: { type: 'button' },
        on: {
          click: () => {
            toast.classList.remove('visible');
            void (async () => {
              try {
                await undo();
                await reload();
                showStatus('Angret');
              } catch (error) {
                showStatus(error instanceof Error ? error.message : 'Klarte ikke å angre', true);
              }
            })();
          },
        },
      }),
    ]);
    toast.classList.add('visible');
    window.setTimeout(() => {
      toast.classList.remove('visible');
    }, 7000);
  }

  /** Samler endringer som kommer tett, så det blir én melding og ikke fem. */
  function announce(message: string): void {
    pending.push(message);
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      replaceChildren(toast, [el('span', { class: 'toast-text', text: summarizeChanges(pending) ?? '' })]);
      toast.classList.add('visible');
      pending = [];
      window.setTimeout(() => toast.classList.remove('visible'), 4000);
    }, 400);
  }

  let statusTimer: number | undefined;
  function showStatus(message: string, isError = false): void {
    status.textContent = message;
    status.classList.toggle('error', isError);
    window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => {
      status.textContent = '';
      status.classList.remove('error');
    }, isError ? 8000 : 3000);
  }

  function setTab(next: TabId): void {
    tab = next;
    for (const button of tabBar.querySelectorAll('.tab')) {
      button.classList.toggle('active', button.getAttribute('data-tab') === tab);
    }
    replaceChildren(content, [views[tab].element]);
    views[tab].update(state);
    content.scrollTo({ top: 0 });
  }

  function showMealEditor(meal: Meal | null): void {
    for (const button of tabBar.querySelectorAll('.tab')) button.classList.remove('active');
    replaceChildren(content, [
      createMealEditor(meal, {
        save: actions.saveMeal,
        remove: actions.deleteMeal,
        close: () => setTab('middager'),
      }),
    ]);
    content.scrollTo({ top: 0 });
  }

  /** Synonymene må inn i normalizeName før noe slås sammen. */
  async function refreshAliases(): Promise<void> {
    state.aliases = await db.fetchAliases();
    setRuntimeAliases(state.aliases);
  }

  function refreshView(): void {
    views[tab].update(state);
  }

  /** Varer den andre har rørt siden forrige gang appen var åpen her. */
  function unseenIds(): Set<string> {
    if (seenBefore === null) return new Set();
    const me = deviceName();
    return new Set(
      state.items
        .filter((item) => item.updated_at > seenBefore && item.updated_by !== null && item.updated_by !== me)
        .map((item) => item.id),
    );
  }

  /**
   * Kjører en handling og henter deretter alt på nytt. Realtime varsler den
   * andre telefonen; denne refetchen er for vår egen, som ikke får sitt eget
   * postgres_changes-kall garantert før neste tegning.
   */
  function run(action: () => Promise<unknown>): void {
    void (async () => {
      try {
        await action();
        await reload();
      } catch (error) {
        showStatus(error instanceof Error ? error.message : 'Noe gikk galt', true);
      }
    })();
  }

  async function reload(): Promise<void> {
    const [items, week, register] = await Promise.all([
      db.fetchList(),
      db.fetchWeekPlan(),
      db.fetchRegister(),
    ]);
    state.items = items;
    state.week = week;
    state.register = register;
    state.unseen = unseenIds();
    markSeenNow();
    refreshView();
  }

  setTab('liste');
  // Et tregt eller feil prosjekt bruker flere sekunder på å feile (klienten
  // prøver på nytt et par ganger), så det må synes at noe skjer.
  showStatus('Kobler til …');

  try {
    await refreshAliases();
    state.meals = await db.fetchMeals();
    await reload();
  } catch (error) {
    showStatus(error instanceof Error ? error.message : 'Klarte ikke å hente data', true);
    replaceChildren(content, [
      el('section', { class: 'view' }, [
        el('h2', { text: 'Får ikke kontakt med databasen' }),
        el('p', {
          text:
            'Sjekk at prosjektet lever, at begge SQL-filene er kjørt, og at nøklene er riktige.',
        }),
        !isConfigFixed() &&
          el('button', {
            class: 'primary wide',
            text: 'Endre nøkler',
            attrs: { type: 'button' },
            on: {
              click: () => {
                clearConfig();
                resetClient();
                boot(container);
              },
            },
          }),
      ]),
    ]);
    return;
  }

  // Realtime: den andre telefonen sin endring lander her.
  db.subscribeToChanges((event: ChangeEvent | null) => {
    if (event !== null) {
      const message = describeChange(event, deviceName());
      if (message !== null) announce(message);
    }
    void reload().catch(() => showStatus('Mistet kontakt med databasen', true));
  });
}
