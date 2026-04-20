-- Zjednoť RLS pre recurring works s can_view_project (aby ich videli všetci,
-- ktorí majú prístup k projektu — nielen project_members).

drop policy if exists "members can read recurring works" on public.project_recurring_works;
drop policy if exists "members can insert recurring works" on public.project_recurring_works;
drop policy if exists "members can update recurring works" on public.project_recurring_works;
drop policy if exists "members can delete recurring works" on public.project_recurring_works;

create policy "view recurring works"
  on public.project_recurring_works for select to authenticated
  using (public.can_view_project(project_id, auth.uid()));

create policy "insert recurring works"
  on public.project_recurring_works for insert to authenticated
  with check (public.can_view_project(project_id, auth.uid()));

create policy "update recurring works"
  on public.project_recurring_works for update to authenticated
  using (public.can_view_project(project_id, auth.uid()));

create policy "delete recurring works"
  on public.project_recurring_works for delete to authenticated
  using (public.can_view_project(project_id, auth.uid()));

drop policy if exists "members can read completions" on public.project_recurring_work_completions;
drop policy if exists "members can insert completions" on public.project_recurring_work_completions;
drop policy if exists "members can delete completions" on public.project_recurring_work_completions;

create policy "view completions"
  on public.project_recurring_work_completions for select to authenticated
  using (exists (
    select 1 from public.project_recurring_works w
    where w.id = work_id and public.can_view_project(w.project_id, auth.uid())
  ));

create policy "insert completions"
  on public.project_recurring_work_completions for insert to authenticated
  with check (exists (
    select 1 from public.project_recurring_works w
    where w.id = work_id and public.can_view_project(w.project_id, auth.uid())
  ));

create policy "delete completions"
  on public.project_recurring_work_completions for delete to authenticated
  using (exists (
    select 1 from public.project_recurring_works w
    where w.id = work_id and public.can_view_project(w.project_id, auth.uid())
  ));
