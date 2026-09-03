-- ---------------------------------------------------------------------------
-- Felles innstillinger for husholdningen
--
-- Én rad per innstilling. Foreløpig bare «hvor mange er vi», som avgjør hvor
-- mye av en oppskrift som havner på lista.
--
-- Delt, ikke lokalt på hver telefon: er dere to, skal begge legge inn samme
-- mengde. Ligger den på telefonen, får dere ulik liste alt etter hvem som
-- trykket «Legg ingrediensene i lista».
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists "husholdning full tilgang" on public.app_settings;
create policy "husholdning full tilgang" on public.app_settings
  for all to anon, authenticated using (true) with check (true);

alter publication supabase_realtime add table public.app_settings;
