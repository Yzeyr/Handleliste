import { el, replaceChildren } from './dom.ts';
import * as db from './lib/db.ts';
import * as store from './lib/offlineStore.ts';
import { itemsFromMeals, mergePending } from './lib/merge.ts';
import { isCategory, type Meal, type MealDraft, type Quantity, type ShoppingItem } from './lib/types.ts';
import type { Actions, AppState } from './state.ts';
import { createListView } from './views/list.ts';
import { createMealsView } from './views/meals.ts';
import { createWeekView } from './views/week.ts';
import { createRegisterView } from './views/register.ts';
import { createShoppingView } from './views/shopping.ts';
import { createMealEditor } from './views/mealEditor.ts';
import { createPasteRecipeView } from './views/pasteRecipe.ts';
import { normalizeName, setRuntimeAliases } from './lib/normalize.ts';
import { parseIngredientLine } from './lib/parseRecipe.ts';
import { categoryForName } from './lib/facts.ts';
import { watchForAppUpdate } from './lib/appUpdate.ts';
import { normalizeUnit } from './lib/units.ts';
import type { Intent } from './lib/intent.ts';
import { clearLabel, planClear } from './lib/clearing.ts';
import { createSetupView } from './views/setup.ts';
import { createCardsView } from './views/cards.ts';
import {
  applyShareLink,
  clearConfig,
  deviceId,
  deviceName,
  isConfigFixed,
  lastSeenAt,
  markSeenNow,
  pushTopic,
  setPushTopic,
} from './lib/config.ts';
import { freshTopic, sendTest } from './lib/push.ts';
import { describeChange, summarizeChanges, type ChangeEvent } from './lib/changes.ts';
import { createSettingsButton, createSettingsView } from './views/settings.ts';
import { resetClient } from './lib/supabase.ts';

type TabId = 'liste' | 'middager' | 'uke' | 'varer';

const SHOPPING_KEY = 'handleliste.handlemodus';

