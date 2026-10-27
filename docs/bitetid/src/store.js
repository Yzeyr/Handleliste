/**
 * Det appen husker på telefonen: valgt vann, egne plasser og fangster.
 * Alt ligger i localStorage og forlater aldri telefonen. Lesing og skriving
 * tåler at lagringen er av (privat modus): da glemmer appen bare.
 */

const KEY = 'bitetid.v1';

const empty = () => ({ place: null, spots: [], catches: [], species: 'orret', forecast: null });

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === null ? empty() : { ...empty(), ...JSON.parse(raw) };
  } catch {
    return empty();
  }
}

export function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* full eller avslått lagring: appen virker, men husker ikke */
  }
}

export const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

/**
 * Hva fangstene dine har til felles. Først med tre fangster eller mer —
 * færre er tilfeldigheter. Bare fakta: «4 av 6 ved fallende trykk».
 */
export function catchInsights(catches) {
  if (catches.length < 3) return [];
  const n = catches.length;
  const out = [];
  const count = (pred) => catches.filter(pred).length;

  const falling = count((c) => c.conditions?.pressureTrend != null && c.conditions.pressureTrend <= -0.7);
  if (falling / n >= 0.5) out.push(`${falling} av ${n} fangster kom ved fallende lufttrykk.`);

  const twilight = count((c) => c.conditions?.twilight);
  if (twilight / n >= 0.4) out.push(`${twilight} av ${n} fangster kom rundt soloppgang eller solnedgang.`);

  const solunar = count((c) => c.conditions?.solunar);
  if (solunar / n >= 0.4) out.push(`${solunar} av ${n} fangster kom i en solunar-periode.`);

  const bySpecies = {};
  for (const c of catches) bySpecies[c.species] = (bySpecies[c.species] ?? 0) + 1;
  const [topSpecies, topCount] = Object.entries(bySpecies).sort((a, b) => b[1] - a[1])[0];
  if (topCount >= 2) out.push(`Mest ${topSpecies.toLowerCase()}: ${topCount} av ${n}.`);

  const baits = {};
  for (const c of catches) if (c.bait) baits[c.bait.toLowerCase()] = (baits[c.bait.toLowerCase()] ?? 0) + 1;
  const topBait = Object.entries(baits).sort((a, b) => b[1] - a[1])[0];
  if (topBait && topBait[1] >= 2) out.push(`Beste agn så langt: ${topBait[0]} (${topBait[1]} fangster).`);

  return out;
}
