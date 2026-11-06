-- LinkedIn Easy Apply shows its questions only inside the form. The apply runner goes through it, and
-- when there are questions for you (ones it couldn't answer, or ones LinkedIn had filled in differently
-- from your profile) it discards the form unsent and sends the application back from approved: to Needs
-- you, or to Ready to review when it only has answers to double-check.
insert into application_status_transitions (from_status, to_status) values
  ('approved', 'needs_input'), ('approved', 'queued')
on conflict do nothing;

-- 'linkedin': LinkedIn had another answer filled in; your profile's is used unless you pick LinkedIn's.
alter table application_questions drop constraint application_questions_answer_source_check;
alter table application_questions add constraint application_questions_answer_source_check
  check (answer_source in ('profile','criteria','skill_years','answer','drafted','rule','user','linkedin'));
