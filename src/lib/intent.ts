/**
 * En handling brukeren gjorde, beskrevet så den kan utføres senere.
 *
 * Køen lagrer disse, ikke rader. Poenget er at en handling som ble gjort
 * offline skal utføres på nytt mot lista slik den faktisk ser ut når nettet
 * er tilbake — «legg til 3 dl melk» skal slå seg sammen med det den andre
 * telefonen rakk å legge inn, ikke overskrive det.
 *
 * Id-er lages på telefonen, ikke i databasen, slik at en vare lagt til
 * offline peker på samme rad når køen sendes.
 */
import type { Category, Quantity, ShoppingItem } from './types.ts';
import type { PendingItem } from './merge.ts';

export type Intent =
  | { kind: 'addPending'; pending: PendingItem[]; newIds: string[]; mealIds: string[] }
  | { kind: 'setChecked'; id: string; checked: boolean }
  | { kind: 'archive'; ids: string[] }
  | { kind: 'revive'; id: string; quantities: Quantity[] }
  | { kind: 'edit'; id: string; patch: { name: string; category: Category; quantities: Quantity[] } }
  | { kind: 'forget'; id: string }
  | { kind: 'restore'; items: ShoppingItem[] }
  | { kind: 'weekAdd'; mealId: string; id: string }
  | { kind: 'weekRemove'; mealId: string }
  | { kind: 'weekSet'; entries: { id: string; meal_id: string; added_to_list: boolean }[] };

export interface QueuedIntent {
  id: string;
  intent: Intent;
  queuedAt: string;
}

/** Hva handlingen het, til bruk i «3 endringer venter på nett». */
export function describeIntent(intent: Intent): string {
  switch (intent.kind) {
    case 'addPending':
      return intent.pending.length === 1 ? `la til ${intent.pending[0]?.name}` : 'la til varer';
    case 'setChecked':
      return intent.checked ? 'haket av en vare' : 'angret en avhuking';
    case 'archive':
      return intent.ids.length === 1 ? 'fjernet en vare' : `fjernet ${intent.ids.length} varer`;
    case 'revive':
      return 'la til en vare fra registeret';
    case 'edit':
      return `endret ${intent.patch.name}`;
    case 'forget':
      return 'slettet en vare';
    case 'restore':
      return 'angret';
    case 'weekAdd':
    case 'weekRemove':
    case 'weekSet':
      return 'endret ukemenyen';
  }
}
