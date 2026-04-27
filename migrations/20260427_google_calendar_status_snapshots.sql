-- Snapshot statusov úloh pred automatickou opravou (pre rollback).
create table if not exists public.google_calendar_status_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  items jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists google_calendar_status_snapshots_user_idx
  on public.google_calendar_status_snapshots(user_id, created_at desc);

alter table public.google_calendar_status_snapshots enable row level security;

drop policy if exists "view own snapshots" on public.google_calendar_status_snapshots;
create policy "view own snapshots"
  on public.google_calendar_status_snapshots for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "delete own snapshots" on public.google_calendar_status_snapshots;
create policy "delete own snapshots"
  on public.google_calendar_status_snapshots for delete to authenticated
  using (user_id = auth.uid());