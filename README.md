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
   `08_uke_og_kjopslogg.sql`, `09_porsjoner_og_notat.sql`. De legger bare til
   det som er nytt, og er trygge å kjøre flere ganger.
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

Mengdefeltene er `<input type="text">` med `inputmode="decimal"`, ikke
`type="number"`. Et talfelt forkaster «1,5» som ugyldig, og da kommer verdien
aldri fram til koden — feltet ser bare tomt ut mens du står og lurer. Norsk
tastatur gir komma, så det er komma folk skriver. `parseAmount` tar både komma
og punktum, og `formatAmount` skriver den tilbake med norsk komma. Dekket av
test, sammen med at «1,2,3» og «-2» ikke blir en mengde.

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

## Ukemenyen

Uke-fanen er satt opp etter dager, ikke som en pose middager. De sju dagene
ligger der hele tiden, også de tomme: spørsmålet man sitter med er «hva spiser
vi på torsdag», ikke «hvilke fire har vi valgt». En tom rad er en del av
svaret.

Valget skjer i en vanlig `<select>`. På telefon gir det systemets egen
hjulvelger — større trykkflate og kjent oppførsel enn noe egenbygd, og
ingenting nytt å lære. «—» på en dag betyr at vi ikke spiser den, ikke at den
flyttes til en haug uten dag; det er det tomvalget ser ut som.

`meal_id` har fortsatt unik indeks, så én middag har én plass i uka. Velger du
den samme middagen på en annen dag, **flyttes** den. Samme middag to ganger i
uka går altså ikke — det ville krevd at den indeksen røk, og med den også
`+ Uke`-knappens av/på-modell inne på Middager.

**Lesingen henter `*`, ikke en håndskrevet kolonneliste.** Første utgave gjorde
det motsatte, og lista manglet `weekday`: dagen ble lagret, men aldri lest
tilbake, så raden sto tom uten at noe feilet. Mock-laget returnerer hele
objekter, så alle nettlesertestene var grønne — feilen fantes bare mot en ekte
database. `db.select.test.ts` vokter regelen nå: en lesing henter enten `*`
eller navngir hvert felt typen har.

Middager valgt med `+ Uke` inne på Middager har ingen dag ennå. De havner
under **Uten dag** med sin egen dagvelger, i stedet for å bli usynlige fordi
de mangler et felt.

## Kjøpsloggen

`purchases` får én rad hver gang en avhuket vare ryddes bort — altså hver gang
noe faktisk ble kjøpt.

**Ingenting i appen leser den ennå.** Den finnes fordi intervaller ikke kan
regnes ut i ettertid: vi lagrer `use_count` og `last_used_at`, og av ett tall
og én dato kan man ikke utlede «omtrent hver sjette dag». Uten en logg som
starter nå, har vi om et halvt år fortsatt bare ett tall og én dato. Koster én
tabell å samle; kan ikke hentes inn igjen senere.

Loggen skrives av en trigger i databasen, ikke av appen. «Dette ble kjøpt» er
en egenskap ved overgangen på raden — `archived` fra usann til sann mens
`checked` var sann — ikke ved hvilken knapp som ble trykket. Da blir den
riktig uansett hvilken vei endringen kom inn, også når en offline-kø sendes
i etterkant.

Navnet lagres på raden, ikke bare som peker: en vare kan slettes for godt
eller få nytt navn, og historikken skal fortsatt gi mening.

Verifisert mot ekte Postgres: avhuket vare ryddet bort gir én rad; en
uavhuket gir ingen; å hake av og av igjen gir ingen; kjøpt to ganger gir to
rader; endringer på en allerede arkivert rad gir ingen; og sletter man varen,
blir loggen stående med `item_id = null` og navnet i behold.

Vil du se den: `select name, bought_at from purchases order by bought_at desc`
i SQL-editoren.

## Husk før du går inn

En smal stripe rett over «Start handling»: **Husk — Handlenett**. Trykk på den
i butikkdøra, så er den borte resten av dagen.

Tre valg som gjør at den ikke blir tapet på veggen:

- **Den vises bare når det står noe uhaket på lista.** Har du ingenting å
  handle, skal ingen linje minne deg på handlenett. Den regelen fjerner
  mesteparten av støyen uten at appen må gjette om du er på vei ut.
