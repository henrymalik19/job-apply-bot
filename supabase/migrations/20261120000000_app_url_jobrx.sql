-- The app is Jobrx now, on its own domain: digest emails link to https://jobrx.ai and come from "Jobrx".
update settings set value = '"https://jobrx.ai"' where key = 'app_url';
update user_settings
set value = jsonb_set(value, '{from}', to_jsonb(replace(value ->> 'from', 'Job Search Autopilot', 'Jobrx')))
where key = 'notifications' and value ->> 'from' like 'Job Search Autopilot%';
