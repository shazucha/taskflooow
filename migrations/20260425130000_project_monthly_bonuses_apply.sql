-- Apply monthly bonuses table (predchádzajúca migrácia neprebehla na DB).
create table if not exists public.project_monthly_bonuses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  month_key text not null,
  title text not null,
  note text,
  position integer not null default 0,
  done boolean not null default false,
  done_by uuid references auth.users(id) on delete set null,
  done_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists project_monthly_bonuses_project_month_idx
  on public.project_monthly_bonuses(project_id, month_key);

alter table public.project_monthly_bonuses enable row level security;

drop policy if exists "view monthly bonuses" on public.project_monthly_bonuses;
create policy "view monthly bonuses"
  on public.project_monthly_bonuses for select to authenticated
  using (public.can_view_project(project_id, auth.uid()));

drop policy if exists "insert monthly bonuses" on public.project_monthly_bonuses;
create policy "insert monthly bonuses"
  on public.project_monthly_bonuses for insert to authenticated
  with check (public.can_view_project(project_id, auth.uid()));

drop policy if exists "update monthly bonuses" on public.project_monthly_bonuses;
create policy "update monthly bonuses"
  on public.project_monthly_bonuses for update to authenticated
  using (public.can_view_project(project_id, auth.uid()));

drop policy if exists "delete monthly bonuses" on public.project_monthly_bonuses;
create policy "delete monthly bonuses"
  on public.project_monthly_bonuses for delete to authenticated
  using (public.can_view_project(project_id, auth.uid()));