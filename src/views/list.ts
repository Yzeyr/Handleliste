import { el, replaceChildren, type View } from '../dom.ts';
import { CATEGORIES, isCategory, type Category, type Quantity, type ShoppingItem } from '../lib/types.ts';
import { parseIngredientLine } from '../lib/parseRecipe.ts';
import { categoryForName } from '../lib/facts.ts';
import { amountForInput, formatQuantities, normalizeUnit } from '../lib/units.ts';
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
  // Alt appen har sett før, til oppslag av kategori. Fylles ved hver tegning.
  let known: ShoppingItem[] = [];

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
  const AUTO = 'auto';
  const categorySelect = el('select', { class: 'category', attrs: { 'aria-label': 'Kategori' } }, [
    // Standard er å la appen finne kategorien. Ingen skal måtte åpne en
    // nedtrekksliste for å legge melk i handlelista.
    el('option', { text: 'kategori: automatisk', attrs: { value: AUTO, selected: true } }),
    ...CATEGORIES.map((c) => el('option', { text: c, attrs: { value: c } })),
  ]);

  const preview = el('p', { class: 'add-preview' });

  /**
   * Leser hele varen ut av ett felt: "2 l melk", "500 g kjøttdeig", "brød".
   * Feltene for mengde, enhet og kategori er der fortsatt, men bare som
   * overstyring — man skal aldri måtte åpne dem.
   */
  function read(): { name: string; amount: number | null; unit: string; category: Category } | null {
    const raw = nameInput.value.trim();
    if (raw === '') return null;

    const parsed = parseIngredientLine(raw);
    // Tolkede navn får stor forbokstav av parseren; de utolkede skal se likedan ut.
    const name = parsed?.name ?? raw.charAt(0).toUpperCase() + raw.slice(1);

    const typedAmount = amountInput.value.trim().replace(',', '.');
    const amount =
      typedAmount === '' ? (parsed?.amount ?? null) : Number(typedAmount);
    const unit = unitInput.value.trim() !== '' ? unitInput.value : (parsed?.unit ?? 'stk');

    const category = isCategory(categorySelect.value)
      ? categorySelect.value
      : categoryForName(name, known);

    return {
      name,
      amount: amount !== null && Number.isFinite(amount) && amount > 0 ? amount : null,
      unit,
      category,
    };
  }

  /** Viser hva som faktisk blir lagt til, så syntaksen lærer seg selv. */
  function showPreview(): void {
    const parsed = read();
    if (parsed === null || parsed.name === nameInput.value.trim()) {
      // Ingenting tolket ut over navnet: da er forhåndsvisningen bare støy.
      preview.textContent =
        parsed === null ? '' : `${parsed.name} · ${parsed.category}`;
      return;
    }
    const amount = parsed.amount === null ? '' : ` · ${formatQuantities([{ amount: parsed.amount, unit: parsed.unit }])}`;
    preview.textContent = `${parsed.name}${amount} · ${parsed.category}`;
  }

  function submit(): void {
    const parsed = read();
    if (parsed === null) return;

    actions.addManual(parsed);

    form.classList.remove('open');
    nameInput.value = '';
    amountInput.value = '';
    unitInput.value = '';
    categorySelect.value = AUTO;
    preview.textContent = '';
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
        // Detaljene folder seg ikke ut av seg selv lenger. Feltet over
        // forstår "2 l melk", så de trengs sjelden — og et skjema som vokser
        // når du trykker i det dytter lista nedover uten grunn.
        input: () => showPreview(),
      },
    },
    [
      el('div', { class: 'row' }, [
        nameInput,
        el('button', { class: 'primary', text: 'Legg til', attrs: { type: 'submit' } }),
      ]),
      preview,
      el('button', {
        class: 'detail-toggle',
        text: 'Mengde og kategori',
        attrs: { type: 'button' },
        on: { click: () => form.classList.toggle('open') },
      }),
      details,
      unitOptions,
      nameOptions,
    ],
  );

  const banner = el('div');
  const shoppingEntry = el('div');
  const body = el('div', { class: 'list-body' });
  const footer = el('div', { class: 'list-footer' });
  const element = el('section', { class: 'view' }, [form, shoppingEntry, banner, body, footer]);

  function update(state: AppState): void {
    known = [...state.items, ...state.register];
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

    // Inngangen til handlemodus står øverst, ikke i bunnen: du åpner appen i
    // butikkdøra og skal ikke måtte scrolle forbi hele lista for å finne den.
    const igjen = state.items.filter((item) => !item.checked).length;
    replaceChildren(shoppingEntry, [
      igjen > 0 &&
        el('button', {
          class: 'outline wide',
          text: `🛒 Start handling · ${igjen} ${igjen === 1 ? 'vare' : 'varer'}`,
          attrs: { type: 'button' },
          on: { click: () => actions.startShopping() },
        }),
    ]);

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
      value: first === undefined ? '' : amountForInput(first.amount),
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
