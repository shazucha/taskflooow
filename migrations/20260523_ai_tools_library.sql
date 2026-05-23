-- AI knižnica nástrojov – zdieľaná pre celý tím
create table if not exists public.ai_tools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null,
  description text,
  category text not null default 'ine',
  image_url text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_tools_category_idx on public.ai_tools(category);
create index if not exists ai_tools_created_at_idx on public.ai_tools(created_at desc);

alter table public.ai_tools enable row level security;

drop policy if exists "ai_tools_select" on public.ai_tools;
create policy "ai_tools_select"
  on public.ai_tools for select
  to authenticated
  using (true);

drop policy if exists "ai_tools_insert" on public.ai_tools;
create policy "ai_tools_insert"
  on public.ai_tools for insert
  to authenticated
  with check (created_by = auth.uid());

-- Každý prihlásený používateľ môže upravovať (zdieľaná tímová knižnica).
drop policy if exists "ai_tools_update" on public.ai_tools;
create policy "ai_tools_update"
  on public.ai_tools for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "ai_tools_delete" on public.ai_tools;
create policy "ai_tools_delete"
  on public.ai_tools for delete
  to authenticated
  using (created_by = auth.uid());

-- Auto updated_at
create or replace function public.touch_ai_tools_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_touch_ai_tools on public.ai_tools;
create trigger trg_touch_ai_tools
  before update on public.ai_tools
  for each row execute function public.touch_ai_tools_updated_at();

alter publication supabase_realtime add table public.ai_tools;