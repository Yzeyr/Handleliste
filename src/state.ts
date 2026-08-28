import type { Meal, Quantity, ShoppingItem, WeekPlanItem } from './lib/types.ts';

export interface AppState {
  items: ShoppingItem[];
  meals: Meal[];
  week: WeekPlanItem[];
  /** Vareregisteret: arkiverte rader — samme rader som lista, bare ikke på den nå. */
  register: ShoppingItem[];
}

export interface Actions {
  addManual: (input: { name: string; amount: number | null; unit: string; category: string }) => void;
  toggleChecked: (item: ShoppingItem) => void;
  removeItem: (item: ShoppingItem) => void;
  removeChecked: () => void;
  addFromRegister: (item: ShoppingItem, quantities: Quantity[]) => void;
  forgetItem: (item: ShoppingItem) => void;
  clearList: () => void;
  toggleWeekMeal: (meal: Meal) => void;
  addWeekToList: () => void;
  clearWeek: () => void;
  goToList: () => void;
}
