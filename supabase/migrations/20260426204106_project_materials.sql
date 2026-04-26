-- Project materials (URL links attached to a project: drive, figma, etc.)
create table if not exists public.project_materials (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  url text not null,
  label text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists project_materials_project_id_idx on public.project_materials(project_id);

alter table public.project_materials enable row level security;

drop policy if exists "project_materials_select" on public.project_materials;
create policy "project_materials_select"
on public.project_materials
for select
to authenticated
using (public.can_view_project(project_id, auth.uid()));

drop policy if exists "project_materials_insert" on public.project_materials;
create policy "project_materials_insert"
on public.project_materials
for insert
to authenticated
with check (
  public.can_view_project(project_id, auth.uid())
  and created_by = auth.uid()
);

drop policy if exists "project_materials_delete" on public.project_materials;
create policy "project_materials_delete"
on public.project_materials
for delete
to authenticated
using (
  created_by = auth.uid()
  or exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid())
);

alter publication supabase_realtime add table public.project_materials;
