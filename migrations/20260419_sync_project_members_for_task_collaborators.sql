create or replace function public.sync_project_members(_project_id uuid, _user_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if _project_id is null or coalesce(array_length(_user_ids, 1), 0) = 0 then
    return;
  end if;

  if not public.is_project_member(_project_id, auth.uid()) then
    raise exception 'Forbidden';
  end if;

  insert into public.project_members (project_id, user_id, role)
  select distinct _project_id, member_id, 'member'::public.member_role
  from unnest(_user_ids) as member_id
  where member_id is not null
  on conflict (project_id, user_id) do nothing;
end;
$$;

revoke all on function public.sync_project_members(uuid, uuid[]) from public;
grant execute on function public.sync_project_members(uuid, uuid[]) to authenticated;