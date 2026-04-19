-- Oprava vytvárania projektov + projektové meta údaje

-- 1) nové stĺpce na projects
alter table public.projects add column if not exists monthly_price numeric(10,2);
alter table public.projects add column if not exists currency text default 'EUR';
alter table public.projects add column if not exists client_since date;

-- 2) tabuľka jednotlivých prác
create table if not exists public.project_works (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  price numeric(10,2),
  note text,
  created_at timestamptz not null default now()
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

-- 3) RPC funkcia: vytvorenie projektu cez security definer
create or replace function public.create_project_with_membership(
  _name text,
  _description text,
  _color text,
  _owner_id uuid,
  _monthly_price numeric default null,
  _currency text default 'EUR',
  _client_since date default null
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.projects;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if auth.uid() <> _owner_id then
    raise exception 'Owner mismatch';
  end if;

  insert into public.projects (
    name, description, color, owner_id, monthly_price, currency, client_since
  ) values (
    _name, _description, _color, _owner_id, _monthly_price, coalesce(_currency, 'EUR'), _client_since
  )
  returning * into v_project;

  insert into public.project_members (project_id, user_id, role)
  values (v_project.id, _owner_id, 'owner')
  on conflict (project_id, user_id) do nothing;

  return v_project;
end;
$$;

revoke all on function public.create_project_with_membership(text, text, text, uuid, numeric, text, date) from public;
grant execute on function public.create_project_with_membership(text, text, text, uuid, numeric, text, date) to authenticated;