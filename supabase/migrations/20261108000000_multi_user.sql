-- Multi-user data model. Every per-user row gets user_id (backfilled with the
-- owner); companies, jobs, skills and the question catalog stay shared.
-- Matches are per (user, job); per-user settings move to user_settings;
-- user_companies says who follows which board. RLS: your own rows, for anyone
-- in `users`. The web app still lets only the owner sign in.

create or replace function is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from users where id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- user_id on per-user tables. Web-app inserts get it from the session;
-- workers (service role, no session) must pass it, or not null rejects the row.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  v_owner uuid := (select id from users where role = 'owner');
begin
  foreach t in array array[
    'applications', 'matches', 'employments', 'educations', 'certifications', 'work_authorizations',
    'profile_skills', 'lessons', 'question_answers', 'resumes', 'emails', 'llm_calls'
  ] loop
    execute format('alter table %I add column user_id uuid references users (id) on delete cascade', t);
    execute format('update %I set user_id = $1', t) using v_owner;
    execute format('alter table %I alter column user_id set not null, alter column user_id set default auth.uid()', t);
    execute format('create index %I on %I (user_id)', t || '_user_id_idx', t);
  end loop;
end $$;

alter table profiles alter column user_id set default auth.uid();
alter table match_criteria alter column user_id set default auth.uid();

-- Runs of per-user work (match, prepare, notify) name their user; discovery runs don't.
alter table worker_runs add column user_id uuid references users (id) on delete cascade;
create index worker_runs_worker_user_idx on worker_runs (worker, user_id, started_at desc);

-- Uniqueness becomes per user.
alter table matches drop constraint matches_job_id_key, add constraint matches_user_job_key unique (user_id, job_id);
alter table applications drop constraint applications_job_id_key, add constraint applications_user_job_key unique (user_id, job_id);
alter table work_authorizations drop constraint work_authorizations_country_key,
  add constraint work_authorizations_user_country_key unique (user_id, country);
alter table profile_skills drop constraint user_skills_pkey, add primary key (user_id, skill_id);
alter table question_answers drop constraint answers_pkey, add primary key (user_id, question_id);
alter table emails drop constraint emails_message_id_key, add constraint emails_user_message_key unique (user_id, message_id);

-- ---------------------------------------------------------------------------
-- Who follows which board. Discovery checks a board when anyone follows it.
-- ---------------------------------------------------------------------------
create table user_companies (
  user_id uuid not null default auth.uid() references users (id) on delete cascade,
  company_id uuid not null references companies (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, company_id)
);
create index user_companies_company_idx on user_companies (company_id);
insert into user_companies (user_id, company_id) select u.id, c.id from users u cross join companies c where u.role = 'owner';
create trigger user_companies_updated_at before update on user_companies for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Per-user settings. `settings` keeps only global ones (app_url, discovery interval).
-- ---------------------------------------------------------------------------
create table user_settings (
  user_id uuid not null default auth.uid() references users (id) on delete cascade,
  key text not null,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
create trigger user_settings_updated_at before update on user_settings for each row execute function set_updated_at();

insert into user_settings (user_id, key, value)
select u.id, s.key, s.value
from settings s cross join users u
where u.role = 'owner'
  and s.key in ('daily_cap', 'llm_monthly_cap_usd', 'notifications', 'job_inbox', 'stale_days', 'public_page_enabled',
                'discover_filter', 'discover_job_filter');
delete from settings where key in ('daily_cap', 'llm_monthly_cap_usd', 'notifications', 'job_inbox', 'stale_days',
                                   'public_page_enabled', 'discover_filter', 'discover_job_filter');
-- The pipeline now runs every 6 hours (Health uses this to tell when it's late).
insert into settings (key, value) values ('discover_interval_minutes', '360')
on conflict (key) do update set value = excluded.value;

-- Room for preparing 20 applications a day plus scoring.
insert into user_settings (user_id, key, value)
select id, 'llm_monthly_cap_usd', '20' from users where role = 'owner'
on conflict (user_id, key) do update set value = '20';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table user_companies enable row level security;
alter table user_settings enable row level security;

do $$
declare t text;
begin
  -- Your own rows.
  foreach t in array array[
    'applications', 'matches', 'employments', 'educations', 'certifications', 'work_authorizations', 'profile_skills',
    'lessons', 'question_answers', 'resumes', 'emails', 'llm_calls', 'profiles', 'match_criteria',
    'user_companies', 'user_settings'
  ] loop
    execute format('drop policy if exists owner_all on %I', t);
    execute format(
      'create policy own_rows on %I for all using (user_id = auth.uid() and is_member()) with check (user_id = auth.uid() and is_member())', t);
  end loop;

  -- Shared catalogs any member may add to.
  foreach t in array array['companies', 'skills', 'skill_aliases', 'questions', 'question_aliases'] loop
    execute format('drop policy if exists owner_all on %I', t);
    execute format('create policy members_all on %I for all using (is_member()) with check (is_member())', t);
  end loop;

  -- Shared data members read; the owner (and workers) write.
  foreach t in array array['jobs', 'settings', 'worker_runs', 'application_status_transitions'] loop
    execute format('drop policy if exists owner_all on %I', t);
    execute format('create policy members_read on %I for select using (is_member())', t);
    execute format('create policy owner_all on %I for all using (is_owner()) with check (is_owner())', t);
  end loop;
end $$;

-- Child rows follow their parent.
do $$
declare t text;
begin
  foreach t in array array['application_questions', 'application_events', 'application_evidence_items'] loop
    execute format('drop policy if exists owner_all on %I', t);
    execute format(
      'create policy own_rows on %I for all using (exists (select 1 from applications a where a.id = application_id and a.user_id = auth.uid()))'
      ' with check (exists (select 1 from applications a where a.id = application_id and a.user_id = auth.uid()))', t);
  end loop;
  foreach t in array array['employment_responsibilities', 'employment_skills'] loop
    execute format('drop policy if exists owner_all on %I', t);
    execute format(
      'create policy own_rows on %I for all using (exists (select 1 from employments e where e.id = employment_id and e.user_id = auth.uid()))'
      ' with check (exists (select 1 from employments e where e.id = employment_id and e.user_id = auth.uid()))', t);
  end loop;
end $$;

-- Resume PDFs: readable by the user whose resume row points at them.
drop policy if exists resumes_owner_read on storage.objects;
create policy resumes_own_read on storage.objects for select using (
  bucket_id = 'resumes' and exists (select 1 from public.resumes r where r.pdf_path = name and r.user_id = auth.uid())
);

-- The public page shows one user's submitted applications. Server (service role) only,
-- as first set up in init; the earlier recreation left the default grants in place.
drop view public_applications;
create view public_applications as
  select a.id, a.user_id, j.title as job_title, j.company_name, j.url as job_url, a.status, a.created_at, a.submitted_at, a.last_status_at
  from applications a join jobs j on j.id = a.job_id
  where a.status <> all (array['queued', 'needs_input', 'manual', 'approved', 'skipped', 'expired', 'failed']);
revoke all on public_applications from anon, authenticated, public;
grant select on public_applications to service_role;

revoke all on user_companies, user_settings from anon;
