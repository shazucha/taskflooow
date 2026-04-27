-- Oprava RLS politík na service_catalog: predošlé politiky sa pýtali priamo do
-- auth.users, na ktorú rola "authenticated" nemá SELECT (preto „permission denied for table users").
-- Riešenie: security definer funkcia, ktorá kontrolu emailu spraví s vyššími právami.

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from auth.users u
    where u.id = auth.uid()
      and lower(u.email) = 'hazucha.stano@gmail.com'
  );
$$;

revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to authenticated;

-- Prepíšeme politiky na service_catalog tak, aby používali túto funkciu
drop policy if exists "admin can insert service_catalog" on public.service_catalog;
create policy "admin can insert service_catalog"
  on public.service_catalog for insert to authenticated
  with check (public.is_app_admin());

drop policy if exists "admin can update service_catalog" on public.service_catalog;
create policy "admin can update service_catalog"
  on public.service_catalog for update to authenticated
  using (public.is_app_admin());

drop policy if exists "admin can delete service_catalog" on public.service_catalog;
create policy "admin can delete service_catalog"
  on public.service_catalog for delete to authenticated
  using (public.is_app_admin());