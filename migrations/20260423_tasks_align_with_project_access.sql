-- Align tasks RLS with project access (category-based or membership)
-- Previously INSERT/UPDATE/DELETE used is_project_member only,
-- which blocked users who only have access via category 'odstartujto.sk'.

drop policy if exists "Members can view tasks" on public.tasks;
create policy "Users can view permitted tasks"
  on public.tasks for select to authenticated
  using (
    (project_id is null and (created_by = auth.uid() or assignee_id = auth.uid()))
    or (project_id is not null and public.can_view_project(project_id, auth.uid()))
  );

drop policy if exists "Members can create tasks" on public.tasks;
create policy "Users can create tasks in permitted projects"
  on public.tasks for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      project_id is null
      or public.can_view_project(project_id, auth.uid())
    )
  );

drop policy if exists "Members or assignee can update tasks" on public.tasks;
create policy "Users can update permitted tasks"
  on public.tasks for update to authenticated
  using (
    assignee_id = auth.uid()
    or created_by = auth.uid()
    or (project_id is not null and public.can_view_project(project_id, auth.uid()))
  );

drop policy if exists "Members, creator or owner can delete tasks" on public.tasks;
drop policy if exists "Creator or owner can delete tasks" on public.tasks;
create policy "Users can delete permitted tasks"
  on public.tasks for delete to authenticated
  using (
    created_by = auth.uid()
    or assignee_id = auth.uid()
    or (project_id is not null and public.can_view_project(project_id, auth.uid()))
    or public.is_app_admin()
  );
