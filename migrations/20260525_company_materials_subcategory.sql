-- Pridanie podkategórie (voľný text) pre firemné materiály.
alter table public.company_materials
  add column if not exists subcategory text;

create index if not exists company_materials_subcategory_idx
  on public.company_materials (subcategory);