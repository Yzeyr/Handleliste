-- Handleliste: komplett oppsett. Kjor denne EN gang pa et nytt prosjekt.

-- ============================================================================
-- Handleliste — skjema
-- Kjøres i Supabase: SQL Editor -> New query -> lim inn -> Run
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Kategorier. Holdt som en tekstkolonne med CHECK i stedet for en enum,
-- fordi det er mye lettere å utvide lista senere enn å endre en enum-type.
-- ---------------------------------------------------------------------------
-- 'grønt' | 'kjøtt' | 'fisk' | 'meieri' | 'tørrvarer' | 'frys' | 'bakeri' | 'annet'

-- ---------------------------------------------------------------------------
-- meals — ett middagsforslag
-- ---------------------------------------------------------------------------
create table if not exists public.meals (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  emoji        text,
  description  text,
  servings     smallint not null default 2 check (servings > 0),
  -- Korte tilberedningssteg. "Oppskrift" er i praksis ingrediensene, men
  -- 3-5 steg gjør at appen kan brukes på kjøkkenet og ikke bare i butikken.
  steps        text[] not null default '{}',
  tags         text[] not null default '{}',
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- meal_ingredients — ingrediens med mengde, hører til én middag
-- ---------------------------------------------------------------------------
create table if not exists public.meal_ingredients (
  id               uuid primary key default gen_random_uuid(),
  meal_id          uuid not null references public.meals(id) on delete cascade,
  name             text not null,               -- vises som skrevet: "Kyllingfilet"
  normalized_name  text not null,               -- nøkkel for sammenslåing: "kyllingfilet"
  -- amount = null betyr "etter smak" / "litt" — tas med på lista uten mengde.
  amount           numeric,
  unit             text,
  category         text not null default 'annet'
                   check (category in ('grønt','kjøtt','fisk','meieri','tørrvarer','frys','bakeri','annet')),
  sort_order       smallint not null default 0,
  constraint meal_ingredients_unit_requires_amount check (amount is not null or unit is null)
);

create index if not exists meal_ingredients_meal_id_idx on public.meal_ingredients (meal_id);

-- ---------------------------------------------------------------------------
-- shopping_list_items — den delte handlelista. Én rad = én linje i butikken.
--
-- quantities er en jsonb-liste: [{"amount": 5, "unit": "dl"}, {"amount": 2, "unit": "boks"}]
-- Normalt har en linje ett element. Flere elementer betyr at mengdene ikke lot
-- seg regne sammen (ulike dimensjoner), og vises da som "3 dl + 2 boks" på
-- SAMME linje — aldri som to rader. Tom liste = vare uten mengde.
--
-- normalized_name har unik indeks: det er selve garantien mot duplikat-rader.
-- ---------------------------------------------------------------------------
create table if not exists public.shopping_list_items (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  normalized_name  text not null,
  quantities       jsonb not null default '[]'::jsonb,
  category         text not null default 'annet'
                   check (category in ('grønt','kjøtt','fisk','meieri','tørrvarer','frys','bakeri','annet')),
  checked          boolean not null default false,
  -- Arkivert = har vært på lista, står ikke på den nå. Raden slettes ikke,
  -- så den unike indeksen under holder fortsatt én rad per vare, og
  -- historikken faller ut av det uten en egen tabell.
  archived         boolean not null default false,
  use_count        integer not null default 1,
  -- Om varen noen gang er lagt inn for hånd, i motsetning til å ha kommet
  -- med en oppskrift. Forslagene under skrivefeltet viser bare disse:
  -- hvitløk og tomatpuré hører hjemme i vareregisteret, ikke i det du får
  -- opp når du skal skrive en handleliste. Settes aldri tilbake til false.
  manual           boolean not null default false,
  last_used_at     timestamptz not null default now(),
  -- Hvilke middager linja kom fra, for visning: "fra Taco, Lasagne".
  -- Tom array = lagt inn manuelt.
  source_meals     text[] not null default '{}',
  note             text,
  -- Navnet på telefonen som sist skrev til raden, så appen kan si
  -- "Kari la til melk" i stedet for bare "lista er endret".
  updated_by       text,
  -- Telles opp av en trigger ved hver endring. Klienten bruker den til
  -- sammenlign-og-bytt: en oppdatering som bygger på en utdatert versjon
  -- treffer ingen rader, og leses da på nytt i stedet for å overskrive det
  -- den andre telefonen rakk å skrive.
  version          integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists shopping_list_items_normalized_name_key
  on public.shopping_list_items (normalized_name);

-- Historikken hentes som "arkiverte, mest brukte først".
create index if not exists shopping_list_items_archived_idx
  on public.shopping_list_items (archived, use_count desc, last_used_at desc);

-- updated_at og version settes av databasen, ikke av klienten, slik at de
-- gjelder uansett hvilken vei en endring kom inn.
create or replace function public.bump_version()
returns trigger language plpgsql as $$
begin
  new.version = old.version + 1;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists shopping_list_items_touch on public.shopping_list_items;
create trigger shopping_list_items_touch
  before update on public.shopping_list_items
  for each row execute function public.bump_version();

-- ---------------------------------------------------------------------------
-- app_settings — felles innstillinger for husholdningen
--
-- Én rad per innstilling. Foreløpig bare «hvor mange er vi», som avgjør hvor
-- mye av en oppskrift som havner på lista. Delt, ikke lokalt på hver telefon:
-- er dere to, skal begge legge inn samme mengde.
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- purchases — én rad hver gang en avhuket vare ryddes bort
--
-- Altså: hver gang noe faktisk ble kjøpt. Ingenting i appen leser den ennå.
-- Den finnes fordi intervaller ikke kan regnes ut i ettertid — uten en logg
-- som starter nå, har vi om et halvt år fortsatt bare ett antall og én dato.
--
-- Navnet lagres på raden, ikke bare som peker: en vare kan slettes for godt
-- eller få nytt navn, og da skal historikken fortsatt gi mening.
-- ---------------------------------------------------------------------------
create table if not exists public.purchases (
  id              uuid primary key default gen_random_uuid(),
  item_id         uuid references public.shopping_list_items(id) on delete set null,
  normalized_name text not null,
  name            text not null,
  bought_at       timestamptz not null default now()
);

create index if not exists purchases_name_time_idx
  on public.purchases (normalized_name, bought_at desc);

-- Loggen skrives av databasen, ikke av appen. «Dette ble kjøpt» er en
-- egenskap ved overgangen på raden, ikke ved hvilken knapp som ble trykket —
-- og da blir den riktig uansett hvilken vei endringen kom inn, også når en
-- offline-kø sendes i etterkant.
create or replace function public.log_purchase()
returns trigger language plpgsql as $$
begin
  if new.archived and not old.archived and old.checked then
    insert into public.purchases (item_id, normalized_name, name)
    values (new.id, new.normalized_name, new.name);
  end if;
  return new;
end;
$$;

drop trigger if exists shopping_list_items_log_purchase on public.shopping_list_items;
create trigger shopping_list_items_log_purchase
  after update on public.shopping_list_items
  for each row execute function public.log_purchase();

-- ---------------------------------------------------------------------------
-- ingredient_aliases — "dette navnet betyr egentlig det navnet"
--
-- Motstykket til synonymtabellen i koden: den dekker det vanlige, denne lar
-- dere legge til deres egne uten at noen må endre kode og bygge på nytt.
-- ---------------------------------------------------------------------------
create table if not exists public.ingredient_aliases (
  alias      text primary key,
  canonical  text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- week_plan_items — "denne uken skal vi ha ..."
-- Valgfri (se README). Gjør ukevalget delt i stedet for lokalt i én nettleser,
-- slik at dere ser samme ukemeny på hver deres telefon.
-- ---------------------------------------------------------------------------
create table if not exists public.week_plan_items (
  id            uuid primary key default gen_random_uuid(),
  meal_id       uuid not null unique references public.meals(id) on delete cascade,
  added_to_list boolean not null default false,
  -- null = valgt, men ikke satt på en dag ennå. Mandag = 1 ... søndag = 7,
  -- samme tall som ISO-ukedager, så det ikke er noe å huske.
  weekday       smallint check (weekday is null or (weekday between 1 and 7)),
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- push_targets — én rad per telefon som vil ha varsel på låseskjermen
--
-- Kanalen ligger her, ikke bare på telefonen, slik at den andre telefonen vet
-- hvor den skal sende uten at noen setter opp hverandres kanal for hånd.
-- ---------------------------------------------------------------------------
create table if not exists public.push_targets (
  device_id  text primary key,
  label      text,
  topic      text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Realtime: begge telefonene får push ved endring
--
-- replica identity full gjør at endringshendelsen også bærer raden slik den
-- var FØR endringen. Uten det kan ikke appen skille "haket av" fra "fjernet",
-- og varslene blir upresise. Koster litt mer WAL — på en handleliste for to
-- er det ingenting.
-- ---------------------------------------------------------------------------
alter table public.shopping_list_items replica identity full;
alter publication supabase_realtime add table public.shopping_list_items;
alter publication supabase_realtime add table public.week_plan_items;
alter publication supabase_realtime add table public.app_settings;

-- ---------------------------------------------------------------------------
-- RLS
--
-- Ingen innlogging: appen bruker anon-nøkkelen, og den nøkkelen ligger i
-- JS-bundelen. Med policyene under kan altså hvem som helst som har URL-en
-- til appen lese og endre lista. For en handleliste for to personer er det
-- en grei avveining, men det ER en reell åpning — se README for hvordan vi
-- kan stramme det til med magic-link-innlogging senere.
-- ---------------------------------------------------------------------------
alter table public.meals               enable row level security;
alter table public.ingredient_aliases  enable row level security;
alter table public.push_targets        enable row level security;
alter table public.purchases           enable row level security;
alter table public.app_settings        enable row level security;
alter table public.meal_ingredients    enable row level security;
alter table public.shopping_list_items enable row level security;
alter table public.week_plan_items     enable row level security;

drop policy if exists "husholdning full tilgang" on public.meals;
create policy "husholdning full tilgang" on public.meals
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "husholdning full tilgang" on public.meal_ingredients;
create policy "husholdning full tilgang" on public.meal_ingredients
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "husholdning full tilgang" on public.shopping_list_items;
create policy "husholdning full tilgang" on public.shopping_list_items
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "husholdning full tilgang" on public.ingredient_aliases;
create policy "husholdning full tilgang" on public.ingredient_aliases
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "husholdning full tilgang" on public.app_settings;
create policy "husholdning full tilgang" on public.app_settings
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "husholdning full tilgang" on public.purchases;
create policy "husholdning full tilgang" on public.purchases
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "husholdning full tilgang" on public.push_targets;
create policy "husholdning full tilgang" on public.push_targets
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "husholdning full tilgang" on public.week_plan_items;
create policy "husholdning full tilgang" on public.week_plan_items
  for all to anon, authenticated using (true) with check (true);

-- ============================================================================
-- Handleliste — 19 middagsforslag med ingredienser
-- Kjør ETTER 01_schema.sql. Trygg å kjøre flere ganger (on conflict do nothing).
-- ============================================================================

insert into public.meals (name, emoji, description, servings, tags, steps) values
  ('Taco', '🌮', 'Fredagstaco med kjøttdeig og alt tilbehøret.', 4, '{fredag,rask,familie}',
   '{"Stek kjøttdeigen løs i panna.","Ha i tacokrydder og litt vann, la småkoke 5 min.","Skjær opp grønnsakene mens det koker.","Varm lefser/skjell og server."}'),
  ('Spaghetti bolognese', '🍝', 'Langkokt kjøttsaus over spaghetti.', 4, '{klassiker,familie}',
   '{"Fres løk, hvitløk og revet gulrot mykt.","Brun kjøttdeigen, ha i tomatpuré og hermetiske tomater.","La småkoke minst 30 min.","Kok spaghettien og server med revet ost."}'),
  ('Ovnsbakt laks', '🐟', 'Laks i ovn med poteter og brokkoli.', 4, '{sunt,ovn}',
   '{"Sett ovnen på 180 grader.","Legg laksen i form med smør, sitron og salt, 20-25 min.","Kok poteter og damp brokkoli.","Rør crème fraîche med sitron til saus."}'),
  ('Kylling i form', '🍗', 'Kylling, paprika og crème fraîche i én form.', 4, '{ovn,enkel}',
   '{"Skjær kylling og paprika i biter.","Bland alt med crème fraîche og krydder i en ildfast form.","Topp med revet ost, 30 min på 200 grader.","Kok ris ved siden av."}'),
  ('Fiskegrateng', '🥘', 'Gammeldags fiskegrateng med makaroni.', 4, '{klassiker,ovn}',
   '{"Kok makaronien.","Lag hvit saus av smør, mel og helmelk.","Bland inn fisk i biter, egg og makaroni.","Ha i form med ost på, 35 min på 200 grader."}'),
  ('Kjøttkaker i brun saus', '🍽️', 'Kjøttkaker med ertestuing og poteter.', 4, '{klassiker,søndag}',
   '{"Elt kjøttdeig med potetmel, salt, revet løk og helmelk.","Form kaker og stek dem gyllne.","Kok poteter og varm ertestuing.","Lag brun saus og la kakene trekke i den."}'),
  ('Lasagne', '🍲', 'Kjøttsaus, hvit saus og plater i lag.', 4, '{ovn,familie}',
   '{"Lag kjøttsaus av løk, kjøttdeig og hermetiske tomater.","Lag hvit saus av smør, mel og helmelk.","Legg lagvis i form, avslutt med ost.","45 min på 200 grader, la hvile 10 min."}'),
  ('Hjemmelaget pizza', '🍕', 'Egen bunn med det tilbehøret dere liker.', 4, '{fredag,helg}',
   '{"Elt deig av mel, gjær, vann, salt og olje. Hev 1 time.","Kjevle ut og legg på stekebrett.","Ha på saus, ost og fyll.","10-12 min på 250 grader."}'),
  ('Fiskesuppe', '🍜', 'Kremet fiskesuppe med rotgrønnsaker.', 4, '{sunt,gryte}',
   '{"Kok opp fiskekraft med helmelk og fløte.","Ha i gulrot, purre og potet i biter, kok mørt.","Legg i fisken helt til slutt, trekk 4-5 min.","Smak til med salt, pepper og sitron."}'),
  ('Kremet laksepasta', '🍤', 'Rask pasta med laks og spinat.', 3, '{rask,hverdag}',
   '{"Kok pastaen.","Stek laksebiter raskt i panna.","Ha i crème fraîche, hvitløk og spinat.","Vend inn pastaen, smak til med sitron."}'),
  ('Kylling wok', '🥢', 'Wok med nudler og masse grønnsaker.', 3, '{rask,hverdag}',
   '{"Skjær kyllingen i strimler og stek på sterk varme.","Ha i wokgrønnsaker, ingefær og hvitløk.","Ha i soyasaus og la det putre kort.","Kok nudler og vend dem inn."}'),
  ('Pasta carbonara', '🥓', 'Ekte carbonara med egg og bacon.', 3, '{rask,hverdag}',
   '{"Kok spaghettien, ta vare på litt kokevann.","Stek bacon sprøtt.","Visp egg med revet parmesan og fløte.","Bland alt utenfor varmen så eggene ikke stivner."}'),
  ('Makaronigryte', '🥣', 'Kjøttdeig og makaroni i én gryte.', 4, '{rask,billig,familie}',
   '{"Brun kjøttdeig med løk og paprika.","Ha i hermetiske tomater og vann.","Ha makaronien rett i gryta, kok til den er al dente.","Topp med revet ost."}'),
  ('Wraps med kylling', '🌯', 'Lune lefser med kylling og salat.', 3, '{rask,fredag}',
   '{"Stek kyllingstrimler med krydder.","Skjær opp salat, tomat og agurk.","Varm lefsene kort i panna.","Fyll og rull."}'),
  ('Fårikål', '🐑', 'Høstklassikeren. Koker seg selv.', 4, '{klassiker,helg,gryte}',
   '{"Legg kjøtt og kål lagvis i gryta med pepper og salt.","Hell over vann til det så vidt dekker.","La koke sakte 2 timer til kjøttet slipper beinet.","Server med kokte poteter."}'),
  ('Ovnsbakt torsk', '🐠', 'Torsk med rotgrønnsaker fra ovnen.', 3, '{sunt,ovn}',
   '{"Skjær rotgrønnsaker i staver, stek 25 min på 200 grader.","Legg torsken oppå, smør og sitron over.","12-15 min til fisken er akkurat gjennomstekt.","Server med sitronbåter."}'),
  ('Kylling tikka masala', '🍛', 'Mild indisk kyllinggryte med ris.', 4, '{gryte,hverdag}',
   '{"Brun kyllingbiter med løk.","Ha i tikka masala-saus og kokosmelk.","La småkoke 15-20 min.","Kok ris og varm naan."}'),
  ('Pytt i panne', '🍳', 'Restemat som faktisk er god.', 3, '{rask,billig}',
   '{"Kok og terning poteter (eller bruk rester).","Stek potet og løk gyllen i panna.","Ha i pølsebiter og stek videre.","Server med speilegg og rødbeter."}'),
  ('Hamburger', '🍔', 'Hjemmelagde burgere på panne eller grill.', 3, '{fredag,helg}',
   '{"Form karbonadedeigen til tykke burgere, salt godt.","Stek 3-4 min på hver side.","Legg på ost siste minutt.","Rist brødene og fyll med salat, tomat og løk."}')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Ingredienser
-- ---------------------------------------------------------------------------
create or replace function pg_temp.add_ing(p_meal text, p_rows jsonb) returns void
language plpgsql as $$
begin
  insert into public.meal_ingredients (meal_id, name, normalized_name, amount, unit, category, sort_order)
  select m.id,
         r->>0,
         r->>1,
         nullif(r->>2, '')::numeric,
         nullif(r->>3, ''),
         r->>4,
         (idx - 1)::smallint
  from public.meals m,
       lateral jsonb_array_elements(p_rows) with ordinality as t(r, idx)
  where m.name = p_meal
    and not exists (select 1 from public.meal_ingredients mi where mi.meal_id = m.id);
end;
$$;

-- ["visningsnavn", "normalisert navn", mengde, "enhet", "kategori"]
select pg_temp.add_ing('Taco', '[
  ["Kjøttdeig","kjottdeig",400,"g","kjøtt"],
  ["Tacokrydder","tacokrydder",1,"pk","tørrvarer"],
  ["Tacoskjell","tacoskjell",1,"pk","tørrvarer"],
  ["Mais","mais",1,"boks","tørrvarer"],
  ["Revet ost","revet ost",150,"g","meieri"],
  ["Rømme","romme",3,"dl","meieri"],
  ["Tomat","tomat",2,"stk","grønt"],
  ["Agurk","agurk",1,"stk","grønt"],
  ["Salathode","salathode",1,"stk","grønt"]
]'::jsonb);

select pg_temp.add_ing('Spaghetti bolognese', '[
  ["Kjøttdeig","kjottdeig",400,"g","kjøtt"],
  ["Spaghetti","spaghetti",250,"g","tørrvarer"],
  ["Hermetiske tomater","hermetiske tomater",2,"boks","tørrvarer"],
  ["Tomatpuré","tomatpure",1,"ss","tørrvarer"],
  ["Løk","lok",1,"stk","grønt"],
  ["Hvitløk","hvitlok",2,"fedd","grønt"],
  ["Gulrot","gulrot",1,"stk","grønt"],
  ["Revet ost","revet ost",100,"g","meieri"]
]'::jsonb);

select pg_temp.add_ing('Ovnsbakt laks', '[
  ["Laksefilet","laksefilet",500,"g","fisk"],
  ["Potet","potet",800,"g","grønt"],
  ["Brokkoli","brokkoli",1,"stk","grønt"],
  ["Sitron","sitron",1,"stk","grønt"],
  ["Smør","smor",50,"g","meieri"],
  ["Crème fraîche","creme fraiche",2,"dl","meieri"]
]'::jsonb);

select pg_temp.add_ing('Kylling i form', '[
  ["Kyllingfilet","kyllingfilet",600,"g","kjøtt"],
  ["Crème fraîche","creme fraiche",3,"dl","meieri"],
  ["Paprika","paprika",2,"stk","grønt"],
  ["Løk","lok",1,"stk","grønt"],
  ["Ris","ris",300,"g","tørrvarer"],
  ["Revet ost","revet ost",100,"g","meieri"]
]'::jsonb);

select pg_temp.add_ing('Fiskegrateng', '[
  ["Seifilet","seifilet",500,"g","fisk"],
  ["Makaroni","makaroni",200,"g","tørrvarer"],
  ["Helmelk","helmelk",5,"dl","meieri"],
  ["Smør","smor",40,"g","meieri"],
  ["Hvetemel","hvetemel",40,"g","tørrvarer"],
  ["Revet ost","revet ost",100,"g","meieri"],
  ["Egg","egg",2,"stk","meieri"]
]'::jsonb);

select pg_temp.add_ing('Kjøttkaker i brun saus', '[
  ["Kjøttdeig","kjottdeig",500,"g","kjøtt"],
  ["Potetmel","potetmel",2,"ss","tørrvarer"],
  ["Helmelk","helmelk",1,"dl","meieri"],
  ["Løk","lok",1,"stk","grønt"],
  ["Potet","potet",800,"g","grønt"],
  ["Ertestuing","ertestuing",1,"pk","frys"],
  ["Brun saus","brun saus",1,"pk","tørrvarer"]
]'::jsonb);

select pg_temp.add_ing('Lasagne', '[
  ["Kjøttdeig","kjottdeig",400,"g","kjøtt"],
  ["Lasagneplater","lasagneplater",1,"pk","tørrvarer"],
  ["Hermetiske tomater","hermetiske tomater",2,"boks","tørrvarer"],
  ["Helmelk","helmelk",5,"dl","meieri"],
  ["Smør","smor",40,"g","meieri"],
  ["Hvetemel","hvetemel",40,"g","tørrvarer"],
  ["Revet ost","revet ost",200,"g","meieri"],
  ["Løk","lok",1,"stk","grønt"]
]'::jsonb);

select pg_temp.add_ing('Hjemmelaget pizza', '[
  ["Hvetemel","hvetemel",500,"g","tørrvarer"],
  ["Tørrgjær","torrgjar",1,"pk","tørrvarer"],
  ["Pizzasaus","pizzasaus",1,"boks","tørrvarer"],
  ["Revet ost","revet ost",300,"g","meieri"],
  ["Skinke","skinke",150,"g","kjøtt"],
  ["Paprika","paprika",1,"stk","grønt"],
  ["Olivenolje","olivenolje",1,"dl","tørrvarer"]
]'::jsonb);

select pg_temp.add_ing('Fiskesuppe', '[
  ["Torskefilet","torskefilet",400,"g","fisk"],
  ["Laksefilet","laksefilet",200,"g","fisk"],
  ["Fiskekraft","fiskekraft",1,"pk","tørrvarer"],
  ["Helmelk","helmelk",5,"dl","meieri"],
  ["Matfløte","matflote",3,"dl","meieri"],
  ["Gulrot","gulrot",2,"stk","grønt"],
  ["Purre","purre",1,"stk","grønt"],
  ["Potet","potet",4,"stk","grønt"]
]'::jsonb);

select pg_temp.add_ing('Kremet laksepasta', '[
  ["Laksefilet","laksefilet",400,"g","fisk"],
  ["Pasta","pasta",300,"g","tørrvarer"],
  ["Crème fraîche","creme fraiche",3,"dl","meieri"],
  ["Spinat","spinat",100,"g","grønt"],
  ["Sitron","sitron",1,"stk","grønt"],
  ["Hvitløk","hvitlok",2,"fedd","grønt"]
]'::jsonb);

select pg_temp.add_ing('Kylling wok', '[
  ["Kyllingfilet","kyllingfilet",500,"g","kjøtt"],
  ["Wokgrønnsaker","wokgronnsaker",1,"pose","frys"],
  ["Nudler","nudler",200,"g","tørrvarer"],
  ["Soyasaus","soyasaus",1,"dl","tørrvarer"],
  ["Ingefær","ingefar",1,"stk","grønt"],
  ["Hvitløk","hvitlok",2,"fedd","grønt"]
]'::jsonb);

select pg_temp.add_ing('Pasta carbonara', '[
  ["Spaghetti","spaghetti",300,"g","tørrvarer"],
  ["Bacon","bacon",200,"g","kjøtt"],
  ["Egg","egg",3,"stk","meieri"],
  ["Parmesan","parmesan",100,"g","meieri"],
  ["Matfløte","matflote",2,"dl","meieri"],
  ["Hvitløk","hvitlok",1,"fedd","grønt"]
]'::jsonb);

select pg_temp.add_ing('Makaronigryte', '[
  ["Kjøttdeig","kjottdeig",400,"g","kjøtt"],
  ["Makaroni","makaroni",250,"g","tørrvarer"],
  ["Hermetiske tomater","hermetiske tomater",1,"boks","tørrvarer"],
  ["Løk","lok",1,"stk","grønt"],
  ["Paprika","paprika",1,"stk","grønt"],
  ["Revet ost","revet ost",100,"g","meieri"]
]'::jsonb);

select pg_temp.add_ing('Wraps med kylling', '[
  ["Kyllingfilet","kyllingfilet",500,"g","kjøtt"],
  ["Tortillalefser","tortillalefser",1,"pk","bakeri"],
  ["Salathode","salathode",1,"stk","grønt"],
  ["Tomat","tomat",2,"stk","grønt"],
  ["Agurk","agurk",1,"stk","grønt"],
  ["Rømme","romme",3,"dl","meieri"],
  ["Revet ost","revet ost",100,"g","meieri"]
]'::jsonb);

select pg_temp.add_ing('Fårikål', '[
  ["Fårikålkjøtt","farikalkjott",1,"kg","kjøtt"],
  ["Hodekål","hodekal",1,"kg","grønt"],
  ["Hel pepper","hel pepper",2,"ss","tørrvarer"],
  ["Potet","potet",800,"g","grønt"]
]'::jsonb);

select pg_temp.add_ing('Ovnsbakt torsk', '[
  ["Torskefilet","torskefilet",600,"g","fisk"],
  ["Gulrot","gulrot",3,"stk","grønt"],
  ["Sellerirot","sellerirot",300,"g","grønt"],
  ["Potet","potet",500,"g","grønt"],
  ["Smør","smor",50,"g","meieri"],
  ["Sitron","sitron",1,"stk","grønt"]
]'::jsonb);

select pg_temp.add_ing('Kylling tikka masala', '[
  ["Kyllingfilet","kyllingfilet",600,"g","kjøtt"],
  ["Tikka masala-saus","tikka masalasaus",1,"boks","tørrvarer"],
  ["Kokosmelk","kokosmelk",1,"boks","tørrvarer"],
  ["Ris","ris",300,"g","tørrvarer"],
  ["Løk","lok",1,"stk","grønt"],
  ["Naanbrød","naanbrod",1,"pk","bakeri"]
]'::jsonb);

select pg_temp.add_ing('Pytt i panne', '[
  ["Potet","potet",800,"g","grønt"],
  ["Kjøttpølse","kjottpolse",300,"g","kjøtt"],
  ["Løk","lok",2,"stk","grønt"],
  ["Egg","egg",4,"stk","meieri"],
  ["Rødbeter","rodbeter",1,"boks","tørrvarer"]
]'::jsonb);

select pg_temp.add_ing('Hamburger', '[
  ["Karbonadedeig","karbonadedeig",500,"g","kjøtt"],
  ["Hamburgerbrød","hamburgerbrod",1,"pk","bakeri"],
  ["Cheddar","cheddar",100,"g","meieri"],
  ["Salathode","salathode",1,"stk","grønt"],
  ["Tomat","tomat",2,"stk","grønt"],
  ["Rødløk","rodlok",1,"stk","grønt"],
  ["Burgerdressing","burgerdressing",1,"stk","tørrvarer"]
]'::jsonb);
