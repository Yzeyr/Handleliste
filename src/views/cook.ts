import { el, replaceChildren } from '../dom.ts';
import { suggestMeals } from '../lib/suggest.ts';
import { normalizeName } from '../lib/normalize.ts';
import { formatQuantities } from '../lib/units.ts';
import type { Meal, MealIngredient, ShoppingItem } from '../lib/types.ts';

/**
 * «Hva kan vi lage?» — du skriver det du ser i kjøleskapet, appen svarer.
 *
 * Forslagene over feltet er varer dere har kjøpt nylig, nyest først. Det er
 * ikke en beholdning og later ikke som det er en: det er en snarvei til å
 * slippe å skrive «kyllingfilet» med fingeren. Du bekrefter selv hva du
 * faktisk har.
 */
export interface CookActions {
  close: () => void;
  openMeal: (meal: Meal) => void;
  addMissing: (meal: Meal, missing: readonly MealIngredient[]) => void;
}

export function createCookView(
  meals: readonly Meal[],
  /** Varer dere har kjøpt: arkiverte, og avhukede som fortsatt står på lista. */
  bought: readonly ShoppingItem[],
  actions: CookActions,
): HTMLElement {
  const have: string[] = [];
  const results = el('div', { class: 'cook-results' });
  const chips = el('div', { class: 'cook-chips' });
  const nearby = el('div', { class: 'cook-nearby' });

  const input = el('input', {
    class: 'grow',
    attrs: {
      type: 'text',
      placeholder: 'Kylling, fløte …',
      'aria-label': 'Noe du har',
      autocomplete: 'off',
      enterkeyhint: 'done',
    },
  });

  function add(name: string): void {
    const clean = name.trim();
    if (clean === '') return;
    const key = normalizeName(clean);
    if (have.some((row) => normalizeName(row) === key)) return;
    have.push(clean);
    input.value = '';
    render();
  }

  function remove(name: string): void {
    const index = have.indexOf(name);
    if (index >= 0) have.splice(index, 1);
    render();
  }

  function render(): void {
    replaceChildren(
      chips,
      have.map((name) =>
        el('button', {
          class: 'cook-chip',
          text: `${name} ×`,
          attrs: { type: 'button', 'aria-label': `Fjern ${name}` },
          on: { click: () => remove(name) },
        }),
      ),
    );

    // Nylig kjøpt, nyest først: det du hadde i handleposen i går er det du
    // mest sannsynlig har i kjøleskapet nå.
    //
    // Både arkiverte varer og avhukede på lista. Egne varer blir jo stående
    // på lista etter en handletur — uten dem ville forslagene systematisk
    // bommet på melk og egg, som er nettopp det man har hjemme.
    const taken = new Set(have.map((name) => normalizeName(name)));
    const recent = [...bought]
      .sort((a, b) => b.last_used_at.localeCompare(a.last_used_at))
      .filter((item) => !taken.has(item.normalized_name))
      .slice(0, 12);

    replaceChildren(nearby, [
      have.length === 0 &&
        recent.length > 0 &&
        el('p', { class: 'fine-print', text: 'Nylig kjøpt — trykk på det du har:' }),
      ...recent.map((item) =>
        el('button', {
          class: 'cook-chip ghost-chip',
          text: item.name,
          attrs: { type: 'button' },
          on: { click: () => add(item.name) },
        }),
      ),
    ]);

    const matches = suggestMeals(meals, have);

    if (have.length === 0) {
      replaceChildren(results, [
        el('p', { class: 'empty', text: 'Skriv inn ett par ting, så finner jeg middager som bruker dem.' }),
      ]);
      return;
    }

    if (matches.length === 0) {
      replaceChildren(results, [
        el('p', { class: 'empty', text: 'Ingen av middagene bruker dette. Prøv noe annet.' }),
      ]);
      return;
    }

    replaceChildren(
      results,
      matches.map((match) =>
        el('div', { class: 'cook-hit' }, [
          el('button', {
            class: 'cook-hit-head',
            attrs: { type: 'button', 'aria-label': `Åpne ${match.meal.name}` },
            on: { click: () => actions.openMeal(match.meal) },
          }, [
            el('span', { class: 'meal-emoji', text: match.meal.emoji ?? '🍽️' }),
            el('span', { class: 'cook-hit-text' }, [
              el('span', { class: 'meal-name', text: match.meal.name }),
              el('span', {
                class: 'cook-have',
                text: `bruker ${match.matched.map((i) => i.name.toLowerCase()).join(', ')}`,
              }),
            ]),
          ]),
          match.missing.length === 0
            ? el('p', { class: 'cook-ready', text: 'Du har alt du trenger.' })
            : el('p', {
                class: 'cook-missing',
                text: `Mangler ${match.missing.length}: ${match.missing
                  .map((i) => `${i.name.toLowerCase()}${quantity(i)}`)
                  .join(', ')}`,
              }),
          match.missing.length > 0 &&
            el('button', {
              class: 'outline wide',
              text: `Legg de ${match.missing.length} som mangler i lista`,
              attrs: { type: 'button' },
              on: { click: () => actions.addMissing(match.meal, match.missing) },
            }),
        ]),
      ),
    );
  }

  render();

  return el('section', { class: 'view' }, [
    el('h2', { class: 'view-title', text: 'Hva kan vi lage?' }),
    el('p', {
      class: 'fine-print',
      text: 'Skriv det du ser i kjøleskapet. Appen fører ingen beholdning — den svarer bare på det du oppgir nå.',
    }),
    el(
      'form',
      {
        class: 'row',
        on: {
          submit: (event) => {
            event.preventDefault();
            add(input.value);
          },
        },
      },
      [input, el('button', { class: 'primary', text: 'Legg til', attrs: { type: 'submit' } })],
    ),
    chips,
    nearby,
    results,
    el('button', { class: 'ghost', text: 'Tilbake', attrs: { type: 'button' }, on: { click: actions.close } }),
  ]);
}

function quantity(ingredient: MealIngredient): string {
  if (ingredient.amount === null) return '';
  const text = formatQuantities([
    { amount: ingredient.amount, unit: ingredient.unit ?? 'stk' },
  ]);
  return text === '' ? '' : ` (${text})`;
}
