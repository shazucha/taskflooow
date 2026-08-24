-- =====================================================================
-- VR Liptov — šablóny fixných (pravidelných) nákladov
-- Používateľ si ich spravuje v UI: názov, suma, kategória, či je hradené
-- z peňazí konateľa a či sa má generovať každý mesiac.
-- =====================================================================

create table if not exists public.vr_fixed_costs (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  amount        numeric(12,2) not null default 0,
  category      text not null default 'prevadzka',
  from_director boolean not null default false,  -- hradené z peňazí konateľa (vytvorí pôžičku)
  active        boolean not null default true,   -- zahrnúť do generovania mesiaca
  day_of_month  integer not null default 5,
  note          text,
  position      integer not null default 0,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint vr_fixed_costs_day_chk check (day_of_month between 1 and 28)
);

grant select, insert, update, delete on public.vr_fixed_costs to authenticated;
grant all on public.vr_fixed_costs to service_role;

alter table public.vr_fixed_costs enable row level security;

drop policy if exists "vr_fixed_costs_select" on public.vr_fixed_costs;
create policy "vr_fixed_costs_select" on public.vr_fixed_costs
  for select to authenticated using (public.is_company_member());

drop policy if exists "vr_fixed_costs_insert" on public.vr_fixed_costs;
create policy "vr_fixed_costs_insert" on public.vr_fixed_costs
  for insert to authenticated with check (public.is_company_member());

drop policy if exists "vr_fixed_costs_update" on public.vr_fixed_costs;
create policy "vr_fixed_costs_update" on public.vr_fixed_costs
  for update to authenticated using (public.is_company_member()) with check (public.is_company_member());

drop policy if exists "vr_fixed_costs_delete" on public.vr_fixed_costs;
create policy "vr_fixed_costs_delete" on public.vr_fixed_costs
  for delete to authenticated using (public.is_company_member());

-- realtime
alter publication supabase_realtime add table public.vr_fixed_costs;

-- Predvyplnené fixné náklady (nájom + internet). HeroZoneVR kredity nie sú
-- pravidelné, preto sa nepridávajú automaticky.
insert into public.vr_fixed_costs (title, amount, category, from_director, active, position)
select * from (values
  ('Nájom priestorov', 350.00, 'najom', true, true, 10),
  ('Internet', 61.50, 'prevadzka', true, true, 20)
) as v(title, amount, category, from_director, active, position)
where not exists (select 1 from public.vr_fixed_costs);
