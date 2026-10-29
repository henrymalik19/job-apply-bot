-- 1. Matching criteria become one editable row per user (match_criteria) with
--    the salary range and relocation preference. Matches are one row per job;
--    changing criteria affects newly discovered jobs only (no rescoring).
-- 2. app_status enum → text + check, so every fixed-value column uses checks.
-- 3. Answers: a catalog of questions (where each answer lives), aliases (every
--    wording seen → its question) and answers (only what neither the profile
--    nor the criteria hold). Replaces answer_topics / answer_topic_variants.
-- 4. Skill aliases get their own table (one alias → one skill, indexed).

-- ---------------------------------------------------------------------------
-- 1. match_criteria
-- ---------------------------------------------------------------------------
create table match_criteria (
  user_id              uuid primary key references users(id) on delete cascade,
  roles                text[] not null default '{}',
  seniority            text[] not null default '{}',
  salary_min           int check (salary_min >= 0),       -- floor: rules jobs out, low end stated on forms
  salary_max           int check (salary_max >= 0),       -- top of the range stated on forms
  dealbreakers         text[] not null default '{}',
  excluded_companies   text[] not null default '{}',
  threshold            int not null default 75 check (threshold between 0 and 100),
  notes                text not null default '',
  willing_to_relocate  boolean,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  check (salary_max is null or salary_min is null or salary_max >= salary_min)
);

-- The owner's newest criteria version becomes their row; relocation moves over from the profile.
insert into match_criteria (user_id, roles, seniority, salary_min, dealbreakers, excluded_companies, threshold, notes, willing_to_relocate)
select u.id,
       coalesce(array(select jsonb_array_elements_text(c.criteria->'roles')), '{}'),
       coalesce(array(select jsonb_array_elements_text(c.criteria->'seniority')), '{}'),
       (c.criteria->>'min_salary')::int,
       coalesce(array(select jsonb_array_elements_text(c.criteria->'dealbreakers')), '{}'),
       coalesce(array(select jsonb_array_elements_text(c.criteria->'excluded_companies')), '{}'),
       coalesce((c.criteria->>'threshold')::int, 75),
       coalesce(c.criteria->>'notes', ''),
       p.willing_to_relocate
from users u
left join lateral (select criteria from criteria_versions order by created_at desc limit 1) c on true
left join profiles p on p.user_id = u.id
where u.role = 'owner';

alter table profiles drop column willing_to_relocate;

-- Keep each job's match under the newest version, then drop versions.
delete from matches m
where m.criteria_version_id is distinct from (select id from criteria_versions order by created_at desc limit 1);
alter table matches drop column criteria_version_id;
alter table matches add constraint matches_job_id_key unique (job_id);
create index matches_status_score_idx on matches (status, score desc);
drop table criteria_versions;

-- ---------------------------------------------------------------------------
-- 2. app_status enum → text + check
-- ---------------------------------------------------------------------------
drop function transition_application(uuid, app_status, text, jsonb);
drop trigger applications_guard_status on applications;
drop view public_status;

alter table applications alter column status drop default;
alter table applications alter column status type text;
alter table applications alter column status set default 'queued';

-- Unchanged view, recreated over the text column.
create view public_status as
  select
    a.id,
    j.title       as job_title,
    j.company_name,
    j.url         as job_url,
    a.status,
    a.created_at,
    a.submitted_at,
    a.last_status_at
  from applications a
  join jobs j on j.id = a.job_id
  where a.status not in ('queued','needs_input','manual','approved','skipped','expired','failed');
revoke all on public_status from anon, authenticated, public;
grant select on public_status to service_role;

create trigger applications_guard_status
  before update of status on applications
  for each row execute function guard_status_update();
alter table status_transitions alter column from_status type text, alter column to_status type text;
alter table events alter column from_status type text, alter column to_status type text;
drop type app_status;

alter table applications add constraint applications_status_check check (status in (
  'queued','needs_input','manual','approved','submitted','confirmed',
  'responded','interviewing','offer','rejected','skipped','expired','failed'));
alter table status_transitions add constraint status_transitions_from_status_check check (from_status in (
  'queued','needs_input','manual','approved','submitted','confirmed',
  'responded','interviewing','offer','rejected','skipped','expired','failed'));
alter table status_transitions add constraint status_transitions_to_status_check check (to_status in (
  'queued','needs_input','manual','approved','submitted','confirmed',
  'responded','interviewing','offer','rejected','skipped','expired','failed'));

-- Same function as before, with a text status.
create function transition_application(
  p_application_id uuid,
  p_to text,
  p_cause text,
  p_detail jsonb default null
) returns applications
language plpgsql security invoker set search_path = public as $$
declare
  v_app applications;
  v_from text;
begin
  select * into v_app from applications where id = p_application_id for update;
  if not found then
    raise exception 'application % not found', p_application_id using errcode = 'P0002';
  end if;
  v_from := v_app.status;

  if not exists (select 1 from status_transitions where from_status = v_from and to_status = p_to) then
    raise exception 'illegal transition % -> %', v_from, p_to using errcode = 'P0001';
  end if;
  if coalesce(trim(p_cause), '') = '' then
    raise exception 'cause is required' using errcode = 'P0001';
  end if;

  perform set_config('app.transitioning', 'on', true);
  update applications set
    status = p_to,
    last_status_at = now(),
    approved_at  = case when p_to = 'approved'  then now() else approved_at end,
    submitted_at = case when p_to = 'submitted' then now() else submitted_at end,
    confirmed_at = case when p_to = 'confirmed' then now() else confirmed_at end
  where id = p_application_id
  returning * into v_app;
  perform set_config('app.transitioning', 'off', true);

  insert into events (application_id, job_id, from_status, to_status, cause, detail)
  values (v_app.id, v_app.job_id, v_from, p_to, p_cause, p_detail);

  return v_app;
