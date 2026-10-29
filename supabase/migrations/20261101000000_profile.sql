-- Structured profile: contact details, work authorization per country,
-- employment history with responsibilities and skills used, education,
-- skills (a generic catalog plus the ones I have) and certifications.
-- confirmed_facts keeps only free-form facts. Nothing has a "reviewed" flag:
-- what's in these tables counts as true.
--
-- Also: table names are plural everywhere. owner becomes users: one row per
-- person allowed in the app (id = their auth.users id) with a role. During the
-- MVP there is exactly one 'owner'; later users are 'member's. evidence becomes
-- evidence_items and llm_usage becomes llm_calls.

alter table owner rename to users;
alter table users drop constraint owner_pkey;
alter table users drop column singleton;
alter table users rename column user_id to id;
alter table users add primary key (id);
alter table users add column role text not null default 'owner' check (role in ('owner','member'));
-- At most one owner.
create unique index users_one_owner on users (role) where role = 'owner';

create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from users where id = auth.uid() and role = 'owner');
$$;

alter table evidence rename to evidence_items;
alter table llm_usage rename to llm_calls;

-- One row per user.
create table profiles (
  user_id              uuid primary key references users(id) on delete cascade,
  first_name           text,
  last_name            text,
  preferred_name       text,
  email                text,
  phone                text,
  city                 text,
  state                text,                 -- US state code, e.g. 'TX'
  country              text not null default 'US',
  postal_code          text,
  linkedin_url         text,
  github_url           text,
  website_url          text,
  headline             text,
  summary              text,
  willing_to_relocate  boolean,
  notice_period        text,                 -- "2 weeks", "immediately"
  updated_at           timestamptz not null default now()
);

create table work_authorizations (
  id                    uuid primary key default gen_random_uuid(),
  country               text not null unique,  -- ISO code: 'US', 'CA', 'GB'
  authorized            boolean not null,
  requires_sponsorship  boolean not null,
  status                text,                  -- "US citizen", "Permanent resident", "H-1B"
  notes                 text,
  created_at            timestamptz not null default now()
);

create table employments (
  id               uuid primary key default gen_random_uuid(),
  employer         text not null,
  title            text not null,
  location         text,
  employment_type  text check (employment_type in ('full_time','part_time','contract','internship','freelance')),
  start_date       date not null,              -- month precision: always the 1st
  end_date         date,                       -- null while current (or not known yet)
  is_current       boolean not null default false,
  description      text,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  check (not (is_current and end_date is not null))
);

create table employment_responsibilities (
  id             uuid primary key default gen_random_uuid(),
  employment_id  uuid not null references employments(id) on delete cascade,
  text           text not null,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now()
);
create index employment_responsibilities_employment_idx on employment_responsibilities (employment_id, sort_order);

-- Generic skill catalog: no personal data.
create table skills (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  normalized  text not null unique,
  aliases     text[] not null default '{}',
  category    text check (category in ('language','framework','database','cloud','tool','practice','other')),
  created_at  timestamptz not null default now()
);

-- Skills I have. Years are computed from employment_skills unless overridden.
create table user_skills (
  skill_id        uuid primary key references skills(id) on delete cascade,
  years_override  numeric(4,1),
  proficiency     text check (proficiency in ('expert','advanced','working','familiar')),
  last_used_year  int,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);

-- Skills used at each job.
create table employment_skills (
  employment_id  uuid not null references employments(id) on delete cascade,
  skill_id       uuid not null references skills(id) on delete cascade,
  primary key (employment_id, skill_id)
);
create index employment_skills_skill_idx on employment_skills (skill_id);

create table educations (
  id              uuid primary key default gen_random_uuid(),
  institution     text not null,
  degree          text,
  field_of_study  text,
  start_year      int,
  end_year        int,
  completed       boolean not null default true,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);

create table certifications (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  issuer          text,
  issued_on       date,
  expires_on      date,
  credential_url  text,
  sort_order      int not null default 0,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Move off the flat facts. Every structured fact so far came from the old-app
-- import, which `pnpm import:profile` now writes into the tables above. Keep
-- the summary text (it may have been edited) on the owner's profile.
-- ---------------------------------------------------------------------------
insert into profiles (user_id, summary)
select u.id,
       (select fact from confirmed_facts where category = 'summary' and active order by sort_order limit 1)
from users u where u.role = 'owner';

delete from confirmed_facts
where category in ('summary','employment','education','skill','metric','authorization','logistics','link');

alter table confirmed_facts drop column reviewed;
alter table confirmed_facts drop constraint confirmed_facts_category_check;
alter table confirmed_facts add constraint confirmed_facts_category_check
  check (category in ('project','award','preference','other'));

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','work_authorizations','employments','employment_responsibilities',
    'skills','user_skills','employment_skills','educations','certifications'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy owner_all on %I for all to authenticated using (is_owner()) with check (is_owner())', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;
