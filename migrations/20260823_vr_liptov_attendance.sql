-- =====================================================================
-- VR Liptov — dochádzka / rezervácie VR herne
-- =====================================================================

create table if not exists public.vr_liptov_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  day         date not null,
  start_time  time not null default '07:00',
  end_time    time not null default '14:00',
  kind        text not null default 'work',   -- 'work' | 'session' | 'reservation'
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint vr_liptov_entries_kind_chk check (kind in ('work','session','reservation'))
);

create index if not exists vr_liptov_entries_day_idx on public.vr_liptov_entries(day);

-- Data API prístup (bez GRANTov PostgREST tabuľku nevidí)
grant select, insert, update, delete on public.vr_liptov_entries to authenticated;
grant all on public.vr_liptov_entries to service_role;

alter table public.vr_liptov_entries enable row level security;

drop policy if exists "VR entries readable by authenticated" on public.vr_liptov_entries;
create policy "VR entries readable by authenticated"
  on public.vr_liptov_entries for select to authenticated using (true);

drop policy if exists "VR entries insert own" on public.vr_liptov_entries;
create policy "VR entries insert own"
  on public.vr_liptov_entries for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "VR entries update own" on public.vr_liptov_entries;
create policy "VR entries update own"
  on public.vr_liptov_entries for update to authenticated using (user_id = auth.uid());

drop policy if exists "VR entries delete own" on public.vr_liptov_entries;
create policy "VR entries delete own"
  on public.vr_liptov_entries for delete to authenticated using (user_id = auth.uid());

-- updated_at trigger (funkcia set_updated_at už v projekte existuje)
drop trigger if exists vr_liptov_entries_set_updated_at on public.vr_liptov_entries;
create trigger vr_liptov_entries_set_updated_at
  before update on public.vr_liptov_entries
  for each row execute function public.set_updated_at();

-- realtime
alter publication supabase_realtime add table public.vr_liptov_entries;
