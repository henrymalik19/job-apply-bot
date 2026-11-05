-- "Have you worked here before?" (often naming the company: "Are you a former Rula employee?") is
-- one question for every employer, answered from employment history: yes when the posting's company
-- is one of your past employers.
insert into questions (key, label, category, answer_type, answer_source, source_field) values
  ('previously_employed_here', 'Have you worked at this company before?', 'other', 'boolean', 'profile', 'employments (employer matches the posting''s company)')
on conflict (key) do update set
  label = excluded.label, category = excluded.category, answer_type = excluded.answer_type,
  answer_source = excluded.answer_source, source_field = excluded.source_field;
