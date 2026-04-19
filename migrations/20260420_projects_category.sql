-- Add fixed category to projects (initial values: odstartujto.sk, shazucha.sk)
alter table public.projects
  add column if not exists category text;

-- Update RPC to accept category
create or replace function public.create_project_with_membership(
  _name text,
  _description text,
  _color text,
  _owner_id uuid,
  _monthly_price numeric default null,
  _currency text default null,
  _client_since date default null,
  _category text default null
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  new_project public.projects;
begin
  insert into public.projects (name, description, color, owner_id, monthly_price, currency, client_since, category)
  values (_name, _description, _color, _owner_id, _monthly_price, _currency, _client_since, _category)
  returning * into new_project;

  insert into public.project_members (project_id, user_id)
  values (new_project.id, _owner_id)
  on conflict do nothing;

  return new_project;
end;
$$;
