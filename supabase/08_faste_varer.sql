-- Faste varer: linjer som aldri fjernes av «Tøm lista» eller «Fjern avhukede»,
-- de bare hakes av. Én stjerne, én regel — i motsetning til å utlede det av
-- hvor varen kom fra, som ville gjort knappene uforutsigbare.
alter table public.shopping_list_items
  add column if not exists pinned boolean not null default false;
