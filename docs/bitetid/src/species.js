/**
 * Hvor fisken står, og hvordan du får den, i norske innsjøer og lakseelver.
 *
 * Det finnes ingen data som viser hvor fisken er akkurat nå. Det som finnes,
 * er hva fisken gjør i hver årstid: hvilken dybde, hvilke steder, hvilke agn.
 * Det er det som står her. Årstiden velges ut fra måneden og det grove
 * anslaget på vanntemperaturen.
 *
 * Elveartene (laks og sjøørret) har water: 'elv', rules og links. I elva er
 * fisket stengt store deler av året, og regler og kvoter endres fra år til år,
 * så teksten sier heller «sjekk» enn å late som den vet. Arter uten water er
 * innsjøarter.
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
        bait: 'Dødagn (mort, sik) fra samme vann på vippe eller pilk. Levende agnfisk er ikke lov.',
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
  {
    id: 'laks',
    name: 'Laks',
    latin: 'Salmo salar',
    water: 'elv',
    // Måneder elvefisket normalt er åpent (Namsen 2026: 1. juni–15. september
    // øverst). Utenfor dem foreslår appen ikke redskap.
    openMonths: [6, 7, 8, 9],
    blurb: 'Kommer fra havet for å gyte og spiser ikke i elva. Den biter av refleks, nysgjerrighet eller aggresjon.',
    presence: 'Namsen er en av de store lakseelvene i landet. Laksen går opp gjennom hele sommeren.',
    best: 'Når vannet synker og klarner etter flom eller regn, og når det kommer frisk fisk. Morgen og kveld på varme dager. Vannføring og vanntemperatur betyr mer enn månen.',
    gear: 'Tohånds- eller enhåndsflue, eller kraftig spinnestang med 0,35–0,45 mm line. Utstyr som har vært i andre vassdrag må desinfiseres.',
    // Fisketidene for 2026 er sjekket mot Namsenvassdraget Elveierlags «Fiskeregler for
    // sesongen 2026» (https://lakseelver.no/nb/fiskeregler, publisert 4.7.2026), som også
    // krever elvekort og rapportering innen 24 timer. Kvotene er ikke tatt med: de ble
    // endret ved midtsesongevalueringen i juli 2026, og en kvote i appen blir fort feil.
    rules: 'Fisketid og kvoter settes på nytt hvert år og kan strammes inn midt i sesongen; i 2026 var Namsen åpen 1. juni–31. august nedenfor Nedre Fiskumfoss og 1. juli–15. september ovenfor. Du trenger elvekort for Namsenvassdraget, fiskekort for sonen og betalt fiskeravgift, og all fangst skal rapporteres i laksebørsen innen 24 timer – sjekk elveeierlagets sider før hver tur.',
    links: [
      // NVE-stasjonen Tørrisdal (139.32.0) ligger i Grong og måler vannføring og
      // vanntemperatur i hovedelva. Det er det nærmeste du kommer «hvordan er elva nå».
      { label: 'Vannføring og temperatur i Namsen (NVE, Tørrisdal)', href: 'https://sildre.nve.no/station/139.32.0' },
      { label: 'Namsenvassdraget Elveierlag', href: 'https://lakseelver.no/nb/elver/namsenvassdraget' },
      { label: 'Fiskeregler for Namsen', href: 'https://lakseelver.no/nb/fiskeregler' },
      { label: 'Elvekort for Namsenvassdraget (Elveguiden)', href: 'https://elveguiden.no/no/elvekort/127' },
    ],
    seasons: {
      vinter: {
        where: 'Fiske etter laks er stengt nå. Følg med på snøen i fjellet: mye snø gir stor og kald vårflom og ofte en sen start på sesongen.',
        depth: '–',
        bait: 'Forbered sesongen: bind eller kjøp fluer i flere størrelser, sjekk snører og fortommer, og ha tunge sluker og wobblere klare for høyt vann.',
      },
      vaar: {
        where: 'Fiske etter laks er normalt stengt fram til sesongstart i juni; enkelte sideelver åpner litt før. Er det åpnet og elva fortsatt stor og kald av snøsmelting, står laksen i roligere vann nær land, ikke midt i hovedstrømmen.',
        depth: '–, i åpen sesong 1–3 m nær land',
        bait: 'Gjør klar utstyr for storvann: synkeline, tunge tuber, store sluker og wobblere. Kjøp kort og sjekk årets regler.',
      },
      forsommer: {
        where: 'Sesongstart, og storlaksen kommer tidlig. I høyt, kaldt vann hviler laksen i bakevjer, innersvinger og bak steiner og odder. Det blir ofte bra når flommen begynner å synke og klarne.',
        depth: '1–3 m, nær land i høyt vann',
        bait: 'Store, tunge fluer på synkeline. Sluk og wobbler som går dypt og sakte.',
      },
      sommer: {
        where: 'Hovedsesongen, og smålaksen kommer for fullt. Laksen står i kulper, strømkanter, nakker der strømmen går inn i kulpen, og bak steiner. Etter regn blir det ofte godt når vannet synker igjen. Lavt, varmt vann midt på sommeren gir tregt fiske: fisk tidlig morgen, sen kveld og natt.',
        depth: '1–3 m i kulper og strømkanter',
        bait: 'Små fluer (str. 10–14) på flytende line i lavt, klart vann. Større og mørkere fluer, sluk og spinner i farget vann.',
      },
      host: {
        where: 'Fisket stenger normalt i slutten av august i nedre del av Namsen og noe senere lenger opp. Laksen gyter i oktober–november på grus og er fredet; la gyteplassene være i fred.',
        depth: '–, der det fortsatt er åpent 1–3 m',
        bait: 'Der det fortsatt er åpent: laksen er farget og treg, prøv noe den ikke har sett – sterke farger eller en helt annen størrelse. Ellers: rens og tørk utstyret.',
      },
    },
  },
  {
    id: 'sjoorret',
    name: 'Sjøørret',
    latin: 'Salmo trutta',
    water: 'elv',
    openMonths: [6, 7, 8, 9],
    blurb: 'Ørret som vandrer ut i sjøen for å spise og kommer tilbake til elva. Svært sky i dagslys.',
    presence: 'Går opp i Namsen og i mange mindre elver i Namdalen.',
    best: 'Skumring og natt i juli og august, gjerne overskyet. Fisken går opp når vannet stiger etter regn.',
    gear: 'Enhåndsflue klasse 5–7 eller lett spinnestang med 0,25–0,30 mm line.',
    // Minstemålet på 35 cm i Namsen er sjekket mot «Fiskeregler for sesongen 2026»
    // (https://lakseelver.no/nb/fiskeregler). Døgnkvoten står ikke her: den varierer
    // mellom elver og år.
    rules: 'Sjøørret i elva følger normalt samme fisketid som laksen, med egne døgnkvoter og minstemål som settes hvert år (i Namsen 2026: minst 35 cm). Du trenger fiskekort og betalt fiskeravgift, fangst skal rapporteres, og fiske i sjøen har egne regler – sjekk reglene for elva før du drar.',
    links: [
      { label: 'Vannføring og temperatur i Namsen (NVE, Tørrisdal)', href: 'https://sildre.nve.no/station/139.32.0' },
      { label: 'Fiskeregler for Namsen', href: 'https://lakseelver.no/nb/fiskeregler' },
      { label: 'Lakseregisteret: fakta og fisketider for elva', href: 'https://lakseregisteret.statsforvalteren.no/' },
      { label: 'Fiskekort på Inatur', href: 'https://www.inatur.no/' },
    ],
    seasons: {
      vinter: {
        where: 'Fiske etter sjøørret i elva er stengt nå. Mye av fisken overvintrer i elva eller i roligere vann nær munningen. I sjøen kan det være lov å fiske: sjekk reglene for området.',
        depth: '–',
        bait: 'Forbered sesongen: små, mørke fluer for nattfiske og lette sluker.',
      },
      vaar: {
        where: 'Fiske etter sjøørret i elva er normalt stengt. Fisken som har overvintret i elva går ut i sjøen for å spise.',
        depth: '–',
        bait: 'Kjøp kort og sjekk årets regler før sesongen. I sjøen, der det er lov: lette sluker og fluer langs land.',
      },
      forsommer: {
        where: 'Sesongen åpner, men hovedoppgangen kommer først utover sommeren. Den første sjøørreten som går opp er ofte stor.',
        depth: '1–2 m i rolige partier',
        bait: 'Fluer og små sluker; litt tyngre og større i høyt vann.',
      },
      sommer: {
        where: 'Beste tida, særlig juli–august. Om dagen står sjøørreten i dype, rolige høler og under overheng. I skumring og natt går den ut i kulphaler og på grunnere glattstrøm. Gå forsiktig, hold deg unna kanten og ikke lys på vannet.',
        depth: 'Dag 1–3 m i høler, natt 0,5–1,5 m i kulphaler',
        bait: 'Små, mørke fluer (str. 8–12) om natta, også i overflata. Små sluker og spinnere i skumring.',
      },
      host: {
        where: 'Fisket stenger normalt i slutten av august eller midten av september. Sjøørreten gyter i oktober–november på grus i elva og sidebekkene og er fredet.',
        depth: '–, der det fortsatt er åpent 1–2 m',
        bait: 'Der det fortsatt er åpent: litt større fluer og sluk i farget vann. Ellers: rens og tørk utstyret.',
      },
    },
  },
];

/** Ørret og røye først: de vanligste artene i vann rundt Namsos og i Namdalen. Elveartene sist. */
const ORDER = ['orret', 'roye', 'abbor', 'sik', 'gjedde', 'laks', 'sjoorret'];
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
