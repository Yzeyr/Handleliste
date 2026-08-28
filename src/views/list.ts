import { el, replaceChildren, type View } from '../dom.ts';
import { CATEGORIES, isCategory, type Category, type Quantity, type ShoppingItem } from '../lib/types.ts';
import { formatAmount, formatQuantities, normalizeUnit } from '../lib/units.ts';
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
  // Hvilke rader som står åpne for redigering. Holdes utenfor tegningen, så
  // en oppdatering fra den andre telefonen ikke lukker et skjema du står i.
  const open = new Set<string>();

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
        // leser i butikken. De folder seg ut når man begynner å skrive, og
        // igjen når varen er lagt til.
        //
        // De folder seg bevisst IKKE sammen når fokus forlater skjemaet: da
        // ville lista hoppet oppover mellom at fingeren går ned og opp, og
        // trykket havnet på feil rad — eller forsvant helt.
        focusin: () => form.classList.add('open'),
      },
    },
    [
      el('div', { class: 'row' }, [nameInput, el('button', { class: 'primary', text: 'Legg til', attrs: { type: 'submit' } })]),
      details,
      unitOptions,
      nameOptions,
    ],
  );

  const banner = el('div');
  const body = el('div', { class: 'list-body' });
  const footer = el('div', { class: 'list-footer' });
  const element = el('section', { class: 'view' }, [form, banner, body, footer]);

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
            el('ul', { class: 'items' }, group.items.map((item) =>
                renderItem(item, actions, state.unseen.has(item.id), open.has(item.id), () => {
                  if (open.has(item.id)) open.delete(item.id);
                  else open.add(item.id);
                  update(state);
                }),
              )),
          ]),
        ),
      );
    }

    const unseenCount = state.items.filter((item) => state.unseen.has(item.id)).length;
    replaceChildren(banner, [
      unseenCount > 0 &&
        el('p', {
          class: 'banner',
          text:
            unseenCount === 1
              ? '1 vare er endret siden du var her sist'
              : `${unseenCount} varer er endret siden du var her sist`,
        }),
    ]);

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

function renderItem(
  item: ShoppingItem,
  actions: Actions,
  unseen: boolean,
  isOpen: boolean,
  toggleOpen: () => void,
): HTMLElement {
  const quantity = formatQuantities(item.quantities);
  const source = item.source_meals.join(', ');
  const classes = ['item', item.checked && 'checked', unseen && 'unseen', isOpen && 'open']
    .filter(Boolean)
    .join(' ');

  return el('li', { class: classes }, [
    el('div', { class: 'item-row' }, [
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
              unseen &&
                el('span', {
                  class: 'new-dot',
                  attrs: { title: 'Endret siden sist', 'aria-label': 'Endret siden sist' },
                }),
            ]),
            source !== '' && el('span', { class: 'item-source', text: source }),
          ]),
        ],
      ),
      // Sletting ligger inne i skjemaet, ikke som en knapp rett ved siden av
      // avhukingen. Ett feiltrykk i butikken skal ikke fjerne en vare.
      el('button', {
        class: 'item-edit',
        text: '⋯',
        attrs: { type: 'button', 'aria-expanded': isOpen, 'aria-label': `Endre ${item.name}` },
        on: { click: toggleOpen },
      }),
    ]),
    isOpen && renderEditor(item, actions, toggleOpen),
  ]);
}

function renderEditor(item: ShoppingItem, actions: Actions, close: () => void): HTMLElement {
  const first = item.quantities[0];
  const nameInput = el('input', {
    attrs: { type: 'text', 'aria-label': 'Navn', autocomplete: 'off', value: item.name },
  });
  const amountInput = el('input', {
    class: 'amount',
    attrs: {
      type: 'number',
      inputmode: 'decimal',
      step: 'any',
      min: '0',
      placeholder: 'Antall',
      'aria-label': 'Antall',
      value: first === undefined ? '' : formatAmount(first.amount),
    },
  });
  const unitInput = el('input', {
    class: 'unit',
    attrs: {
      type: 'text',
      list: 'enheter',
      placeholder: 'Enhet',
      'aria-label': 'Enhet',
      autocomplete: 'off',
      value: first?.unit ?? '',
    },
  });
  const categorySelect = el(
    'select',
    { class: 'category', attrs: { 'aria-label': 'Kategori' } },
    CATEGORIES.map((c) => el('option', { text: c, attrs: { value: c, selected: c === item.category } })),
  );

  function quantities(): Quantity[] {
    const raw = amountInput.value.trim().replace(',', '.');
    if (raw === '') return [];
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) return [];
    // Bare den første mengden er redigerbar. Står det "3 dl + 2 boks" fordi
    // enhetene ikke lot seg regne sammen, beholdes resten som den er.
    return [{ amount, unit: normalizeUnit(unitInput.value) }, ...item.quantities.slice(1)];
  }

  return el('div', { class: 'item-editor' }, [
    nameInput,
    el('div', { class: 'row' }, [amountInput, unitInput, categorySelect]),
    el('div', { class: 'row' }, [
      el('button', {
        class: 'primary grow',
        text: 'Lagre',
        attrs: { type: 'button' },
        on: {
          click: () => {
            actions.editItem(item, {
              name: nameInput.value,
              category: isCategory(categorySelect.value) ? categorySelect.value : item.category,
              quantities: quantities(),
            });
            // Lukkes med en gang. Går lagringen galt, sier varselet hva som
            // skjedde, og raden kan åpnes igjen — bedre enn et skjema som
            // blir stående åpent og ser ulagret ut når det faktisk er lagret.
            close();
          },
        },
      }),
      el('button', {
        class: 'ghost danger',
        text: 'Fjern',
        attrs: { type: 'button' },
        on: {
          click: () => {
            actions.removeItem(item);
            // Ellers står skjemaet åpent når varen kommer tilbake — enten
            // fordi du angret, eller fordi du la den til på nytt senere.
            close();
          },
        },
      }),
    ]),
  ]);
}
