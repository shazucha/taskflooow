-- Allow project members (not just creator/owner) to delete tasks within their project
drop policy if exists "Creator or owner can delete tasks" on public.tasks;

create policy "Members, creator or owner can delete tasks"
  on public.tasks for delete to authenticated
  using (
    created_by = auth.uid()
    or assignee_id = auth.uid()
    or (project_id is not null and public.is_project_member(project_id, auth.uid()))
    or exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = auth.uid()
    )
  );
