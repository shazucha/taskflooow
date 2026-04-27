-- Watchers (sledujúci) musia vidieť úlohy, kde sú pridelení ako watcher.
-- Doteraz RLS policy aj RPC `get_visible_tasks` zohľadňovali iba
-- `created_by`, `assignee_id` a prístup k projektu. Keď admin pridá
-- spolupracovníka ako watchera (nie hlavného riešiteľa) na úlohu mimo
-- jeho projektu, danú úlohu vôbec nevidel vo svojom kalendári/zozname.

-- 1) Aktualizovaná SELECT policy na public.tasks
drop policy if exists "Users can view permitted tasks" on public.tasks;
create policy "Users can view permitted tasks"
  on public.tasks for select to authenticated
  using (
    public.is_app_admin()
    or created_by = auth.uid()
    or assignee_id = auth.uid()
    or exists (
      select 1 from public.task_watchers w
      where w.task_id = tasks.id and w.user_id = auth.uid()
    )
    or (project_id is not null and public.can_view_project(project_id, auth.uid()))
  );

-- 2) RPC `get_visible_tasks` musí tiež vrátiť úlohy, kde som watcher
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
     or exists (
       select 1 from public.task_watchers w
       where w.task_id = t.id and w.user_id = auth.uid()
     )
     or (t.project_id is not null and public.can_view_project(t.project_id, auth.uid()))
  order by t.created_at desc;
$$;

revoke all on function public.get_visible_tasks() from public;
grant execute on function public.get_visible_tasks() to authenticated;