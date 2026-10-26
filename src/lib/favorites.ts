/**
 * «Ofte kjøpt»: varene som står klare til ett trykk under skrivefeltet.
 *
 * Rangert etter hvor ofte dere kjøper dem, med et lite dytt for det dere
 * kjøpte nylig. Rent antall alene ville latt en vare dere kjøpte tjue ganger
 * i fjor ligge øverst for alltid; ren nyhet ville latt én tilfeldig vare fra
 * i går skyve melka ned. Halveringstiden på en måned gjør at vaner som endrer
 * seg, slår igjennom i løpet av noen uker.
 */
import type { ShoppingItem } from './types.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Etter så mange dager teller et kjøp halvparten. */
const HALF_LIFE_DAYS = 30;

/** Høyere er mer brukt. Eksportert for testene. */
export function favoriteScore(item: ShoppingItem, now: number): number {
  const last = Date.parse(item.last_used_at);
  const days = Number.isFinite(last) ? Math.max(0, (now - last) / DAY_MS) : 365;
  return item.use_count / (1 + days / HALF_LIFE_DAYS);
}

/**
 * Det som ikke allerede står på lista, mest brukte først.
 *
 * En vare som bare har kommet med en oppskrift, én gang, hører ikke hjemme
 * her: hvitløken fra lasagnen er ikke noe dere «ofte kjøper». Telleren får
 * +1 når varen havner på lista og +1 når den hakes av, så én lasagne gir 2.
 * Først når den er kommet tilbake en gang til (3), eller du har lagt den inn
 * selv, er den en favoritt.
 */
export function rankFavorites(
  register: readonly ShoppingItem[],
  onList: readonly ShoppingItem[],
  now: number = Date.now(),
): ShoppingItem[] {
  const taken = new Set(onList.map((item) => item.normalized_name));
  return register
    .filter((item) => !taken.has(item.normalized_name))
    .filter((item) => item.manual || item.use_count >= 3)
    .map((item) => ({ item, score: favoriteScore(item, now) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.item.last_used_at.localeCompare(a.item.last_used_at) ||
        a.item.name.localeCompare(b.item.name, 'nb'),
    )
    .map(({ item }) => item);
}

/**
 * Treff mens du skriver. Navn som begynner med det du skrev, kommer før navn
 * som bare inneholder det — «mel» skal gi mel og melk før karamell. Innenfor
 * hver gruppe: mest brukt først.
 */
export function searchRegister(
  register: readonly ShoppingItem[],
  onList: readonly ShoppingItem[],
  query: string,
  now: number = Date.now(),
): ShoppingItem[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  const taken = new Set(onList.map((item) => item.normalized_name));
  return register
    .filter((item) => !taken.has(item.normalized_name))
    .map((item) => {
      const name = item.name.toLowerCase();
      const rank = name.startsWith(q) ? 0 : name.split(/\s+/).some((word) => word.startsWith(q)) ? 1 : name.includes(q) ? 2 : -1;
      return { item, rank, score: favoriteScore(item, now) };
    })
    .filter((hit) => hit.rank >= 0)
    .sort((a, b) => a.rank - b.rank || b.score - a.score || a.item.name.localeCompare(b.item.name, 'nb'))
    .map(({ item }) => item);
}
