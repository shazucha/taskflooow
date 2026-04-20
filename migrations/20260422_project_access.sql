-- =====================================================================
-- Per-project access control
--   - Hardcoded super-admin: hazucha.stano@gmail.com (vidí a spravuje všetko)
--   - Bežní users: vidia projekty kategórie 'odstartujto.sk' + projekty
--     kde sú v project_members
--   - Admin priradzuje členov v UI projektu
-- =====================================================================

-- ---------- Helper: je prihlásený user super-admin?
create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from auth.users
    where id = auth.uid()
      and lower(email) = 'hazucha.stano@gmail.com'
  );
$$;

revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to authenticated;

-- ---------- Rozšírený check: môže user vidieť projekt?
create or replace function public.can_view_project(_project_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_app_admin()
    or exists (
      select 1 from public.projects p
      where p.id = _project_id
        and (
          p.owner_id = _user_id
          or p.category = 'odstartujto.sk'
        )
    )
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = _project_id and pm.user_id = _user_id
    );
$$;

revoke all on function public.can_view_project(uuid, uuid) from public;
grant execute on function public.can_view_project(uuid, uuid) to authenticated;

-- ---------- Prepíš RLS pre projects (SELECT)
drop policy if exists "Members can view projects" on public.projects;
create policy "Users can view permitted projects"
  on public.projects for select to authenticated
  using (public.can_view_project(id, auth.uid()));

-- Owners alebo admin môžu update / delete
drop policy if exists "Owners can update projects" on public.projects;
create policy "Owners or admin can update projects"
  on public.projects for update to authenticated
  using (auth.uid() = owner_id or public.is_app_admin());

drop policy if exists "Owners can delete projects" on public.projects;
create policy "Owners or admin can delete projects"
  on public.projects for delete to authenticated
  using (auth.uid() = owner_id or public.is_app_admin());

-- ---------- RLS pre project_members
-- Admin vidí všetkých členov všetkých projektov; ostatní iba svojich projektov
drop policy if exists "Members can view membership" on public.project_members;
create policy "View project members"
  on public.project_members for select to authenticated
  using (
    public.is_app_admin()
    or public.can_view_project(project_id, auth.uid())
  );

-- Iba admin alebo owner môže pridávať/mazať členov (cez RPC nižšie)
drop policy if exists "Owners manage members" on public.project_members;
create policy "Admin or owner manage members"
  on public.project_members for all to authenticated
  using (
    public.is_app_admin()
    or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
  )
  with check (
    public.is_app_admin()
    or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
  );

-- ---------- RPC: pridanie / odobratie člena (admin/owner only)
create or replace function public.add_project_member(_project_id uuid, _user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not (
    public.is_app_admin()
    or exists (select 1 from public.projects p where p.id = _project_id and p.owner_id = auth.uid())
  ) then
    raise exception 'Forbidden';
  end if;
  insert into public.project_members (project_id, user_id, role)
  values (_project_id, _user_id, 'member')
  on conflict (project_id, user_id) do nothing;
end;
$$;

revoke all on function public.add_project_member(uuid, uuid) from public;
grant execute on function public.add_project_member(uuid, uuid) to authenticated;

create or replace function public.remove_project_member(_project_id uuid, _user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not (
    public.is_app_admin()
    or exists (select 1 from public.projects p where p.id = _project_id and p.owner_id = auth.uid())
  ) then
    raise exception 'Forbidden';
  end if;
  -- Owner sa nedá odobrať
  if exists (select 1 from public.projects p where p.id = _project_id and p.owner_id = _user_id) then
    raise exception 'Cannot remove project owner';
  end if;
  delete from public.project_members
  where project_id = _project_id and user_id = _user_id;
end;
$$;

revoke all on function public.remove_project_member(uuid, uuid) from public;
grant execute on function public.remove_project_member(uuid, uuid) to authenticated;
