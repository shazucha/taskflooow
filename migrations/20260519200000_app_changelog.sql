-- Changelog aplikácie: deň + odrážky noviniek. Píšu len super-admini, čítajú všetci prihlásení.
create table if not exists public.app_changelog (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists app_changelog_date_idx on public.app_changelog (entry_date desc, created_at desc);

alter table public.app_changelog enable row level security;

drop policy if exists "changelog read all" on public.app_changelog;
drop policy if exists "changelog admin insert" on public.app_changelog;
drop policy if exists "changelog admin update" on public.app_changelog;
drop policy if exists "changelog admin delete" on public.app_changelog;

create policy "changelog read all"
  on public.app_changelog for select to authenticated using (true);

create policy "changelog admin insert"
  on public.app_changelog for insert to authenticated
  with check (public.is_app_admin());

create policy "changelog admin update"
  on public.app_changelog for update to authenticated
  using (public.is_app_admin()) with check (public.is_app_admin());

create policy "changelog admin delete"
  on public.app_changelog for delete to authenticated
  using (public.is_app_admin());
