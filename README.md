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
   Har du kjørt en eldre `setup.sql` fra før, kjør `supabase/03_history.sql`
   i stedet — den legger bare til historikk-kolonnene.
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

På telefonen: «Legg til på Hjem-skjerm» gir et ikon som åpner uten
nettleserfelt. Det er ikke en full PWA — den trenger nett for å snakke med
Supabase.

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
| `archived` | boolean | har vært på lista, står ikke på den nå — dette er historikken |
| `use_count` | integer | hvor mange ganger varen har vært lagt til; sorterer historikken |
| `last_used_at` | timestamptz | sist varen ble lagt til eller fjernet |
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

Den er en ren datatabell i klienten, lett å utvide når dere oppdager en
variant som ikke matcher.

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

Sammenslåingen skjer i klienten (`src/lib/merge.ts`): les eksisterende rad på
`normalized_name`, slå sammen, skriv tilbake. Den unike indeksen er
sikkerhetsnettet — hvis dere skulle treffe samtidig, feiler den ene
innsettingen med `23505`, og `db.ts` leser da på nytt og fletter mot raden
som nå finnes.

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
src/lib/merge.test.ts  19 tester av det over
src/lib/db.ts          Supabase-kall og realtime
src/lib/db.mock.ts     samme API i minnet, for npm run dev:mock
src/views/             liste, middager, uke
```

## Historikk

Varer slettes ikke når de fjernes fra lista — de settes `archived = true`,
og mengde og middagsopphav nullstilles. Historikk-fanen er de radene, mest
brukte først.

Det fine med å gjenbruke raden i stedet for å ha en egen historikktabell: den
unike indeksen på `normalized_name` gjelder fortsatt, så en arkivert
«helmelk» blir *vekket til live* neste gang helmelk trengs — uansett om det
skjer fra historikken, fra en middag eller ved å skrive den inn for hånd. Det
kan ikke oppstå en arkivert og en aktiv rad for samme vare. Dekket av test.

Navnene i historikken foreslås også mens du skriver i «Legg til vare».

`×` i historikken sletter for godt. Det er det eneste stedet i appen noe
faktisk fjernes fra databasen.

## Realtime

`shopping_list_items` og `week_plan_items` ligger i `supabase_realtime`.
Klienten abonnerer på alle endringer og oppdaterer lokal state. `meals`
er ikke med — oppskrifter endres ikke mens dere står i butikken, de hentes
én gang ved oppstart.

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
