import { el, replaceChildren } from './dom.ts';
import * as db from './lib/db.ts';
import { isCategory, type Meal, type ShoppingItem } from './lib/types.ts';
import type { Actions, AppState } from './state.ts';
import { createListView } from './views/list.ts';
import { createMealsView } from './views/meals.ts';
import { createWeekView } from './views/week.ts';
import { createHistoryView } from './views/history.ts';
import { createSetupView } from './views/setup.ts';
import { applyShareLink, clearConfig, isConfigFixed } from './lib/config.ts';
import { createSettingsButton, createSettingsView } from './views/settings.ts';
import { resetClient } from './lib/supabase.ts';

type TabId = 'liste' | 'middager' | 'uke' | 'historikk';

const TABS: { id: TabId; label: string }[] = [
  { id: 'liste', label: 'Liste' },
  { id: 'middager', label: 'Middager' },
  { id: 'uke', label: 'Uke' },
  { id: 'historikk', label: 'Historikk' },
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
  const state: AppState = { items: [], meals: [], week: [], history: [] };
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
    removeItem: (item: ShoppingItem) => run(() => db.removeItem(item.id)),
    removeChecked: () => run(() => db.removeCheckedItems()),
    addFromHistory: (item: ShoppingItem) => run(() => db.addFromHistory(item)),
    forgetItem: (item: ShoppingItem) => {
      if (!confirm(`Slette «${item.name}» fra historikken for godt?`)) return;
      run(() => db.forgetItem(item.id));
    },
    clearList: () => {
      if (!confirm('Tømme hele handlelista?')) return;
      run(() => db.clearList());
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
    clearWeek: () => run(() => db.clearWeek()),
    goToList: () => setTab('liste'),
  };

  const views = {
    liste: createListView(actions),
    middager: createMealsView(actions),
    uke: createWeekView(actions),
    historikk: createHistoryView(actions),
  } as const;

  const status = el('div', { class: 'status', attrs: { role: 'status' } });
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
      }),
    ]);
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

  function refreshView(): void {
    views[tab].update(state);
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
    const [items, week, history] = await Promise.all([
      db.fetchList(),
      db.fetchWeekPlan(),
      db.fetchHistory(),
    ]);
    state.items = items;
    state.week = week;
    state.history = history;
    refreshView();
  }

  setTab('liste');
  // Et tregt eller feil prosjekt bruker flere sekunder på å feile (klienten
  // prøver på nytt et par ganger), så det må synes at noe skjer.
  showStatus('Kobler til …');

  try {
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
  db.subscribeToChanges(() => {
    void reload().catch(() => showStatus('Mistet kontakt med databasen', true));
  });
}
