-- =====================================================================
-- VR Liptov — financie v2
--  1) vr_categories        = kategórie/typy uložené v DB (nie localStorage)
--  2) spoločný vklad       = group_id + share_mode + total_amount
--  3) RLS                  = len prihlásení členovia firmy (majú profil)
--  4) ochrana duplicít     = unique indexy
-- =====================================================================

-- Helper: člen firmy = prihlásený používateľ s profilom -----------------
create or replace function public.is_company_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid())
$$;

-- 1) Kategórie / typy ---------------------------------------------------
create table if not exists public.vr_categories (
  id         uuid primary key default gen_random_uuid(),
  scope      text not null,                  -- contribution | expense | income
  key        text not null,                  -- stabilný kľúč použitý v záznamoch
  label      text not null,
  is_default boolean not null default false,
  position   integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vr_categories_scope_chk check (scope in ('contribution','expense','income'))
);

create unique index if not exists vr_categories_scope_key_uidx
  on public.vr_categories(scope, key);
create unique index if not exists vr_categories_scope_label_uidx
  on public.vr_categories(scope, lower(label));

grant select, insert, update, delete on public.vr_categories to authenticated;
grant all on public.vr_categories to service_role;

alter table public.vr_categories enable row level security;

drop policy if exists "vrcat select" on public.vr_categories;
create policy "vrcat select" on public.vr_categories
  for select to authenticated using (public.is_company_member());

drop policy if exists "vrcat insert" on public.vr_categories;
create policy "vrcat insert" on public.vr_categories
  for insert to authenticated with check (public.is_company_member() and created_by = auth.uid());

drop policy if exists "vrcat update" on public.vr_categories;
create policy "vrcat update" on public.vr_categories
  for update to authenticated using (public.is_company_member()) with check (public.is_company_member());

drop policy if exists "vrcat delete" on public.vr_categories;
create policy "vrcat delete" on public.vr_categories
  for delete to authenticated using (public.is_company_member() and is_default = false);

drop trigger if exists vr_categories_set_updated_at on public.vr_categories;
create trigger vr_categories_set_updated_at
  before update on public.vr_categories
  for each row execute function public.set_updated_at();

-- Predvolené kategórie (spoločné pre všetkých) --------------------------
insert into public.vr_categories (scope, key, label, is_default, position) values
  ('contribution','prevadzka','Prevádzka',true,10),
  ('contribution','najom','Nájom a energie',true,20),
  ('contribution','technika','Technika a VR',true,30),
  ('contribution','software','Softvér a licencie',true,40),
  ('contribution','marketing','Marketing',true,50),
  ('contribution','uctovnictvo','Účtovníctvo a odvody',true,60),
  ('contribution','ine','Iné',true,70),
  ('expense','prevadzka','Prevádzka',true,10),
  ('expense','najom','Nájom a energie',true,20),
  ('expense','technika','Technika a VR',true,30),
  ('expense','software','Softvér a licencie',true,40),
  ('expense','marketing','Marketing',true,50),
  ('expense','uctovnictvo','Účtovníctvo a odvody',true,60),
  ('expense','ine','Iné',true,70),
  ('income','vklad_konatela','Vklad konateľa',true,10),
  ('income','vklad_spolocnika','Vklad spoločníka',true,20),
  ('income','trzby','Tržby zo sessions',true,30),
  ('income','ine_prijmy','Iné príjmy',true,40)
on conflict (scope, key) do nothing;

-- 2) Spoločný vklad -----------------------------------------------------
alter table public.vr_partner_contributions
  add column if not exists group_id     uuid,
  add column if not exists share_mode   text not null default 'single',
  add column if not exists total_amount numeric(12,2);

do $$
begin
  alter table public.vr_partner_contributions
    add constraint vr_pc_share_mode_chk check (share_mode in ('single','half','each'));
exception when duplicate_object then null;
end $$;

create index if not exists vr_partner_contributions_group_idx
  on public.vr_partner_contributions(group_id);

-- doplň total_amount pre existujúce záznamy
update public.vr_partner_contributions set total_amount = amount where total_amount is null;

-- 3) Ochrana proti duplicitám ------------------------------------------
create unique index if not exists vr_partner_contributions_dup_uidx
  on public.vr_partner_contributions(partner_id, paid_on, amount, lower(purpose));

create unique index if not exists vr_finance_records_dup_uidx
  on public.vr_finance_records(occurred_on, direction, amount, lower(title));

-- 4) Sprísnené RLS ------------------------------------------------------
drop policy if exists "vrpc select" on public.vr_partner_contributions;
create policy "vrpc select" on public.vr_partner_contributions
  for select to authenticated using (public.is_company_member());

drop policy if exists "vrpc insert" on public.vr_partner_contributions;
create policy "vrpc insert" on public.vr_partner_contributions
  for insert to authenticated with check (public.is_company_member() and created_by = auth.uid());

drop policy if exists "vrpc update" on public.vr_partner_contributions;
create policy "vrpc update" on public.vr_partner_contributions
  for update to authenticated using (public.is_company_member()) with check (public.is_company_member());

drop policy if exists "vrpc delete" on public.vr_partner_contributions;
create policy "vrpc delete" on public.vr_partner_contributions
  for delete to authenticated using (public.is_company_member());

drop policy if exists "vrfr select" on public.vr_finance_records;
create policy "vrfr select" on public.vr_finance_records
  for select to authenticated using (public.is_company_member());

drop policy if exists "vrfr insert" on public.vr_finance_records;
create policy "vrfr insert" on public.vr_finance_records
  for insert to authenticated with check (public.is_company_member() and created_by = auth.uid());

drop policy if exists "vrfr update" on public.vr_finance_records;
create policy "vrfr update" on public.vr_finance_records
  for update to authenticated using (public.is_company_member()) with check (public.is_company_member());

drop policy if exists "vrfr delete" on public.vr_finance_records;
create policy "vrfr delete" on public.vr_finance_records
  for delete to authenticated using (public.is_company_member());

-- realtime
do $$
begin
  begin
    alter publication supabase_realtime add table public.vr_categories;
  exception when others then null;
  end;
end $$;
