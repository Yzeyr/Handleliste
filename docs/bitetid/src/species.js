/**
 * Hvor fisken står, og hvordan du får den, i norske innsjøer.
 *
 * Det finnes ingen data som viser hvor fisken er akkurat nå. Det som finnes,
 * er hva fisken gjør i hver årstid: hvilken dybde, hvilke steder, hvilke agn.
 * Det er det som står her. Årstiden velges ut fra måneden og det grove
 * anslaget på vanntemperaturen.
 */

export const SEASONS = {
  vinter: { name: 'Vinter og is', short: 'Is' },
  vaar: { name: 'Vår og isgang', short: 'Vår' },
  forsommer: { name: 'Forsommer', short: 'Forsommer' },
  sommer: { name: 'Sommer', short: 'Sommer' },
  host: { name: 'Høst', short: 'Høst' },
};

/** Årstid for fisken, ikke for kalenderen: et kaldt vann i mai er fortsatt vår. */
export function fishSeason(month, waterTemp) {
  const w = waterTemp ?? 8;
  if (month === 12 || month <= 3) return 'vinter';
  if (month === 11 || month === 4) return w < 3 ? 'vinter' : month === 4 ? 'vaar' : 'host';
  if (month === 5) return w > 12 ? 'forsommer' : 'vaar';
  if (month === 6) return w < 10 ? 'vaar' : 'forsommer';
  if (month === 7 || month === 8) return 'sommer';
  return 'host';
}

