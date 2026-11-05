-- "Country of residence" is its own question, answered from your profile's country: before, it was matched
-- to where you live (city, state), so forms asking for a country got "Atlanta, GA". And passport country,
-- citizenship and nationality are one question (nationality), so one saved answer fills every form that
-- asks any of them.

insert into questions (key, label, category, answer_type, answer_source, source_field)
values
  ('country_of_residence', 'Country you live in', 'logistics', 'text', 'profile', 'profiles.country'),
  ('nationality', 'Nationality', 'eeo', 'text', 'answer', null)
on conflict (key) do nothing;

-- Wordings for each, confirmed (some were matched to the wrong question before).
with wording (normalized_text, key) as (
  values
    ('country of residence', 'country_of_residence'),
    ('country of residency', 'country_of_residence'),
    ('current country of residence', 'country_of_residence'),
    ('which country do you live in', 'country_of_residence'),
    ('which country do you currently live in', 'country_of_residence'),
    ('which country are you currently based in', 'country_of_residence'),
    ('which country will you be working from', 'country_of_residence'),
    ('what country do you live in', 'country_of_residence'),
    ('passport country', 'nationality'),
    ('country of passport', 'nationality'),
    ('country of citizenship', 'nationality'),
    ('citizenship', 'nationality'),
    ('nationality', 'nationality'),
    ('what is your nationality', 'nationality'),
    ('what is your citizenship', 'nationality'),
    ('what country are you a citizen of', 'nationality')
)
insert into question_aliases (normalized_text, question_id, polarity, skill_id, confidence, confirmed)
select w.normalized_text, q.id, 'same', null, null, true
from wording w join questions q on q.key = w.key
on conflict (normalized_text) do update
  set question_id = excluded.question_id, polarity = 'same', skill_id = null, confidence = null, confirmed = true;

-- Applications not sent yet (and not being filled by the runner): those questions point at the right one.
-- An answer you typed yourself is left as it is. A residence answer taken from your profile is replaced on
-- the next recheck (answers rules version 3); a citizenship step left for the Chrome window becomes a
-- question you answer here, once for all of them.
with linked as (
  select aq.id, a.status, al.question_id, q.key
  from application_questions aq
  join applications a on a.id = aq.application_id
  join question_aliases al on al.normalized_text = trim(regexp_replace(lower(aq.question), '[^a-z0-9]+', ' ', 'g'))
  join questions q on q.id = al.question_id and q.key in ('country_of_residence', 'nationality')
  where a.status in ('needs_input', 'queued', 'manual', 'approved')
    and a.apply_step is null
    and coalesce(aq.answer_source, '') <> 'user'
)
update application_questions aq
set question_id = l.question_id,
    answer_source = case when l.key = 'country_of_residence' and aq.answer is not null then 'profile' else aq.answer_source end,
    bucket = case when l.key = 'nationality' and aq.answer is null and aq.bucket = 'cannot_automate' and l.status <> 'approved' then 'needs_user' else aq.bucket end,
    reason = case when l.key = 'nationality' and aq.answer is null then 'Answer it once (your nationality) and every form asking for it is filled.' else aq.reason end
from linked l
where aq.id = l.id;
