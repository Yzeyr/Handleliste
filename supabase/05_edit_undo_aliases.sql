alter table public.shopping_list_items
  add column if not exists version integer not null default 0;

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

create table if not exists public.ingredient_aliases (
  alias      text primary key,
  canonical  text not null,
  created_at timestamptz not null default now()
);

alter table public.ingredient_aliases enable row level security;

drop policy if exists "husholdning full tilgang" on public.ingredient_aliases;
create policy "husholdning full tilgang" on public.ingredient_aliases
  for all to anon, authenticated using (true) with check (true);