- **Kvitteringen varer én dag.** Du åpner appen mange ganger daglig; å bli
  minnet på det samme etter at du har svart, er nettopp det som gjør at man
  slutter å lese. Neste dag er den tilbake, uten at appen trenger å forstå hva
  en handletur er.
- **Den ligger over «Start handling»,** ikke i lista. Et fast punkt blant
  varene ville blitt en linje du slutter å se, og du oppdager den først inne i
  butikken — der den ikke hjelper.

Lagres i `localStorage` på den ene telefonen, ikke i den delte basen: om *du*
har nettet med er ikke noe samboeren skal se haket av. Innholdet redigeres
under tannhjulet; «Handlenett» er der fra start.

## Hvor mange er dere?

Oppskriftene er skrevet for et antall porsjoner. Sier du under tannhjulet hvor
mange dere er, regnes mengdene om når en middag legges i lista — ellers står
noen ved kjøttdisken og halverer 800 g i hodet hver gang.

**Tellbare ting rundes opp til hele.** En halv løk kjøper man ikke, og trenger
oppskriften halvannen, må du ha to. Vekt og volum rundes til noe som er lesbart
ved disken: 400 g, ikke 399,84.

**Skaleringen skjer før sammenslåingen.** To middager som hver bruker melk blir
først regnet om, så slått sammen — ikke omvendt, som ville gitt avrundingsfeil
på hver enkelt før summen. Dekket av test.

Innstillingen ligger i `app_settings` i databasen, ikke på telefonen: er dere
to, skal begge legge inn samme mengde. Lå den lokalt, ville lista blitt
forskjellig alt etter hvem som trykket «Legg ingrediensene i lista». Tomt felt
lar oppskriften stå som den er skrevet.

## Notat på en vare

«Ost» på en delt liste er tjue oster i butikken. Notatfeltet i ⋯-skjemaet er
der den som skriver kan si hvilken — «Norvegia, den store» — og det vises der
den andre står: på raden, og i handlemodus under navnet.

Dette er den vanligste kilden til feilkjøp når to personer handler for
hverandre, og feltet lå i skjemaet fra første dag uten at noe kunne fylle det
ut.

## Handlemodus

«🛒 Start handling» øverst på lista tar over hele skjermen. Faner, skjema,
tannhjul og radmenyer forsvinner; igjen står store rader med navn og mengde,
gruppert i den rekkefølgen man går gjennom butikken, og «7 / 17 varer» med en
framdriftsstripe øverst.

Avhukede varer samles i én bolk nederst, gjennomstreket. Det som står igjen å
handle krymper mens du går; det du har tatt er fortsatt synlig, men ute av
veien. (Motsatt av det som sto her før — jeg mente butikkrekkefølgen var mer
verdt enn å rydde unna, og det viste seg å være feil i faktisk bruk.)

Nederst, etter lista, står et skrivefelt. Butikken er nettopp der du husker at
dere er tom for oppvasksåpe, og uten det feltet måtte du ut av modusen, legge
den inn, og starte på nytt — stikk i strid med regelen om at alt du gjør
stående i butikken skal skje uten å bytte skjerm. Ett felt, ingen mengde og
ingen kategori: den som står i en kø skriver «oppvasksåpe», ikke «1 stk
oppvasksåpe · husholdning».

Er alt haket av, tilbyr den «Rydd bort og avslutt», som arkiverer varene
(altså rett i vareregisteret) og går ut av modusen.

Modusen ligger i `localStorage`, så en omlasting midt i butikken ikke kaster
deg ut av den, og appen ber om `wakeLock` mens den er på — en telefon som
låser seg mellom hver vare er den raskeste måten å gjøre en handleliste
ubrukelig på. Støttes ikke overalt, og da oppfører den seg som før.

## Hva kan vi lage?

Under Middager: skriv det du ser i kjøleskapet, så rangeres middagene etter
hvor mye av det de bruker. Hvert treff sier hva som mangler, og en knapp legger
**bare det som mangler** i lista — gjennom samme sammenslåing og
porsjonsskalering som en hel middag, så en halv oppskrift ikke oppfører seg
annerledes enn en hel.

**Dette er ikke en beholdning, med vilje.** Et lager over hva dere har hjemme
må føres hver gang det går tomt for egg. Det blir feil i løpet av en uke, og en
beholdning man ikke stoler på er verre enn ingen: du sjekker i kjøleskapet
likevel, og har i tillegg brukt tid på å føre den. Her ser du i kjøleskapet én
gang og skriver det du ser.

