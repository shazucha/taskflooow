-- Web Push subscriptions per user
create table if not exists public.push_subscriptions (
  endpoint    text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

-- Užívateľ môže spravovať len svoje subscriptions.
drop policy if exists "own subs select" on public.push_subscriptions;
create policy "own subs select"
  on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "own subs insert" on public.push_subscriptions;
create policy "own subs insert"
  on public.push_subscriptions for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "own subs update" on public.push_subscriptions;
create policy "own subs update"
  on public.push_subscriptions for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "own subs delete" on public.push_subscriptions;
create policy "own subs delete"
  on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid());