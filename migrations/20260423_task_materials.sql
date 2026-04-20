-- Materials (URL links) attached to tasks
create table if not exists public.task_materials (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  url text not null,
  label text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists task_materials_task_id_idx on public.task_materials(task_id);

alter table public.task_materials enable row level security;

-- Helper: who can see/edit materials = anyone who can see the task
-- (creator, assignee, watcher, or project member)
create or replace function public.can_access_task(_task_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tasks t
    where t.id = _task_id
      and (
        t.created_by = _user_id
        or t.assignee_id = _user_id
        or exists (select 1 from public.task_watchers w where w.task_id = t.id and w.user_id = _user_id)
        or (
          t.project_id is not null
          and exists (
            select 1 from public.project_members pm
            where pm.project_id = t.project_id and pm.user_id = _user_id
          )
        )
      )
  )
$$;

drop policy if exists "task_materials_select" on public.task_materials;
create policy "task_materials_select"
on public.task_materials
for select
to authenticated
using (public.can_access_task(task_id, auth.uid()));

drop policy if exists "task_materials_insert" on public.task_materials;
create policy "task_materials_insert"
on public.task_materials
for insert
to authenticated
with check (
  public.can_access_task(task_id, auth.uid())
  and created_by = auth.uid()
);

drop policy if exists "task_materials_delete" on public.task_materials;
create policy "task_materials_delete"
on public.task_materials
for delete
to authenticated
using (
  created_by = auth.uid()
  or exists (select 1 from public.tasks t where t.id = task_id and t.created_by = auth.uid())
);

alter publication supabase_realtime add table public.task_materials;
