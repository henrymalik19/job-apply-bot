-- Questions the profile can answer from employment history: the current (or
-- most recent) employer and title, and total years of experience (merged job
-- date ranges). Claude had created the first two as questions with stored
-- answers; they now read from the profile.
insert into questions (key, label, category, answer_type, answer_source, source_field) values
  ('current_company_name', 'Current or most recent employer', 'other', 'text', 'profile', 'employments (current or most recent)'),
  ('current_job_title', 'Current or most recent job title', 'other', 'text', 'profile', 'employments (current or most recent)'),
  ('years_experience_total', 'Total years of professional experience', 'skills', 'number', 'profile', 'employments (merged date ranges)')
on conflict (key) do update set
  label = excluded.label, category = excluded.category, answer_type = excluded.answer_type,
  answer_source = excluded.answer_source, source_field = excluded.source_field;
delete from question_answers where question_id in (select id from questions where key in ('current_company_name', 'current_job_title'));
