-- =====================================================================
-- TaskFlow — inicializačná migrácia
-- Tabuľky: profiles, projects, project_members, tasks
-- + RLS politiky bezpečné proti rekurzii (security definer helpers)
-- Spusti v Supabase Studio → SQL Editor (celý súbor naraz).
-- Bezpečné na opakované spustenie (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- =====================================================================

-- ---------- ENUMY ------------------------------------------------------
do $$ begin
  create type public.task_priority as enum ('high','medium','low');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.task_status as enum ('todo','in_progress','done');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.member_role as enum ('owner','admin','member');
exception when duplicate_object then null; end $$;

-- ---------- PROFILES ---------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  avatar_url text,
  email      text,
  color      text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Profiles viewable by authenticated" on public.profiles;
create policy "Profiles viewable by authenticated"
  on public.profiles for select to authenticated using (true);

drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile"
  on public.profiles for update to authenticated
  using (auth.uid() = id);

-- Auto-vytvorenie profilu pri signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- PROJECTS ---------------------------------------------------
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  color       text default '#3b82f6',
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.projects enable row level security;

-- ---------- PROJECT MEMBERS -------------------------------------------
create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  role       public.member_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

alter table public.project_members enable row level security;

-- Helper: členstvo v projekte (security definer → bez rekurzie)
create or replace function public.is_project_member(_project_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.project_members
    where project_id = _project_id and user_id = _user_id
  ) or exists (
    select 1 from public.projects
    where id = _project_id and owner_id = _user_id
  );
$$;

-- RLS: projects
drop policy if exists "Members view projects" on public.projects;
create policy "Members view projects"
  on public.projects for select to authenticated
  using (public.is_project_member(id, auth.uid()));

drop policy if exists "Auth users create projects" on public.projects;
create policy "Auth users create projects"
  on public.projects for insert to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists "Owners update projects" on public.projects;
create policy "Owners update projects"
  on public.projects for update to authenticated
  using (auth.uid() = owner_id);

drop policy if exists "Owners delete projects" on public.projects;
create policy "Owners delete projects"
  on public.projects for delete to authenticated
  using (auth.uid() = owner_id);

-- RLS: project_members
drop policy if exists "Members view membership" on public.project_members;
create policy "Members view membership"
  on public.project_members for select to authenticated
  using (public.is_project_member(project_id, auth.uid()));

drop policy if exists "Owners manage members" on public.project_members;
create policy "Owners manage members"
  on public.project_members for all to authenticated
  using (exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.projects p
    where p.id = project_id and p.owner_id = auth.uid()
  ));

-- ---------- TASKS ------------------------------------------------------
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references public.projects(id) on delete cascade,
  title       text not null,
  description text,
  priority    public.task_priority not null default 'medium',
  status      public.task_status   not null default 'todo',
  assignee_id uuid references public.profiles(id) on delete set null,
  created_by  uuid not null references public.profiles(id) on delete cascade,
  due_date    timestamptz,
  due_end     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists tasks_project_idx  on public.tasks(project_id);
create index if not exists tasks_assignee_idx on public.tasks(assignee_id);
create index if not exists tasks_status_idx   on public.tasks(status);

alter table public.tasks enable row level security;

drop policy if exists "Members view tasks" on public.tasks;
create policy "Members view tasks"
  on public.tasks for select to authenticated
  using (
    (project_id is null and (created_by = auth.uid() or assignee_id = auth.uid()))
    or public.is_project_member(project_id, auth.uid())
  );

drop policy if exists "Members create tasks" on public.tasks;
create policy "Members create tasks"
  on public.tasks for insert to authenticated
  with check (
    created_by = auth.uid()
    and (project_id is null or public.is_project_member(project_id, auth.uid()))
  );

drop policy if exists "Members update tasks" on public.tasks;
create policy "Members update tasks"
  on public.tasks for update to authenticated
  using (
    assignee_id = auth.uid()
    or created_by = auth.uid()
    or public.is_project_member(project_id, auth.uid())
  );

drop policy if exists "Creator or owner delete tasks" on public.tasks;
create policy "Creator or owner delete tasks"
  on public.tasks for delete to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.projects p
      where p.id = project_id and p.owner_id = auth.uid()
    )
  );

-- ---------- updated_at triggery ---------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();