-- Firemné materiály – zdieľané pre všetkých prihlásených členov tímu
create table if not exists public.company_materials (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  label text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists company_materials_created_at_idx
  on public.company_materials(created_at desc);

alter table public.company_materials enable row level security;

drop policy if exists "company_materials_select" on public.company_materials;
create policy "company_materials_select"
  on public.company_materials for select
  to authenticated
  using (true);

drop policy if exists "company_materials_insert" on public.company_materials;
create policy "company_materials_insert"
  on public.company_materials for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "company_materials_delete" on public.company_materials;
create policy "company_materials_delete"
  on public.company_materials for delete
  to authenticated
  using (created_by = auth.uid());

alter publication supabase_realtime add table public.company_materials;