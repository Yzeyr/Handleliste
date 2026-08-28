-- ---------------------------------------------------------------------------
-- 1) Ukedag på ukemenyen
--
-- null = valgt, men ikke satt på en dag ennå. Mandag = 1 ... søndag = 7,
-- samme tall som ISO-ukedager, så det ikke er noe å huske.
-- ---------------------------------------------------------------------------
alter table public.week_plan_items
  add column if not exists weekday smallint
  check (weekday is null or (weekday between 1 and 7));

-- ---------------------------------------------------------------------------
-- 2) Kjøpslogg
--
-- Én rad hver gang en avhuket vare ryddes bort — altså hver gang noe faktisk
-- ble kjøpt. Ingenting i appen leser den ennå; den finnes fordi intervaller
-- ikke kan regnes ut i ettertid. Uten en logg som starter nå, har vi om et
-- halvt år fortsatt bare ett antall og én dato.
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

alter table public.purchases enable row level security;

drop policy if exists "husholdning full tilgang" on public.purchases;
create policy "husholdning full tilgang" on public.purchases
  for all to anon, authenticated using (true) with check (true);
