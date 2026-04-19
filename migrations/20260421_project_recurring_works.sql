-- Opakované práce klienta v rámci predplatného (zoznam toho, čo robíme každý mesiac)
create table if not exists public.project_recurring_works (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  note text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists project_recurring_works_project_idx
  on public.project_recurring_works(project_id);

alter table public.project_recurring_works enable row level security;

-- Členovia projektu môžu čítať
create policy "members can read recurring works"
  on public.project_recurring_works for select
  to authenticated
  using (
    exists (
      select 1 from public.project_members pm
      where pm.project_id = project_recurring_works.project_id
        and pm.user_id = auth.uid()
    )
  );

create policy "members can insert recurring works"
  on public.project_recurring_works for insert
  to authenticated
  with check (
    exists (
      select 1 from public.project_members pm
      where pm.project_id = project_recurring_works.project_id
        and pm.user_id = auth.uid()
    )
  );

create policy "members can update recurring works"
  on public.project_recurring_works for update
  to authenticated
  using (
    exists (
      select 1 from public.project_members pm
      where pm.project_id = project_recurring_works.project_id
        and pm.user_id = auth.uid()
    )
  );

create policy "members can delete recurring works"
  on public.project_recurring_works for delete
  to authenticated
  using (
    exists (
      select 1 from public.project_members pm
      where pm.project_id = project_recurring_works.project_id
        and pm.user_id = auth.uid()
    )
  );

-- Mesačné dokončenia (per práca + mesiac "YYYY-MM")
create table if not exists public.project_recurring_work_completions (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.project_recurring_works(id) on delete cascade,
  month_key text not null, -- "YYYY-MM"
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz not null default now(),
  unique (work_id, month_key)
);

create index if not exists project_recurring_work_completions_work_idx
  on public.project_recurring_work_completions(work_id);
create index if not exists project_recurring_work_completions_month_idx
  on public.project_recurring_work_completions(month_key);

alter table public.project_recurring_work_completions enable row level security;

create policy "members can read completions"
  on public.project_recurring_work_completions for select
  to authenticated
  using (
    exists (
      select 1
      from public.project_recurring_works w
      join public.project_members pm on pm.project_id = w.project_id
      where w.id = project_recurring_work_completions.work_id
        and pm.user_id = auth.uid()
    )
  );

create policy "members can insert completions"
  on public.project_recurring_work_completions for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.project_recurring_works w
      join public.project_members pm on pm.project_id = w.project_id
      where w.id = project_recurring_work_completions.work_id
        and pm.user_id = auth.uid()
    )
  );

create policy "members can delete completions"
  on public.project_recurring_work_completions for delete
  to authenticated
  using (
    exists (
      select 1
      from public.project_recurring_works w
      join public.project_members pm on pm.project_id = w.project_id
      where w.id = project_recurring_work_completions.work_id
        and pm.user_id = auth.uid()
    )
  );
