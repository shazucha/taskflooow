-- VR Liptov — vklad konateľa ako pôžička firme (záväzok), nie príjem
-- 'loan'       = konateľ požičal firme (firma dlhuje => mínus)
-- 'loan_repay' = firma vrátila konateľovi (znižuje dlh)

alter table public.vr_finance_records
  drop constraint if exists vr_finance_records_direction_chk;

alter table public.vr_finance_records
  add constraint vr_finance_records_direction_chk
  check (direction in ('expense','income','loan','loan_repay'));

-- Migrácia existujúcich vkladov konateľa z príjmov na pôžičky
update public.vr_finance_records
   set direction = 'loan'
 where direction = 'income'
   and (category in ('vklad_konatela','vklad_spolocnika')
        or lower(title) like '%vklad konate%'
        or lower(title) like '%pôžič%'
        or lower(title) like '%pozic%');
