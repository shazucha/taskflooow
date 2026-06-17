-- Umožní úpravu project_materials (farba, is_highlighted, label, url)
-- členom projektu. Bez tejto politiky 🔔 (toggle novinky) tichá failne.

drop policy if exists "project_materials_update" on public.project_materials;
create policy "project_materials_update"
  on public.project_materials for update
  to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = project_materials.project_id
        and pm.user_id = auth.uid()
    )
  )
  with check (
    created_by = auth.uid()
    or exists (
      select 1 from public.project_members pm
      where pm.project_id = project_materials.project_id
        and pm.user_id = auth.uid()
    )
  );