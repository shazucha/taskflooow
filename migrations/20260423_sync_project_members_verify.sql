-- Verifikácia, že sync_project_members používa can_view_project
-- (a nie staršiu is_project_member kontrolu).
do $$
declare
  src text;
begin
  select pg_get_functiondef(p.oid) into src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'sync_project_members';

  if src is null then
    raise exception 'sync_project_members function not found';
  end if;

  if position('can_view_project' in src) = 0 then
    raise exception 'sync_project_members must use can_view_project, current definition: %', src;
  end if;

  if position('is_project_member' in src) > 0 then
    raise exception 'sync_project_members still references is_project_member';
  end if;

  raise notice 'OK: sync_project_members is aligned with can_view_project';
end$$;
