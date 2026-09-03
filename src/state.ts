import type { Category, Meal, MealDraft, Quantity, ShoppingItem, WeekPlanItem } from './lib/types.ts';

export interface AppState {
  items: ShoppingItem[];
  meals: Meal[];
  week: WeekPlanItem[];
  /** Vareregisteret: arkiverte rader — samme rader som lista, bare ikke på den nå. */
  register: ShoppingItem[];
  /** Varer den andre har endret siden appen sist var åpen her. */
  unseen: Set<string>;
  aliases: { alias: string; canonical: string }[];
  pushTargets: { device_id: string; label: string | null; topic: string }[];
  /** Hvor mange dere er. null = ikke satt, og da skaleres ingen oppskrift. */
  servings: number | null;
}

export interface Actions {
  addManual: (input: { name: string; amount: number | null; unit: string; category: string }) => void;
  addPastedLines: (lines: readonly string[]) => void;
  toggleChecked: (item: ShoppingItem) => void;
  removeItem: (item: ShoppingItem) => void;
  removeChecked: () => void;
  addFromRegister: (item: ShoppingItem, quantities: Quantity[]) => void;
  forgetItem: (item: ShoppingItem) => void;
  clearList: () => void;
  toggleWeekMeal: (meal: Meal) => void;
  setWeekday: (meal: Meal, weekday: number | null) => void;
  addWeekToList: () => void;
  clearWeek: () => void;
  goToList: () => void;
  startShopping: () => void;
  showCards: () => void;
  showCook: () => void;
  editItem: (
    item: ShoppingItem,
    patch: { name: string; category: Category; quantities: Quantity[]; note: string | null },
  ) => void;
  setServings: (servings: number | null) => void;
  addAlias: (alias: string, canonical: string) => void;
  removeAlias: (alias: string) => void;
  addMealToList: (meal: Meal) => void;
  editMeal: (meal: Meal | null) => void;
  pasteRecipe: () => void;
  saveMeal: (draft: MealDraft) => void;
  deleteMeal: (meal: Meal) => void;
}
