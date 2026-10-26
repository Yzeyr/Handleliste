import type { Category } from '../lib/types.ts';

/**
 * Hvordan en butikk-seksjon ser ut på skjermen. Fargen settes i CSS via
 * data-cat, så lista, handlemodus og «Ofte kjøpt» bruker samme farge for
 * samme seksjon — øyet lærer at gult er meieri uten å lese overskriften.
 */
const LOOK: Record<Category, { emoji: string; label: string }> = {
  grønt: { emoji: '🥬', label: 'Frukt og grønt' },
  kjøtt: { emoji: '🥩', label: 'Kjøtt' },
  fisk: { emoji: '🐟', label: 'Fisk' },
  meieri: { emoji: '🧀', label: 'Meieri' },
  bakeri: { emoji: '🍞', label: 'Bakeri' },
  frys: { emoji: '🧊', label: 'Frys' },
  tørrvarer: { emoji: '🥫', label: 'Tørrvarer' },
  annet: { emoji: '🧺', label: 'Annet' },
};

export const categoryEmoji = (category: Category): string => LOOK[category].emoji;
export const categoryLabel = (category: Category): string => LOOK[category].label;

/**
 * Egne tegn for de vanligste varene. Melk med et ostetegn ser feil ut, og
 * når knappene står tett, er det tegnet du kjenner igjen først. Ordet må stå
 * først i et ord i navnet: «sjokolademelk» blir melk, «karamell» blir ikke
 * mel. Treffer ingenting, får varen seksjonens tegn.
 */
const ITEM_EMOJI: [string, string][] = [
  ['melk', '🥛'], ['egg', '🥚'], ['brød', '🍞'], ['rundstykk', '🥖'], ['baguett', '🥖'],
  ['banan', '🍌'], ['eple', '🍎'], ['epler', '🍎'], ['pære', '🍐'], ['appelsin', '🍊'],
  ['klementin', '🍊'], ['sitron', '🍋'], ['lime', '🍋'], ['drue', '🍇'], ['jordbær', '🍓'],
  ['blåbær', '🫐'], ['avokado', '🥑'], ['agurk', '🥒'], ['tomat', '🍅'], ['paprika', '🫑'],
  ['gulrot', '🥕'], ['gulrøtter', '🥕'], ['potet', '🥔'], ['løk', '🧅'], ['hvitløk', '🧄'],
  ['brokkoli', '🥦'], ['salat', '🥬'], ['mais', '🌽'], ['sopp', '🍄'], ['chili', '🌶️'],
  ['smør', '🧈'], ['ost', '🧀'], ['norvegia', '🧀'], ['jarlsberg', '🧀'], ['yoghurt', '🥣'],
  ['kaffe', '☕'], ['te', '🍵'], ['juice', '🧃'], ['brus', '🥤'], ['cola', '🥤'], ['øl', '🍺'],
  ['vin', '🍷'], ['vann', '💧'], ['pizza', '🍕'], ['pasta', '🍝'], ['spagetti', '🍝'],
  ['ris', '🍚'], ['mel', '🌾'], ['havre', '🥣'], ['müsli', '🥣'], ['frokostblanding', '🥣'],
  ['sukker', '🍬'], ['sjokolade', '🍫'], ['kjeks', '🍪'], ['chips', '🍟'], ['pommes', '🍟'],
  ['kylling', '🍗'], ['bacon', '🥓'], ['pølse', '🌭'], ['kjøttdeig', '🥩'], ['biff', '🥩'],
  ['laks', '🐟'], ['torsk', '🐟'], ['reker', '🦐'], ['taco', '🌮'], ['tortilla', '🌯'],
  ['honning', '🍯'], ['salt', '🧂'], ['is', '🍦'], ['dopapir', '🧻'], ['toalettpapir', '🧻'],
  ['tørkerull', '🧻'], ['såpe', '🧼'], ['oppvask', '🧽'], ['bleier', '👶'], ['tannkrem', '🪥'],
];

export function itemEmoji(name: string, category: Category): string {
  const words = name.toLowerCase().split(/[\s,.-]+/);
  for (const [key, emoji] of ITEM_EMOJI) {
    // «te» og «is» er så korte at de ville truffet starten på alt mulig
    // («tekstil»), så de må stå som et helt ord.
    const hit =
      key.length <= 2
        ? words.includes(key)
        : words.some((word) => word.startsWith(key) || (key.length >= 4 && word.endsWith(key)));
    if (hit) return emoji;
  }
  return categoryEmoji(category);
}
