import { el } from '../dom.ts';
import { CATEGORIES, isCategory, type Category, type Meal, type MealDraft } from '../lib/types.ts';
import { formatAmount, normalizeUnit } from '../lib/units.ts';

const UNITS = ['stk', 'g', 'kg', 'dl', 'l', 'ml', 'ss', 'ts', 'pk', 'boks', 'pose', 'fedd'];

interface Row {
  element: HTMLElement;
  read: () => MealDraft['ingredients'][number];
}

/**
 * Skjema for en egen middag. Oppskriftene lå til nå bare i SQL, som betyr at
 * dere ikke kunne legge inn deres egne uten at noen endret koden.
 */
export function createMealEditor(
  meal: Meal | null,
  actions: {
    save: (draft: MealDraft) => void;
    remove: (meal: Meal) => void;
    close: () => void;
  },
): HTMLElement {
  const nameInput = field('Navn', 'text', meal?.name ?? '');
  const emojiInput = field('Ikon', 'text', meal?.emoji ?? '');
  const descriptionInput = field('Kort beskrivelse', 'text', meal?.description ?? '');
  const servingsInput = field('Porsjoner', 'number', String(meal?.servings ?? 4));

  const stepsInput = el('textarea', {
    attrs: { rows: 5, 'aria-label': 'Framgangsmåte, ett steg per linje' },
  });
  stepsInput.value = (meal?.steps ?? []).join('\n');

  const rows: Row[] = [];
  const rowList = el('div', { class: 'ingredient-rows' });

  function addRow(values?: MealDraft['ingredients'][number]): void {
    const row = ingredientRow(values, () => {
      const index = rows.indexOf(row);
      if (index !== -1) rows.splice(index, 1);
      row.element.remove();
      if (rows.length === 0) addRow();
    });
    rows.push(row);
    rowList.append(row.element);
  }

  const existing = meal?.ingredients ?? [];
  if (existing.length === 0) addRow();
  else {
    for (const ingredient of existing) {
      addRow({
        name: ingredient.name,
        amount: ingredient.amount,
        unit: ingredient.unit,
        category: ingredient.category,
      });
    }
  }

  const error = el('p', { class: 'form-error' });

  function draft(): MealDraft {
    return {
      id: meal?.id ?? null,
      name: nameInput.value,
      emoji: emojiInput.value,
      description: descriptionInput.value,
      servings: Math.max(1, Number(servingsInput.value) || 1),
      steps: stepsInput.value
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== ''),
      ingredients: rows.map((row) => row.read()).filter((row) => row.name.trim() !== ''),
    };
  }

  return el('section', { class: 'view' }, [
    el('h2', { class: 'view-title', text: meal === null ? 'Ny middag' : `Endre ${meal.name}` }),
    nameInput.labelled,
    el('div', { class: 'row' }, [emojiInput.labelled, servingsInput.labelled]),
    descriptionInput.labelled,

    el('h3', { class: 'section-title', text: 'Ingredienser' }),
    rowList,
    el('button', {
      class: 'ghost',
      text: '+ Én til',
      attrs: { type: 'button' },
      on: { click: () => addRow() },
    }),

    el('h3', { class: 'section-title', text: 'Framgangsmåte' }),
    el('p', { class: 'fine-print', text: 'Ett steg per linje. Kan stå tomt.' }),
    stepsInput,

    error,
    el('button', {
      class: 'primary wide',
      text: 'Lagre middagen',
      attrs: { type: 'button' },
      on: {
        click: () => {
          if (nameInput.value.trim() === '') {
            error.textContent = 'Middagen må ha et navn.';
            return;
          }
          error.textContent = '';
          actions.save(draft());
        },
      },
    }),
    meal !== null &&
      el('button', {
        class: 'ghost danger',
        text: 'Slett middagen',
        attrs: { type: 'button' },
        on: { click: () => actions.remove(meal) },
      }),
    el('button', { class: 'ghost', text: 'Avbryt', attrs: { type: 'button' }, on: { click: actions.close } }),
  ]);
}

interface Field {
  value: string;
  labelled: HTMLElement;
}

function field(label: string, type: string, value: string): Field {
  const input = el('input', { attrs: { type, 'aria-label': label, placeholder: label, autocomplete: 'off', value } });
  const wrapper = el('div', { class: 'field grow' }, [
    el('label', { class: 'field-label', text: label }),
    input,
  ]);
  return {
    get value() {
      return input.value;
    },
    labelled: wrapper,
  };
}

function ingredientRow(
  values: MealDraft['ingredients'][number] | undefined,
  onRemove: () => void,
): Row {
  const name = el('input', {
    class: 'grow',
    attrs: { type: 'text', placeholder: 'Ingrediens', 'aria-label': 'Ingrediens', autocomplete: 'off', value: values?.name ?? '' },
  });
  const amount = el('input', {
    class: 'amount',
    attrs: {
      type: 'number',
      inputmode: 'decimal',
      step: 'any',
      min: '0',
      placeholder: 'Antall',
      'aria-label': 'Antall',
      value: values?.amount === null || values?.amount === undefined ? '' : formatAmount(values.amount),
    },
  });
  const unit = el('input', {
    class: 'unit',
    attrs: { type: 'text', list: 'enheter', placeholder: 'Enhet', 'aria-label': 'Enhet', autocomplete: 'off', value: values?.unit ?? '' },
  });
  const category = el(
    'select',
    { class: 'category', attrs: { 'aria-label': 'Kategori' } },
    CATEGORIES.map((c) =>
      el('option', { text: c, attrs: { value: c, selected: c === (values?.category ?? 'annet') } }),
    ),
  );

  const element = el('div', { class: 'ingredient-row' }, [
    el('div', { class: 'row' }, [
      name,
      el('button', {
        class: 'item-remove',
        text: '×',
        attrs: { type: 'button', 'aria-label': 'Fjern ingrediensen' },
        on: { click: onRemove },
      }),
    ]),
    el('div', { class: 'row' }, [amount, unit, category]),
    el('datalist', { attrs: { id: 'enheter' } }, UNITS.map((u) => el('option', { attrs: { value: u } }))),
  ]);

  return {
    element,
    read: () => {
      const raw = amount.value.trim().replace(',', '.');
      const parsed = raw === '' ? null : Number(raw);
      const valid = parsed !== null && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      return {
        name: name.value,
        amount: valid,
        unit: valid === null ? null : normalizeUnit(unit.value),
        category: isCategory(category.value) ? (category.value as Category) : 'annet',
      };
    },
  };
}

