/**
 * Regelen bak «Fjern avhukede» og «Tøm lista».
 *
 * Én setning: en fast vare fjernes aldri, den hakes bare av. Begge knappene
 * kjører den på hvert sitt utvalg, så de ikke kan komme i utakt — og den bor
 * her, uten DOM rundt seg, fordi det er nettopp en slik regel som råtner i
 * stillhet når den ligger spredt i to klikk-handlere.
 *
 * Merk at dette bare gjelder de to samleknappene. Fjerner du én enkelt vare
 * fra ⋯-skjemaet, blir den fjernet — også en fast. Det er et bevisst trykk på
 * akkurat den varen, ikke en opprydding.
 */
import type { ShoppingItem } from './types.ts';

export interface ClearPlan {
  /** Arkiveres: havner i Varer-fanen, kan hentes tilbake derfra. */
  remove: ShoppingItem[];
  /** Faste varer som blir stående. Kvitteringen teller disse. */
  kept: ShoppingItem[];
  /** De av dem som var haket av. Haken tas av, varen blir. */
  uncheck: ShoppingItem[];
}

export function planClear(candidates: readonly ShoppingItem[]): ClearPlan {
  const kept = candidates.filter((item) => item.pinned);
  return {
    remove: candidates.filter((item) => !item.pinned),
    kept,
    uncheck: kept.filter((item) => item.checked),
  };
}

/**
 * Sier hva som faktisk skjedde, inkludert de faste som ble stående. Uten det
 * ser «Tøm lista» ut som om den ikke gjorde jobben sin.
 */
export function clearLabel(removed: number, kept: number): string {
  const first =
    removed === 0
      ? 'Ingen varer fjernet'
      : removed === 1
        ? '1 vare fjernet'
        : `${removed} varer fjernet`;
  if (kept === 0) return first;
  return `${first} · ${kept} ${kept === 1 ? 'fast vare står' : 'faste varer står'} igjen`;
}
