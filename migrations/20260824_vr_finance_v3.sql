-- =====================================================================
-- VR Liptov — financie v3
--  1) hromadné premenovanie predvolených kategórií na názvy firiem
--  2) doplnenie DB ochrany proti duplicitám (aj pre skupinové vklady)
--  3) kontrolné dotazy na RLS (člen firmy vs. nečlen)
-- =====================================================================

-- --------------------------------------------------------------------
-- 1) HROMADNÉ PREMENOVANIE — uprav si pravú stranu na reálne firmy
--    (kľúč 'key' zostáva rovnaký, takže existujúce záznamy sa nerozbijú)
-- --------------------------------------------------------------------
update public.vr_categories set label = 'Digitance s.r.o.'  where key = 'prevadzka';
update public.vr_categories set label = 'Prenajímateľ – VR Liptov' where key = 'najom';
update public.vr_categories set label = 'Alza.sk'            where key = 'technika';
update public.vr_categories set label = 'Google / Adobe'     where key = 'software';
update public.vr_categories set label = 'Meta Ads'           where key = 'marketing';
update public.vr_categories set label = 'Účtovníčka'         where key = 'uctovnictvo';
update public.vr_categories set label = 'Iné'                where key = 'ine';

update public.vr_categories set label = 'Vklad konateľa'   where key = 'vklad_konatela';
update public.vr_categories set label = 'Vklad spoločníka' where key = 'vklad_spolocnika';
update public.vr_categories set label = 'Zákazníci (sessions)' where key = 'trzby';
update public.vr_categories set label = 'Iné príjmy'       where key = 'ine_prijmy';

-- Ak chceš premenovať len v jednom rozsahu (napr. iba výdaje):
--   update public.vr_categories set label = 'Alza.sk'
--   where scope = 'expense' and key = 'technika';

-- --------------------------------------------------------------------
-- 2) DB OCHRANA PROTI DUPLICITÁM
-- --------------------------------------------------------------------
-- 2a) úhrady spoločníkov: jeden partner nemôže mať 2x rovnaký účel v ten istý deň
drop index if exists public.vr_partner_contributions_dup_uidx;
create unique index if not exists vr_partner_contributions_dup_uidx
  on public.vr_partner_contributions(partner_id, paid_on, lower(purpose))
  where group_id is null;

-- 2b) skupinový vklad: jeden partner len raz v tej istej skupine
create unique index if not exists vr_partner_contributions_group_partner_uidx
  on public.vr_partner_contributions(group_id, partner_id)
  where group_id is not null;

-- 2c) finančné záznamy: rovnaký deň + smer + názov = duplicita
drop index if exists public.vr_finance_records_dup_uidx;
create unique index if not exists vr_finance_records_dup_uidx
  on public.vr_finance_records(occurred_on, direction, lower(title));

-- 2d) sumy musia byť kladné (validácia sa nedá obísť mimo UI)
do $$
begin
  alter table public.vr_partner_contributions
    add constraint vr_pc_amount_pos_chk check (amount > 0);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.vr_finance_records
    add constraint vr_fr_amount_pos_chk check (amount > 0);
exception when duplicate_object then null;
end $$;

-- --------------------------------------------------------------------
-- 3) KONTROLA RLS — spusti a porovnaj výsledky
-- --------------------------------------------------------------------
-- 3a) prehľad politík
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in ('vr_categories','vr_partner_contributions','vr_finance_records')
order by tablename, cmd;

-- 3b) RLS musí byť zapnutá na všetkých troch tabuľkách
select relname, relrowsecurity
from pg_class
where relname in ('vr_categories','vr_partner_contributions','vr_finance_records');

-- 3c) test ako ANON (nečlen) — očakávaný výsledok: 0 riadkov
set local role anon;
select count(*) as anon_categories from public.vr_categories;
select count(*) as anon_contributions from public.vr_partner_contributions;
select count(*) as anon_finance from public.vr_finance_records;
reset role;

-- 3d) test ako ČLEN FIRMY — nahraď <USER_UUID> svojím auth.users.id
--     (užívateľ musí mať riadok v public.profiles)
-- set local role authenticated;
-- set local request.jwt.claims = '{"sub":"<USER_UUID>","role":"authenticated"}';
-- select count(*) as member_categories from public.vr_categories;
-- select count(*) as member_contributions from public.vr_partner_contributions;
-- select count(*) as member_finance from public.vr_finance_records;
-- reset role;

-- 3e) test ako AUTHENTICATED BEZ PROFILU (nečlen) — očakávané: 0 riadkov
-- set local role authenticated;
-- set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}';
-- select count(*) as nonmember_categories from public.vr_categories;
-- reset role;
