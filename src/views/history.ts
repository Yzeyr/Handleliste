import { el, replaceChildren, type View } from '../dom.ts';
import type { ShoppingItem } from '../lib/types.ts';
import type { Actions, AppState } from '../state.ts';

/**
 * Varer som har vært på lista før. Mest brukte først — på en handleliste er
 * "det vi alltid kjøper" mer nyttig enn "det vi kjøpte sist".
 */
export function createHistoryView(actions: Actions): View<AppState> {
  let query = '';

  const search = el('input', {
    class: 'search',
    attrs: { type: 'search', placeholder: 'Søk i historikken', 'aria-label': 'Søk i historikken', autocomplete: 'off' },
    on: {
      input: (event) => {
        query = (event.target as HTMLInputElement).value.toLowerCase().trim();
        render();
      },
    },
  });

  const body = el('div', { class: 'list-body' });
  const element = el('section', { class: 'view' }, [el('div', { class: 'row' }, [search]), body]);

  let current: AppState = { items: [], meals: [], week: [], history: [] };

  function render(): void {
    const matches = current.history.filter(
      (item) => query === '' || item.name.toLowerCase().includes(query),
    );

    if (matches.length === 0) {
      replaceChildren(body, [
        el('p', {
          class: 'empty',
          text:
            current.history.length === 0
              ? 'Ingenting her ennå. Varer havner i historikken når du fjerner dem fra lista.'
              : 'Ingen varer matcher søket.',
        }),
      ]);
      return;
    }

    replaceChildren(body, [
      el('ul', { class: 'items' }, matches.map((item) => renderRow(item, actions))),
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

function renderRow(item: ShoppingItem, actions: Actions): HTMLElement {
  return el('li', { class: 'item' }, [
    el(
      'button',
      {
        class: 'item-tap',
        attrs: { type: 'button', 'aria-label': `Legg ${item.name} på lista` },
        on: { click: () => actions.addFromHistory(item) },
      },
      [
        el('span', { class: 'tick plus', text: '+' }),
        el('span', { class: 'item-main' }, [
          el('span', { class: 'item-line' }, [
            el('span', { class: 'item-name', text: item.name }),
          ]),
          el('span', {
            class: 'item-source',
            text: item.use_count === 1 ? `${item.category}` : `${item.category} · kjøpt ${item.use_count} ganger`,
          }),
        ]),
      ],
    ),
    el('button', {
      class: 'item-remove',
      text: '×',
      attrs: { type: 'button', 'aria-label': `Slett ${item.name} fra historikken` },
      on: { click: () => actions.forgetItem(item) },
    }),
  ]);
}
