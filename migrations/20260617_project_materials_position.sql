-- Pridáme stĺpec position pre drag & drop usporiadanie projektových materiálov.
alter table public.project_materials
  add column if not exists position double precision;

-- Inicializácia pozícií podľa created_at v rámci projektu.
with ordered as (
  select id,
         row_number() over (partition by project_id order by created_at asc) as rn
  from public.project_materials
  where position is null
)
update public.project_materials pm
set position = ordered.rn
from ordered
where pm.id = ordered.id;

create index if not exists project_materials_position_idx
  on public.project_materials(project_id, position asc);