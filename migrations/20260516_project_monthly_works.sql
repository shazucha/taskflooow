-- Mesačné snapshoty náplne predplatného. Šablóna ostáva v `project_recurring_works`.
-- Keď používateľ v danom mesiaci čokoľvek upraví, vytvorí sa snapshot tu a edituje sa už len on.

create table if not exists public.project_monthly_works (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  month_key text not null,                -- 'YYYY-MM'
  title text not null,
  note text,
  position integer not null default 0,
  source_work_id uuid references public.project_recurring_works(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists project_monthly_works_proj_month_idx
  on public.project_monthly_works(project_id, month_key, position);

alter table public.project_monthly_works enable row level security;

create policy "members read monthly works"
  on public.project_monthly_works for select
  to authenticated
  using (
    exists (
      select 1 from public.project_members pm
      where pm.project_id = project_monthly_works.project_id
        and pm.user_id = auth.uid()
    )
  );

create policy "members insert monthly works"
  on public.project_monthly_works for insert
  to authenticated
  with check (
    exists (
      select 1 from public.project_members pm
      where pm.project_id = project_monthly_works.project_id
        and pm.user_id = auth.uid()
    )
  );

create policy "members update monthly works"
  on public.project_monthly_works for update
  to authenticated
  using (
    exists (
      select 1 from public.project_members pm
      where pm.project_id = project_monthly_works.project_id
        and pm.user_id = auth.uid()
    )
  );

create policy "members delete monthly works"
  on public.project_monthly_works for delete
  to authenticated
  using (
    exists (
      select 1 from public.project_members pm
      where pm.project_id = project_monthly_works.project_id
        and pm.user_id = auth.uid()
    )
  );

-- Dokončenia pre snapshot položky (oddelené od starých `project_recurring_work_completions`).
create table if not exists public.project_monthly_work_completions (
  id uuid primary key default gen_random_uuid(),
  monthly_work_id uuid not null references public.project_monthly_works(id) on delete cascade,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz not null default now(),
  unique (monthly_work_id)
);

create index if not exists project_monthly_work_completions_work_idx
  on public.project_monthly_work_completions(monthly_work_id);

alter table public.project_monthly_work_completions enable row level security;

create policy "members read monthly completions"
  on public.project_monthly_work_completions for select
  to authenticated
  using (
    exists (
      select 1
      from public.project_monthly_works mw
      join public.project_members pm on pm.project_id = mw.project_id
      where mw.id = project_monthly_work_completions.monthly_work_id
        and pm.user_id = auth.uid()
    )
  );

create policy "members insert monthly completions"
  on public.project_monthly_work_completions for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.project_monthly_works mw
      join public.project_members pm on pm.project_id = mw.project_id
      where mw.id = project_monthly_work_completions.monthly_work_id
        and pm.user_id = auth.uid()
    )
  );

create policy "members delete monthly completions"
  on public.project_monthly_work_completions for delete
  to authenticated
  using (
    exists (
      select 1
      from public.project_monthly_works mw
      join public.project_members pm on pm.project_id = mw.project_id
      where mw.id = project_monthly_work_completions.monthly_work_id
        and pm.user_id = auth.uid()
    )
  );