Forslagene over feltet er varer dere har kjøpt nylig, nyest først — både
arkiverte og avhukede som fortsatt står på lista. Egne varer blir jo stående
etter en handletur, og uten dem ville forslagene systematisk bommet på melk og
egg, som er nettopp det man har hjemme.

**Bare matkategoriene er med i forslagene.** `annet` er søppelbøtta der avisa,
oppvasksåpa og batteriene havner, og en snarveisliste full av dem er ingen
snarvei. Prisen er at noen ekte ingredienser også ligger der — laurbærblad, for
eksempel — men knappene er en snarvei, ikke den eneste veien inn: feltet tar
imot hva som helst, og søket leter i alt.

Rangeringen er antall treff først, så færrest mangler: en rett som bruker alle
tre tingene dine slår en som bruker to, og blant like slår den du er nærmest å
kunne lage i kveld. Salt, pepper, vann og olje telles ikke som noe du mangler —
det er ikke det som avgjør om middagen lar seg lage. Sammenligningen går
gjennom samme synonymtabell som resten av appen, så «H-melk» i kjøleskapet
treffer «helmelk» i oppskriften. Dekket av test.

## Lime inn en hel liste i skrivefeltet

Limer du flere linjer inn i «Legg til vare», leses de som en ingrediensliste:

```
800 g benfri høyrygg av storfekjøtt , evt. bog
2 ss smør , til steking
0,5 stk. purre
```

Et `<input>` er én linje, så nettleseren ville slått elleve linjer sammen til
én lang, meningsløs vare. Derfor leses utklippstavla direkte i `paste`, og
limingen stanses før den når feltet.

Elleve varer skal ikke føyes til lista i stillhet fordi en finger traff «lim
inn». Du får se hva som kommer, og bekrefte. Boksen teller det samme som
skrivingen gjør: nevner lista løk to ganger, står det én vare — den skal ikke
love tre og legge til to.

**Tilberedning strippes fra navnet.** «Smør, til steking» og «potet i
terninger» er samme vare som «smør» og «potet» — én ting i butikken. Blir
tilberedningen stående, ryker sammenslåingen: to oppskrifter med potet gir to
linjer, og «potet i terninger» finner aldri poteten fra forrige uke.

Alt etter et komma ryker. Ellers er det en kort liste over tilberedninger, ikke
et forsøk på å forstå språk: « i » alene er for farlig, siden «makrell i tomat»
er en vare i seg selv. Dekket av test, sammen med at «revet ost» og «hakkede
tomater» står urørt.

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

### Amerikanske oppskrifter

Limer du inn en engelsk oppskrift, oversettes enheter og ingrediensnavn.
`src/lib/english.ts` er to ordbøker, ikke språkforståelse — og det som ikke
står i dem, står urørt igjen. En linje som kommer uendret gjennom er lett å
rette i skjemaet; en linje som er gjettet feil ser riktig ut og blir stående.

**Volum blir volum, vekt blir vekt.** «2 cups flour» blir 4,7 dl mel, ikke
240 g. Å gå fra volum til vekt krever en tetthet per ingrediens (mel ≈ 120
g/cup, sukker ≈ 200, smør ≈ 227), og bommer man der, er bakingen ødelagt.
Norske oppskrifter måler mel og sukker i dl hele tiden, så dl er et ekte norsk
mål her — ikke en snarvei rundt et vanskelig problem. Unntaket er `stick`, som
per definisjon er en vektenhet: én stick smør er 113 g uansett hva den fyller.

`tbsp` og `tsp` blir `ss` og `ts` uten omregning. Forskjellen er 0,2 ml; å
skrive 1,97 ss ville vært presist og ubrukelig. Derimot rundes de **ikke** til
hele tall: «1/2 tsp» avrundet til 1 ts er dobbelt så mye krydder.

**Oversettelsen krever entydig bevis på at linja er engelsk** — en amerikansk
enhet, eller et ingrediensord som ikke også er norsk. Uten den terskelen ble
«2 stk paprika» i en norsk oppskrift til paprikapulver: på norsk er paprika
grønnsaken, på engelsk krydderet. Ordene språkene deler står i en egen liste
og teller ikke som bevis. Dekket av test, i begge retninger.

