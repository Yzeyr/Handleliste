import type { ShoppingItem } from './types.ts';
import { formatQuantities } from './units.ts';

/**
 * Oversetter en databaseendring til en setning et menneske kan lese.
 *
 * Ren funksjon med vilje: dette er den delen som lett blir subtilt feil
 * ("fjernet" når noe egentlig ble haket av), og den er lettest å holde
 * riktig når den kan testes uten hverken database eller DOM.
 */

export type ChangeType = 'INSERT' | 'UPDATE' | 'DELETE';

export interface ChangeEvent {
  type: ChangeType;
  /** Raden slik den ble. Mangler ved DELETE. */
  next: Partial<ShoppingItem> | null;
  /** Raden slik den var. Krever `replica identity full` i Postgres. */
  previous: Partial<ShoppingItem> | null;
}

/**
 * @param me Navnet denne telefonen skriver med, eller null om det ikke er satt.
 * @returns Setningen som skal vises, eller null hvis endringen ikke er verdt
 *          å nevne — typisk fordi den kom herfra.
 */
export function describeChange(event: ChangeEvent, me: string | null): string | null {
  const row = event.next ?? event.previous;
  if (row === null || row.name === undefined) return null;

  const author = row.updated_by ?? null;
  // Egne endringer skal ikke varsles tilbake til en selv.
  if (author !== null && me !== null && author === me) return null;

  const who = author ?? 'Noen';
  const name = row.name;

  if (event.type === 'DELETE') return `${who} slettet ${name}`;
  if (event.type === 'INSERT') return `${who} la til ${name}${amountSuffix(event.next)}`;

  const before = event.previous;
  const after = event.next;
  if (after === undefined || after === null) return null;

  // Uten replica identity full mangler forrige tilstand, og da er det bedre
  // å si noe vagt enn å gjette feil.
  if (before === null || before.archived === undefined) {
    if (after.archived === true) return `${who} fjernet ${name}`;
    if (after.checked === true) return `${who} handlet ${name}`;
    return `${who} oppdaterte ${name}`;
  }

  if (before.archived === false && after.archived === true) return `${who} fjernet ${name}`;
  if (before.archived === true && after.archived === false) {
    return `${who} la til ${name}${amountSuffix(after)}`;
  }
  if (before.checked === false && after.checked === true) return `${who} handlet ${name}`;
  if (before.checked === true && after.checked === false) return `${who} angret ${name}`;

  const beforeAmount = formatQuantities(before.quantities ?? []);
  const afterAmount = formatQuantities(after.quantities ?? []);
  if (beforeAmount !== afterAmount) {
    return afterAmount === ''
      ? `${who} fjernet mengden på ${name}`
      : `${who} endret ${name} til ${afterAmount}`;
  }

  return null;
}

function amountSuffix(row: Partial<ShoppingItem> | null): string {
  const amount = formatQuantities(row?.quantities ?? []);
  return amount === '' ? '' : ` (${amount})`;
}

/** Flere endringer på rad blir én linje i stedet for en strøm av dem. */
export function summarizeChanges(messages: readonly string[]): string | null {
  if (messages.length === 0) return null;
  if (messages.length === 1) return messages[0] ?? null;
  return `${messages.length} endringer på lista`;
}
