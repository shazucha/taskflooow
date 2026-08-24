-- VR Liptov — konateľ pri pôžičke + rozdelenie tržieb (VR herňa / iná činnosť)

-- 1) Kto poskytol pôžičku / komu sa spláca (konateľ)
alter table public.vr_finance_records
  add column if not exists partner_id uuid references public.profiles(id) on delete set null;

create index if not exists vr_finance_records_partner_idx
  on public.vr_finance_records(partner_id);

-- 2) Druh tržby pri príjmoch: 'vr' = VR herňa (sessions), 'other' = iná činnosť
alter table public.vr_finance_records
  add column if not exists revenue_kind text;

do $$
begin
  alter table public.vr_finance_records
    add constraint vr_finance_records_revenue_kind_chk
    check (revenue_kind is null or revenue_kind in ('vr','other'));
exception when duplicate_object then null;
end $$;

-- staré príjmy bez druhu ber ako VR herňu
update public.vr_finance_records
   set revenue_kind = 'vr'
 where direction = 'income' and revenue_kind is null;

-- 3) Doplnkové zdroje príjmov
insert into public.vr_categories (scope, key, label, is_default, position) values
  ('income','trzby_vr','Tržby — VR herňa',true,25),
  ('income','trzby_ine','Tržby — iná činnosť',true,35)
on conflict (scope, key) do nothing;