const ALL_SPECIES = [
  {
    id: 'abbor',
    name: 'Abbor',
    latin: 'Perca fluviatilis',
    blurb: 'Stimfisk som jakter i flokk. Finner du én, er det flere.',
    presence: 'Vanlig på Østlandet, mer spredt i Trøndelag.',
    best: 'Morgen og kveld; midt på dagen i kaldt vann.',
    gear: 'Lett stang, 0,20–0,25 mm line eller tynn fletteline.',
    seasons: {
      vaar: {
        where: 'Grunne, solvarme viker og ved innløp. Gyter i mai–juni på kvist, røtter og siv.',
        depth: '1–4 m',
        bait: 'Mark under dupp, liten spinner, jigg 5 cm.',
      },
      forsommer: {
        where: 'Langs sivkanter og vannvegetasjon, der stimene jakter yngel.',
        depth: '1–4 m',
        bait: 'Spinner, liten wobbler, mark.',
      },
      sommer: {
        where: 'Ytterkanten av vegetasjonen og steinete grunner. De store står dypere ved stup.',
        depth: '2–6 m, storabbor 6–10 m',
        bait: 'Dropshot med liten softbait, spinner, jigg 5–7 cm.',
      },
      host: {
        where: 'Samler seg i store stimer ved stup og grunnetopper når vannet kjøles. Finn stimen, så får du mange.',
        depth: '6–12 m',
        bait: 'Jigg og dropshot nær bunnen, balansepilk når det blir kaldt.',
      },
      vinter: {
        where: 'Under isen ved stup og grunner. Bor flere hull og flytt deg til du finner stimen.',
        depth: '5–15 m, nær bunnen',
        bait: 'Balansepilk, blinkpilk med mark eller maggot.',
      },
    },
  },
  {
    id: 'gjedde',
    name: 'Gjedde',
    latin: 'Esox lucius',
    blurb: 'Bakholdsjeger som ligger stille og slår til fort.',
    presence: 'Finnes ikke i de fleste vann i Trøndelag og Namdalen. Sjekk hva som er i ditt vann.',
    best: 'Overskyet og vind, morgen og kveld.',
    gear: 'Kraftig stang og alltid stålfortom: gjedda biter over vanlig line.',
    seasons: {
      vaar: {
        where: 'Gyter like etter isgang i grunne, gressrike viker. Mange vann har lokale regler i gytetida: sjekk fiskekortet.',
        depth: '0,5–2 m',
        bait: 'Sakte agn: softbait, flytende wobbler, dødagn.',
      },
      forsommer: {
        where: 'I bakhold i siv og vannvegetasjon, gjerne ved åpninger i grøden.',
        depth: '1–4 m',
        bait: 'Spinnerbait, store spinnere, wobbler.',
      },
      sommer: {
        where: 'Kanten av vegetasjonen og ved stup. De største står dypere, der byttefisken er.',
        depth: '2–6 m',
        bait: 'Wobbler, jerkbait, softbait 12–20 cm.',
      },
      host: {
        where: 'Høsten er storgjeddetid. Gjedda følger byttefisken ut på stup og odder og spiser seg opp før vinteren.',
        depth: '4–10 m',
        bait: 'Store softbaits og jerkbaits, fisket sakte. Dødagn på dupp.',
      },
      vinter: {
        where: 'Dødagn på vippe ved stup og grunne kanter, gjerne nær gamle grødeområder.',
        depth: '3–8 m',
        bait: 'Dødagn (mort, sik) på vippe eller pilk.',
      },
    },
  },
  {
    id: 'orret',
    name: 'Ørret',
    latin: 'Salmo trutta',
    blurb: 'Vil ha kaldt, rent vann. Sky i sterk sol, modig i skumring.',
    best: 'Skumring og natt om sommeren, hele dagen rett etter isgang.',
    gear: 'Lett stang, 0,20–0,25 mm line. Flue i stille vær.',
    seasons: {
      vaar: {
        where: 'Den beste tida. Rett etter isgang står ørreten nær land og ved innløp og utløp og jakter aktivt.',
        depth: '0,5–3 m',
        bait: 'Sluk (Toby, Møresilda), spinner, mark og dupp, flue.',
      },
      forsommer: {
        where: 'Langs land morgen og kveld. Når insektene klekker, vaker den i overflata.',
        depth: '0–3 m',
        bait: 'Tørrflue og nymfe, lett sluk.',
      },
      sommer: {
        where: 'Når overflata blir varm trekker ørreten dypere om dagen, og kommer opp i skumring og natt. Fisk på vak i stille vær.',
        depth: 'Dagtid 5–15 m, kveld 0–2 m',
        bait: 'Flue på kvelden, dorging eller tungt sluk om dagen.',
      },
      host: {
        where: 'Før gytinga (september–oktober) trekker den mot innløpsbekker. Gytebekker er ofte fredet. Senere på høsten går den nær land igjen.',
        depth: '0,5–4 m',
        bait: 'Sluk og spinner langs land, mark og dupp.',
      },
      vinter: {
        where: 'Isfiske nær land og ved innløp, ofte grunnere enn man tror.',
        depth: '1–4 m',
        bait: 'Mark eller maggot på liten pilk, rett under isen eller midt i vannet.',
      },
    },
  },
  {
    id: 'roye',
    name: 'Røye',
    latin: 'Salvelinus alpinus',
    blurb: 'Fjellvannets fisk. Står kaldt og dypt mesteparten av året.',
    best: 'Morgen og skumring. Klassisk isfiskefisk.',
    gear: 'Kort isfiskestang eller lett stang, tynn line.',
    seasons: {
      vaar: {
        where: 'Ved islossing og like etter står røya grunt og er lett å få.',
        depth: '2–8 m',
        bait: 'Maggot, liten blank pilk, mark.',
      },
      forsommer: {
        where: 'Trekker dypere etter hvert som vannet varmes.',
        depth: '8–20 m',
        bait: 'Dorging, tung flue eller pilk på dypet.',
      },
      sommer: {
        where: 'Kaldt, dypt vann i store, klare innsjøer.',
        depth: '15–30 m',
        bait: 'Dypfiske med pilk eller mormyshka, dorging.',
      },
      host: {
        where: 'Gyter om høsten på grus og stein, og kommer grunnere.',
        depth: '1–10 m',
        bait: 'Liten sluk, pilk med maggot.',
      },
      vinter: {
        where: 'Fisk nær bunnen og løft sakte. Røya går ofte i stimer langs bunnen.',
        depth: '5–15 m',
        bait: 'Mormyshka, liten pilk og maggot.',
      },
    },
  },
  {
    id: 'sik',
    name: 'Sik',
    latin: 'Coregonus lavaretus',
    blurb: 'Planktonspiser i stim. Biter forsiktig, så vær rask på kroken.',
    best: 'Kveld, og om høsten når den kommer opp på grunna.',
    gear: 'Lett stang med følsom tupp, små kroker.',
    seasons: {
      vaar: {
        where: 'Følger planktonet; ofte grunt etter islossing.',
        depth: '2–6 m',
        bait: 'Maggot eller mark på liten krok, små nymfer.',
      },
      forsommer: {
        where: 'Står i stimer ute i de frie vannmassene og spiser plankton og insektlarver.',
        depth: '5–15 m',
        bait: 'Små nymfer og fluer, maggot.',
      },
      sommer: {
        where: 'Dypere når overflata er varm. Krevende å få om sommeren.',
        depth: '10–25 m',
        bait: 'Små nymfer på dypet, maggot.',
      },
      host: {
        where: 'Gyter på grunt i oktober–november. Mange får sik på grunna om kvelden nå.',
        depth: '1–5 m',
        bait: 'Små fluer og nymfer, maggot på liten krok.',
      },
      vinter: {
        where: 'Nær bunnen under isen. Sik biter forsiktig: se på tuppen, ikke kjenn etter.',
        depth: '5–15 m',
        bait: 'Små pilker og mormyshka med maggot.',
      },
    },
  },
];

/** Ørret og røye først: de vanligste artene i vann rundt Namsos og i Namdalen. */
const ORDER = ['orret', 'roye', 'abbor', 'sik', 'gjedde'];
export const SPECIES = ORDER.map((id) => ALL_SPECIES.find((s) => s.id === id));

/** Tips som gjelder alle arter, valgt ut fra været nå. */
export function conditionTips(hour, season) {
  const tips = [];
  if (hour) {
    if (hour.wind >= 3 && hour.wind < 9) {
      tips.push('Fisk på vindsiden: vinden fører mat og småfisk inn mot land der.');
    }
    if (hour.wind < 1) tips.push('Blikkstille: fisk lenger fra båten og bruk tynnere line, fisken er sky.');
    if (hour.pressureTrend !== null && hour.pressureTrend >= 2) {
      tips.push('Trykket stiger etter en front: fisken står ofte dypere og tregere. Sakte og dypt.');
    }
    if (hour.sunAlt > 25 && hour.cloud < 30) {
      tips.push('Sterk sol: let i skyggen, ved stup og under vegetasjon.');
    }
  }
  if (season === 'vinter') {
    tips.push('Isen: minst 10 cm stålis for å gå. Råk ved innløp, utløp og strømmer. Usikker? La være.');
  }
  if (season === 'vaar') tips.push('Rett etter isgang er vannet kaldest i dypet og varmest i grunne, solvendte viker.');
  return tips;
}
