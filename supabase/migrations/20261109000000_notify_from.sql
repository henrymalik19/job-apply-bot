-- Notifications send through Resend (Railway blocks SMTP), from a domain verified
-- there. The owner's digest comes from send.jobrx.ai and still goes to the job inbox.
update user_settings
set value = value || '{"from": "Job Search Autopilot <autopilot@send.jobrx.ai>"}'
where key = 'notifications' and user_id = (select id from users where role = 'owner');
