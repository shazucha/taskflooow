-- Zjednotenie stavov úloh: iba "todo" a "done".
-- Existujúce "in_progress" sa preklopia na "todo".

update public.tasks
set status = 'todo'
where status = 'in_progress';

-- Odstránime starý CHECK (ak existuje) a nahradíme novým, ktorý povoľuje
-- iba dve hodnoty. Názov constraintu môže byť rôzny — riešime cez DO blok.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.tasks'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.tasks drop constraint %I', c.conname);
  end loop;
end$$;

alter table public.tasks
  add constraint tasks_status_check
  check (status in ('todo', 'done'));

-- Default na "todo" (ak nebol).
alter table public.tasks alter column status set default 'todo';

-- Označíme všetky úlohy importované z Google Calendar, ktorých koniec
-- (alebo začiatok ak nemajú koniec) je v minulosti, ako dokončené.
-- Užívatelia nahlásili stovky "otvorených" úloh, ktoré v skutočnosti
-- predstavujú dávno uplynulé udalosti v kalendári.
update public.tasks
set status = 'done'
where google_imported = true
  and status <> 'done'
  and coalesce(due_end, due_date) is not null
  and coalesce(due_end, due_date) < now();