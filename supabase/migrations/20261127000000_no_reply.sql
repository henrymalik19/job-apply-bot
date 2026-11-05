-- "No reply": a submitted application that heard nothing for a while (30 days by default; 14 once
-- the posting has closed) moves out of Submitted, so that column shows only ones still in play. A
-- reply that comes later still moves it on (confirmed, heard back, interviewing, offer, rejected),
-- and you can move it back to Submitted.
alter table applications drop constraint applications_status_check;
alter table applications add constraint applications_status_check check (status in (
  'queued','needs_input','manual','approved','submitted','confirmed',
  'responded','interviewing','offer','rejected','skipped','expired','failed','no_reply'));
alter table application_status_transitions drop constraint status_transitions_from_status_check;
alter table application_status_transitions add constraint status_transitions_from_status_check check (from_status in (
  'queued','needs_input','manual','approved','submitted','confirmed',
  'responded','interviewing','offer','rejected','skipped','expired','failed','no_reply'));
alter table application_status_transitions drop constraint status_transitions_to_status_check;
alter table application_status_transitions add constraint status_transitions_to_status_check check (to_status in (
  'queued','needs_input','manual','approved','submitted','confirmed',
  'responded','interviewing','offer','rejected','skipped','expired','failed','no_reply'));

insert into application_status_transitions (from_status, to_status) values
  ('submitted', 'no_reply'), ('confirmed', 'no_reply'),
  ('no_reply', 'submitted'), ('no_reply', 'confirmed'), ('no_reply', 'responded'),
  ('no_reply', 'interviewing'), ('no_reply', 'offer'), ('no_reply', 'rejected')
on conflict do nothing;
