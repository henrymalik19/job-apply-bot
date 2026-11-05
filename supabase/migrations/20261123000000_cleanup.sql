-- Small schema tidy-ups:
--   settings holds the app-wide values (the app's address, how often discovery runs); next to
--   user_settings, app_settings says so.
--   profile_skills.last_used_year was never set by anything.
alter table settings rename to app_settings;
alter table profile_skills drop column last_used_year;
