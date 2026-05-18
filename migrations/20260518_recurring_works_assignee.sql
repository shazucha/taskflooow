-- Priradenie zodpovednej osoby k položkám "Náplň predplatného".
-- Stĺpec sa pridáva v šablóne aj v mesačnom snapshote.

alter table public.project_recurring_works
  add column if not exists assignee_id uuid references auth.users(id) on delete set null;

alter table public.project_monthly_works
  add column if not exists assignee_id uuid references auth.users(id) on delete set null;

create index if not exists project_recurring_works_assignee_idx
  on public.project_recurring_works(assignee_id);

create index if not exists project_monthly_works_assignee_idx
  on public.project_monthly_works(assignee_id);
