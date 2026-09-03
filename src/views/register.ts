import { el, replaceChildren, type View } from '../dom.ts';
import type { Meal, Quantity, ShoppingItem } from '../lib/types.ts';
import { describeLastBought, mealsUsing } from '../lib/facts.ts';
import { COMMON_UNITS, formatAmount, formatQuantities, normalizeUnit, parseAmount } from '../lib/units.ts';
import type { Actions, AppState } from '../state.ts';

/**
 * Vareregisteret: alt som har vært på lista før, mest brukte først. På en
 * handleliste er "det vi alltid kjøper" mer nyttig enn "det vi kjøpte sist".
 *
 * Raden husker mengden fra sist, så den vanlige veien er ett trykk på «+».
 * Trenger du en annen mengde, åpner du raden og justerer.
 */
export function createRegisterView(actions: Actions): View<AppState> {
  let query = '';
  const open = new Set<string>();

  const search = el('input', {
    class: 'search',
    attrs: { type: 'search', placeholder: 'Søk i varer', 'aria-label': 'Søk i varer', autocomplete: 'off' },
    on: {
      input: (event) => {
        query = (event.target as HTMLInputElement).value.toLowerCase().trim();
        render();
      },
    },
  });

  const body = el('div', { class: 'list-body' });
  const element = el('section', { class: 'view' }, [
    el('div', { class: 'row' }, [search]),
    body,
    el(
      'datalist',
      { attrs: { id: 'register-enheter' } },
      COMMON_UNITS.map((u) => el('option', { attrs: { value: u } })),
    ),
  ]);

  let current: AppState = { items: [], meals: [], week: [], register: [], unseen: new Set(), aliases: [], pushTargets: [], servings: null };

  function render(): void {
    const matches = current.register.filter(
      (item) => query === '' || item.name.toLowerCase().includes(query),
    );

    if (matches.length === 0) {
      replaceChildren(body, [
        el('p', {
          class: 'empty',
          text:
            current.register.length === 0
              ? 'Tomt ennå. Varer havner her når du fjerner dem fra lista, og kan legges tilbake med ett trykk.'
              : 'Ingen varer matcher søket.',
        }),
      ]);
      return;
    }

    replaceChildren(body, [
      el(
        'ul',
        { class: 'items' },
        matches.map((item) =>
          renderRow(item, current.meals, open.has(item.id), actions, () => {
            if (open.has(item.id)) open.delete(item.id);
            else open.add(item.id);
            render();
          }),
        ),
      ),
    ]);
  }

  return {
    element,
    update(state) {
      current = state;
      render();
    },
  };
}

/** Mengden raden husker fra sist, som noe man kan skrive videre på. */
function lastQuantity(item: ShoppingItem): { amount: string; unit: string } {
  const first = item.quantities[0];
  if (first === undefined) return { amount: '', unit: '' };
  return { amount: formatAmount(first.amount), unit: first.unit };
}

function renderRow(
  item: ShoppingItem,
  meals: readonly Meal[],
  isOpen: boolean,
  actions: Actions,
  toggleOpen: () => void,
): HTMLElement {
  const remembered = lastQuantity(item);
  const summary = formatQuantities(item.quantities);

  const amountInput = el('input', {
    class: 'amount',
    attrs: {
      type: 'text',
      inputmode: 'decimal',
      placeholder: 'Antall',
      'aria-label': `Antall ${item.name}`,
      value: remembered.amount,
    },
  });
  const unitInput = el('input', {
    class: 'unit',
    attrs: {
      type: 'text',
      list: 'register-enheter',
      placeholder: 'Enhet',
      'aria-label': `Enhet for ${item.name}`,
      autocomplete: 'off',
      value: remembered.unit,
    },
  });

  function chosenQuantity(): Quantity[] {
    const amount = parseAmount(amountInput.value);
    if (amount === null) return [];
    return [{ amount, unit: normalizeUnit(unitInput.value) }];
  }

  const sist = describeLastBought(item.last_used_at);
  const brukesI = mealsUsing(item, meals);

  const details = isOpen
    ? el('div', { class: 'register-details' }, [
        // Bare det appen vet sikkert, og bare det som ikke allerede står i
        // raden over — mengden og antall ganger er synlige der.
        // Ingen «du burde kjøpe denne nå».
        (sist !== null || brukesI.length > 0) &&
          el('dl', { class: 'facts' }, [
            sist !== null && el('dt', { text: 'Sist kjøpt' }),
            sist !== null && el('dd', { text: sist }),
            brukesI.length > 0 && el('dt', { text: 'Brukes i' }),
            brukesI.length > 0 && el('dd', { text: brukesI.join(', ') }),
          ]),
        el('div', { class: 'row' }, [
          amountInput,
          unitInput,
          el('button', {
            class: 'primary',
            text: 'Legg til',
            attrs: { type: 'button' },
            on: { click: () => actions.addFromRegister(item, chosenQuantity()) },
          }),
        ]),
        el('button', {
          class: 'ghost danger',
          text: 'Slett fra varene',
          attrs: { type: 'button' },
          on: { click: () => actions.forgetItem(item) },
        }),
      ])
    : null;

  return el('li', { class: isOpen ? 'item open' : 'item' }, [
    el('div', { class: 'item-row' }, [
      el(
        'button',
        {
          class: 'item-tap',
          attrs: { type: 'button', 'aria-expanded': isOpen, 'aria-label': `Endre mengde for ${item.name}` },
          on: { click: toggleOpen },
        },
        [
          el('span', { class: 'item-main' }, [
            el('span', { class: 'item-line' }, [
              el('span', { class: 'item-name', text: item.name }),
              summary !== '' && el('span', { class: 'item-qty', text: summary }),
            ]),
            el('span', {
              class: 'item-source',
              text:
                item.use_count === 1
                  ? item.category
                  : `${item.category} · kjøpt ${item.use_count} ganger`,
            }),
          ]),
        ],
      ),
      el('button', {
        class: 'quick-add',
        text: '+',
        attrs: { type: 'button', 'aria-label': `Legg ${item.name} på lista` },
        on: { click: () => actions.addFromRegister(item, item.quantities) },
      }),
    ]),
    details,
  ]);
}
