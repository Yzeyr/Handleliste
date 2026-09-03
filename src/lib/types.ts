/** Butikk-seksjoner. Må matche CHECK-constrainten i 01_schema.sql. */
export const CATEGORIES = [
  'grønt',
  'kjøtt',
  'fisk',
  'meieri',
  'tørrvarer',
  'frys',
  'bakeri',
  'annet',
] as const;

export type Category = (typeof CATEGORIES)[number];

/**
 * Rekkefølgen man går gjennom butikken i. Bor her, ikke i visningene: to
 * kopier av den samme rekkefølgen driver garantert fra hverandre, og da går
 * lista og handlemodus i utakt uten at noe feiler.
 */
export const GROUP_ORDER: Category[] = [
  'grønt',
  'kjøtt',
  'fisk',
  'meieri',
  'bakeri',
  'frys',
  'tørrvarer',
  'annet',
];

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

/**
 * Én mengde på én handlelinje. En linje har normalt nøyaktig én av disse.
 * Flere betyr at mengdene ikke lot seg regne sammen (ulike dimensjoner),
 * og de vises da etter hverandre på samme linje: "3 dl + 2 boks".
 */
export interface Quantity {
  amount: number;
  unit: string;
}

export interface ShoppingItem {
  id: string;
  name: string;
  normalized_name: string;
  quantities: Quantity[];
  category: Category;
  checked: boolean;
  /** Har vært på lista, står ikke på den nå. Utgjør historikken. */
  archived: boolean;
  /** Hvor mange ganger varen har vært lagt på lista. Sorterer historikken. */
  use_count: number;
  /** Lagt inn for hånd minst én gang, ikke bare via en oppskrift. */
  manual: boolean;
  last_used_at: string;
  /** Navnet på telefonen som sist skrev til raden. Null hvis ikke satt. */
  updated_by: string | null;
  /** Telles opp av databasen ved hver endring. Grunnlaget for sammenlign-og-bytt. */
  version: number;
  source_meals: string[];
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface MealIngredient {
  id: string;
  meal_id: string;
  name: string;
  normalized_name: string;
  /** null = "etter smak" — havner på lista uten mengde. */
  amount: number | null;
  unit: string | null;
  category: Category;
  sort_order: number;
}

export interface Meal {
  id: string;
  name: string;
  emoji: string | null;
  description: string | null;
  servings: number;
  steps: string[];
  tags: string[];
  ingredients: MealIngredient[];
}

export interface WeekPlanItem {
  id: string;
  meal_id: string;
  added_to_list: boolean;
  /** 1 = mandag ... 7 = søndag. null = valgt, men ikke satt på en dag. */
  weekday: number | null;
}

export const WEEKDAYS = [
  { day: 1, name: 'Mandag' },
  { day: 2, name: 'Tirsdag' },
  { day: 3, name: 'Onsdag' },
  { day: 4, name: 'Torsdag' },
  { day: 5, name: 'Fredag' },
  { day: 6, name: 'Lørdag' },
  { day: 7, name: 'Søndag' },
] as const;

/** En middag under redigering, før den har møtt databasen. */
export interface MealDraft {
  id: string | null;
  name: string;
  emoji: string | null;
  description: string | null;
  servings: number;
  steps: string[];
  ingredients: {
    name: string;
    amount: number | null;
    unit: string | null;
    category: Category;
  }[];
}
