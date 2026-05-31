-- Pridáme stĺpec position pre drag & drop usporiadanie návodov.
alter table public.guides
  add column if not exists position double precision;

with ordered as (
  select id, row_number() over (order by created_at asc) as rn
  from public.guides
  where position is null
)
update public.guides g
set position = ordered.rn
from ordered
where g.id = ordered.id;

create index if not exists guides_position_idx
  on public.guides(position asc);