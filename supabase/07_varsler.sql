create table if not exists public.push_targets (
  device_id  text primary key,
  label      text,
  topic      text not null,
  created_at timestamptz not null default now()
);

alter table public.push_targets enable row level security;

drop policy if exists "husholdning full tilgang" on public.push_targets;
create policy "husholdning full tilgang" on public.push_targets
  for all to anon, authenticated using (true) with check (true);
