-- Zarovnanie RLS pre public.chat_messages s per-project prístupom.
-- Príčina: Romeo (člen projektu mimo kategórie 'odstartujto.sk') nevidel ani
-- nemohol posielať správy/poznámky do projektu, lebo staré policies neriešili
-- per-project členstvo cez can_view_project().

alter table public.chat_messages enable row level security;

-- Zhoď všetky staré policy mená, ktoré sa v projekte historicky používali.
drop policy if exists "chat_messages select" on public.chat_messages;
drop policy if exists "chat_messages insert" on public.chat_messages;
drop policy if exists "chat_messages update" on public.chat_messages;
drop policy if exists "chat_messages delete" on public.chat_messages;
drop policy if exists "Members can read chat" on public.chat_messages;
drop policy if exists "Members can insert chat" on public.chat_messages;
drop policy if exists "Members can delete own chat" on public.chat_messages;
drop policy if exists "Members can update own chat" on public.chat_messages;
drop policy if exists "Anyone can read team chat" on public.chat_messages;
drop policy if exists "Authenticated can insert chat" on public.chat_messages;
drop policy if exists "Authors can delete own chat" on public.chat_messages;
drop policy if exists "Authors can update own chat" on public.chat_messages;

-- SELECT: tímový chat vidia všetci prihlásení; projektový chat iba členovia
-- (cez can_view_project, ktorá pokrýva owner / project_members / kategóriu
-- 'odstartujto.sk' / super-admina).
create policy "chat read team or project members"
  on public.chat_messages for select to authenticated
  using (
    public.is_app_admin()
    or scope = 'team'
    or (
      scope = 'project'
      and project_id is not null
      and public.can_view_project(project_id, auth.uid())
    )
  );

-- INSERT: autor musí byť prihlásený user a musí mať prístup do daného scope.
create policy "chat insert by members"
  on public.chat_messages for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      public.is_app_admin()
      or scope = 'team'
      or (
        scope = 'project'
        and project_id is not null
        and public.can_view_project(project_id, auth.uid())
      )
    )
  );

-- UPDATE / DELETE: vlastná správa alebo super-admin.
create policy "chat update own"
  on public.chat_messages for update to authenticated
  using (author_id = auth.uid() or public.is_app_admin())
  with check (author_id = auth.uid() or public.is_app_admin());

create policy "chat delete own"
  on public.chat_messages for delete to authenticated
  using (author_id = auth.uid() or public.is_app_admin());
