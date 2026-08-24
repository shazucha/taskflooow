-- VR Liptov — vklady spoločníkov (napr. podiel Romea z marketingových projektov
-- použitý ako vklad do firmy). Samostatná tabuľka oproti úhradám.

create table if not exists public.vr_partner_deposits (
  id           uuid primary key default gen_random_uuid(),
  partner_id   uuid not null references public.profiles(id) on delete cascade,
  deposited_on date not null default current_date,
  amount       numeric(12,2) not null default 0,   -- reálne vložená suma
  source       text,                               -- odkiaľ (projekt / klient / firma)
  base_amount  numeric(12,2),                      -- zárobok projektu (napr. 1000 €)
  share_pct    numeric(5,2),                       -- podiel spoločníka v % (napr. 50)
  note         text,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists vr_partner_deposits_date_idx
  on public.vr_partner_deposits(deposited_on desc);

grant select, insert, update, delete on public.vr_partner_deposits to authenticated;
grant all on public.vr_partner_deposits to service_role;

alter table public.vr_partner_deposits enable row level security;

drop policy if exists "vrpd select" on public.vr_partner_deposits;
create policy "vrpd select" on public.vr_partner_deposits
  for select to authenticated using (true);

drop policy if exists "vrpd insert" on public.vr_partner_deposits;
create policy "vrpd insert" on public.vr_partner_deposits
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "vrpd update" on public.vr_partner_deposits;
create policy "vrpd update" on public.vr_partner_deposits
  for update to authenticated using (true);

drop policy if exists "vrpd delete" on public.vr_partner_deposits;
create policy "vrpd delete" on public.vr_partner_deposits
  for delete to authenticated using (true);

drop trigger if exists vr_partner_deposits_set_updated_at on public.vr_partner_deposits;
create trigger vr_partner_deposits_set_updated_at
  before update on public.vr_partner_deposits
  for each row execute function public.set_updated_at();

do $$
begin
  begin
    alter publication supabase_realtime add table public.vr_partner_deposits;
  exception when others then null;
  end;
end $$;
