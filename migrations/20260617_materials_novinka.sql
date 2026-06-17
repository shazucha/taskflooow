-- Novinky v materiáloch: farba pre project_materials, „is_highlighted" príznak
-- pre obidva typy materiálov a per-user evidencia, kto čo už videl.

alter table public.project_materials
  add column if not exists color text,
  add column if not exists is_highlighted boolean not null default false;

alter table public.company_materials
  add column if not exists is_highlighted boolean not null default false;

-- Per-user záznam o tom, že daný používateľ už materiál otvoril/videl.
create table if not exists public.material_views (
  user_id uuid not null references auth.users(id) on delete cascade,
  material_id uuid not null,
  material_type text not null check (material_type in ('project','company')),
  viewed_at timestamptz not null default now(),
  primary key (user_id, material_id)
);

create index if not exists material_views_user_idx
  on public.material_views(user_id);

grant select, insert, update, delete on public.material_views to authenticated;
grant all on public.material_views to service_role;

alter table public.material_views enable row level security;

drop policy if exists "material_views_select_own" on public.material_views;
create policy "material_views_select_own" on public.material_views
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "material_views_insert_own" on public.material_views;
create policy "material_views_insert_own" on public.material_views
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "material_views_update_own" on public.material_views;
create policy "material_views_update_own" on public.material_views
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "material_views_delete_own" on public.material_views;
create policy "material_views_delete_own" on public.material_views
  for delete to authenticated using (user_id = auth.uid());

-- Realtime, aby sa po označení ako videné/novinka okamžite prepočítali bodky.
do $$
begin
  begin
    alter publication supabase_realtime add table public.material_views;
  exception when others then null;
  end;
end $$;