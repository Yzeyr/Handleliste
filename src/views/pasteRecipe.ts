import { el } from '../dom.ts';
import { parseRecipe } from '../lib/parseRecipe.ts';
import type { MealDraft } from '../lib/types.ts';

/**
 * Lim inn en oppskrift som tekst.
 *
 * Appen kan ikke hente en nettadresse selv — nettleseren nekter en side å
 * lese innhold fra andre domener. Å kopiere teksten fra oppskriftssida gir
 * samme resultat uten et serverledd i mellom.
 *
 * Tolkningen åpnes alltid i middagsskjemaet før noe lagres. Den treffer det
 * vanlige, ikke alt, og da er det bedre å vise hva den fant.
 */
export function createPasteRecipeView(actions: {
  parsed: (draft: MealDraft, uncertain: number) => void;
  close: () => void;
}): HTMLElement {
  const input = el('textarea', {
    attrs: {
      rows: 12,
      'aria-label': 'Oppskriftstekst',
      placeholder:
        'Fiskegrateng\n4 porsjoner\n\n500 g seifilet\n2 dl makaroni\n5 dl melk\n\nSlik gjør du\n1. Kok makaronien.',
    },
  });

  const message = el('p', { class: 'form-error' });

  return el('section', { class: 'view' }, [
    el('h2', { class: 'view-title', text: 'Lim inn oppskrift' }),
    el('p', {
      class: 'fine-print',
      text:
        'Marker oppskriften på nettsida, kopier, og lim inn her. Ingredienser, ' +
        'mengder og framgangsmåte plukkes ut så godt det lar seg gjøre — du ' +
        'får se og rette alt før noe lagres.',
    }),
    input,
    message,
    el('button', {
      class: 'primary wide',
      text: 'Les inn',
      attrs: { type: 'button' },
      on: {
        click: () => {
          const { draft, uncertain } = parseRecipe(input.value);
          if (draft.ingredients.length === 0) {
            message.textContent = 'Fant ingen ingredienser i teksten.';
            return;
          }
          message.textContent = '';
          actions.parsed(draft, uncertain.length);
        },
      },
    }),
    el('button', { class: 'ghost', text: 'Avbryt', attrs: { type: 'button' }, on: { click: actions.close } }),
  ]);
}
