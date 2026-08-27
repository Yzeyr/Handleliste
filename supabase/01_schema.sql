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
  -- Hvilke middager linja kom fra, for visning: "fra Taco, Lasagne".
  -- Tom array = lagt inn manuelt.
  source_meals     text[] not null default '{}',
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create unique index if not exists shopping_list_items_normalized_name_key
  on public.shopping_list_items (normalized_name);

-- updated_at settes av databasen, ikke av klienten
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists shopping_list_items_touch on public.shopping_list_items;
create trigger shopping_list_items_touch
  before update on public.shopping_list_items
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- week_plan_items — "denne uken skal vi ha ..."
-- Valgfri (se README). Gjør ukevalget delt i stedet for lokalt i én nettleser,
-- slik at dere ser samme ukemeny på hver deres telefon.
-- ---------------------------------------------------------------------------
create table if not exists public.week_plan_items (
  id            uuid primary key default gen_random_uuid(),
  meal_id       uuid not null unique references public.meals(id) on delete cascade,
  added_to_list boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Realtime: begge telefonene får push ved endring
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.shopping_list_items;
alter publication supabase_realtime add table public.week_plan_items;

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

drop policy if exists "husholdning full tilgang" on public.week_plan_items;
create policy "husholdning full tilgang" on public.week_plan_items
  for all to anon, authenticated using (true) with check (true);
