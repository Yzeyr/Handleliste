/**
 * «Slik får du fisk likevel»: et konkret råd for hver ting som trekker ned.
 *
 * Dårlige forhold betyr sjelden at fisken ikke spiser i det hele tatt, men
 * at den står et annet sted og spiser mindre. Rådene sier hvor, og hvordan
 * du fisker for å nå den.
 */

const TIPS = {
  Nordavind:
    'Fisk dypere og saktere, rett over bunnen. Bruk små agn som mark, liten jigg eller balansepilk, og fisk på lesiden, der vannet er roligst og varmest.',
  'Kaldt vindskifte':
    'Etter et brått temperaturfall står fisken stille og dypt. Senk tempoet kraftig: la agnet ligge, rist forsiktig, og gi den tid.',
  'Trykket stiger raskt — ofte tregt etter en front':
    'Etter en front står fisken dypt og nær bunnen. Fisk sakte med mindre agn, gjerne mark, og prøv stup og dype kanter.',
  'Stigende lufttrykk': 'Gå litt dypere og ned i størrelse på agnet. Fisken tar fortsatt, men mer forsiktig.',
  'Sterk sol':
    'Let i skyggen: under trær langs land, ved stup og under vegetasjon. Eller fisk dypere, eller vent til sola står lavere.',
  'Blikkstille, fisken er sky':
    'Bruk tynnere line, kast lenger og vær stille. Flue eller lett sluk fra land, og hold deg unna kanten med skyggen din.',
  Mørkt: 'Ørret tar gjerne nær land i mørket, særlig om sommeren. Ellers er det lurt å være på plass til gry.',
  'Kraftig regn':
    'Prøv ved innløp, der bekken fører mat ut, men unngå grumsete flomvann. Bruk sterke farger, eller mark som fisken kan lukte.',
};

/** Råd når det ikke er noe spesielt som trekker ned, men det er tregt. */
const GENERAL =
  'Når ingenting skiller seg ut, er det lyset som avgjør: vær på plass i skumringen, og fisk sakte og grundig mellom toppene.';

/**
 * Rådene for en time, i samme rekkefølge som grunnene som trekker mest ned.
 * Tom liste når det går bra og ingenting trekker ned.
 */
export function badConditionTips(score, reasons) {
  const tips = reasons
    .filter((r) => r.points < 0 && TIPS[r.text])
    .map((r) => ({ for: r.text, tip: TIPS[r.text] }));
  if (tips.length === 0 && score < 30) tips.push({ for: 'Tregt', tip: GENERAL });
  return tips;
}

export { TIPS };

const SIDES = ['nord', 'nordøst', 'øst', 'sørøst', 'sør', 'sørvest', 'vest', 'nordvest'];

/**
 * Hvor du bør stå ut fra vindretningen.
 *
 * Vinden skyver overflatevannet, planktonet og småfisken mot den siden av
 * vannet den blåser mot. På siden den kommer fra, kan kaldere vann komme
 * opp fra dypet. Derfor: fisk på siden der du har vinden i ansiktet. I
 * nordavind er det sørsiden. Er det kuling, gjelder sikkerheten først: da
 * er le-siden (der vinden kommer fra) tryggest, men fisken står fortsatt
 * mot vindsiden.
 *
 * Gir null i stille vær, når retningen ikke betyr noe.
 */
export function windSpot(hour) {
  if (!hour || hour.wind == null || hour.wind < 2) return null;
  const dir = (((hour.windDir ?? 0) % 360) + 360) % 360;
  const from = SIDES[Math.round(dir / 45) % 8];
  const toward = SIDES[(Math.round(dir / 45) + 4) % 8];
  const north = dir >= 315 || dir <= 45;
  const cold = hour.tempTrend != null && hour.tempTrend <= -2;
  let text = `Vinden kommer fra ${from}. Fisk på ${toward}siden av vannet, der den blåser inn mot land: der samles mat og småfisk.`;
  if (north) {
    text += cold
      ? ' Nordavinden er kald nå, så fisken står dypere: fisk sakte og nær bunnen der.'
      : ' I nordavind står fisken gjerne litt dypere enn vanlig.';
  }
  if (hour.wind >= 14) text += ` Det er kuling, så hold deg på land, gjerne i le på ${from}siden.`;
  return { from, toward, text };
}
