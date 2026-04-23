-- Detailnejší verifikátor pre sync_project_members:
--   - vypíše OID, schému, jazyk
--   - nájde presné čísla riadkov, kde sa vyskytuje can_view_project / is_project_member
--   - zlyhá s exception, ak funkcia nepoužíva can_view_project alebo
--     ešte obsahuje is_project_member
do $$
declare
  fn_oid oid;
  fn_schema text;
  fn_lang text;
  fn_src text;
  line_no int;
  line_txt text;
  has_cvp boolean := false;
  has_ipm boolean := false;
  ipm_lines text := '';
  cvp_lines text := '';
begin
  select p.oid, n.nspname, l.lanname, pg_get_functiondef(p.oid)
    into fn_oid, fn_schema, fn_lang, fn_src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language  l on l.oid = p.prolang
  where n.nspname = 'public'
    and p.proname = 'sync_project_members';

  if fn_oid is null then
    raise exception 'sync_project_members(uuid, uuid[]) not found in schema public';
  end if;

  raise notice 'sync_project_members → oid=%, schema=%, lang=%', fn_oid, fn_schema, fn_lang;

  line_no := 0;
  foreach line_txt in array string_to_array(fn_src, E'\n') loop
    line_no := line_no + 1;
    if position('can_view_project' in line_txt) > 0 then
      has_cvp := true;
      cvp_lines := cvp_lines || format('  L%s: %s%s', line_no, line_txt, E'\n');
    end if;
    if position('is_project_member' in line_txt) > 0 then
      has_ipm := true;
      ipm_lines := ipm_lines || format('  L%s: %s%s', line_no, line_txt, E'\n');
    end if;
  end loop;

  if has_ipm then
    raise exception E'sync_project_members (oid=%) still references is_project_member at:\n%full source:\n%',
      fn_oid, ipm_lines, fn_src;
  end if;

  if not has_cvp then
    raise exception E'sync_project_members (oid=%) does NOT use can_view_project.\nfull source:\n%',
      fn_oid, fn_src;
  end if;

  raise notice E'OK: sync_project_members uses can_view_project at:\n%', cvp_lines;
end$$;
