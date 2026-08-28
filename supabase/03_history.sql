-- ============================================================================
-- Migrering: historikk
-- Kjør denne BARE hvis du allerede har kjørt setup.sql (eller 01_schema.sql)
-- fra før. Nye prosjekter får dette med i setup.sql og trenger den ikke.
-- Trygg å kjøre flere ganger.
-- ============================================================================

alter table public.shopping_list_items
  add column if not exists archived     boolean     not null default false,
  add column if not exists use_count    integer     not null default 1,
  add column if not exists last_used_at timestamptz not null default now();

create index if not exists shopping_list_items_archived_idx
  on public.shopping_list_items (archived, use_count desc, last_used_at desc);
