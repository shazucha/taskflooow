-- Google Calendar -> TaskFlow pull sync
-- Tracks which tasks were imported from Google so we know how to handle deletions.

alter table public.tasks
  add column if not exists google_imported boolean not null default false;

-- Per-user incremental sync token (Google's nextSyncToken).
alter table public.google_calendar_tokens
  add column if not exists sync_token text,
  add column if not exists last_pulled_at timestamptz;

-- Speed up "find task by event id" lookups during pull
create index if not exists tasks_google_event_owner_idx
  on public.tasks(google_calendar_owner, google_event_id)
  where google_event_id is not null;