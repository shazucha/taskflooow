-- Pridanie series_id pre opakované úlohy
alter table public.tasks add column if not exists series_id uuid;
create index if not exists tasks_series_idx on public.tasks(series_id);
