-- Farebné označenie materiálu (legenda v UI):
--   red = Google Ads, blue = Facebook, green = Prompty, orange = Webstránky
alter table public.company_materials
  add column if not exists color text;