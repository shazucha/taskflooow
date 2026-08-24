-- VR Liptov: zápis úhrad Stanley + Lenka (spoločný vklad, delené na polovicu)
-- Predpoklad: stĺpec items jsonb už existuje (20260824_vr_contribution_items.sql)

do $$
declare
  v_stan uuid;
  v_lenka uuid;
  g uuid;
  r record;
  half numeric;
begin
  select id into v_stan from public.profiles where lower(email) = 'hazucha.stano@gmail.com' limit 1;
  select id into v_lenka from public.profiles
    where full_name ilike '%lenka%' or lower(email) like '%lenka%' limit 1;
  if v_stan is null or v_lenka is null then
    raise exception 'Nenašiel som profily (Stanley: %, Lenka: %)', v_stan, v_lenka;
  end if;

  -- firmy / zdroje úhrad
  insert into public.vr_categories (scope, key, label, is_default, position)
  values
    ('contribution','datacomp_sk','datacomp.sk',false,100),
    ('contribution','top4mobile_sk','top4mobile.sk',false,110),
    ('contribution','vortexvr_sk','vortexvr.sk',false,120),
    ('contribution','nay_sk','Nay.sk',false,130),
    ('contribution','mito_sk','Mito.sk',false,140),
    ('contribution','alza_sk','Alza.sk',false,150),
    ('contribution','besteron_sk','Besteron.sk',false,160),
    ('contribution','profinet_sk','Profinet.sk',false,170),
    ('contribution','lh_plagaty','LH plagáty',false,180)
  on conflict (scope, key) do update set label = excluded.label;

  for r in
    select * from (values
      ('datacomp_sk','datacomp.sk – VR technika', date '2026-08-24', 5985.38::numeric,
        '[{"name":"Meta Quest 3","price":571.49},{"name":"Pico 4 Ultra Enterprise 6ks","price":4464.90},{"name":"Herný PC","price":948.99}]'::jsonb),
      ('top4mobile_sk','top4mobile.sk – príslušenstvo', date '2026-08-24', 524.75,
        '[{"name":"BOBOVR batéria pre M2 Pro + nabíjacia stanica 4 ks","price":129.24},{"name":"BOBOVR batéria pre M2 Pro + nabíjacia stanica 1 ks","price":28.72},{"name":"BOBOVR M3 Pro popruh pre Oculus Quest 3 + batéria","price":41.52},{"name":"BOBOVR P4S popruh na uľahčenie batérie pre Pico 5 ks","price":155.60},{"name":"Príslušenstvo na nabíjanie","price":108.77},{"name":"Príslušenstvo na nabíjanie","price":60.90}]'::jsonb),
      ('vortexvr_sk','vortexvr.sk – príslušenstvo', date '2026-08-24', 75.25,
        '[{"name":"BOBOVR M3 Pro | Strap with battery for Meta Quest 3 1 ks","price":59.99},{"name":"Silicone controller covers + holder for Meta Quest 3 1 ks","price":9.99},{"name":"Doručenie","price":5.27}]'::jsonb),
      ('nay_sk','Nay.sk – vybavenie', date '2026-08-24', 608.38,
        '[{"name":"Wifi Router","price":217.59},{"name":"Monitor","price":69.90},{"name":"Myška","price":13.80},{"name":"Klávesnica","price":19.49},{"name":"Reproduktory","price":11.40},{"name":"TV + stojan","price":276.20}]'::jsonb),
      ('mito_sk','Mito.sk – založenie s.r.o.', date '2026-08-24', 270.80,
        '[{"name":"Založenie s.r.o.","price":200.00},{"name":"Sídlo pre s.r.o. na rok","price":70.80}]'::jsonb),
      ('alza_sk','Alza.sk – doplnky', date '2026-08-24', 86.51,
        '[{"name":"Nabíjacie baterky","price":22.38},{"name":"Nabíjacie baterky","price":22.38},{"name":"Ventilátor","price":41.75}]'::jsonb),
      ('besteron_sk','Besteron.sk – inštalácia VRP', date '2026-08-24', 49.90,
        '[{"name":"INŠTALÁCIA VRP","price":49.90}]'::jsonb),
      ('profinet_sk','Profinet.sk – internet', date '2026-07-27', 278.90,
        '[{"name":"Zriadenie internetu","price":221.40},{"name":"Internet Júl","price":57.50}]'::jsonb),
      ('lh_plagaty','LH plagáty', date '2026-08-01', 50.00,
        '[{"name":"LH plagáty","price":50.00}]'::jsonb)
    ) as t(cat, purpose, paid_on, total, items)
  loop
    g := gen_random_uuid();
    half := round(r.total / 2, 2);
    insert into public.vr_partner_contributions
      (partner_id, paid_on, amount, purpose, category, note, group_id, share_mode, total_amount, items, created_by)
    values
      (v_stan, r.paid_on, half, r.purpose, r.cat, 'Spoločná úhrada: Stanley + Lenka', g, 'half', r.total, r.items, v_stan),
      (v_lenka, r.paid_on, r.total - half, r.purpose, r.cat, 'Spoločná úhrada: Stanley + Lenka', g, 'half', r.total, r.items, v_stan);
  end loop;
end $$;
