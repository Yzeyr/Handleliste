import type { Meal, ShoppingItem, WeekPlanItem } from './lib/types.ts';

export interface AppState {
  items: ShoppingItem[];
  meals: Meal[];
  week: WeekPlanItem[];
}

export interface Actions {
  addManual: (input: { name: string; amount: number | null; unit: string; category: string }) => void;
  toggleChecked: (item: ShoppingItem) => void;
  removeItem: (item: ShoppingItem) => void;
  removeChecked: () => void;
  clearList: () => void;
  toggleWeekMeal: (meal: Meal) => void;
  addWeekToList: () => void;
  clearWeek: () => void;
  goToList: () => void;
}
