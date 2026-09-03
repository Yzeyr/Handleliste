import { el, replaceChildren, type View } from '../dom.ts';
import {
  CATEGORIES,
  GROUP_ORDER,
  isCategory,
  type Category,
  type Quantity,
  type ShoppingItem,
} from '../lib/types.ts';
import { parseIngredientLine } from '../lib/parseRecipe.ts';
import { categoryForName } from '../lib/facts.ts';
import { normalizeName } from '../lib/normalize.ts';
import { acknowledge, loadAcknowledged, loadReminders, pendingReminders, today } from '../lib/reminders.ts';
import { COMMON_UNITS, formatAmount, formatQuantities, normalizeUnit, parseAmount } from '../lib/units.ts';
import type { Actions, AppState } from '../state.ts';

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
      paste: (event: ClipboardEvent) => {
        const text = event.clipboardData?.getData('text') ?? '';
        const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '');
        if (lines.length < 2) return; // én linje er en vanlig liming
        event.preventDefault();
        pasted = lines;
        suggestionsOpen = false;
        renderSuggestions();
        renderPasteBox();
      },
    },
  });

  const amountInput = el('input', {
    class: 'amount',
    attrs: { type: 'text', inputmode: 'decimal', placeholder: 'Antall', 'aria-label': 'Mengde' },
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
   * En hel ingrediensliste limt inn i skrivefeltet.
   *
   * Et <input> er én linje: limer du inn elleve, slår nettleseren dem sammen
   * til én lang streng, og du sitter igjen med én meningsløs vare. Derfor
   * leses utklippstavla direkte, og limingen stanses før den når feltet.
   *
   * Elleve varer skal ikke føyes til lista i det stille bare fordi en finger
   * traff «lim inn». Du får se hva som kommer, og bekrefte.
   */
  let pasted: string[] = [];
  const pasteBox = el('div', { class: 'paste-box' });

  function renderPasteBox(): void {
    if (pasted.length === 0) {
      replaceChildren(pasteBox, []);
      pasteBox.classList.remove('visible');
      return;
    }
    // Samme telling som skrivingen gjør: nevner lista løk to ganger, blir det
    // én vare. Boksen skal ikke love tre og legge til to.
    const names: string[] = [];
    const seen = new Set<string>();
    for (const line of pasted) {
      const name = parseIngredientLine(line)?.name ?? line.trim();
      const key = normalizeName(name);
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }

    pasteBox.classList.add('visible');
    replaceChildren(pasteBox, [
      el('p', {
        class: 'paste-title',
        text: `${names.length} ${names.length === 1 ? 'vare' : 'varer'} fra det du limte inn`,
      }),
      el('p', { class: 'paste-names', text: names.join(' · ') }),
      el('div', { class: 'row' }, [
        el('button', {
          class: 'primary grow',
          text: 'Legg til alle',
          attrs: { type: 'button' },
          on: { click: () => addPasted() },
        }),
        el('button', {
          class: 'ghost',
          text: 'Avbryt',
          attrs: { type: 'button' },
          on: {
            click: () => {
              pasted = [];
              renderPasteBox();
            },
          },
        }),
      ]),
    ]);
  }

  function addPasted(): void {
    if (pasted.length === 0) return;
    actions.addPastedLines(pasted);
    pasted = [];
    renderPasteBox();
    nameInput.value = '';
    preview.textContent = '';
    suggestionsOpen = false;
    renderSuggestions();
  }

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

    const typed = parseAmount(amountInput.value);
    const amount = typed ?? (amountInput.value.trim() === '' ? (parsed?.amount ?? null) : null);
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
    if (parsed === null || (parsed.amount === null && parsed.name === nameInput.value.trim())) {
      // Ingenting tolket ut over navnet, og ingen mengde skrevet i feltene
      // under: da er forhåndsvisningen bare støy.
      preview.textContent =
        parsed === null ? '' : `${parsed.name} · ${parsed.category}`;
      return;
    }
    const amount = parsed.amount === null ? '' : ` · ${formatQuantities([{ amount: parsed.amount, unit: parsed.unit }])}`;
    preview.textContent = `${parsed.name}${amount} · ${parsed.category}`;
  }

  function submit(): void {
    // Står en innliming og venter, er det den enteren gjelder.
    if (pasted.length > 0) return addPasted();

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
  const remindBand = el('div', { class: 'remind' });
  const shoppingEntry = el('div');

  /**
   * «Husk før du går inn». Står rett over «Start handling», fordi det er den
   * knappen du ser i butikkdøra — og bare når det faktisk står noe uhaket på
   * lista.
   */
  function renderReminders(igjen: number): void {
    const pending = igjen === 0
      ? []
      : pendingReminders(loadReminders(), loadAcknowledged(), today());

    replaceChildren(remindBand, [
      pending.length > 0 && el('span', { class: 'remind-label', text: 'Husk' }),
      ...pending.map((name) =>
        el('button', {
          class: 'remind-chip',
          text: name,
          attrs: { type: 'button', 'aria-label': `${name} — jeg har den` },
          on: {
            click: () => {
              acknowledge(name);
              renderReminders(igjen);
            },
          },
        }),
      ),
    ]);
    remindBand.classList.toggle('visible', pending.length > 0);
  }
  const body = el('div', { class: 'list-body' });
  const footer = el('div', { class: 'list-footer' });
  const element = el('section', { class: 'view' }, [
    form,
    pasteBox,
    remindBand,
    shoppingEntry,
    banner,
    body,
    footer,
  ]);

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
    renderReminders(igjen);
    replaceChildren(shoppingEntry, [
      el('div', { class: 'row' }, [
        igjen > 0 &&
          el('button', {
            class: 'outline grow',
            text: `🛒 Start handling · ${igjen} ${igjen === 1 ? 'vare' : 'varer'}`,
            attrs: { type: 'button' },
            on: { click: () => actions.startShopping() },
          }),
        // Kortet brukes i kassa, altså på samme tur som lista. Da hører det
        // hjemme her, ikke bak tannhjulet.
        el('button', {
          class: igjen > 0 ? 'outline' : 'outline grow',
          text: '💳 Kort',
          attrs: { type: 'button' },
          on: { click: () => actions.showCards() },
        }),
      ]),
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

  const row = el('div', { class: 'item-row' }, [
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
      // Sletting har ingen knapp ved siden av avhukingen. Ett feiltrykk i
      // butikken skal ikke fjerne en vare — sveip eller ⋯ krever at du mente
      // det.
      el('button', {
        class: 'item-edit',
        text: '⋯',
        attrs: { type: 'button', 'aria-expanded': isOpen, 'aria-label': `Endre ${item.name}` },
        on: { click: toggleOpen },
      }),
  ]);

  const swipe = el('div', { class: 'swipe' }, [
    el('div', { class: 'swipe-back' }, [el('span', { text: 'Fjern' })]),
    row,
  ]);
  enableSwipeToRemove(row, () => actions.removeItem(item));

  return el('li', { class: classes }, [swipe, isOpen && renderEditor(item, actions, toggleOpen)]);
}

/** Så langt raden må dras før slippet betyr «fjern». */
const SWIPE_THRESHOLD = 96;
/** Under dette er bevegelsen et trykk som skalv, ikke et sveip. */
const SWIPE_SLOP = 10;

/**
 * Sveip mot venstre for å fjerne raden.
 *
 * Retningen avgjøres én gang, ved første bevegelse over slop-grensen: er den
 * mest loddrett, slipper vi taket og lar siden scrolle som vanlig. Uten det
 * ville hver scroll gjennom lista dratt i radene.
 */
function enableSwipeToRemove(row: HTMLElement, remove: () => void): void {
  let startX = 0;
  let startY = 0;
  let axis: 'ukjent' | 'vannrett' | 'loddrett' = 'ukjent';
  let dx = 0;

  const slide = (x: number): void => {
    row.style.transform = x === 0 ? '' : `translateX(${x}px)`;
  };

  row.addEventListener('pointerdown', (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    startX = event.clientX;
    startY = event.clientY;
    axis = 'ukjent';
    dx = 0;
    row.style.transition = 'none';
  });

  row.addEventListener('pointermove', (event: PointerEvent) => {
    if (startX === 0 && startY === 0) return;
    const moveX = event.clientX - startX;
    const moveY = event.clientY - startY;

    if (axis === 'ukjent') {
      if (Math.abs(moveX) < SWIPE_SLOP && Math.abs(moveY) < SWIPE_SLOP) return;
      axis = Math.abs(moveX) > Math.abs(moveY) ? 'vannrett' : 'loddrett';
      if (axis === 'vannrett') row.setPointerCapture(event.pointerId);
    }
    if (axis !== 'vannrett') return;

    // Bare mot venstre. Å dra mot høyre gjør ingenting, så en skjev
    // fingerbevegelse ikke ser ut som om den skal føre til noe.
    dx = Math.min(0, moveX);
    slide(dx);
    row.classList.toggle('will-remove', -dx >= SWIPE_THRESHOLD);
  });

  function end(): void {
    const wasSwipe = axis === 'vannrett';
    const far = -dx >= SWIPE_THRESHOLD;
    startX = 0;
    startY = 0;
    axis = 'ukjent';
    dx = 0;
    row.style.transition = '';
    row.classList.remove('will-remove');

    if (!wasSwipe) return;
    // Et sveip skal aldri også hake av varen. Klikket kommer etter pointerup,
    // så det må stanses i fangstfasen, én gang.
    row.addEventListener('click', (click: Event) => {
      click.stopPropagation();
      click.preventDefault();
    }, { capture: true, once: true });

    if (far) remove();
    else slide(0);
  }

  row.addEventListener('pointerup', end);
  row.addEventListener('pointercancel', end);
}

function renderEditor(item: ShoppingItem, actions: Actions, close: () => void): HTMLElement {
  const first = item.quantities[0];
  const nameInput = el('input', {
    attrs: { type: 'text', 'aria-label': 'Navn', autocomplete: 'off', value: item.name },
  });
  const amountInput = el('input', {
    class: 'amount',
    attrs: {
      type: 'text',
      inputmode: 'decimal',
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
    const amount = parseAmount(amountInput.value);
    if (amount === null) return [];
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
