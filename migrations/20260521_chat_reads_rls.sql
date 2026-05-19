-- RLS pre chat_reads a direct_message_reads: každý vidí/upravuje iba svoje riadky.

alter table public.chat_reads enable row level security;
alter table public.direct_message_reads enable row level security;

drop policy if exists "Users can view own chat_reads" on public.chat_reads;
drop policy if exists "Users can insert own chat_reads" on public.chat_reads;
drop policy if exists "Users can update own chat_reads" on public.chat_reads;
drop policy if exists "Users can delete own chat_reads" on public.chat_reads;

create policy "Users can view own chat_reads"
  on public.chat_reads for select to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own chat_reads"
  on public.chat_reads for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own chat_reads"
  on public.chat_reads for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete own chat_reads"
  on public.chat_reads for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can view own dm_reads" on public.direct_message_reads;
drop policy if exists "Users can insert own dm_reads" on public.direct_message_reads;
drop policy if exists "Users can update own dm_reads" on public.direct_message_reads;
drop policy if exists "Users can delete own dm_reads" on public.direct_message_reads;

create policy "Users can view own dm_reads"
  on public.direct_message_reads for select to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own dm_reads"
  on public.direct_message_reads for insert to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own dm_reads"
  on public.direct_message_reads for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete own dm_reads"
  on public.direct_message_reads for delete to authenticated
  using (user_id = auth.uid());
