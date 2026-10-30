-- M5 notifications: the notify worker emails a digest of applications that
-- need attention, from and to the job inbox.

-- The status an application was last notified in. The notify worker picks
-- applications whose status is worth an email and differs from this.
alter table applications add column notified_status text;

-- Non-secret mail settings; the password stays in the JOB_INBOX_PASSWORD variable.
insert into settings (key, value) values
  ('job_inbox', '{"address": "jobs@malikhenry.com", "smtp_host": "smtp.purelymail.com", "smtp_port": 465, "imap_host": "imap.purelymail.com", "imap_port": 993}'),
  ('notifications', '{"to": null, "quiet_start": "22:00", "quiet_end": "07:00", "timezone": "America/New_York", "min_interval_minutes": 15}'),
  ('app_url', '"https://job-apply-bot-nu.vercel.app"')
on conflict (key) do nothing;
