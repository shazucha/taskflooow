-- Zarovnaj RLS pre project_monthly_works a project_monthly_work_completions
-- s can_view_project (rovnako ako šablóna project_recurring_works).
-- Inak používatelia, ktorí majú prístup k projektu cez kategóriu (nie cez
-- project_members), nedokážu vytvoriť/snapshotnúť mesačnú náplň predplatného.

drop policy if exists "members read monthly works" on public.project_monthly_works;
drop policy if exists "members insert monthly works" on public.project_monthly_works;
drop policy if exists "members update monthly works" on public.project_monthly_works;
drop policy if exists "members delete monthly works" on public.project_monthly_works;

create policy "view monthly works"
  on public.project_monthly_works for select to authenticated
  using (public.can_view_project(project_id, auth.uid()));

create policy "insert monthly works"
  on public.project_monthly_works for insert to authenticated
  with check (public.can_view_project(project_id, auth.uid()));

create policy "update monthly works"
  on public.project_monthly_works for update to authenticated
  using (public.can_view_project(project_id, auth.uid()));

create policy "delete monthly works"
  on public.project_monthly_works for delete to authenticated
  using (public.can_view_project(project_id, auth.uid()));

drop policy if exists "members read monthly completions" on public.project_monthly_work_completions;
drop policy if exists "members insert monthly completions" on public.project_monthly_work_completions;
drop policy if exists "members delete monthly completions" on public.project_monthly_work_completions;

create policy "view monthly completions"
  on public.project_monthly_work_completions for select to authenticated
  using (exists (
    select 1 from public.project_monthly_works mw
    where mw.id = monthly_work_id
      and public.can_view_project(mw.project_id, auth.uid())
  ));

create policy "insert monthly completions"
  on public.project_monthly_work_completions for insert to authenticated
  with check (exists (
    select 1 from public.project_monthly_works mw
    where mw.id = monthly_work_id
      and public.can_view_project(mw.project_id, auth.uid())
  ));

create policy "delete monthly completions"
  on public.project_monthly_work_completions for delete to authenticated
  using (exists (
    select 1 from public.project_monthly_works mw
    where mw.id = monthly_work_id
      and public.can_view_project(mw.project_id, auth.uid())
  ));
