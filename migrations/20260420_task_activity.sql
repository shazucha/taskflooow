-- Task activity log: zaznamenáva zmeny úloh + watcherov

create table if not exists public.task_activity (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null, -- 'created' | 'field_changed' | 'watcher_added' | 'watcher_removed'
  field text,           -- názov poľa pri field_changed
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists task_activity_task_id_idx on public.task_activity(task_id, created_at desc);

alter table public.task_activity enable row level security;

-- Vidieť aktivitu môže ten, kto vidí danú úlohu (rovnaká logika ako tasks SELECT policy)
drop policy if exists "task_activity_select" on public.task_activity;
create policy "task_activity_select"
on public.task_activity
for select
to authenticated
using (
  exists (
    select 1 from public.tasks t
    where t.id = task_activity.task_id
    and (
      t.created_by = auth.uid()
      or t.assignee_id = auth.uid()
      or exists (select 1 from public.task_watchers w where w.task_id = t.id and w.user_id = auth.uid())
      or (t.project_id is not null and exists (
        select 1 from public.project_members pm where pm.project_id = t.project_id and pm.user_id = auth.uid()
      ))
    )
  )
);

-- Trigger function: tasks insert
create or replace function public.log_task_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.task_activity (task_id, actor_id, action, new_value)
  values (NEW.id, auth.uid(), 'created', to_jsonb(NEW));
  return NEW;
end;
$$;

drop trigger if exists trg_log_task_created on public.tasks;
create trigger trg_log_task_created
after insert on public.tasks
for each row execute function public.log_task_created();

-- Trigger function: tasks update — porovnáva vybrané polia
create or replace function public.log_task_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if NEW.title is distinct from OLD.title then
    insert into public.task_activity (task_id, actor_id, action, field, old_value, new_value)
    values (NEW.id, uid, 'field_changed', 'title', to_jsonb(OLD.title), to_jsonb(NEW.title));
  end if;
  if NEW.description is distinct from OLD.description then
    insert into public.task_activity (task_id, actor_id, action, field, old_value, new_value)
    values (NEW.id, uid, 'field_changed', 'description', to_jsonb(OLD.description), to_jsonb(NEW.description));
  end if;
  if NEW.priority is distinct from OLD.priority then
    insert into public.task_activity (task_id, actor_id, action, field, old_value, new_value)
    values (NEW.id, uid, 'field_changed', 'priority', to_jsonb(OLD.priority), to_jsonb(NEW.priority));
  end if;
  if NEW.status is distinct from OLD.status then
    insert into public.task_activity (task_id, actor_id, action, field, old_value, new_value)
    values (NEW.id, uid, 'field_changed', 'status', to_jsonb(OLD.status), to_jsonb(NEW.status));
  end if;
  if NEW.project_id is distinct from OLD.project_id then
    insert into public.task_activity (task_id, actor_id, action, field, old_value, new_value)
    values (NEW.id, uid, 'field_changed', 'project_id', to_jsonb(OLD.project_id), to_jsonb(NEW.project_id));
  end if;
  if NEW.assignee_id is distinct from OLD.assignee_id then
    insert into public.task_activity (task_id, actor_id, action, field, old_value, new_value)
    values (NEW.id, uid, 'field_changed', 'assignee_id', to_jsonb(OLD.assignee_id), to_jsonb(NEW.assignee_id));
  end if;
  if NEW.due_date is distinct from OLD.due_date then
    insert into public.task_activity (task_id, actor_id, action, field, old_value, new_value)
    values (NEW.id, uid, 'field_changed', 'due_date', to_jsonb(OLD.due_date), to_jsonb(NEW.due_date));
  end if;
  if NEW.due_end is distinct from OLD.due_end then
    insert into public.task_activity (task_id, actor_id, action, field, old_value, new_value)
    values (NEW.id, uid, 'field_changed', 'due_end', to_jsonb(OLD.due_end), to_jsonb(NEW.due_end));
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_log_task_updated on public.tasks;
create trigger trg_log_task_updated
after update on public.tasks
for each row execute function public.log_task_updated();

-- Trigger function: task_watchers insert
create or replace function public.log_watcher_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.task_activity (task_id, actor_id, action, new_value)
  values (NEW.task_id, auth.uid(), 'watcher_added', to_jsonb(NEW.user_id));
  return NEW;
end;
$$;

drop trigger if exists trg_log_watcher_added on public.task_watchers;
create trigger trg_log_watcher_added
after insert on public.task_watchers
for each row execute function public.log_watcher_added();

-- Trigger function: task_watchers delete
create or replace function public.log_watcher_removed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.task_activity (task_id, actor_id, action, old_value)
  values (OLD.task_id, auth.uid(), 'watcher_removed', to_jsonb(OLD.user_id));
  return OLD;
end;
$$;

drop trigger if exists trg_log_watcher_removed on public.task_watchers;
create trigger trg_log_watcher_removed
after delete on public.task_watchers
for each row execute function public.log_watcher_removed();