function readShoppingMode(): boolean {
  try {
    return window.localStorage.getItem(SHOPPING_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Holder skjermen våken mens man handler. En telefon som låser seg mellom
 * hver vare er den raskeste måten å gjøre en handleliste ubrukelig på.
 * Støttes ikke overalt, og det er helt greit — da oppfører den seg som før.
 */
let screenLock: { release: () => Promise<void> } | null = null;

async function keepScreenAwake(): Promise<void> {
  try {
    const anyNavigator = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };
    if (anyNavigator.wakeLock === undefined) return;
    screenLock = await anyNavigator.wakeLock.request('screen');
  } catch {
    screenLock = null;
  }
}

function releaseScreenLock(): void {
  void screenLock?.release().catch(() => undefined);
  screenLock = null;
}

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

// Er appen allerede åpen på samme adresse, bytter et trykk på delingslenka
// bare fragmentet — nettleseren laster ikke siden på nytt, og oppsettet ville
// blitt liggende ubrukt. Da starter vi på nytt selv.
window.addEventListener('hashchange', () => {
  if (applyShareLink()) window.location.reload();
});

// Service worker: appen skal laste uten nett, og si fra når den er oppdatert.
// Registreres etter første tegning, så den ikke konkurrerer om oppstarten.
window.addEventListener('load', () => {
  watchForAppUpdate({
    onAvailable: (install) => showUpdateBar(install),
  });
});

/**
 * Baren står til den blir trykket. En oppdatering er ikke noe hastverk, men
 * den skal heller ikke forsvinne av seg selv slik varsler gjør — da ville du
 * aldri fått den nye utgaven før du lukket appen helt.
 */
function showUpdateBar(install: () => void): void {
  const existing = document.querySelector('.update-bar');
  if (existing !== null) return;

  const bar = el('div', { class: 'update-bar', attrs: { role: 'status' } }, [
    el('span', { text: 'Appen er oppdatert' }),
    el('button', {
      class: 'update-load',
      text: 'Last inn',
      attrs: { type: 'button' },
      on: { click: install },
    }),
  ]);
  document.querySelector('.app-header')?.after(bar);
}
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

/** «Oppdatert 16:04» — kvitteringen på at knappen faktisk gjorde noe. */
function clockNow(): string {
  return new Date().toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
}

async function start(container: HTMLElement): Promise<void> {
  const state: AppState = {
    items: [],
    meals: [],
    week: [],
    register: [],
    unseen: new Set(),
    aliases: [],
    pushTargets: [],
  };
  let tab: TabId = 'liste';

  const actions: Actions = {
    addManual: (input) =>
      queue(() => {
        const name = input.name.trim();
        if (name === '') return null;
        const quantities =
          input.amount === null ? [] : [{ amount: input.amount, unit: normalizeUnit(input.unit) }];
        return {
          kind: 'addPending',
          pending: [
            {
              normalizedName: normalizeName(name),
              name,
              quantities,
              category: isCategory(input.category) ? input.category : 'annet',
              sourceMeals: [],
            },
          ],
          newIds: [crypto.randomUUID()],
          mealIds: [],
        };
      }),
    /**
     * En hel ingrediensliste limt inn i skrivefeltet. Linjer som ikke har en
     * mengde tas med som de er — «brød» er en gyldig handlelinje.
     */
    addPastedLines: (lines: readonly string[]) =>
      queue(() => {
        const pending = mergePending(
          lines.flatMap((line) => {
            const text = line.trim();
            if (text === '') return [];
            const parsed = parseIngredientLine(text);
            const name = parsed?.name ?? text.charAt(0).toUpperCase() + text.slice(1);
            return [
              {
                normalizedName: normalizeName(name),
                name,
                quantities:
                  parsed?.amount == null
                    ? []
                    : [{ amount: parsed.amount, unit: normalizeUnit(parsed.unit ?? 'stk') }],
                category: categoryForName(name, state.items.concat(state.register)),
                sourceMeals: [] as string[],
              },
            ];
          }),
        );
        if (pending.length === 0) return null;
        return {
          kind: 'addPending',
          pending,
          newIds: pending.map(() => crypto.randomUUID()),
          mealIds: [],
        };
      }),
    toggleChecked: (item: ShoppingItem) =>
      queue(() => ({ kind: 'setChecked', id: item.id, checked: !item.checked })),
    removeItem: (item: ShoppingItem) =>
      queueUndoable(`${item.name} fjernet`, { kind: 'archive', ids: [item.id] }, [item]),
    removeChecked: () => clear(state.items.filter((item) => item.checked)),
    addFromRegister: (item: ShoppingItem, quantities: Quantity[]) =>
      queue(() => ({ kind: 'revive', id: item.id, quantities })),
    forgetItem: (item: ShoppingItem) =>
      queueUndoable(`${item.name} slettet`, { kind: 'forget', id: item.id }, [item]),
    clearList: () => clear([...state.items]),
    toggleWeekMeal: (meal: Meal) => {
      const inWeek = state.week.some((entry) => entry.meal_id === meal.id);
      queue(() =>
        inWeek
          ? { kind: 'weekRemove', mealId: meal.id }
          : { kind: 'weekAdd', mealId: meal.id, id: crypto.randomUUID(), weekday: null },
      );
    },
    setWeekday: (meal: Meal, weekday: number | null) => {
      const inWeek = state.week.some((entry) => entry.meal_id === meal.id);
      queue(() =>
        inWeek
          ? { kind: 'weekSetDay', mealId: meal.id, weekday }
          : { kind: 'weekAdd', mealId: meal.id, id: crypto.randomUUID(), weekday },
      );
    },
    addWeekToList: () => {
      const byId = new Map(state.meals.map((meal) => [meal.id, meal]));
      const chosen = state.week
        .filter((entry) => !entry.added_to_list)
        .map((entry) => byId.get(entry.meal_id))
        .filter((meal): meal is Meal => meal !== undefined);
      if (chosen.length === 0) return;

      const pending = itemsFromMeals(chosen);
      queue(() => ({
        kind: 'addPending',
        pending,
        newIds: pending.map(() => crypto.randomUUID()),
        mealIds: chosen.map((meal) => meal.id),
      }));
      setTab('liste');
      showStatus(`${pending.length} varer lagt til fra ${chosen.length} middager`);
    },
    clearWeek: () => {
      const affected = [...state.week];
      if (affected.length === 0) return;
      queueUndoable('Ukemenyen tømt', { kind: 'weekSet', entries: [] }, [], {
        kind: 'weekSet',
        entries: affected,
      });
    },
    editItem: (item, patch) => queue(() => ({ kind: 'edit', id: item.id, patch })),
    addAlias: (alias: string, canonical: string) =>
      run(async () => {
        if (!store.isOnline()) throw new Error('Synonymer kan bare endres når du har nett');
        await db.addAlias(alias, canonical);
        await refreshAliases();
        showSettings();
      }),
    removeAlias: (alias: string) =>
      run(async () => {
        if (!store.isOnline()) throw new Error('Synonymer kan bare endres når du har nett');
        await db.removeAlias(alias);
        await refreshAliases();
        showSettings();
      }),
    // Én middag rett i lista, uten å gå veien om ukemenyen. Ukemenyen er for
    // planlegging; dette er for «vi tar taco i kveld».
    addMealToList: (meal: Meal) => {
      const pending = itemsFromMeals([meal]);
      queue(() => ({
        kind: 'addPending',
        pending,
        newIds: pending.map(() => crypto.randomUUID()),
        mealIds: [],
      }));
      setTab('liste');
      showStatus(`${pending.length} varer lagt til fra ${meal.name}`);
    },
    editMeal: (meal: Meal | null) => showMealEditor(meal),
    pasteRecipe: () => showPasteRecipe(),
    // Oppskrifter og synonymer legges ikke i offline-køen. De endres sjelden,
    // og aldri midt i en butikk — å si det rett ut er bedre enn å late som
    // det gikk og så sende det senere.
    saveMeal: (draft: MealDraft) =>
      run(async () => {
        if (!store.isOnline()) throw new Error('Middager kan bare endres når du har nett');
        await db.saveMeal(draft);
        await store.refreshMeals();
        setTab('middager');
        showStatus('Middagen er lagret');
      }),
    deleteMeal: (meal: Meal) =>
      run(async () => {
        if (!store.isOnline()) throw new Error('Middager kan bare endres når du har nett');
        await db.deleteMeal(meal.id);
        await store.refreshMeals();
        setTab('middager');
        showStatus(`${meal.name} slettet`);
      }),
    goToList: () => setTab('liste'),
    startShopping: () => setShopping(true),
    showCards: () => showCards(),
  };

  const shoppingView = createShoppingView(actions, () => setShopping(false));

  const views = {
    liste: createListView(actions),
    middager: createMealsView(actions),
    uke: createWeekView(actions),
    varer: createRegisterView(actions),
  } as const;

  const status = el('div', { class: 'status', attrs: { role: 'status' } });
  const connection = el('div', { class: 'connection', attrs: { role: 'status' } });
  const toast = el('div', { class: 'toast', attrs: { role: 'status', 'aria-live': 'polite' } });

  // Frosset ved oppstart: alt som er endret av den andre etter dette
  // tidspunktet markeres helt til appen lukkes igjen.
  const seenBefore = lastSeenAt();
  const content = el('main', { class: 'content' });
  const settingsButton = createSettingsButton(() => showSettings());
  const refreshButton = el('button', {
    class: 'settings-button refresh-button',
    text: '\u21bb',
    attrs: { type: 'button', 'aria-label': 'Hent lista p\u00e5 nytt' },
    on: { click: () => void refreshNow() },
  });
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
      refreshButton,
      settingsButton,
    ]),
    connection,
    content,
    toast,
    tabBar,
  ]);

  /**
   * Kortene ligger på samme nivå som innstillinger — utenfor fanene, siden de
   * ikke er en del av lista. «Tilbake» går dit du kom fra, også når det var
   * handlemodus.
   */
  function showCards(): void {
    const wasShopping = shopping;
    for (const button of tabBar.querySelectorAll('.tab')) button.classList.remove('active');
    replaceChildren(content, [
      createCardsView(() => {
        if (wasShopping) setShopping(true);
        else setTab(tab);
      }),
    ]);
    content.scrollTo({ top: 0 });
  }

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
        enablePush: () =>
          run(async () => {
            const topic = pushTopic() ?? freshTopic();
            setPushTopic(topic);
            await db.registerPushTarget(topic);
            await store.refreshPushTargets();
            showSettings();
          }),
        disablePush: () =>
          run(async () => {
            await db.removePushTarget();
            setPushTopic(null);
            await store.refreshPushTargets();
            showSettings();
          }),
        testPush: () =>
          run(async () => {
            const topic = pushTopic();
            if (topic === null) return;
            const ok = await sendTest(topic);
            showStatus(
              ok
                ? 'Testvarsel sendt. Sjekk ntfy.'
                : 'Fikk ikke sendt. Har telefonen nett?',
              !ok,
            );
          }),
        // Hvem som allerede får varsler, så man ser om det er satt opp.
        otherReceivers: state.pushTargets
          .filter((target) => target.device_id !== deviceId())
          .map((target) => target.label ?? 'En telefon'),
      }),
    ]);
  }

  let toastTimer: number | undefined;
  let pending: string[] = [];

  /**
   * Legger en handling i køen: skrives lokalt med en gang, sendes når det er
   * nett. Det er dette som gjør at appen virker i en butikk uten dekning.
   */
  function queue(build: () => Intent | null): void {
    try {
      const intent = build();
      if (intent === null) return;
      store.apply(intent);
      readFromStore();
    } catch (error) {
      showStatus(error instanceof Error ? error.message : 'Noe gikk galt', true);
    }
  }

  /**
   * «Fjern avhukede» og «Tøm lista» gjør samme jobb på hvert sitt utvalg.
   * Selve regelen ligger i clearing.ts, uten DOM rundt seg.
   */
  function clear(candidates: ShoppingItem[]): void {
    const { remove, kept, uncheck } = planClear(candidates);
    if (remove.length === 0 && uncheck.length === 0) {
      // Alt som sto der var faste og uhakede. Da skjer det ingenting — men
      // «jeg trykket og ingenting skjedde» trenger et svar.
      if (kept.length > 0) showStatus(clearLabel(0, kept.length));
      return;
    }

    // Radene tas vare på slik de var før: angre skal både hente tilbake de
    // fjernede og sette haken tilbake på de faste.
    const before = [...remove, ...uncheck].map((item) => ({ ...item }));

    if (remove.length > 0) queue(() => ({ kind: 'archive', ids: remove.map((item) => item.id) }));
    for (const item of uncheck) {
      queue(() => ({ kind: 'setChecked', id: item.id, checked: false, quiet: true }));
    }

    offerUndo(clearLabel(remove.length, kept.length), async () => {
      store.apply({ kind: 'restore', items: before });
      readFromStore();
    });
  }

  /** Som `queue`, men med en angre-knapp i noen sekunder etterpå. */
  function queueUndoable(
    label: string,
    intent: Intent,
    affected: ShoppingItem[],
    undoIntent?: Intent,
  ): void {
    queue(() => intent);
    offerUndo(label, async () => {
      store.apply(undoIntent ?? { kind: 'restore', items: affected });
      readFromStore();
    });
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

  let shopping = readShoppingMode();

  /**
   * Handlemodus overtar hele skjermen. Den lagres på telefonen, så en
   * omlasting midt i butikken ikke kaster deg ut av den.
   */
  function setShopping(on: boolean): void {
    shopping = on;
    try {
      if (on) window.localStorage.setItem(SHOPPING_KEY, '1');
      else window.localStorage.removeItem(SHOPPING_KEY);
    } catch {
      /* uten lagring virker modusen fortsatt, den bare glemmes ved omlasting */
    }
    container.classList.toggle('shopping-mode', on);
    if (on) {
      void keepScreenAwake();
      replaceChildren(content, [shoppingView.element]);
      shoppingView.update(state);
      content.scrollTo({ top: 0 });
    } else {
      releaseScreenLock();
      setTab(tab);
    }
  }

  function setTab(next: TabId): void {
    if (shopping) return;
    tab = next;
    for (const button of tabBar.querySelectorAll('.tab')) {
      button.classList.toggle('active', button.getAttribute('data-tab') === tab);
    }
    replaceChildren(content, [views[tab].element]);
    views[tab].update(state);
    content.scrollTo({ top: 0 });
  }

  function showPasteRecipe(): void {
    for (const button of tabBar.querySelectorAll('.tab')) button.classList.remove('active');
    replaceChildren(content, [
      createPasteRecipeView({
        // Utkastet går rett inn i det vanlige skjemaet. Ingen egen
        // lagringsvei for importerte oppskrifter — én vei inn, ett sted å
        // rette feil.
        parsed: (draft, uncertain) => showMealEditor(null, draft, uncertain),
        close: () => setTab('middager'),
      }),
    ]);
    content.scrollTo({ top: 0 });
  }

  function showMealEditor(meal: Meal | null, draft?: MealDraft, uncertain = 0): void {
    for (const button of tabBar.querySelectorAll('.tab')) button.classList.remove('active');
    replaceChildren(content, [
      createMealEditor(meal, draft, uncertain, {
        save: actions.saveMeal,
        remove: actions.deleteMeal,
        close: () => setTab('middager'),
      }),
    ]);
    content.scrollTo({ top: 0 });
  }

  /**
   * Synonymene må inn i normalizeName før noe slås sammen. De ligger lagret
   * på telefonen også, så sammenslåingen blir den samme uten nett.
   */
  function useAliases(list: { alias: string; canonical: string }[]): void {
    state.aliases = list;
    setRuntimeAliases(list);
  }

  async function refreshAliases(): Promise<void> {
    useAliases(await store.refreshAliases());
  }

  function refreshView(): void {
    if (shopping) shoppingView.update(state);
    else views[tab].update(state);
  }

  /** Fyller skjermtilstanden fra den lokale kopien. Ingen nettverk her. */
  function readFromStore(): void {
    state.items = store.listItems();
    state.register = store.registerItems();
    state.week = store.weekItems();
    state.meals = store.allMeals();
    state.unseen = unseenIds();
    markSeenNow();
    showConnection();
    refreshView();
  }

  function showConnection(): void {
    const info = store.status();
    // En endring databasen sa nei til ble kastet fra køen. Uten dette skjedde
    // det i stillhet: du så endringen på skjermen, og så var den borte igjen.
    const rejected = store.takeLastError();
    if (rejected !== null) showStatus(`Ikke lagret: ${rejected}`, true);
    connection.classList.toggle('visible', !info.online || info.queued > 0);
    if (!info.online) {
      connection.textContent =
        info.queued > 0
          ? `Uten nett — ${store.pendingSummary()}`
          : 'Uten nett. Lista er den du så sist, og endringer sendes når nettet er tilbake.';
    } else if (info.queued > 0) {
      connection.textContent = store.pendingSummary() ?? '';
    } else {
      connection.textContent = '';
    }
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
    try {
      await store.refreshFromServer();
    } catch (error) {
      // Uten nett er den lokale kopien det vi har, og den er allerede tegnet.
      if (store.isOnline()) throw error;
    }
    readFromStore();
  }

  /**
   * «Er lista faktisk oppdatert?» — spørsmålet realtime ikke kan svare på,
   * fordi en telefon som har ligget i lomma har mistet forbindelsen uten å si
   * fra. Knappen henter alt på nytt og sier hva klokka var, for en
   * oppdateringsknapp uten kvittering gjør deg ikke sikrere enn før.
   */
  let refreshing = false;
  async function refreshNow(): Promise<void> {
    if (refreshing) return;
    refreshing = true;
    refreshButton.classList.add('spinning');
    refreshButton.disabled = true;
    try {
      if (!store.isOnline()) {
        showStatus('Uten nett — henter så snart nettet er tilbake');
        return;
      }
      // Snurren må vare lenge nok til å sees. Uten den leser et raskt svar
      // som at ingenting skjedde.
      await Promise.all([
        (async () => {
          await store.flush();
          await store.refreshFromServer({ meals: true });
          readFromStore();
        })(),
        new Promise((done) => window.setTimeout(done, 450)),
      ]);
      showStatus(`Oppdatert ${clockNow()}`);
    } catch {
      showStatus('Fikk ikke kontakt — viser lista slik den var', true);
    } finally {
      refreshing = false;
      refreshButton.classList.remove('spinning');
      refreshButton.disabled = false;
    }
  }

  // Samme problem, løst automatisk: når appen hentes fram igjen er
  // realtime-forbindelsen som regel død etter tiden i lomma.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    void reload().catch(() => {
      /* banneret sier allerede fra om nettet */
    });
  });

  // Fra telefonen først: lista er på skjermen før noe nettverk er forsøkt.
  store.loadFromDevice();
  store.watchConnection();
  store.subscribe(readFromStore);
  setTab('liste');
  if (shopping) setShopping(true);
  readFromStore();

  useAliases(store.allAliases());

  const hadNothing = state.items.length === 0 && state.meals.length === 0;
  if (hadNothing) showStatus('Kobler til …');

  // Synonymene og varselkanalene er greie å ha, men ingen grunn til å stoppe
  // oppstarten for.
  try {
    await refreshAliases();
  } catch {
    /* beholder de lagrede */
  }
  try {
    await store.refreshPushTargets();
  } catch {
    /* beholder de lagrede */
  }

  try {
    await store.refreshFromServer({ meals: true });
    await store.flush();
    readFromStore();
  } catch (error) {
    readFromStore();
    // Har vi noe lagret fra sist, er det bedre å vise det enn en feilskjerm.
    // Banneret sier allerede at vi er uten nett. Feilskjermen er bare riktig
    // når vi står helt tomme og problemet ikke er dekningen.
    if (!hadNothing || !store.isOnline()) return;
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
  // Én handletur er tretti avhukinger, og hver av dem er en hendelse her.
  // Uten denne pausen ble det tretti fulle henting-runder per telefon, i en
  // butikk med dårlig dekning. Endringene kommer uansett samlet i den siste.
  let reloadTimer: number | undefined;
  db.subscribeToChanges((event: ChangeEvent | null) => {
    if (event !== null) {
      const message = describeChange(event, deviceName());
      if (message !== null) announce(message);
    }
    window.clearTimeout(reloadTimer);
    reloadTimer = window.setTimeout(() => {
      void reload().catch(() => showStatus('Mistet kontakt med databasen', true));
    }, 400);
  });
}
