-- Pridá month_key (YYYY-MM) k chat_messages, aby sa pri projektoch dali poznámky
-- filtrovať podľa mesiaca. Existujúce projektové správy sa priraďujú k aktuálnemu mesiacu.

alter table public.chat_messages
  add column if not exists month_key text;

-- Backfill: existujúce projektové správy → aktuálny mesiac (Europe/Bratislava)
update public.chat_messages
   set month_key = to_char((now() at time zone 'Europe/Bratislava')::date, 'YYYY-MM')
 where scope = 'project'
   and month_key is null;

create index if not exists chat_messages_project_month_idx
  on public.chat_messages (project_id, month_key)
  where scope = 'project';
