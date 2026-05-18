-- Komentáre k jednotlivým položkám náplne predplatného (per mesiac).
-- Polymorfné: work_id ukazuje buď na project_recurring_works (template) alebo na project_monthly_works (snapshot).
-- Spolu s project_id + month_key — vďaka tomu komentár ostáva viazaný na konkrétny mesiac.

create table if not exists public.monthly_work_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  month_key text not null,
  work_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists monthly_work_comments_lookup_idx
  on public.monthly_work_comments(project_id, month_key, work_id, created_at);

alter table public.monthly_work_comments enable row level security;

drop policy if exists "members read mw comments" on public.monthly_work_comments;
create policy "members read mw comments"
  on public.monthly_work_comments for select to authenticated
  using (public.is_app_admin() or public.can_view_project(project_id, auth.uid()));

drop policy if exists "members insert mw comments" on public.monthly_work_comments;
create policy "members insert mw comments"
  on public.monthly_work_comments for insert to authenticated
  with check (
    user_id = auth.uid()
    and (public.is_app_admin() or public.can_view_project(project_id, auth.uid()))
  );

drop policy if exists "owner or admin delete mw comments" on public.monthly_work_comments;
create policy "owner or admin delete mw comments"
  on public.monthly_work_comments for delete to authenticated
  using (public.is_app_admin() or user_id = auth.uid());

drop policy if exists "owner or admin update mw comments" on public.monthly_work_comments;
create policy "owner or admin update mw comments"
  on public.monthly_work_comments for update to authenticated
  using (public.is_app_admin() or user_id = auth.uid());
