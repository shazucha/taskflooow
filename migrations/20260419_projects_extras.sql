-- ====================================================================
-- Fix RLS pre projects + nové stĺpce + tabuľka project_works
-- Spusti v Supabase SQL editore.
-- ====================================================================

-- 1) RLS policy aby authenticated user mohol vytvárať projekty
drop policy if exists "Authenticated users can create projects" on public.projects;
create policy "Authenticated users can create projects"
  on public.projects for insert to authenticated
  with check (auth.uid() = owner_id);

-- (pre istotu uistime sa, že ostatné policies existujú)
drop policy if exists "Members can view projects" on public.projects;
create policy "Members can view projects"
  on public.projects for select to authenticated
  using (public.is_project_member(id, auth.uid()));

drop policy if exists "Owners can update projects" on public.projects;
create policy "Owners can update projects"
  on public.projects for update to authenticated using (auth.uid() = owner_id);

drop policy if exists "Owners can delete projects" on public.projects;
create policy "Owners can delete projects"
  on public.projects for delete to authenticated using (auth.uid() = owner_id);

-- 2) Nové stĺpce na projects: mesačná cena, mena, klient od (mesiac začiatku spolupráce)
alter table public.projects add column if not exists monthly_price numeric(10,2);
alter table public.projects add column if not exists currency text default 'EUR';
alter table public.projects add column if not exists client_since date;

-- 3) Tabuľka jednotlivých prác / služieb pre klienta
create table if not exists public.project_works (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  title       text not null,
  price       numeric(10,2),
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists project_works_project_idx on public.project_works(project_id);

alter table public.project_works enable row level security;

drop policy if exists "Members can view project works" on public.project_works;
create policy "Members can view project works"
  on public.project_works for select to authenticated
  using (public.is_project_member(project_id, auth.uid()));

drop policy if exists "Members can insert project works" on public.project_works;
create policy "Members can insert project works"
  on public.project_works for insert to authenticated
  with check (public.is_project_member(project_id, auth.uid()));

drop policy if exists "Members can update project works" on public.project_works;
create policy "Members can update project works"
  on public.project_works for update to authenticated
  using (public.is_project_member(project_id, auth.uid()));

drop policy if exists "Members can delete project works" on public.project_works;
create policy "Members can delete project works"
  on public.project_works for delete to authenticated
  using (public.is_project_member(project_id, auth.uid()));