end;
$$;
revoke execute on function transition_application(uuid, text, text, jsonb) from anon, public;
grant execute on function transition_application(uuid, text, text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. questions, question_aliases, answers
-- ---------------------------------------------------------------------------
alter table application_questions drop constraint application_questions_answer_topic_id_fkey;
alter table application_questions rename column answer_topic_id to question_id;
drop table answer_topic_variants;
drop table answer_topics;

-- The catalog: every distinct thing forms ask. A question holds no answer, only where it lives.
create table questions (
  id             uuid primary key default gen_random_uuid(),
  key            text not null unique,      -- 'requires_sponsorship', 'salary_expectation', 'years_with_skill'
  label          text not null,
  category       text not null default 'other'
    check (category in ('contact','authorization','compensation','logistics','skills','links','eeo','other')),
  answer_type    text not null check (answer_type in ('boolean','number','range','text','choice')),
  answer_source  text not null check (answer_source in ('profile','criteria','skill_years','answer','drafted','ask')),
  source_field   text,                      -- for profile/criteria: 'work_authorizations.requires_sponsorship'
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check ((answer_source in ('profile','criteria')) = (source_field is not null))
);

-- Every wording seen, pointing at its question.
create table question_aliases (
  normalized_text  text primary key,
  question_id      uuid not null references questions(id) on delete cascade,
  polarity         text not null default 'same' check (polarity in ('same','inverted')),
  skill_id         uuid references skills(id) on delete cascade,   -- for years_with_skill wordings
  confidence       numeric,                 -- from Claude; null when set by rule or by me
  confirmed        boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index question_aliases_question_idx on question_aliases (question_id);

-- Answers to catalog questions that neither the profile nor the criteria hold.
create table answers (
  question_id  uuid primary key references questions(id) on delete cascade,
  value        jsonb not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table application_questions
  add constraint application_questions_question_id_fkey
    foreign key (question_id) references questions(id) on delete set null;

-- Where each prepared answer came from, in the catalog's terms ('rule': e.g. an
-- EEO decline option; 'user': typed on Needs you).
alter table application_questions drop constraint application_questions_answer_source_check;
alter table application_questions add constraint application_questions_answer_source_check
  check (answer_source in ('profile','criteria','skill_years','answer','drafted','rule','user'));

insert into questions (key, label, category, answer_type, answer_source, source_field) values
  ('first_name', 'First name', 'contact', 'text', 'profile', 'profiles.first_name'),
  ('last_name', 'Last name', 'contact', 'text', 'profile', 'profiles.last_name'),
  ('full_name', 'Full name', 'contact', 'text', 'profile', 'profiles.first_name + last_name'),
  ('preferred_name', 'Preferred name', 'contact', 'text', 'profile', 'profiles.preferred_name'),
  ('email', 'Email', 'contact', 'text', 'profile', 'profiles.email'),
  ('phone', 'Phone', 'contact', 'text', 'profile', 'profiles.phone'),
  ('current_location', 'Where you live (city, state)', 'logistics', 'text', 'profile', 'profiles.city + state'),
  ('postal_code', 'Postal code', 'contact', 'text', 'profile', 'profiles.postal_code'),
  ('linkedin_url', 'LinkedIn URL', 'links', 'text', 'profile', 'profiles.linkedin_url'),
  ('github_url', 'GitHub URL', 'links', 'text', 'profile', 'profiles.github_url'),
  ('website_url', 'Website or portfolio URL', 'links', 'text', 'profile', 'profiles.website_url'),
  ('notice_period', 'Notice period or earliest start', 'logistics', 'text', 'profile', 'profiles.notice_period'),
  ('work_authorization', 'Authorized to work in the country', 'authorization', 'boolean', 'profile', 'work_authorizations.authorized'),
  ('requires_sponsorship', 'Requires visa sponsorship', 'authorization', 'boolean', 'profile', 'work_authorizations.requires_sponsorship'),
  ('salary_expectation', 'Desired salary', 'compensation', 'range', 'criteria', 'match_criteria.salary_min + salary_max'),
  ('willing_to_relocate', 'Willing to relocate', 'logistics', 'boolean', 'criteria', 'match_criteria.willing_to_relocate'),
  ('years_with_skill', 'Years of experience with a skill', 'skills', 'number', 'skill_years', null);

-- ---------------------------------------------------------------------------
-- 4. skill_aliases
-- ---------------------------------------------------------------------------
create table skill_aliases (
  alias       text primary key,              -- normalized: 'k8s', 'amazon web services'
  skill_id    uuid not null references skills(id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index skill_aliases_skill_idx on skill_aliases (skill_id);
insert into skill_aliases (alias, skill_id)
select distinct on (lower(a)) lower(a), s.id from skills s, unnest(s.aliases) a
on conflict do nothing;
alter table skills drop column aliases;

-- ---------------------------------------------------------------------------
-- RLS and updated_at triggers for the new tables.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['match_criteria','questions','question_aliases','answers','skill_aliases'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy owner_all on %I for all to authenticated using (is_owner()) with check (is_owner())', t);
    execute format('revoke all on %I from anon', t);
    execute format(
      'create trigger set_updated_at before update on %I for each row execute function set_updated_at()', t);
  end loop;
end $$;
