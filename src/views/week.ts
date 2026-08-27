import { el, replaceChildren, type View } from '../dom.ts';
import { itemsFromMeals, planListChange } from '../lib/merge.ts';
import type { Meal } from '../lib/types.ts';
import { formatQuantities } from '../lib/units.ts';
import type { Actions, AppState } from '../state.ts';

export function createWeekView(actions: Actions): View<AppState> {
  const body = el('div', { class: 'week-body' });
  const preview = el('div', { class: 'preview' });
  const footer = el('div', { class: 'list-footer' });
  const element = el('section', { class: 'view' }, [
    el('h2', { class: 'view-title', text: 'Denne uken skal vi ha' }),
    body,
    preview,
    footer,
  ]);

  function update(state: AppState): void {
    const byId = new Map(state.meals.map((meal) => [meal.id, meal]));
    const chosen = state.week
      .map((entry) => ({ entry, meal: byId.get(entry.meal_id) }))
      .filter((row): row is { entry: (typeof state.week)[number]; meal: Meal } => row.meal !== undefined);

    if (chosen.length === 0) {
      replaceChildren(body, [
        el('p', { class: 'empty', text: 'Ingen middager valgt ennå. Gå til Middager og trykk «+ Uke».' }),
      ]);
      replaceChildren(preview, []);
      replaceChildren(footer, []);
      return;
    }

    replaceChildren(
      body,
      [
        el(
          'ul',
          { class: 'week-list' },
          chosen.map(({ entry, meal }) =>
            el('li', { class: 'week-item' }, [
              el('span', { class: 'meal-emoji', text: meal.emoji ?? '🍽️' }),
              el('span', { class: 'week-name', text: meal.name }),
              entry.added_to_list && el('span', { class: 'badge', text: 'lagt til' }),
              el('button', {
                class: 'item-remove',
                text: '×',
                attrs: { type: 'button', 'aria-label': `Fjern ${meal.name} fra ukemenyen` },
                on: { click: () => actions.toggleWeekMeal(meal) },
              }),
            ]),
          ),
        ),
      ],
    );

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
        text: pendingMeals.length === 0 ? 'Alt er lagt til' : `Legg til i handleliste (${pendingMeals.length})`,
        attrs: { type: 'button', disabled: pendingMeals.length === 0 },
        on: { click: () => actions.addWeekToList() },
      }),
      el('button', { class: 'ghost', text: 'Tøm ukemenyen', on: { click: () => actions.clearWeek() } }),
    ]);
  }

  return { element, update };
}
