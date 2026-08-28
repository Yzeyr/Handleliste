import { el, replaceChildren, type View } from '../dom.ts';
import { itemsFromMeals, planListChange } from '../lib/merge.ts';
import { WEEKDAYS, type Meal, type WeekPlanItem } from '../lib/types.ts';
import { formatQuantities } from '../lib/units.ts';
import type { Actions, AppState } from '../state.ts';

/**
 * Ukemenyen, satt opp etter dager i stedet for som en pose middager.
 *
 * Dagene ligger der hele tiden, også de tomme: spørsmålet man sitter med er
 * «hva spiser vi på torsdag», ikke «hvilke fire middager har vi valgt». En tom
 * rad er en del av svaret.
 *
 * Valget skjer i en vanlig nedtrekksliste. På telefon gir det systemets egen
 * hjulvelger — større trykkflate og kjent oppførsel enn noe egenbygd, og
 * ingenting nytt å lære.
 */
export function createWeekView(actions: Actions): View<AppState> {
  const days = el('ul', { class: 'day-list' });
  const loose = el('div', { class: 'loose' });
  const preview = el('div', { class: 'preview' });
  const footer = el('div', { class: 'list-footer' });
  const element = el('section', { class: 'view' }, [
    el('h2', { class: 'view-title', text: 'Denne uken' }),
    days,
    loose,
    preview,
    footer,
  ]);

  function update(state: AppState): void {
    const byId = new Map(state.meals.map((meal) => [meal.id, meal]));
    const chosen = state.week
      .map((entry) => ({ entry, meal: byId.get(entry.meal_id) }))
      .filter((row): row is { entry: WeekPlanItem; meal: Meal } => row.meal !== undefined);

    const onDay = new Map(
      chosen.filter(({ entry }) => entry.weekday !== null).map(({ entry, meal }) => [entry.weekday, { entry, meal }]),
    );

    replaceChildren(
      days,
      WEEKDAYS.map(({ day, name }) => {
        const taken = onDay.get(day);
        return el('li', { class: taken === undefined ? 'day-row empty' : 'day-row' }, [
          el('span', { class: 'day-name', text: name }),
          mealPicker(state.meals, taken?.meal ?? null, (meal) => {
            // «—» betyr at vi ikke spiser den, ikke at den flyttes til en
            // haug uten dag. Det er det tomvalget ser ut som.
            if (meal === null && taken !== undefined) actions.toggleWeekMeal(taken.meal);
            else if (meal !== null) actions.setWeekday(meal, day);
          }),
          taken !== undefined &&
            taken.entry.added_to_list &&
            el('span', { class: 'badge', text: 'lagt til' }),
        ]);
      }),
    );

    // Middager valgt med «+ Uke» inne på Middager har ingen dag ennå. De skal
    // ikke bli usynlige bare fordi de mangler et felt.
    const uten = chosen.filter(({ entry }) => entry.weekday === null);
    replaceChildren(loose, [
      uten.length > 0 && el('h3', { class: 'loose-title', text: 'Uten dag' }),
      uten.length > 0 &&
        el(
          'ul',
          { class: 'day-list' },
          uten.map(({ entry, meal }) =>
            el('li', { class: 'day-row' }, [
              el('span', { class: 'day-name' }, [
                el('span', { class: 'meal-emoji', text: meal.emoji ?? '🍽️' }),
                el('span', { text: meal.name }),
              ]),
              dayPicker(entry.weekday, (day) => actions.setWeekday(meal, day)),
              el('button', {
                class: 'item-remove',
                text: '×',
                attrs: { type: 'button', 'aria-label': `Fjern ${meal.name} fra ukemenyen` },
                on: { click: () => actions.toggleWeekMeal(meal) },
              }),
            ]),
          ),
        ),
    ]);

    if (chosen.length === 0) {
      replaceChildren(preview, []);
      replaceChildren(footer, [
        el('p', {
          class: 'empty',
          text: 'Velg en middag på hver dag dere vil planlegge. Resten kan stå tomme.',
        }),
      ]);
      return;
    }

    // Forhåndsvisning av nøyaktig de linjene knappen kommer til å skrive,
    // regnet ut med samme funksjoner som gjør selve skrivingen.
    const pendingMeals = chosen.filter(({ entry }) => !entry.added_to_list).map(({ meal }) => meal);
    const change = planListChange(state.items, itemsFromMeals(pendingMeals));
    const changedLines = [
      ...change.updates.map((update) => ({
        name: update.item.name,
        from: formatQuantities(update.item.quantities),
        to: formatQuantities(update.quantities),
      })),
      ...change.inserts.map((insert) => ({
        name: insert.name,
        from: '',
        to: formatQuantities(insert.quantities),
      })),
    ];

    replaceChildren(preview, [
      changedLines.length > 0 &&
        el('h3', { class: 'preview-title', text: `Dette legges til (${changedLines.length} varer)` }),
      changedLines.length > 0 &&
        el(
          'ul',
          { class: 'preview-list' },
          changedLines.map((line) =>
            el('li', {}, [
              el('span', { text: line.name }),
              el('span', { class: 'preview-qty' }, [
                line.from !== '' && el('span', { class: 'was', text: line.from }),
                line.from !== '' && el('span', { class: 'arrow', text: '→' }),
                el('span', { text: line.to !== '' ? line.to : '—' }),
              ]),
            ]),
          ),
        ),
    ]);

    replaceChildren(footer, [
      el('button', {
        class: 'primary wide',
        text:
          changedLines.length === 0
            ? 'Alt er lagt til'
            : `Handle alt · ${changedLines.length} ${changedLines.length === 1 ? 'vare' : 'varer'}`,
        attrs: { type: 'button', disabled: pendingMeals.length === 0 },
        on: { click: () => actions.addWeekToList() },
      }),
      el('button', { class: 'ghost', text: 'Tøm ukemenyen', on: { click: () => actions.clearWeek() } }),
    ]);
  }

  return { element, update };
}

/** Nedtrekk over alle middagene, med tomvalget først. */
function mealPicker(
  meals: readonly Meal[],
  current: Meal | null,
  onPick: (meal: Meal | null) => void,
): HTMLElement {
  const select = el(
    'select',
    {
      class: current === null ? 'day-pick empty' : 'day-pick',
      attrs: { 'aria-label': 'Middag' },
      on: {
        change: () => onPick(meals.find((meal) => meal.id === select.value) ?? null),
      },
    },
    [
      el('option', { text: '—', attrs: { value: '', selected: current === null } }),
      ...meals.map((meal) =>
        el('option', {
          text: `${meal.emoji ?? '🍽️'} ${meal.name}`,
          attrs: { value: meal.id, selected: current?.id === meal.id },
        }),
      ),
    ],
  );
  return select;
}

/** Nedtrekk over ukedagene, for en middag som ennå ikke har fått en. */
function dayPicker(current: number | null, onPick: (day: number | null) => void): HTMLElement {
  const select = el(
    'select',
    {
      class: 'day-pick',
      attrs: { 'aria-label': 'Ukedag' },
      on: { change: () => onPick(select.value === '' ? null : Number(select.value)) },
    },
    [
      el('option', { text: 'Velg dag', attrs: { value: '', selected: current === null } }),
      ...WEEKDAYS.map(({ day, name }) =>
        el('option', { text: name, attrs: { value: String(day), selected: current === day } }),
      ),
    ],
  );
  return select;
}
