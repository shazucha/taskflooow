-- Hodinová sadzba na úrovni projektu + globálny/per-projekt cenník extra služieb
-- + rozšírenie project_monthly_bonuses o ceny, hodiny, množstvo a zdroj.

-- 1) Hodinovka per projekt
alter table public.projects
  add column if not exists hourly_rate numeric(10,2);

-- 2) Globálny cenník služieb (admin – jeden pre celú apku)
create table if not exists public.service_catalog (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  unit_price numeric(10,2) not null default 0,
  default_hours numeric(6,2),
  note text,
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists service_catalog_active_idx on public.service_catalog(active);

alter table public.service_catalog enable row level security;

-- Každý prihlásený si vie zoznam prečítať
drop policy if exists "auth can read service_catalog" on public.service_catalog;
create policy "auth can read service_catalog"
  on public.service_catalog for select to authenticated
  using (true);

-- Mutácie iba admin (rovnaký pattern ako iné admin features – kontroluje sa cez email).
-- Keďže v DB nemáme priamo role tabuľku, povoľujeme mutácie len používateľovi
-- s emailom hazucha.stano@gmail.com.
drop policy if exists "admin can insert service_catalog" on public.service_catalog;
create policy "admin can insert service_catalog"
  on public.service_catalog for insert to authenticated
  with check (
    exists (
      select 1 from auth.users u
      where u.id = auth.uid() and lower(u.email) = 'hazucha.stano@gmail.com'
    )
  );

drop policy if exists "admin can update service_catalog" on public.service_catalog;
create policy "admin can update service_catalog"
  on public.service_catalog for update to authenticated
  using (
    exists (
      select 1 from auth.users u
      where u.id = auth.uid() and lower(u.email) = 'hazucha.stano@gmail.com'
    )
  );

drop policy if exists "admin can delete service_catalog" on public.service_catalog;
create policy "admin can delete service_catalog"
  on public.service_catalog for delete to authenticated
  using (
    exists (
      select 1 from auth.users u
      where u.id = auth.uid() and lower(u.email) = 'hazucha.stano@gmail.com'
    )
  );

-- 3) Per-projekt override cenníka (ceny špecifické pre konkrétneho klienta)
create table if not exists public.project_service_overrides (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  catalog_id uuid not null references public.service_catalog(id) on delete cascade,
  unit_price numeric(10,2),
  default_hours numeric(6,2),
  created_at timestamptz not null default now(),
  unique (project_id, catalog_id)
);

create index if not exists project_service_overrides_project_idx
  on public.project_service_overrides(project_id);

alter table public.project_service_overrides enable row level security;

drop policy if exists "members can read service overrides" on public.project_service_overrides;
create policy "members can read service overrides"
  on public.project_service_overrides for select to authenticated
  using (public.can_view_project(project_id, auth.uid()));

drop policy if exists "members can insert service overrides" on public.project_service_overrides;
create policy "members can insert service overrides"
  on public.project_service_overrides for insert to authenticated
  with check (public.can_view_project(project_id, auth.uid()));

drop policy if exists "members can update service overrides" on public.project_service_overrides;
create policy "members can update service overrides"
  on public.project_service_overrides for update to authenticated
  using (public.can_view_project(project_id, auth.uid()));

drop policy if exists "members can delete service overrides" on public.project_service_overrides;
create policy "members can delete service overrides"
  on public.project_service_overrides for delete to authenticated
  using (public.can_view_project(project_id, auth.uid()));

-- 4) Rozšírenie monthly_bonuses o ceny + hodiny + množstvo + zdroj
alter table public.project_monthly_bonuses
  add column if not exists qty numeric(8,2) not null default 1,
  add column if not exists unit_price numeric(10,2),
  add column if not exists hours numeric(6,2),
  add column if not exists hourly_rate numeric(10,2),
  add column if not exists catalog_id uuid references public.service_catalog(id) on delete set null;