Sammensatte navn slår enkeltord, så «heavy cream» blir fløte og ikke en tung
«cream», og «ground beef» blir kjøttdeig og ikke «beef».

Ovnstemperaturer i framgangsmåten regnes om og rundes til nærmeste fem grader
— 176,7 °C er ikke noe man kan stille en ovn på.

**Framgangsmåten oversettes ikke.** Det er hele setninger, altså språk, ikke
oppslag. En maskinoversatt matlagingsinstruksjon som er litt feil er verre enn
en engelsk som er riktig.

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

### Det du skriver inn selv, blir stående

Én regel, i `src/lib/clearing.ts` og dekket av tester: **«Fjern avhukede»,
«Tøm lista» og «Rydd bort og avslutt» fjerner bare varer som kom fra en
middag. Det du har lagt inn for hånd hakes av og blir stående.** Middagsvarer
er engangsvarer for én oppskrift; egne varer er ting man kjøper igjen.

Dette erstattet en stjerne man satte selv. Stjerna var riktig i teorien — hvor
en vare kom fra sier i prinsippet ingenting om du vil beholde den — men i
praksis var svaret alltid «behold det jeg skrev inn», og da er en innstilling
bare et ekstra trykk foran det samme svaret. Regelen som gjetter riktig hver
gang slår innstillingen som må settes hver gang.

Vil du bli kvitt en vare, **sveiper du raden mot venstre**. Retningen avgjøres
ved første bevegelse over 10 px: er den mest loddrett, slipper vi taket og
lar siden scrolle, ellers følger raden fingeren. Over 96 px betyr slippet
«fjern», og angre-knappen står i noen sekunder etterpå. Sveipet stanser sitt
eget klikk, så en fjerning aldri også haker av varen.

Avhukingen som skjer under en opprydding er merket `quiet` og sender ikke
varsel. Uten det hadde en handletur med seks egne varer gitt samboeren seks
meldinger på låseskjermen.

### «Er lista oppdatert?»

Realtime holder som regel lista fersk av seg selv, men en telefon som har
ligget i lomma har mistet forbindelsen uten å si fra. Derfor to ting:
`↻` i toppen henter alt på nytt og kvitterer med klokkeslettet — en
oppdateringsknapp uten kvittering gjør deg ikke sikrere enn før — og appen
henter automatisk på nytt når den kommer fram i forgrunnen igjen. Knappen står
også i handlemodus, der resten av toppen er skjult: det er nettopp i butikken
man trenger å vite at lista er den ferskeste.

### Når databasen sier nei

En endring som blir avvist av en grunn som ikke går over av seg selv, kastes
fra køen — ellers står køen fast for alltid. Den vises nå som «Ikke lagret: …»
i toppen. Før forsvant den i stillhet: du så endringen på skjermen, og så var
den borte igjen uten et ord.

Feilen tømmes bare ved lesing, aldri av at noe annet gikk bra. Første forsøk
nullstilte den i `refreshFromServer`, og da rakk en vellykket oppfriskning å
viske den ut før skjermen fikk se den — at en lesing går bra sier ingenting om
at en skriving ble avvist.

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

Appen har **ingen innlogging**, og RLS-policyene gir `anon` full lese- og
skrivetilgang. Den som har nøkkelen kan lese og endre handlelista deres.

**Men det er ikke nok å finne URL-en til appen.** Bygget som ligger på GitHub
Pages inneholder ingen nøkler — `import.meta.env` er tom der, og oppsettet
kommer fra `localStorage` på hver telefon. Det er **delingslenka** som er
nøkkelen. Kjører du derimot med en `.env`, bakes nøklene inn i bundelen, og da
holder det å finne siden.

Praktisk konsekvens: lenka er et passord. Har noen fått den én gang, har de
tilgang til den blir byttet — og å bytte den krever nye nøkler i Supabase og
en ny runde deling.

For en handleliste for to er det en helt grei avveining, og det er derfor
det er satt opp sånn. Men det er en reell åpning, ikke noe jeg har gjemt
bort. Vil du stramme det til er magic-link-innlogging (Supabase Auth,
e-post uten passord) den enkleste veien: policyene byttes fra `to anon` til
`to authenticated`, og dere logger inn én gang per telefon.
