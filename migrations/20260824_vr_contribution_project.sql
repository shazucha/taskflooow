-- VR Liptov: priradenie úhrady spoločníka ku konkrétnemu projektu.
alter table public.vr_partner_contributions
  add column if not exists project text;

create index if not exists vr_partner_contributions_project_idx
  on public.vr_partner_contributions (project);
