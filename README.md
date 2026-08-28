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
   rekkefølge: `03_history.sql`, `04_notifications.sql`,
   `05_edit_undo_aliases.sql`. De legger bare til det som er nytt, og er
   trygge å kjøre flere ganger.
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
gang. Vil du
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
| `checked` | boolean | huket av i butikken; raden blir stående, bare gråtonet |
| `archived` | boolean | har vært på lista, står ikke på den nå — dette er vareregisteret |
| `use_count` | integer | hvor mange ganger varen har vært lagt til; sorterer historikken |
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

Navnene i registeret foreslås mens du skriver, og en rad på lista kan endres
i ettertid — navn, mengde og kategori — via `⋯` på raden. Sletting ligger
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

**Ekte push** til en telefon i lomma er ikke bygget. Det krever service
worker, VAPID-nøkler og en Edge Function som sender — eller en tredjepart
som ntfy. Ikke gjort, ikke halvgjort.

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
