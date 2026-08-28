/**
 * Regelen bak «Fjern avhukede», «Tøm lista» og «Rydd bort og avslutt».
 *
 * Én setning: **det du har lagt inn selv, blir stående — det hakes bare av.**
 * Bare varer som kom fra en middag ryddes bort. Alle tre knappene kjører den
 * samme regelen på hvert sitt utvalg, og den bor her, uten DOM rundt seg,
 * fordi det er nettopp en slik regel som råtner i stillhet når den ligger
 * spredt i tre klikk-handlere.
 *
 * Dette gjaldt først en stjerne man satte selv. Den ble byttet ut: i praksis
 * var svaret alltid «behold det jeg skrev inn», og da er en innstilling bare
 * et ekstra trykk foran det samme svaret. Middagsvarer er engangsvarer for én
 * oppskrift, egne varer er ting man kjøper igjen.
 *
 * Vil du bli kvitt en egen vare, sveiper du den mot venstre. Det er et bevisst
 * trykk på akkurat den varen, ikke en opprydding.
 */
import type { ShoppingItem } from './types.ts';

export interface ClearPlan {
  /** Arkiveres: havner i Varer-fanen, kan hentes tilbake derfra. */
  remove: ShoppingItem[];
  /** Egne varer som blir stående. Kvitteringen teller disse. */
  kept: ShoppingItem[];
  /** De av dem som var haket av. Haken tas av, varen blir. */
  uncheck: ShoppingItem[];
}

export function planClear(candidates: readonly ShoppingItem[]): ClearPlan {
  const kept = candidates.filter((item) => item.manual);
  return {
    remove: candidates.filter((item) => !item.manual),
    kept,
    uncheck: kept.filter((item) => item.checked),
  };
}

/**
 * Sier hva som faktisk skjedde, inkludert de egne som ble stående. Uten det
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
  return `${first} · ${kept} ${kept === 1 ? 'egen vare står' : 'egne varer står'} igjen`;
}
