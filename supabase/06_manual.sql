alter table public.shopping_list_items
  add column if not exists manual boolean not null default false;

update public.shopping_list_items s
set manual = true
where s.manual = false
  and not exists (
    select 1 from public.meal_ingredients i
    where i.normalized_name = s.normalized_name
  );
