-- Mesačné reporty projektu: titulok, mesiac, voliteľný odkaz, voliteľný súbor, poznámka.
-- Vidieť/upravovať môžu členovia projektu (project_members) alebo vlastník.

create table if not exists public.project_monthly_reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  month_key text not null,
  title text,
  note text,
  url text,
  file_url text,
  file_name text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists project_monthly_reports_project_idx
  on public.project_monthly_reports(project_id, created_at desc);

grant select, insert, update, delete on public.project_monthly_reports to authenticated;
grant all on public.project_monthly_reports to service_role;

alter table public.project_monthly_reports enable row level security;

drop policy if exists "pmr_select" on public.project_monthly_reports;
create policy "pmr_select" on public.project_monthly_reports
  for select to authenticated
  using (
    exists (
      select 1 from public.project_members pm
      where pm.project_id = project_monthly_reports.project_id
        and pm.user_id = auth.uid()
    )
    or exists (
      select 1 from public.projects p
      where p.id = project_monthly_reports.project_id
        and p.owner_id = auth.uid()
    )
  );

drop policy if exists "pmr_insert" on public.project_monthly_reports;
create policy "pmr_insert" on public.project_monthly_reports
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and (
      exists (
        select 1 from public.project_members pm
        where pm.project_id = project_monthly_reports.project_id
          and pm.user_id = auth.uid()
      )
      or exists (
        select 1 from public.projects p
        where p.id = project_monthly_reports.project_id
          and p.owner_id = auth.uid()
      )
    )
  );

drop policy if exists "pmr_update" on public.project_monthly_reports;
create policy "pmr_update" on public.project_monthly_reports
  for update to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = project_monthly_reports.project_id
        and pm.user_id = auth.uid()
    )
  )
  with check (true);

drop policy if exists "pmr_delete" on public.project_monthly_reports;
create policy "pmr_delete" on public.project_monthly_reports
  for delete to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = project_monthly_reports.project_id
        and pm.user_id = auth.uid()
    )
  );

do $$
begin
  begin
    alter publication supabase_realtime add table public.project_monthly_reports;
  exception when others then null;
  end;
end $$;