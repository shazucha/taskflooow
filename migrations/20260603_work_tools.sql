-- Knižnica pracovných nástrojov – zdieľaná pre celý tím
create table if not exists public.work_tools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text,
  password text,
  description text,
  category text not null default 'ine',
  image_url text,
  guides jsonb not null default '[]'::jsonb,
  position double precision,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists work_tools_category_idx on public.work_tools(category);
create index if not exists work_tools_created_at_idx on public.work_tools(created_at desc);
create index if not exists work_tools_position_idx on public.work_tools(position);

grant select, insert, update, delete on public.work_tools to authenticated;
grant all on public.work_tools to service_role;

alter table public.work_tools enable row level security;

drop policy if exists "work_tools_select" on public.work_tools;
create policy "work_tools_select"
  on public.work_tools for select
  to authenticated
  using (true);

drop policy if exists "work_tools_insert" on public.work_tools;
create policy "work_tools_insert"
  on public.work_tools for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "work_tools_update" on public.work_tools;
create policy "work_tools_update"
  on public.work_tools for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "work_tools_delete" on public.work_tools;
create policy "work_tools_delete"
  on public.work_tools for delete
  to authenticated
  using (created_by = auth.uid());

create or replace function public.touch_work_tools_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_touch_work_tools on public.work_tools;
create trigger trg_touch_work_tools
  before update on public.work_tools
  for each row execute function public.touch_work_tools_updated_at();

alter publication supabase_realtime add table public.work_tools;
