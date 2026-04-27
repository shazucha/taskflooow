-- Oprava nekonečnej rekurzie medzi tasks <-> task_watchers RLS policies.
-- Riešenie: SECURITY DEFINER helper funkcia, ktorá obíde RLS pri kontrole watchera.

create or replace function public.is_task_watcher(_task_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.task_watchers
    where task_id = _task_id and user_id = _user_id
  )
$$;

revoke all on function public.is_task_watcher(uuid, uuid) from public;
grant execute on function public.is_task_watcher(uuid, uuid) to authenticated;

-- Aktualizovaná SELECT policy na public.tasks (bez priameho EXISTS na task_watchers)
drop policy if exists "Users can view permitted tasks" on public.tasks;
create policy "Users can view permitted tasks"
  on public.tasks for select to authenticated
  using (
    public.is_app_admin()
    or created_by = auth.uid()
    or assignee_id = auth.uid()
    or public.is_task_watcher(id, auth.uid())
    or (project_id is not null and public.can_view_project(project_id, auth.uid()))
  );

-- RPC get_visible_tasks — rovnaký princíp
create or replace function public.get_visible_tasks()
returns setof public.tasks
language sql
stable
security definer
set search_path = public
as $$
  select t.*
  from public.tasks t
  where public.is_app_admin()
     or t.created_by = auth.uid()
     or t.assignee_id = auth.uid()
     or public.is_task_watcher(t.id, auth.uid())
     or (t.project_id is not null and public.can_view_project(t.project_id, auth.uid()))
  order by t.created_at desc;
$$;

revoke all on function public.get_visible_tasks() from public;
grant execute on function public.get_visible_tasks() to authenticated;
