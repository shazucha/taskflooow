-- VR Liptov: položkový rozpis úhrad spoločníkov (názov položky + cena)
alter table public.vr_partner_contributions
  add column if not exists items jsonb;
