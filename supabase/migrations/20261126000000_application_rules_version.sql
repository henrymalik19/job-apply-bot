-- Which version of the answering rules (how prepare sorts questions: consents as saved answers, "worked
-- here before" from your jobs, ...) an application's open questions were last sorted with. When the
-- rules change, older applications are sorted again once (in the prepare run, or when you open one),
-- and what that changed is kept as a note to show you.
alter table applications
  add column rules_version integer not null default 0,
  add column recheck_note text,
  add column rechecked_at timestamptz;
