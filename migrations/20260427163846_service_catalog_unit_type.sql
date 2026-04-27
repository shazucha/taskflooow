-- Doplnenie typu položky cenníka:
--   'piece'  – fixná cena za ks (napr. 1× video = 180 €)
--   'hourly' – cena vychádza z hodín × hodinová sadzba projektu
-- Plus voliteľný popisok zobrazený v UI.

alter table public.service_catalog
  add column if not exists unit_type text not null default 'piece'
    check (unit_type in ('piece', 'hourly')),
  add column if not exists description text;

-- Doplnenie unit_type aj na bonusy (snapshot v čase pridania)
alter table public.project_monthly_bonuses
  add column if not exists unit_type text not null default 'piece'
    check (unit_type in ('piece', 'hourly'));