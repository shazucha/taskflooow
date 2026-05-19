-- Backfill chýbajúcich profilov a doplnenie full_name/email z auth.users,
-- aby in-app notifikácie aj push vždy poznali meno odosielateľa.

-- 1) Doplň chýbajúce riadky v public.profiles pre už existujúcich auth users.
insert into public.profiles (id, email, full_name)
select u.id,
       u.email,
       coalesce(
         nullif(u.raw_user_meta_data->>'full_name', ''),
         nullif(u.raw_user_meta_data->>'name', ''),
         split_part(u.email, '@', 1)
       )
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- 2) Doplň prázdne email/full_name v existujúcich profiloch.
update public.profiles p
set email = coalesce(nullif(p.email, ''), u.email),
    full_name = coalesce(
      nullif(p.full_name, ''),
      nullif(u.raw_user_meta_data->>'full_name', ''),
      nullif(u.raw_user_meta_data->>'name', ''),
      split_part(u.email, '@', 1)
    )
from auth.users u
where u.id = p.id
  and (coalesce(p.email, '') = '' or coalesce(p.full_name, '') = '');