create or replace function public.backfill_project_members_from_tasks()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_members (project_id, user_id, role)
  select distinct project_id, user_id, 'member'::public.member_role
  from (
    select t.project_id, t.created_by as user_id
    from public.tasks t
    where t.project_id is not null and t.created_by is not null

    union

    select t.project_id, t.assignee_id as user_id
    from public.tasks t
    where t.project_id is not null and t.assignee_id is not null

    union

    select t.project_id, tw.user_id
    from public.tasks t
    join public.task_watchers tw on tw.task_id = t.id
    where t.project_id is not null and tw.user_id is not null
  ) visible_members
  on conflict (project_id, user_id) do nothing;
end;
$$;

revoke all on function public.backfill_project_members_from_tasks() from public;
grant execute on function public.backfill_project_members_from_tasks() to authenticated;

select public.backfill_project_members_from_tasks();