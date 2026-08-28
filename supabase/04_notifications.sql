-- ============================================================================
-- Migrering: hvem endret hva
-- Kjør denne BARE hvis du allerede har kjørt setup.sql fra før.
-- Nye prosjekter får dette med i setup.sql.
-- Trygg å kjøre flere ganger.
-- ============================================================================

alter table public.shopping_list_items
  add column if not exists updated_by text;

-- Lar endringshendelsen bære raden slik den var før endringen, så appen kan
-- skille "haket av" fra "fjernet" i varslene.
alter table public.shopping_list_items replica identity full;
