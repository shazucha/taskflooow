-- Komentáre k nahláseniam (thread)
create table if not exists public.feedback_comments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.feedback_reports(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists feedback_comments_report_idx on public.feedback_comments(report_id, created_at);

alter table public.feedback_comments enable row level security;

-- Vidieť komentár môže ten, kto vidí samotné nahlásenie (vlastník reportu alebo admin)
drop policy if exists "select if can see report" on public.feedback_comments;
create policy "select if can see report"
  on public.feedback_comments for select to authenticated
  using (
    public.is_app_admin()
    or exists (
      select 1 from public.feedback_reports r
      where r.id = report_id and r.user_id = auth.uid()
    )
    or user_id = auth.uid()
  );

-- Vložiť komentár môže ktorýkoľvek prihlásený člen (na svoje meno)
drop policy if exists "insert own comment" on public.feedback_comments;
create policy "insert own comment"
  on public.feedback_comments for insert to authenticated
  with check (user_id = auth.uid());

-- Update/Delete: admin alebo autor komentára
drop policy if exists "update own or admin" on public.feedback_comments;
create policy "update own or admin"
  on public.feedback_comments for update to authenticated
  using (public.is_app_admin() or user_id = auth.uid());

drop policy if exists "delete own or admin" on public.feedback_comments;
create policy "delete own or admin"
  on public.feedback_comments for delete to authenticated
  using (public.is_app_admin() or user_id = auth.uid());
