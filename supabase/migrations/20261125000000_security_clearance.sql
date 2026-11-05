-- Security clearance is a profile field: "Do you have an active clearance?" and "What level?" are
-- answered from it instead of a saved answer per wording.
alter table profiles add column security_clearance text
  check (security_clearance in ('none', 'confidential', 'secret', 'top_secret', 'ts_sci'));

insert into questions (key, label, category, answer_type, answer_source, source_field) values
  ('has_security_clearance', 'Do you have an active US security clearance?', 'authorization', 'boolean', 'profile', 'profiles.security_clearance'),
  ('security_clearance_level', 'US security clearance level', 'authorization', 'text', 'profile', 'profiles.security_clearance')
on conflict (key) do update set
  label = excluded.label, category = excluded.category, answer_type = excluded.answer_type,
  answer_source = excluded.answer_source, source_field = excluded.source_field;

-- A saved "No" to an earlier yes/no clearance question becomes the profile's "none", and that
-- question's wordings now point at the profile question. (A saved "Yes" doesn't say the level, so
-- that profile field is left for you to set.)
update profiles p set security_clearance = 'none'
from question_answers a join questions q on q.id = a.question_id
where a.user_id = p.user_id and p.security_clearance is null
  and q.answer_source = 'answer' and q.answer_type = 'boolean' and q.key like '%security_clearance%'
  and a.value = 'false'::jsonb;

update question_aliases al set question_id = (select id from questions where key = 'has_security_clearance')
from questions q
where q.id = al.question_id and q.answer_source = 'answer' and q.answer_type = 'boolean'
  and q.key like '%security_clearance%' and q.key <> 'has_security_clearance';

-- The replaced questions have no wordings left; their saved answers (and the questions) go, so
-- Profile > Saved answers doesn't list a clearance answer nothing reads.
delete from questions
where answer_source = 'answer' and answer_type = 'boolean'
  and key like '%security_clearance%' and key <> 'has_security_clearance'
  and not exists (select 1 from question_aliases al where al.question_id = questions.id);
