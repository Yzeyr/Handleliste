import { el, replaceChildren, type View } from '../dom.ts';
import { CATEGORIES, isCategory, type Category, type ShoppingItem } from '../lib/types.ts';
import { formatQuantities } from '../lib/units.ts';
import type { Actions, AppState } from '../state.ts';

/** Rekkefølgen man går gjennom butikken i, ikke alfabetisk. */
const GROUP_ORDER: Category[] = [
  'grønt',
  'kjøtt',
  'fisk',
  'meieri',
  'bakeri',
  'frys',
  'tørrvarer',
  'annet',
];

const COMMON_UNITS = ['stk', 'g', 'kg', 'dl', 'l', 'ml', 'ss', 'ts', 'pk', 'boks', 'pose', 'fedd'];

export function createListView(actions: Actions): View<AppState> {
  const nameInput = el('input', {
    class: 'grow',
    attrs: {
      type: 'text',
      placeholder: 'Legg til vare',
      'aria-label': 'Varenavn',
      autocomplete: 'off',
      list: 'tidligere-varer',
    },
  });
  // Forslag fra historikken mens man skriver — den vanligste måten å hente
  // fram en gammel vare på, uten å bytte fane.
  const nameOptions = el('datalist', { attrs: { id: 'tidligere-varer' } });
  const amountInput = el('input', {
    class: 'amount',
    attrs: { type: 'number', inputmode: 'decimal', step: 'any', min: '0', placeholder: 'Antall', 'aria-label': 'Mengde' },
  });
  const unitInput = el('input', {
    class: 'unit',
    attrs: { type: 'text', list: 'enheter', placeholder: 'Enhet', 'aria-label': 'Enhet', autocomplete: 'off' },
  });
  const unitOptions = el(
    'datalist',
    { attrs: { id: 'enheter' } },
    COMMON_UNITS.map((u) => el('option', { attrs: { value: u } })),
  );
  const categorySelect = el(
    'select',
    { class: 'category', attrs: { 'aria-label': 'Kategori' } },
    CATEGORIES.map((c) => el('option', { text: c, attrs: { value: c, selected: c === 'annet' } })),
  );

  function submit(): void {
    const name = nameInput.value.trim();
    if (name === '') return;
    const rawAmount = amountInput.value.trim().replace(',', '.');
    const amount = rawAmount === '' ? null : Number(rawAmount);
    const category = isCategory(categorySelect.value) ? categorySelect.value : 'annet';
    actions.addManual({
      name,
      amount: amount !== null && Number.isFinite(amount) && amount > 0 ? amount : null,
      unit: unitInput.value,
      category,
    });
    form.classList.remove('open');
    nameInput.value = '';
    amountInput.value = '';
    unitInput.value = '';
    nameInput.focus();
  }

  const details = el('div', { class: 'row details' }, [amountInput, unitInput, categorySelect]);

  const form = el(
    'form',
    {
      class: 'add-form',
      on: {
        submit: (event) => {
          event.preventDefault();
          submit();
        },
        // Mengde/enhet/kategori tar plass fra lista, som er det man faktisk
        // leser i butikken. De folder seg ut når man begynner å skrive.
        focusin: () => form.classList.add('open'),
        focusout: (event) => {
          const next = (event as FocusEvent).relatedTarget;
          if (next instanceof Node && form.contains(next)) return;
          if (nameInput.value.trim() === '') form.classList.remove('open');
        },
      },
    },
    [
      el('div', { class: 'row' }, [nameInput, el('button', { class: 'primary', text: 'Legg til', attrs: { type: 'submit' } })]),
      details,
      unitOptions,
      nameOptions,
    ],
  );

  const body = el('div', { class: 'list-body' });
  const footer = el('div', { class: 'list-footer' });
  const element = el('section', { class: 'view' }, [form, body, footer]);

  function update(state: AppState): void {
    replaceChildren(
      nameOptions,
      state.register.map((item) => el('option', { attrs: { value: item.name } })),
    );

    const groups = GROUP_ORDER.map((category) => ({
      category,
      items: state.items
        .filter((item) => item.category === category)
        // Avhukede synker til bunnen av sin egen gruppe, men blir stående.
        .sort((a, b) => Number(a.checked) - Number(b.checked)),
    })).filter((group) => group.items.length > 0);

    if (groups.length === 0) {
      replaceChildren(body, [
        el('p', { class: 'empty', text: 'Lista er tom. Legg til varer her, eller velg middager under Uke.' }),
      ]);
    } else {
      replaceChildren(
        body,
        groups.map((group) =>
          el('div', { class: 'group' }, [
            el('h2', { class: 'group-title', text: group.category }),
            el('ul', { class: 'items' }, group.items.map((item) => renderItem(item, actions))),
          ]),
        ),
      );
    }

    const checkedCount = state.items.filter((item) => item.checked).length;
    replaceChildren(footer, [
      checkedCount > 0 &&
        el('button', {
          class: 'ghost',
          text: `Fjern avhukede (${checkedCount})`,
          on: { click: () => actions.removeChecked() },
        }),
      state.items.length > 0 &&
        el('button', { class: 'ghost danger', text: 'Tøm lista', on: { click: () => actions.clearList() } }),
    ]);
  }

  return { element, update };
}

function renderItem(item: ShoppingItem, actions: Actions): HTMLElement {
  const quantity = formatQuantities(item.quantities);
  const source = item.source_meals.join(', ');

  return el('li', { class: item.checked ? 'item checked' : 'item' }, [
    el(
      'button',
      {
        class: 'item-tap',
        attrs: { type: 'button', 'aria-pressed': item.checked },
        on: { click: () => actions.toggleChecked(item) },
      },
      [
        el('span', { class: 'tick', text: item.checked ? '✓' : '' }),
        el('span', { class: 'item-main' }, [
          el('span', { class: 'item-line' }, [
            el('span', { class: 'item-name', text: item.name }),
            quantity !== '' && el('span', { class: 'item-qty', text: quantity }),
          ]),
          source !== '' && el('span', { class: 'item-source', text: source }),
        ]),
      ],
    ),
    el('button', {
      class: 'item-remove',
      text: '×',
      attrs: { type: 'button', 'aria-label': `Fjern ${item.name}` },
      on: { click: () => actions.removeItem(item) },
    }),
  ]);
}
