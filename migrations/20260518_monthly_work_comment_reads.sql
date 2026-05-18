-- Sleduje, kedy si používateľ naposledy prečítal komentáre k danej položke náplne.
create table if not exists public.monthly_work_comment_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  work_id uuid not null,
  last_read_at timestamptz not null default now(),
  primary key (user_id, work_id)
);

create index if not exists mw_comment_reads_user_idx
  on public.monthly_work_comment_reads(user_id);

alter table public.monthly_work_comment_reads enable row level security;

drop policy if exists "own reads select" on public.monthly_work_comment_reads;
create policy "own reads select"
  on public.monthly_work_comment_reads for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "own reads insert" on public.monthly_work_comment_reads;
create policy "own reads insert"
  on public.monthly_work_comment_reads for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "own reads update" on public.monthly_work_comment_reads;
create policy "own reads update"
  on public.monthly_work_comment_reads for update to authenticated
  using (user_id = auth.uid());

drop policy if exists "own reads delete" on public.monthly_work_comment_reads;
create policy "own reads delete"
  on public.monthly_work_comment_reads for delete to authenticated
  using (user_id = auth.uid());
