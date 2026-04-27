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