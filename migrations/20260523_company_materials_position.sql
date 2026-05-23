-- Pridáme stĺpec position pre drag & drop usporiadanie firemných materiálov.
alter table public.company_materials
  add column if not exists position double precision;

-- Inicializácia pozícií podľa created_at pre existujúce záznamy.
with ordered as (
  select id, row_number() over (order by created_at asc) as rn
  from public.company_materials
  where position is null
)
update public.company_materials cm
set position = ordered.rn
from ordered
where cm.id = ordered.id;

create index if not exists company_materials_position_idx
  on public.company_materials(position asc);

-- RLS update: povoliť update vlastných alebo všetkých? Reorder má robiť ktokoľvek z tímu.
drop policy if exists "company_materials_update" on public.company_materials;
create policy "company_materials_update"
  on public.company_materials for update
  to authenticated
  using (true)
  with check (true);