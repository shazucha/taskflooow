-- Google Calendar per-user OAuth + sync mapping

create table if not exists public.google_calendar_tokens (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  access_token   text not null,
  refresh_token  text not null,
  expiry         timestamptz not null,
  calendar_id    text not null default 'primary',
  google_email   text,
  scope          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.google_calendar_tokens enable row level security;

-- Users can read only their own row (so UI can show "connected" state)
create policy "google_tokens_select_own"
  on public.google_calendar_tokens for select to authenticated
  using (user_id = auth.uid());

-- Users can delete (disconnect) their own row
create policy "google_tokens_delete_own"
  on public.google_calendar_tokens for delete to authenticated
  using (user_id = auth.uid());

-- INSERT/UPDATE happen only from edge functions via service-role key (RLS bypass).
-- No insert/update policy is defined for normal authenticated users on purpose.

-- Map task -> Google Calendar event for the assignee
alter table public.tasks
  add column if not exists google_event_id text,
  add column if not exists google_calendar_owner uuid references auth.users(id) on delete set null;

create index if not exists tasks_google_event_idx on public.tasks(google_event_id);

create trigger google_calendar_tokens_set_updated_at
  before update on public.google_calendar_tokens
  for each row execute function public.set_updated_at();