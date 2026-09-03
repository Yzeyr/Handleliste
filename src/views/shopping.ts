import { el, replaceChildren, type View } from '../dom.ts';
import { GROUP_ORDER, type ShoppingItem } from '../lib/types.ts';
import { formatQuantities } from '../lib/units.ts';
import type { Actions, AppState } from '../state.ts';

/**
 * Handlemodus: appen mens du står i butikken.
 *
 * Alt som ikke er «hva mangler jeg, og har jeg tatt det» er borte — skjema,
 * faner, redigering. Radene er store nok til å treffes med én hånd og
 * handlekurv i den andre, og teksten er stor nok til å leses uten å stoppe
 * opp. Det eneste som er lagt til, er hvor langt du er kommet.
 */
export function createShoppingView(actions: Actions, onExit: () => void): View<AppState> {
  const progressText = el('span', { class: 'progress-text' });
  const progressFill = el('div', { class: 'progress-fill' });
  const body = el('div', { class: 'shopping-body' });
  const footer = el('div', { class: 'shopping-footer' });

  /**
   * Butikken er nettopp der du husker at dere er tom for oppvasksåpe. Uten
   * dette feltet måtte du ut av handlemodus, legge den inn, og starte på
   * nytt — stikk i strid med regelen om at alt du gjør stående i butikken
   * skal skje uten å bytte skjerm.
   *
   * Ett felt, ingen mengde og ingen kategori: den som står i en kø skriver
   * «oppvasksåpe», ikke «1 stk oppvasksåpe · husholdning».
   */
  const quickInput = el('input', {
    class: 'grow',
    attrs: {
      type: 'text',
      placeholder: 'Husket du noe? Legg det til her',
      'aria-label': 'Legg til vare',
      autocomplete: 'off',
      enterkeyhint: 'done',
    },
  });

  function quickAdd(): void {
    const text = quickInput.value.trim();
    if (text === '') return;
    actions.addPastedLines([text]);
    quickInput.value = '';
  }

  const quickForm = el(
    'form',
    {
      class: 'shopping-add',
      on: {
        submit: (event) => {
          event.preventDefault();
          quickAdd();
        },
      },
    },
    [
      quickInput,
      el('button', { class: 'primary', text: 'Legg til', attrs: { type: 'submit' } }),
    ],
  );

  const element = el('section', { class: 'shopping' }, [
    el('div', { class: 'shopping-top' }, [
      el('div', { class: 'progress' }, [
        progressText,
        el('div', { class: 'progress-track' }, [progressFill]),
      ]),
      el('button', {
        class: 'ghost',
        text: '💳',
        attrs: { type: 'button', 'aria-label': 'Vis medlemskort' },
        on: { click: () => actions.showCards() },
      }),
      el('button', {
        class: 'ghost',
        text: 'Ferdig',
        attrs: { type: 'button' },
        on: { click: onExit },
      }),
    ]),
    body,
    quickForm,
    footer,
  ]);

  function update(state: AppState): void {
    const total = state.items.length;
    const done = state.items.filter((item) => item.checked).length;

    progressText.textContent = total === 0 ? 'Lista er tom' : `${done} / ${total} varer`;
    progressFill.style.width = total === 0 ? '0%' : `${Math.round((done / total) * 100)}%`;

    // Samme regel som på lista: det du har tatt samles nederst. I butikken
    // teller det enda mer — seksjonen du står i skal bare vise det du mangler.
    const checked = state.items.filter((item) => item.checked);
    const groups = [
      ...GROUP_ORDER.map((category) => ({
        category,
        items: state.items.filter((item) => !item.checked && item.category === category),
      })),
      {
        category: `handlet (${checked.length})`,
        items: [...checked].sort(
          (a, b) => GROUP_ORDER.indexOf(a.category) - GROUP_ORDER.indexOf(b.category),
        ),
      },
    ].filter((group) => group.items.length > 0);

    replaceChildren(
      body,
      groups.length === 0
        ? [el('p', { class: 'empty', text: 'Ingenting å handle.' })]
        : groups.map((group) =>
            el('div', { class: 'group' }, [
              el('h2', { class: 'group-title', text: group.category }),
              el(
                'ul',
                { class: 'shopping-items' },
                group.items.map((item) => renderRow(item, actions)),
              ),
            ]),
          ),
    );

    const allDone = total > 0 && done === total;
    replaceChildren(footer, [
      allDone && el('p', { class: 'all-done', text: 'Alt er handlet.' }),
      allDone &&
        el('button', {
          class: 'primary wide',
          text: 'Rydd bort og avslutt',
          attrs: { type: 'button' },
          on: {
            click: () => {
              actions.removeChecked();
              onExit();
            },
          },
        }),
    ]);
  }

  return { element, update };
}

function renderRow(item: ShoppingItem, actions: Actions): HTMLElement {
  const quantity = formatQuantities(item.quantities);

  return el('li', { class: item.checked ? 'shopping-item checked' : 'shopping-item' }, [
    el(
      'button',
      {
        class: 'shopping-tap',
        attrs: { type: 'button', 'aria-pressed': item.checked },
        on: { click: () => actions.toggleChecked(item) },
      },
      [
        el('span', { class: 'big-tick', text: item.checked ? '✓' : '' }),
        el('span', { class: 'shopping-main' }, [
          el('span', { class: 'shopping-name', text: item.name }),
          // Notatet står under navnet, ikke ved siden av: det er det som
          // avgjør hvilken av tjue oster du tar med deg.
          item.note !== null && item.note !== '' &&
            el('span', { class: 'shopping-note', text: item.note }),
        ]),
        quantity !== '' && el('span', { class: 'shopping-qty', text: quantity }),
      ],
    ),
  ]);
}
