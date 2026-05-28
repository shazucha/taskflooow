-- Knižnica návodov – zdieľaná pre celý tím
create table if not exists public.guides (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text not null default 'ine',
  image_url text,
  attachments jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists guides_category_idx on public.guides(category);
create index if not exists guides_created_at_idx on public.guides(created_at desc);

grant select, insert, update, delete on public.guides to authenticated;
grant all on public.guides to service_role;

alter table public.guides enable row level security;

drop policy if exists "guides_select" on public.guides;
create policy "guides_select"
  on public.guides for select
  to authenticated
  using (true);

drop policy if exists "guides_insert" on public.guides;
create policy "guides_insert"
  on public.guides for insert
  to authenticated
  with check (created_by = auth.uid());

drop policy if exists "guides_update" on public.guides;
create policy "guides_update"
  on public.guides for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "guides_delete" on public.guides;
create policy "guides_delete"
  on public.guides for delete
  to authenticated
  using (created_by = auth.uid());

create or replace function public.touch_guides_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_touch_guides on public.guides;
create trigger trg_touch_guides
  before update on public.guides
  for each row execute function public.touch_guides_updated_at();

alter publication supabase_realtime add table public.guides;