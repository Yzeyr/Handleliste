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
  let current: AppState = { items: [], meals: [], week: [], register: [], unseen: new Set(), aliases: [], pushTargets: [] };

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
    },
    on: {
      // Ikke bare focusin: har feltet fokus fra før — som rett etter at du
      // trykket Enter — fyrer ikke focusin, og et trykk i feltet ville ikke
      // gjort noe. Det er nettopp trykket folk forventer skal vise lista.
      click: () => {
        suggestionsOpen = true;
        renderSuggestions();
      },
    },
  });

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
   * Varer du har hatt på lista før, nyeste først, rett under skrivefeltet.
   * For alt som kjøpes om igjen forsvinner skrivingen helt: trykk i feltet,
   * trykk på varen, ferdig.
   *
   * Panelet legger seg OPPÅ lista i stedet for å dytte den nedover. Et panel
   * som endrer høyden på det som ligger under, flytter radene mellom at
   * fingeren går ned og opp, og da havner trykket feil.
   */
  const suggestions = el('div', { class: 'suggestions' });

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

  let suggestionsOpen = false;

  function renderSuggestions(): void {
    const query = nameInput.value.trim().toLowerCase();
    const onList = new Set(current.items.map((item) => item.normalized_name));

    const matches = current.register
      .filter((item) => !onList.has(item.normalized_name))
      // Uten søk: bare varer dere har lagt inn selv. Hvitløk og tomatpuré kom
      // med en oppskrift og hører hjemme i Varer, ikke i det som spretter opp
      // når du skal skrive en handleliste.
      //
      // Med søk: alt. Skriver du «hvitl», leter du etter noe bestemt, og da
      // skal appen finne det.
      .filter((item) => (query === '' ? item.manual : item.name.toLowerCase().includes(query)))
      // Nyeste først her, ikke mest kjøpte: det du handlet sist er det du
      // mest sannsynlig skal handle igjen.
      .sort((a, b) => b.last_used_at.localeCompare(a.last_used_at))
      .slice(0, 8);

    form.classList.toggle('suggesting', suggestionsOpen && matches.length > 0);
    replaceChildren(
      suggestions,
      matches.map((item) => {
        const amount = formatQuantities(item.quantities);
        return el(
          'button',
          {
            class: 'suggestion',
            attrs: { type: 'button' },
            on: {
              // Hindrer at feltet mister fokus før trykket er ferdig.
              mousedown: (event) => event.preventDefault(),
              click: () => {
                actions.addFromRegister(item, item.quantities);
                nameInput.value = '';
                preview.textContent = '';
                renderSuggestions();
              },
            },
          },
          [
            el('span', { class: 'suggestion-name', text: item.name }),
            amount !== '' && el('span', { class: 'suggestion-qty', text: amount }),
          ],
        );
      }),
    );
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
    // Fokus blir stående så neste vare kan skrives rett inn, men panelet
    // lukkes: ellers står det og dekker lista du nettopp la noe til i.
    // Skriver du videre, åpner det seg igjen. Legger du til fra forslagene,
    // blir det stående — da holder du på med flere.
    nameInput.focus();
    suggestionsOpen = false;
    renderSuggestions();
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
        input: () => {
          suggestionsOpen = true;
          showPreview();
          renderSuggestions();
        },
        focusin: () => {
          suggestionsOpen = true;
          renderSuggestions();
        },
        focusout: (event) => {
          const next = (event as FocusEvent).relatedTarget;
          if (next instanceof Node && form.contains(next)) return;
          suggestionsOpen = false;
          renderSuggestions();
        },
      },
    },
    [
      el('div', { class: 'row' }, [
        nameInput,
        el('button', { class: 'primary', text: 'Legg til', attrs: { type: 'submit' } }),
      ]),
      preview,
      suggestions,
      el('button', {
        class: 'detail-toggle',
        text: 'Mengde og kategori',
        attrs: { type: 'button' },
        on: { click: () => form.classList.toggle('open') },
      }),
      details,
      unitOptions,
    ],
  );

  const banner = el('div');
  const shoppingEntry = el('div');
  const body = el('div', { class: 'list-body' });
  const footer = el('div', { class: 'list-footer' });
  const element = el('section', { class: 'view' }, [form, shoppingEntry, banner, body, footer]);

  function update(state: AppState): void {
    current = state;
    known = [...state.items, ...state.register];
    renderSuggestions();
    // Avhukede varer samles nederst i én bolk, ikke spredt utover i hver sin
    // seksjon. Det som står igjen å handle skal krympe mens du jobber; det du
    // har tatt skal fortsatt være synlig, men ute av veien.
    const checked = state.items.filter((item) => item.checked);
    const groups = [
      ...GROUP_ORDER.map((category) => ({
        category,
        items: state.items.filter((item) => !item.checked && item.category === category),
      })),
      { category: `handlet (${checked.length})`, items: sortByCategory(checked) },
    ].filter((group) => group.items.length > 0);

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

/** Beholder butikkrekkefølgen inne i bolken, så den ikke stokker om seg. */
function sortByCategory(items: readonly ShoppingItem[]): ShoppingItem[] {
  return [...items].sort(
    (a, b) => GROUP_ORDER.indexOf(a.category) - GROUP_ORDER.indexOf(b.category),
  );
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
              // Stjerna er et merke, ikke en knapp: den settes én gang og
              // leses hver gang. Raden har allerede to trykkflater, og en
              // tredje på 68 px i en butikk blir feiltrykk.
              item.pinned &&
                el('span', {
                  class: 'pin-mark',
                  text: '★',
                  attrs: { title: 'Fast vare', 'aria-label': 'Fast vare' },
                }),
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

  const pinButton = el('button', {
    class: item.pinned ? 'outline wide pinned' : 'outline wide',
    text: item.pinned ? '★ Fast vare' : '☆ Gjør til fast vare',
    attrs: { type: 'button', 'aria-pressed': item.pinned },
    on: { click: () => actions.togglePinned(item) },
  });

  return el('div', { class: 'item-editor' }, [
    nameInput,
    el('div', { class: 'row' }, [amountInput, unitInput, categorySelect]),
    pinButton,
    el('p', {
      class: 'fine-print',
      text: 'Faste varer fjernes ikke når lista tømmes — de hakes bare av.',
    }),
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
