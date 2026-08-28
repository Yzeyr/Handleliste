import { el, replaceChildren, type View } from '../dom.ts';
import type { Meal } from '../lib/types.ts';
import { formatAmount } from '../lib/units.ts';
import type { Actions, AppState } from '../state.ts';

export function createMealsView(actions: Actions): View<AppState> {
  let query = '';
  const expanded = new Set<string>();

  const search = el('input', {
    class: 'search',
    attrs: { type: 'search', placeholder: 'Søk i middager', 'aria-label': 'Søk i middager', autocomplete: 'off' },
    on: {
      input: (event) => {
        query = (event.target as HTMLInputElement).value.toLowerCase().trim();
        render();
      },
    },
  });

  const body = el('div', { class: 'meals-body' });
  const element = el('section', { class: 'view' }, [el('div', { class: 'row' }, [search]), body]);

  let current: AppState = { items: [], meals: [], week: [], register: [] };

  function render(): void {
    const inWeek = new Set(current.week.map((w) => w.meal_id));
    const matches = current.meals.filter((meal) => {
      if (query === '') return true;
      const haystack = `${meal.name} ${meal.description ?? ''} ${meal.tags.join(' ')}`.toLowerCase();
      return haystack.includes(query);
    });

    if (matches.length === 0) {
      replaceChildren(body, [el('p', { class: 'empty', text: 'Ingen middager matcher søket.' })]);
      return;
    }

    replaceChildren(
      body,
      matches.map((meal) => renderMeal(meal, inWeek.has(meal.id), expanded.has(meal.id), actions, () => {
        if (expanded.has(meal.id)) expanded.delete(meal.id);
        else expanded.add(meal.id);
        render();
      })),
    );
  }

  return {
    element,
    update(state) {
      current = state;
      render();
    },
  };
}

function renderMeal(
  meal: Meal,
  inWeek: boolean,
  isExpanded: boolean,
  actions: Actions,
  toggleExpanded: () => void,
): HTMLElement {
  const header = el('button', {
    class: 'meal-header',
    attrs: { type: 'button', 'aria-expanded': isExpanded },
    on: { click: toggleExpanded },
  }, [
    el('span', { class: 'meal-emoji', text: meal.emoji ?? '🍽️' }),
    el('span', { class: 'meal-text' }, [
      el('span', { class: 'meal-name', text: meal.name }),
      meal.description !== null && el('span', { class: 'meal-desc', text: meal.description }),
    ]),
    el('span', { class: 'chevron', text: isExpanded ? '▾' : '▸' }),
  ]);

  const weekButton = el('button', {
    class: inWeek ? 'week-toggle on' : 'week-toggle',
    text: inWeek ? '✓ Uke' : '+ Uke',
    attrs: { type: 'button', 'aria-pressed': inWeek, 'aria-label': `${meal.name} i ukemenyen` },
    on: { click: () => actions.toggleWeekMeal(meal) },
  });

  const details = isExpanded
    ? el('div', { class: 'meal-details' }, [
        el('p', { class: 'meal-meta', text: `${meal.servings} porsjoner` }),
        el('h3', { text: 'Ingredienser' }),
        el(
          'ul',
          { class: 'ingredients' },
          meal.ingredients.map((ingredient) =>
            el('li', {}, [
              el('span', { text: ingredient.name }),
              el('span', {
                class: 'ingredient-amount',
                text:
                  ingredient.amount === null
                    ? 'etter smak'
                    : `${formatAmount(ingredient.amount)} ${ingredient.unit ?? 'stk'}`,
              }),
            ]),
          ),
        ),
        meal.steps.length > 0 && el('h3', { text: 'Slik gjør du' }),
        meal.steps.length > 0 &&
          el('ol', { class: 'steps' }, meal.steps.map((step) => el('li', { text: step }))),
      ])
    : null;

  return el('article', { class: 'meal' }, [
    el('div', { class: 'meal-top' }, [header, weekButton]),
    details,
  ]);
}
