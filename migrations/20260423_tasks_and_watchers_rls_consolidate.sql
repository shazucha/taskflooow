-- =====================================================================
-- Konsolidovaná oprava RLS pre tasks + task_watchers
--
-- Symptóm: používateľ s prístupom do projektu LEN cez kategóriu
-- 'odstartujto.sk' (napr. Romeo) dostáva pri vytváraní úlohy chybu
-- "row violates row-level security policy". Príčinou je, že nejaká
-- staršia INSERT/UPDATE policy ešte vyžaduje členstvo v project_members
-- (is_project_member), namiesto can_view_project.
--
-- Táto migrácia idempotentne nahradí všetky relevantné policies tak,
-- aby používali can_view_project (alebo owner/admin check).
-- =====================================================================

-- ---------- TASKS ----------------------------------------------------

-- SELECT
drop policy if exists "Members can view tasks" on public.tasks;
drop policy if exists "Users can view permitted tasks" on public.tasks;
create policy "Users can view permitted tasks"
  on public.tasks for select to authenticated
  using (
    public.is_app_admin()
    or (project_id is null and (created_by = auth.uid() or assignee_id = auth.uid()))
    or (project_id is not null and public.can_view_project(project_id, auth.uid()))
  );

-- INSERT
drop policy if exists "Members can create tasks" on public.tasks;
drop policy if exists "Users can create tasks in permitted projects" on public.tasks;
create policy "Users can create tasks in permitted projects"
  on public.tasks for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      project_id is null
      or public.can_view_project(project_id, auth.uid())
    )
  );

-- UPDATE
drop policy if exists "Members or assignee can update tasks" on public.tasks;
drop policy if exists "Users can update permitted tasks" on public.tasks;
create policy "Users can update permitted tasks"
  on public.tasks for update to authenticated
  using (
    public.is_app_admin()
    or assignee_id = auth.uid()
    or created_by = auth.uid()
    or (project_id is not null and public.can_view_project(project_id, auth.uid()))
  )
  with check (
    public.is_app_admin()
    or assignee_id = auth.uid()
    or created_by = auth.uid()
    or (project_id is not null and public.can_view_project(project_id, auth.uid()))
  );

-- DELETE
drop policy if exists "Members, creator or owner can delete tasks" on public.tasks;
drop policy if exists "Creator or owner can delete tasks" on public.tasks;
drop policy if exists "Users can delete permitted tasks" on public.tasks;
create policy "Users can delete permitted tasks"
  on public.tasks for delete to authenticated
  using (
    public.is_app_admin()
    or created_by = auth.uid()
    or assignee_id = auth.uid()
    or (project_id is not null and public.can_view_project(project_id, auth.uid()))
  );

-- ---------- TASK_WATCHERS -------------------------------------------
-- Tabuľka existuje v Supabase, RLS je zapnutý. Doteraz mohli ostať
-- staré "len členovia projektu" policies, ktoré blokujú vkladanie
-- watcherov pre používateľov s kategorickým prístupom.

alter table if exists public.task_watchers enable row level security;

-- Vyčistíme všetky známe staré policy mená
drop policy if exists "Members can view task watchers" on public.task_watchers;
drop policy if exists "Members can manage task watchers" on public.task_watchers;
drop policy if exists "task_watchers_select" on public.task_watchers;
drop policy if exists "task_watchers_insert" on public.task_watchers;
drop policy if exists "task_watchers_delete" on public.task_watchers;
drop policy if exists "Users can view task watchers" on public.task_watchers;
drop policy if exists "Users can add task watchers" on public.task_watchers;
drop policy if exists "Users can remove task watchers" on public.task_watchers;

-- SELECT — vidieť watcherov môže ten, kto vidí danú úlohu
create policy "Users can view task watchers"
  on public.task_watchers for select to authenticated
  using (
    public.is_app_admin()
    or exists (
      select 1 from public.tasks t
      where t.id = task_watchers.task_id
        and (
          t.created_by = auth.uid()
          or t.assignee_id = auth.uid()
          or task_watchers.user_id = auth.uid()
          or (t.project_id is not null and public.can_view_project(t.project_id, auth.uid()))
        )
    )
  );

-- INSERT — pridať watchera môže ten, kto má prístup k úlohe
create policy "Users can add task watchers"
  on public.task_watchers for insert to authenticated
  with check (
    public.is_app_admin()
    or exists (
      select 1 from public.tasks t
      where t.id = task_watchers.task_id
        and (
          t.created_by = auth.uid()
          or t.assignee_id = auth.uid()
          or (t.project_id is not null and public.can_view_project(t.project_id, auth.uid()))
        )
    )
  );

-- DELETE — odobrať watchera môže ten, kto má prístup, alebo sám watcher
create policy "Users can remove task watchers"
  on public.task_watchers for delete to authenticated
  using (
    public.is_app_admin()
    or task_watchers.user_id = auth.uid()
    or exists (
      select 1 from public.tasks t
      where t.id = task_watchers.task_id
        and (
          t.created_by = auth.uid()
          or t.assignee_id = auth.uid()
          or (t.project_id is not null and public.can_view_project(t.project_id, auth.uid()))
        )
    )
  );

-- ---------- VERIFIKÁCIA ---------------------------------------------
do $$
declare
  r record;
  expr text;
  bad int := 0;
begin
  for r in
    select polname,
           pg_get_expr(polqual, polrelid)      as using_expr,
           pg_get_expr(polwithcheck, polrelid) as check_expr
    from pg_policy
    where polrelid in ('public.tasks'::regclass, 'public.task_watchers'::regclass)
  loop
    expr := coalesce(r.using_expr, '') || ' ' || coalesce(r.check_expr, '');
    if position('is_project_member' in expr) > 0 then
      raise warning 'Policy "%" still references is_project_member: %', r.polname, expr;
      bad := bad + 1;
    end if;
  end loop;

  if bad > 0 then
    raise exception 'consolidate failed: % policy(s) still use is_project_member', bad;
  end if;

  raise notice 'OK: tasks + task_watchers RLS aligned with can_view_project';
end$$;