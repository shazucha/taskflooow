-- Robustná viditeľnosť úloh pre vlastníka/admina.
-- Admin musí vidieť všetky úlohy spolupracovníkov, aj keď sú bez project_id
-- alebo ak staršia RLS policy v databáze ešte nie je zosúladená.

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and lower(u.email) = 'hazucha.stano@gmail.com'
  )
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and lower(coalesce(p.email, '')) = 'hazucha.stano@gmail.com'
  );
$$;

revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to authenticated;

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
     or (t.project_id is not null and public.can_view_project(t.project_id, auth.uid()))
  order by t.created_at desc;
$$;

revoke all on function public.get_visible_tasks() from public;
grant execute on function public.get_visible_tasks() to authenticated;

drop policy if exists "Members can view tasks" on public.tasks;
drop policy if exists "Users can view permitted tasks" on public.tasks;
create policy "Users can view permitted tasks"
  on public.tasks for select to authenticated
  using (
    public.is_app_admin()
    or (project_id is null and (created_by = auth.uid() or assignee_id = auth.uid()))
    or (project_id is not null and public.can_view_project(project_id, auth.uid()))
  );