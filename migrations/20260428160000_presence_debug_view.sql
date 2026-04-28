-- Presence / realtime debug view.
-- Supabase presence channels are in-memory (no DB table backs them), so this
-- view just exposes which tables are part of the supabase_realtime publication
-- (the realtime backend that powers presence + postgres_changes). The diag UI
-- queries this view to confirm chat / presence-adjacent tables are wired in.
create or replace view public.presence_debug as
select
  pn.nspname  as schema_name,
  pc.relname  as table_name,
  'supabase_realtime' as publication
from pg_publication p
join pg_publication_rel pr on pr.prpubid = p.oid
join pg_class pc           on pc.oid = pr.prrelid
join pg_namespace pn       on pn.oid = pc.relnamespace
where p.pubname = 'supabase_realtime';

grant select on public.presence_debug to authenticated, anon;

notify pgrst, 'reload schema';