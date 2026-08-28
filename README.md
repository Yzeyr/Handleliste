# Handleliste

Delt handleliste + middagsplanlegger for to personer. Vite + TypeScript +
Supabase (Postgres + realtime). Ingen rammeverk, ingen UI-bibliotek, mobil
først.

Den ene tingen appen faktisk er bygget rundt: velger du flere middager som
bruker samme ingrediens, blir det **én linje** på handlelista med summert
mengde — ikke én linje per oppskrift.

## Kom i gang

```
npm install
npm run dev:mock     # prøv appen med jukse-data, uten Supabase
```

For ekte, delt liste:

1. Lag et gratis prosjekt på [supabase.com](https://supabase.com).
2. SQL Editor → kjør `supabase/setup.sql` (skjema + de 19 middagene i én fil).
   Har du kjørt en eldre `setup.sql` fra før, kjør migreringene i stedet, i
   nummerrekkefølge: `03_history.sql`, `04_notifications.sql`,
   `05_edit_undo_aliases.sql`, `06_manual.sql`, `07_varsler.sql`,
   `08_faste_varer.sql`. De legger bare til det som er nytt, og er trygge å
   kjøre flere ganger.
3. `cp .env.example .env` og fyll inn URL + anon key fra Project Settings → API.
4. `npm run dev`

| kommando | hva |
|---|---|
| `npm run dev` | dev-server mot Supabase |
| `npm run dev:mock` | dev-server med datalaget i minnet, 6 middager, ingen database |
| `npm test` | enhetstester for navne- og mengdesammenslåing |
| `npm run build` | typesjekk + produksjonsbygg til `dist/` |
| `npm run build:single` | alt inn i én fil: `docs/index.html` (det GitHub Pages serverer) |

## Legge den ut på GitHub Pages

`docs/index.html` er hele appen i én fil — CSS og JS limt inn, ingen eksterne
kall. Den er sjekket inn ferdig bygget, så Pages trenger ikke noe byggesteg:

1. Settings → Pages → Deploy from a branch → `main` / `/docs`.
2. Åpne adressen på begge telefonene og lim inn Supabase-nøklene.

Etter en kodeendring: `npm run build:single`, og commit `docs/index.html`
sammen med endringen.

Nøklene spørres om i appen og lagres i `localStorage` på hver telefon, så
fila trenger ikke bygges på nytt når dere har opprettet prosjektet. Telefon
nummer to slipper å taste noe: tannhjulet i appen gir en delingslenke med
oppsettet i fragmentet (`#k=...`), og den som åpner den er koblet til med én
gang.

En delingslenke kan komme fram på tre måter, og alle tre virker:

1. **Vanlig sidelasting** med lenka.
2. **Appen står allerede åpen** på samme adresse. Da bytter nettleseren bare
   fragment uten å laste siden på nytt — appen fanger `hashchange`, tar i bruk
   oppsettet og starter selv.
3. **Fragmentet kom aldri fram**, for eksempel fordi meldingsappen kortet ned
   lenka. Da står det et felt på oppsettsskjermen der hele lenka kan limes inn.

`shareLink.ts` er ren og testet, nettopp fordi punkt 3 betyr at teksten kan
komme i alle slags tilstander. Vil du
heller bake dem inn ved bygging, legg dem i `.env` før `npm run build:single`
— da hopper appen rett til lista.

På telefonen: «Legg til på Hjem-skjerm» gir et sandwich-ikon som åpner uten
nettleserfelt. Det er ikke en full PWA — den trenger nett for å snakke med
Supabase, og det finnes ingen service worker.

Ikonet er tegnet i `icons/icon.svg` og gjengitt til PNG med Chromium, fordi
iOS ikke godtar SVG som `apple-touch-icon`. PNG-ene og manifestet ligger i
`public/` og kopieres til `docs/` av byggeskriptet — de kan ikke limes inn i
HTML-en, iOS henter dem som egne filer.

## Skjermbilder av flyten

Middager → «+ Uke» på de du vil ha → fanen Uke viser nøyaktig hvilke linjer
som kommer på lista, med sammenslåtte mengder → «Legg til i handleliste».

## Datamodell

Fire tabeller. `meals` + `meal_ingredients` er oppskriftene (leses, endres
sjelden). `shopping_list_items` er selve lista (endres hele tiden, har
realtime på seg). `week_plan_items` er ukemenyen.

### `meals`
| kolonne | type | hva |
|---|---|---|
| `id` | uuid | pk |
| `name` | text unik | "Fiskegrateng" |
| `emoji` | text | ikon i lista |
| `description` | text | én linje |
| `servings` | smallint | porsjoner oppskriften er skrevet for |
| `steps` | text[] | 3-5 korte tilberedningssteg |
| `tags` | text[] | "rask", "fredag", "ovn" — til filtrering senere |

### `meal_ingredients`
| kolonne | type | hva |
|---|---|---|
| `id` | uuid | pk |
| `meal_id` | uuid | → `meals.id`, cascade delete |
| `name` | text | vises som skrevet: "Crème fraîche" |
| `normalized_name` | text | nøkkel for sammenslåing: `creme fraiche` |
| `amount` | numeric, kan være null | null = "etter smak" |
| `unit` | text, kan være null | `g` `kg` `dl` `l` `ml` `ss` `ts` `stk` `pk` `boks` `pose` `fedd` |
| `category` | text | butikk-seksjon, se under |
| `sort_order` | smallint | rekkefølge i oppskriften |

### `shopping_list_items`
| kolonne | type | hva |
|---|---|---|
| `id` | uuid | pk |
| `name` | text | "Helmelk" |
| `normalized_name` | text, **unik indeks** | `helmelk` — dette er garantien mot duplikat-rader |
| `quantities` | jsonb | `[{"amount":5,"unit":"dl"}]` |
| `category` | text | butikk-seksjon |
| `checked` | boolean | huket av i butikken; raden blir stående, gråtonet, nederst |
| `archived` | boolean | har vært på lista, står ikke på den nå — dette er vareregisteret |
| `use_count` | integer | hvor mange ganger varen har vært lagt til; sorterer historikken |
| `manual` | boolean | lagt inn for hånd minst én gang, ikke bare via oppskrift |
| `last_used_at` | timestamptz | sist varen ble lagt til eller fjernet |
| `updated_by` | text | navnet på telefonen som sist skrev til raden |
| `version` | integer | telles opp av en trigger; grunnlaget for sammenlign-og-bytt |
| `source_meals` | text[] | `{Lasagne,Fiskesuppe}` — vises som "fra Lasagne, Fiskesuppe". Tom = lagt inn manuelt |
| `note` | text | fritekst, f.eks. "den billige" |
| `created_at` / `updated_at` | timestamptz | `updated_at` settes av trigger |

### `week_plan_items`
| kolonne | type | hva |
|---|---|---|
| `meal_id` | uuid unik | → `meals.id` |
| `added_to_list` | boolean | om middagen alt er lagt til handlelista |

Kategorier: `grønt` `kjøtt` `fisk` `meieri` `tørrvarer` `frys` `bakeri` `annet`.

## Hvordan sammenslåingen virker

Kjernekravet: to middager som bruker helmelk skal gi **én** linje.

Ett felt holder: skriv **«2 l melk»**, **«500 g kjøttdeig»** eller bare
**«brød»** og trykk Enter. Mengde og enhet plukkes ut av teksten med samme
tolkning som brukes på innlimte oppskrifter, og kategorien finnes selv — fra
varen dere har kjøpt før, ellers gjettet fra navnet. En linje under feltet
viser hva som blir lagt til mens du skriver.

Feltene for mengde, enhet og kategori ligger bak «Mengde og kategori» og er
bare til å overstyre med. De folder seg ikke ut av seg selv: et skjema som
vokser når du trykker i det dytter lista nedover uten grunn.

Trykker du i feltet, kommer **varene dere har lagt inn selv** — nyeste først,
med mengden de hadde sist. Ingredienser som bare har kommet med en oppskrift
(hvitløk, tomatpuré, potetmel) holdes utenfor: de hører hjemme i Varer, ikke
i det som spretter opp når du skal skrive en handleliste.

Skriver du noe, letes det derimot i alt — «hvitl» finner hvitløk. Da leter du
etter noe bestemt, og appen skal finne det.

Skillet ligger i kolonnen `manual`, som settes når en vare legges til uten
middagsopphav og aldri slås av igjen. Legger du inn rømme for hånd én gang,
er den din fra da av. Ett trykk legger til, uten skriving. Det
du allerede har på lista vises ikke. Skriver du, filtreres de.

Panelet legger seg **oppå** lista i stedet for å dytte den nedover: et panel
som endrer høyden på det under seg flytter radene mellom at fingeren går ned
og opp, og da havner trykket feil. Det lukkes når du legger til med Enter —
ellers ville det stått og dekket lista du nettopp la noe til i — men blir
stående når du legger til fra forslagene, for da holder du på med flere.

Sorteringen er bevisst nyeste først her, ikke mest kjøpte som i Varer: det du
handlet sist er det du mest sannsynlig skal handle igjen.

En rad på lista kan endres i ettertid — navn, mengde og kategori — via `⋯`. Sletting ligger
inne i det skjemaet, ikke som en knapp ved siden av avhukingen, og alt som
fjerner noe kan angres i noen sekunder etterpå.

**1. Navn → nøkkel.** `normalize(name)`: små bokstaver, trim, kollaps
mellomrom, fjern bindestreker/punktum, fjern aksenter (`crème` → `creme`),
og til slutt slå opp i en synonymtabell. Synonymtabellen er den som gjør
"H-melk" og "helmelk" til samme vare:

```
hmelk | hmelk 3 | helmelk 3      -> helmelk
lettmelk 1 | lettmelk 05         -> lettmelk
kremfløte | pisk fløte           -> flote
hakkede tomater | knuste tomater -> hermetiske tomater
...
```

Den er en ren datatabell i klienten. Egne varianter legges til i appen under
tannhjulet og lagres i `ingredient_aliases`; de leses ved oppstart og går
foran de innebygde. De får peke videre inn i dem («qmelk» → «melk» →
«helmelk»), med et tak på antall hopp så et par som peker på hverandre ikke
snurrer i ring.

**2. Mengde → felles enhet.** Enheter grupperes i dimensjoner:

| dimensjon | basisenhet | omregning |
|---|---|---|
| vekt | g | kg = 1000, hg = 100 |
| volum | ml | l = 1000, dl = 100, ss = 15, ts = 5 |
| antall | stk | — |
| øvrige (`pk`, `boks`, `pose`, `fedd`) | seg selv | summeres bare med seg selv |

Samme dimensjon → summeres. `3 dl + 2 dl = 5 dl`. `500 g + 1 kg = 1,5 kg`.

**3. Visningsenhet.** Brukte alle bidragene samme enhet, beholdes den
(`2 ss + 1 ss = 3 ss`, ikke `45 ml`). Ellers velges største enhet i
stigen der tallet blir ≥ 1: `1500 g → 1,5 kg`, `300 ml → 3 dl`, `15 ml → 15 ml`.

**4. Når det ikke går opp.** Ulike dimensjoner slås ikke sammen, men havner
som flere elementer i `quantities` på **samme rad**, og vises som
`Helmelk — 3 dl + 2 boks`. Aldri to rader for samme vare.

**5. Mengde uten tall.** `amount = null` ("etter smak") legger seg på lista
uten mengde og blokkerer ikke sammenslåing av de andre bidragene.

Sammenslåingen regnes ut i klienten (`src/lib/merge.ts`): les eksisterende rad
på `normalized_name`, slå sammen, skriv tilbake.

Mellom lesing og skriving kan den andre telefonen ha endret raden. Derfor er
skrivingen en **sammenlign-og-bytt**: den skjer bare hvis `version` fortsatt
er den vi leste. Ellers treffer den ingen rader, og runden går om igjen mot
det som faktisk står der nå — i stedet for å skrive over det de rakk. Fire
forsøk, så gir den opp med en melding. Ved innsetting gjør den unike indeksen
samme jobb: `23505` betyr at noen kom først, og varen slås sammen mot deres
rad i neste runde.

En vare som allerede er huket av, blir haket av igjen når det legges til mer
av den. Trenger dere mer melk enn dere alt har krysset ut, må det synes at
det står igjen å handle.

Reglene er dekket av enhetstester (`npm test`) — blant annet eksempelet fra
kravlista: 3 dl + 2 dl helmelk blir én linje med 5 dl, og «helmelk» + «H-melk»
regnes som samme vare.

## Filer

```
src/lib/normalize.ts   navn -> nøkkel, med synonymtabell
src/lib/units.ts       enheter, omregning, visningsformat
src/lib/merge.ts       all sammenslåingslogikk (ren, uten database)
src/lib/merge.test.ts  tester av det over
src/lib/changes.ts     endring -> setning ("Kari handlet Melk"), ren
src/lib/facts.ts       det appen vet sikkert om en vare, rent og testet
src/lib/parseRecipe.ts innlimt oppskriftstekst -> utkast til middag, rent
src/lib/changes.test.ts tester av det over
src/lib/db.ts          Supabase-kall og realtime
src/lib/localStore.ts  lista i minnet; brukes av offline-laget og av mock
src/lib/intent.ts      en handling beskrevet så den kan utføres senere
src/lib/offlineStore.ts lokal kopi + kø + synkronisering
src/lib/db.mock.ts     samme API i minnet, for npm run dev:mock
src/views/             liste, middager, uke, varer, middagsredigering
```

## Egne middager

De 19 middagene er et utgangspunkt, ikke fasiten. «+ Ny» under Middager, og
«Endre oppskriften» inne i et kort, skriver rett til `meals` og
`meal_ingredients`. Ingrediensene skrives om i sin helhet ved lagring
framfor å flettes rad for rad — en oppskrift er liten, og «slett alt og skriv
nytt» kan ikke etterlate en ingrediens du fjernet i skjemaet.

## Én skjerm for det daglige

Regelen appen styres etter: **alt du gjør stående i butikken eller på
kjøkkenet skal skje på Liste, uten å bytte fane.** Se hva som mangler, legge
til noe, hake av. De andre fanene er for det man gjør sittende — planlegge
uka, skrive en oppskrift, rydde i vareregisteret.

Det er derfor forslagene ligger under skrivefeltet i stedet for i Varer, det
er derfor mengde og kategori leses ut av samme felt, og det er derfor
avhukede varer samles nederst i stedet for å spres utover. Hver gang noe
dagligdags krever et fanebytte, er det et tegn på at det hører hjemme et
annet sted.

## Handlemodus

«🛒 Start handling» øverst på lista tar over hele skjermen. Faner, skjema,
tannhjul og radmenyer forsvinner; igjen står store rader med navn og mengde,
gruppert i den rekkefølgen man går gjennom butikken, og «7 / 17 varer» med en
framdriftsstripe øverst.

Avhukede varer samles i én bolk nederst, gjennomstreket. Det som står igjen å
handle krymper mens du går; det du har tatt er fortsatt synlig, men ute av
veien. (Motsatt av det som sto her før — jeg mente butikkrekkefølgen var mer
verdt enn å rydde unna, og det viste seg å være feil i faktisk bruk.)

Er alt haket av, tilbyr den «Rydd bort og avslutt», som arkiverer varene
(altså rett i vareregisteret) og går ut av modusen.

Modusen ligger i `localStorage`, så en omlasting midt i butikken ikke kaster
deg ut av den, og appen ber om `wakeLock` mens den er på — en telefon som
låser seg mellom hver vare er den raskeste måten å gjøre en handleliste
ubrukelig på. Støttes ikke overalt, og da oppfører den seg som før.

## Lime inn en oppskrift

Under Middager: «eller lim inn en oppskrift». Marker oppskriften på en
nettside, kopier, lim inn. `parseRecipe.ts` plukker ut navn, porsjoner,
ingredienser med mengde og enhet, og framgangsmåte, og foreslår kategori ut
fra navnet. Resultatet åpnes alltid i middagsskjemaet — tolkningen treffer
det vanlige, ikke alt, og da er det bedre å vise hva den fant enn å lagre noe
du ikke har sett. Linjer uten mengde telles opp og nevnes over skjemaet.

Den takler kulepunkter, `400–600 g` (bruker det laveste), brøker som `1 ½`,
desimalkomma, `Kjøttdeig, 400 g`, presiseringer i parentes, og skiller
framgangsmåte fra ingredienser på overskrift eller nummererte linjer.

**Hvorfor ikke en nettadresse:** en nettside i nettleseren får ikke lov å
hente innhold fra andre domener (CORS). URL-import ville krevd en server i
mellom — en Edge Function — som må deployes fra en datamaskin. Teksten gir
samme resultat uten det leddet.

## Vareregisteret

Varer slettes ikke når de fjernes fra lista — de settes `archived = true`.
Varer-fanen er de radene, mest brukte først: ett trykk på «+» legger varen
tilbake med mengden den hadde sist, og åpner du raden kan du justere den
først.

Mengden blir altså stående på den arkiverte raden som et minne. Den regnes
**ikke** med i noen sum: `planListChange` ser bort fra mengden på arkiverte
rader, ellers ville forrige ukes liter melk blitt lagt til denne ukas
oppskrift. Dekket av test.

Det fine med å gjenbruke raden i stedet for å ha en egen historikktabell: den
unike indeksen på `normalized_name` gjelder fortsatt, så en arkivert
«helmelk» blir *vekket til live* neste gang helmelk trengs — uansett om det
skjer fra historikken, fra en middag eller ved å skrive den inn for hånd. Det
kan ikke oppstå en arkivert og en aktiv rad for samme vare. Dekket av test.

Navnene i registeret foreslås også mens du skriver i «Legg til vare».

Åpner du en rad, står det også **hva appen vet sikkert** om varen: når den
sist ble kjøpt, og hvilke middager den brukes i. «Brukes i» regnes ut fra
oppskriftene slik de er nå, ikke lagret noe sted, så den stemmer med
synonymer og middager dere har endret siden sist.

Bevisst bare fakta. «Kjøpt 8 ganger, sist 21. aug» blir mer nyttig jo lenger
dere bruker appen; «du burde kjøpe denne nå» må treffe nesten hver gang for
å være annet enn støy, og gjør det ikke.

«Slett fra varene» sletter for godt. Det er det eneste stedet i appen noe
faktisk fjernes fra databasen.

## Uten nett

Butikker har dårlig dekning, og det du gjør i en butikk er å hake av. Derfor
er appen bygget lokalt først:

1. Alt som vises kommer fra en kopi i `localStorage`. Lista er på skjermen
   før noe nettverk er forsøkt — også når det ikke er noe nett.
2. Hver handling skrives til kopien først, og legges i en kø.
3. Køen sendes når det er nett igjen. Hver handling **utføres på nytt** mot
   lista slik den faktisk er da, gjennom de samme funksjonene som en vanlig
   handling. «Legg til 3 dl melk» slår seg altså sammen med det den andre
   telefonen rakk å legge inn — den overskriver ikke.
4. Så lenge køen har noe i seg, er den lokale kopien fasit. Først når køen er
   tom lar vi serveren overskrive den. Uten den regelen ville en oppfriskning
   kunne slette noe du nettopp gjorde offline.

Id-er lages på telefonen, ikke av databasen, slik at en vare du la til uten
nett peker på samme rad når køen sendes.

En handling som feiler fordi nettet er borte blir stående i køen. En som
feiler fordi databasen sier nei, kastes — ellers ville køen stått fast for
alltid på noe som aldri kommer til å gå. `sw.js` gjør at selve appen laster
uten nett (nett først, telefonen som reserve).

## Når appen er oppdatert

Service workeren installerer en ny utgave i bakgrunnen og blir stående og
vente. Appen viser da en grønn bar: **Appen er oppdatert — Last inn**. Først
når den trykkes får den nye utgaven ta over, og siden lastes på nytt. Å bytte
kode uten å spørre ville betydd at noen som står midt i butikken plutselig
ser noe annet enn for et sekund siden.

Baren står til den blir trykket, i motsetning til varslene, som forsvinner av
seg selv.

To detaljer som gjør at det virker i det hele tatt:

- `sw.js` må endre seg mellom bygg, ellers ser nettleseren aldri at det finnes
  noe nytt. `build-single.mjs` stempler byggets innholdssum inn i fila — og
  siden Vite navngir chunken etter innholdet, endrer den seg bare når koden
  faktisk har endret seg.
- Registreringen skjer på `sw.js` **uten** versjon i URL-en. Å versjonere
  begge deler lager en ny registrering ved hver oppdatering, og da dukker
  baren opp igjen med en gang du har trykket den bort.

Appen ser etter nye utgaver når den kommer i forgrunnen, og ellers hver
halvtime — en app på hjem-skjermen kan bli liggende åpen i dagevis.

**Ikke i køen:** oppskrifter og synonymer. De endres sjelden, og aldri midt i
en butikk; appen sier fra at det krever nett i stedet for å late som det gikk.
Og to telefoner som endrer *samme* rad hver for seg mens begge er offline —
den som sendes sist vinner for felter som avhuking. Mengder slås sammen, så
der er begge med.

## Realtime og varsler

`shopping_list_items` og `week_plan_items` ligger i `supabase_realtime`.
Klienten abonnerer på alle endringer og henter alt på nytt. `meals` er ikke
med — oppskrifter endres ikke mens dere står i butikken, de hentes én gang
ved oppstart.

Varslene er i appen, ikke push til låseskjermen:

- **Mens appen er åpen:** en liten melding nederst, «Kari la til Melk (1 l)».
  Flere endringer tett etter hverandre blir til «3 endringer på lista».
  Egne endringer varsles ikke tilbake til en selv.
- **Når du åpner appen:** «2 varer er endret siden du var her sist», og de
  radene får en prikk. Tidspunktet fryses ved oppstart og lagres i
  `localStorage`, så markeringen står helt til du lukker appen igjen.

Hvem som gjorde hva kommer fra `updated_by`, som settes fra navnet du
oppgir under tannhjulet. Tomt navn blir «Noen».

Tabellen har `replica identity full`, slik at endringshendelsen bærer raden
slik den var *før* endringen. Uten det kan ikke appen skille «haket av» fra
«fjernet», og varslene blir upresise. `describeChange` i
`src/lib/changes.ts` er ren og dekket av tester nettopp fordi det er her det
er lett å si noe som er feil.

### Medlemskort

💳 på Liste-fanen og i handlemodus: bildene av kodene du viser i kassa.
Lagres i `localStorage` på den ene telefonen, aldri i den delte basen — et
medlemsnummer hører til én person, og en delt tabell med anon-tilgang er feil
sted for det.

**Bilde, ikke et nummer vi tegner strekkode av.** Hvilken kodetype hver kjede
forventer er ikke noe vi kan slå fast, og en kode som er gjettet feil oppdager
du først i kassa. Et skjermbilde fra kjedens egen app er nøyaktig det som
virket sist.

Skjermen er delt etter hvor ofte man gjør ting: kortene er store fliser med
bildet i full bredde, mens «Legg til kort» ligger bak en knapp. Første utgave
gjorde det motsatt — skjemaet tok halve skjermen, og kortet man kom for var en
miniatyr på 64×44 px. Det er nå 332×200.

**Beskjæring hører til her, ikke i Bilder-appen.** Et skjermbilde fra kjedens
app har koden midt i mye annet; vist tilpasset skjermen blir selve koden liten,
og det er den skanneren skal lese. Dra en firkant rundt koden før du lagrer, så
gjelder oppløsningen utsnittet i stedet for helbildet. Et for lite utsnitt er
nesten alltid et feiltrykk, så under 5 % faller den tilbake til hele bildet.

Bildet skaleres til maks 1400 px og lagres som PNG når det er lite nok — en
strekkode er skarpe kanter, og JPEG-artefakter treffer nettopp dem. Er PNG-en
for stor, faller den til JPEG i tre trinn heller enn å nekte. Visningen legger
seg over hele skjermen på hvit bakgrunn, utenfor appens mørke ramme, fordi en
skanner leser kontrast.

Virker for QR like godt som for strekkode — appen lagrer et bilde og bryr seg
ikke om hva slags kode det er. Forutsetningen er at koden er **den samme hver
gang**. Bruker en kjede en engangskode som endrer seg, hjelper ingen lagret
kopi, og da er kjedens egen app riktig verktøy.

### Faste varer

★ på en rad betyr én ting: **varen fjernes aldri, den hakes bare av.** Både
«Fjern avhukede» og «Tøm lista» følger den regelen, som ligger samlet i
`src/lib/clearing.ts` og er dekket av tester — det er nettopp en slik regel som
råtner i stillhet når den ligger spredt i to klikk-handlere.

Alternativet som ble forkastet: å la manuelt lagte varer overleve automatisk.
Hvor en vare kom fra sier ingenting om du vil beholde den — «bursdagskake» er
manuell og skal vekk, «melk» kan ha kommet fra en middag og skal bli. En regel
utledet av opphav gjør knappene uforutsigbare; du må huske hver vares historie
for å vite hva som skjer. Stjerna er eksplisitt, og du ser før du trykker hva
som blir stående.

Stjerna settes i ⋯-skjemaet, ikke på raden. Raden har allerede to trykkflater,
og en tredje på 68 px i en butikk blir feiltrykk — mens en stjerne settes én
gang og leses hver gang. På raden er den derfor bare et merke.

Fjerner du én enkelt vare fra ⋯-skjemaet, blir den fjernet — også en fast. Det
er et bevisst trykk på akkurat den varen, ikke en opprydding.

### «Er lista oppdatert?»

Realtime holder som regel lista fersk av seg selv, men en telefon som har
ligget i lomma har mistet forbindelsen uten å si fra. Derfor to ting:
`↻` i toppen henter alt på nytt og kvitterer med klokkeslettet — en
oppdateringsknapp uten kvittering gjør deg ikke sikrere enn før — og appen
henter automatisk på nytt når den kommer fram i forgrunnen igjen. Knappen står
også i handlemodus, der resten av toppen er skjult: det er nettopp i butikken
man trenger å vite at lista er den ferskeste.

### Varsel på låseskjermen

Under tannhjulet: «Slå på varsler». Appen lager en tilfeldig ntfy-kanal,
registrerer den i `push_targets`, og viser **emnenavnet** du abonnerer på i
[ntfy](https://ntfy.sh)-appen.

Skjermen viser emnenavnet og ikke URL-en, med vilje. Første forsøk viste hele
`https://ntfy.sh/handleliste-…`, og den ble limt inn i ntfys «Use another
server»-felt — appen spurte da en server som ikke finnes og svarte 404. Det
eneste som skal inn i skjemaet er emnenavnet; serveren skal stå urørt.

Poenget med å velge ntfy framfor ekte web push: **bare mottakeren installerer
noe.** Den som legger varer på lista trenger ingenting — nettleseren hennes
POSTer varselet direkte. Web push ville krevd VAPID-nøkler og en Edge Function
deployet fra en datamaskin, og da hadde begge måttet gjennom oppsett.

Kanalene ligger i databasen, én rad per telefon, så ingen må sette opp
hverandres kanaler for hånd. Egen kanal hoppes over ved sending, så du aldri
varsles om det du selv gjorde.

Bare det som gjør lista **lengre** varsles: nye varer, varer lagt inn igjen
fra Varer-fanen, og det å hake av en allerede avhuket vare. Det siste hører
hjemme i gruppa fordi det betyr «denne trenger vi likevel» — samme nyhet som
et tillegg, og det gjøres sjelden. Avhuking og fjerning er stille: de skjer i
dusinvis i én butikk, og et varsel per hake er mas man skrur av. Varselet sendes når endringen faktisk har nådd
databasen, ikke når den ble lagt i køen — ellers ville du fått beskjed om noe
som ennå ikke fantes for den andre.

Kanalnavnet er en delt hemmelighet på en åpen tjeneste: den som gjetter det
kan lese varslene og sende falske. Derfor er navnet 32 tilfeldige tegn.
Innholdet er «Kari la til melk», så innsatsen er lav uansett.

## Sikkerhet — verdt å vite

Appen har **ingen innlogging**. Den bruker Supabase sin anon-nøkkel, og den
nøkkelen ligger i JS-bundelen som lastes ned til telefonen. RLS-policyene
gir `anon` full lese- og skrivetilgang. I praksis: den som finner URL-en til
appen kan lese og endre handlelista deres.

Delingslenka endrer ikke på dette: fragmentet sendes aldri til noen server,
men nøkkelen ligger i meldingen dere sender lenka i, og den er uansett
synlig i appens nettverkstrafikk.

For en handleliste for to er det en helt grei avveining, og det er derfor
det er satt opp sånn. Men det er en reell åpning, ikke noe jeg har gjemt
bort. Vil du stramme det til er magic-link-innlogging (Supabase Auth,
e-post uten passord) den enkleste veien: policyene byttes fra `to anon` til
`to authenticated`, og dere logger inn én gang per telefon.
