-- Verifikácia: všetky RLS policy na public.tasks musia používať
-- can_view_project a nesmú obsahovať staršiu is_project_member kontrolu.
do $$
declare
  r record;
  expr text;
  bad_count int := 0;
begin
  for r in
    select polname,
           pg_get_expr(polqual, polrelid)      as using_expr,
           pg_get_expr(polwithcheck, polrelid) as check_expr
    from pg_policy
    where polrelid = 'public.tasks'::regclass
  loop
    expr := coalesce(r.using_expr, '') || ' ' || coalesce(r.check_expr, '');

    if position('is_project_member' in expr) > 0 then
      raise warning 'Policy "%" on public.tasks still uses is_project_member: %', r.polname, expr;
      bad_count := bad_count + 1;
    end if;

    -- Policy musí buď referencovať can_view_project, alebo byť obmedzená
    -- iba na vlastníka záznamu (created_by/assignee_id) — inak je to red flag.
    if position('can_view_project' in expr) = 0
       and position('created_by' in expr) = 0
       and position('assignee_id' in expr) = 0
       and position('is_app_admin' in expr) = 0 then
      raise warning 'Policy "%" on public.tasks neither uses can_view_project nor an owner check: %',
        r.polname, expr;
      bad_count := bad_count + 1;
    end if;
  end loop;

  if bad_count > 0 then
    raise exception 'tasks RLS verification failed: % problem(s) found', bad_count;
  end if;

  raise notice 'OK: all tasks RLS policies are aligned with can_view_project';
end$$;
