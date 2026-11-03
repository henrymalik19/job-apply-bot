-- M6 email tracking: the track_email stage reads the job inbox, sorts each email
-- (confirmation, rejection, interview, recruiter reply, security code, job alert,
-- other) and moves the application it's about. A matched rejection is moved out
-- of the inbox into its own folder, never deleted (archived_at). `reason` says why
-- it was sorted or matched that way; emails left unmatched are linked by hand.
alter table emails
  add column archived_at timestamptz,
  add column reason text;

create index emails_unmatched on emails (user_id, received_at desc) where application_id is null;
