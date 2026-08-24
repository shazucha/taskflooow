-- =====================================================================
-- VR Liptov — financie
--  1) vr_partner_contributions = úhrady spoločníkov na chod firmy
--  2) vr_finance_records       = mesačné výdaje a príjmy (vklady konateľa)
-- =====================================================================

-- 1) Úhrady spoločníkov -----------------------------------------------
create table if not exists public.vr_partner_contributions (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references public.profiles(id) on delete cascade,
  paid_on     date not null default current_date,
  amount      numeric(12,2) not null default 0,
  purpose     text not null,                 -- za čo bola úhrada
  category    text not null default 'ine',   -- prevadzka | najom | technika | marketing | ine
  note        text,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists vr_partner_contributions_paid_idx
  on public.vr_partner_contributions(paid_on desc);

grant select, insert, update, delete on public.vr_partner_contributions to authenticated;
grant all on public.vr_partner_contributions to service_role;

alter table public.vr_partner_contributions enable row level security;

drop policy if exists "vrpc select" on public.vr_partner_contributions;
create policy "vrpc select" on public.vr_partner_contributions
  for select to authenticated using (true);

drop policy if exists "vrpc insert" on public.vr_partner_contributions;
create policy "vrpc insert" on public.vr_partner_contributions
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "vrpc update" on public.vr_partner_contributions;
create policy "vrpc update" on public.vr_partner_contributions
  for update to authenticated using (true);

drop policy if exists "vrpc delete" on public.vr_partner_contributions;
create policy "vrpc delete" on public.vr_partner_contributions
  for delete to authenticated using (true);

drop trigger if exists vr_partner_contributions_set_updated_at on public.vr_partner_contributions;
create trigger vr_partner_contributions_set_updated_at
  before update on public.vr_partner_contributions
  for each row execute function public.set_updated_at();

-- 2) Mesačné výdaje a príjmy ------------------------------------------
create table if not exists public.vr_finance_records (
  id           uuid primary key default gen_random_uuid(),
  month_key    text not null,                  -- "YYYY-MM"
  occurred_on  date not null default current_date,
  direction    text not null default 'expense',-- 'expense' | 'income'
  amount       numeric(12,2) not null default 0,
  title        text not null,
  category     text not null default 'ine',
  recurring    boolean not null default false, -- pravidelný mesačný náklad
  note         text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint vr_finance_records_direction_chk check (direction in ('expense','income'))
);

create index if not exists vr_finance_records_month_idx
  on public.vr_finance_records(month_key, occurred_on desc);

grant select, insert, update, delete on public.vr_finance_records to authenticated;
grant all on public.vr_finance_records to service_role;

alter table public.vr_finance_records enable row level security;

drop policy if exists "vrfr select" on public.vr_finance_records;
create policy "vrfr select" on public.vr_finance_records
  for select to authenticated using (true);

drop policy if exists "vrfr insert" on public.vr_finance_records;
create policy "vrfr insert" on public.vr_finance_records
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "vrfr update" on public.vr_finance_records;
create policy "vrfr update" on public.vr_finance_records
  for update to authenticated using (true);

drop policy if exists "vrfr delete" on public.vr_finance_records;
create policy "vrfr delete" on public.vr_finance_records
  for delete to authenticated using (true);

drop trigger if exists vr_finance_records_set_updated_at on public.vr_finance_records;
create trigger vr_finance_records_set_updated_at
  before update on public.vr_finance_records
  for each row execute function public.set_updated_at();

-- realtime
do $$
begin
  begin
    alter publication supabase_realtime add table public.vr_partner_contributions;
  exception when others then null;
  end;
  begin
    alter publication supabase_realtime add table public.vr_finance_records;
  exception when others then null;
  end;
end $$;
