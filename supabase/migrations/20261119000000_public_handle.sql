-- Each user's public status page lives at /u/<handle>, a name they pick in Settings. A handle belongs
-- to one user.
create unique index user_settings_public_handle on user_settings ((value #>> '{}')) where key = 'public_handle';

-- Anyone whose page is already on gets a handle from their first name (changeable in Settings), so it
-- doesn't go dark when it moves from / to /u/<handle>.
insert into user_settings (user_id, key, value)
select user_id, 'public_handle', to_jsonb(case when length(slug) < 3 then rpad(slug, 3, '0') else left(slug, 30) end)
from (
  select s.user_id, trim(both '-' from lower(regexp_replace(coalesce(p.preferred_name, p.first_name, 'me'), '[^a-zA-Z0-9]+', '-', 'g'))) as slug
  from user_settings s
  left join profiles p on p.user_id = s.user_id
  where s.key = 'public_page_enabled' and s.value = 'true'::jsonb
    and not exists (select 1 from user_settings h where h.user_id = s.user_id and h.key = 'public_handle')
) named
on conflict do nothing;
