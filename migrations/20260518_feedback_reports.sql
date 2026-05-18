-- Tabuľka pre nahlasovanie chýb a vylepšení od členov tímu
create table if not exists public.feedback_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('bug','improvement')),
  title text not null,
  description text,
  status text not null default 'new' check (status in ('new','resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists feedback_reports_status_idx on public.feedback_reports(status);
create index if not exists feedback_reports_user_idx on public.feedback_reports(user_id);

alter table public.feedback_reports enable row level security;

-- vlastník vidí svoje, admin vidí všetko
drop policy if exists "select own or admin" on public.feedback_reports;
create policy "select own or admin"
  on public.feedback_reports for select to authenticated
  using (user_id = auth.uid() or public.is_app_admin());

-- každý prihlásený si môže založiť záznam (ale len pre seba)
drop policy if exists "insert own" on public.feedback_reports;
create policy "insert own"
  on public.feedback_reports for insert to authenticated
  with check (user_id = auth.uid());

-- update: admin (na zmenu statusu) alebo vlastník (úprava textu pokiaľ new)
drop policy if exists "update admin or owner" on public.feedback_reports;
create policy "update admin or owner"
  on public.feedback_reports for update to authenticated
  using (public.is_app_admin() or user_id = auth.uid());

-- delete: admin alebo vlastník
drop policy if exists "delete admin or owner" on public.feedback_reports;
create policy "delete admin or owner"
  on public.feedback_reports for delete to authenticated
  using (public.is_app_admin() or user_id = auth.uid());
