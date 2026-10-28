-- Job Search Autopilot: initial schema (M1)
-- Single-owner app. Owner identity lives in public.owner (one row), read by is_owner().
-- Workers use the service role, which bypasses RLS.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Owner
-- ---------------------------------------------------------------------------
create table owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null,
  created_at timestamptz not null default now()
);

create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from owner where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  ats text not null check (ats in ('greenhouse','lever','ashby','other')),
  board_token text,
  priority int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (ats, board_token)
);

create table jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id),
  company_name text not null,
  source text not null,
  external_id text,
  url text not null,
  apply_url text,
  title text not null,
  location text,
  remote_type text,
  salary_min int, salary_max int, salary_currency text,
  description_md text,
  posted_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  closed_at timestamptz,
  dedup_key text not null,
  raw jsonb,
  unique (source, external_id),
  unique (dedup_key)
);

create table criteria_versions (
  id uuid primary key default gen_random_uuid(),
  criteria jsonb not null,
  created_at timestamptz not null default now()
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  criteria_version_id uuid not null references criteria_versions(id),
  hard_filter_passed boolean not null,
  hard_filter_reason text,
  score int check (score between 0 and 100),
  reasons jsonb,
  model text,
  created_at timestamptz not null default now(),
  unique (job_id, criteria_version_id)
);

create table resume_versions (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  content jsonb not null,
  is_master boolean not null default false,
  created_at timestamptz not null default now()
);
-- At most one master resume.
create unique index resume_versions_one_master on resume_versions (is_master) where is_master;

create type app_status as enum (
  'queued','needs_input','manual','approved','submitted','confirmed',
  'responded','interviewing','offer','rejected','skipped','expired','failed'
);

create table applications (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references jobs(id),
  match_id uuid references matches(id),
  status app_status not null default 'queued',
  resume_pdf_path text,
  resume_content jsonb,
  cover_letter text,
  apply_method text,
  approved_at timestamptz,
  submitted_at timestamptz,
  confirmed_at timestamptz,
  last_status_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table answer_bank (
  id uuid primary key default gen_random_uuid(),
  canonical_question text not null unique,
  answer text not null,
  category text,
  variants text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table application_questions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  question text not null,
  field_type text,
  options jsonb,
  required boolean not null default false,
  bucket text not null check (bucket in ('auto','drafted','needs_user','cannot_automate')),
  answer text,
  answer_bank_id uuid references answer_bank(id),
  user_approved boolean not null default false
);

create table evidence (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references applications(id) on delete cascade,
  kind text not null check (kind in ('screenshot','confirmation_page','confirmation_email','user_attested')),
  storage_path text,
  text_excerpt text,
  email_message_id text,
  created_at timestamptz not null default now()
);

create table emails (
  id uuid primary key default gen_random_uuid(),
  message_id text not null unique,
  received_at timestamptz not null,
  from_addr text, subject text, snippet text,
  classification text,
  application_id uuid references applications(id),
  match_confidence real,
  processed_at timestamptz not null default now()
);

create table events (
  id bigint generated always as identity primary key,
  application_id uuid references applications(id) on delete cascade,
  job_id uuid references jobs(id) on delete cascade,
  from_status app_status,
  to_status app_status,
  cause text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
create index events_application_id_idx on events (application_id, created_at);

create table runs (
  id uuid primary key default gen_random_uuid(),
  worker text not null,
  source text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  counts jsonb,
  error text
);
create index runs_worker_started_idx on runs (worker, source, started_at desc);

create table settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into settings (key, value) values
  ('public_page_enabled', 'false'),
  ('daily_cap', '20'),
  ('score_threshold', '75'),
  ('stale_days', '5');

-- ---------------------------------------------------------------------------
-- Status transitions: the single source of truth for allowed moves.
-- ---------------------------------------------------------------------------
create table status_transitions (
  from_status app_status not null,
  to_status app_status not null,
  primary key (from_status, to_status)
);

insert into status_transitions (from_status, to_status) values
  ('queued','approved'), ('queued','skipped'), ('queued','needs_input'), ('queued','manual'),
  ('queued','expired'), ('queued','failed'),
  ('needs_input','queued'), ('needs_input','manual'), ('needs_input','skipped'), ('needs_input','expired'),
  ('manual','submitted'), ('manual','skipped'), ('manual','expired'),
  ('approved','submitted'), ('approved','skipped'), ('approved','expired'), ('approved','failed'),
  ('submitted','confirmed'), ('submitted','responded'), ('submitted','interviewing'),
  ('submitted','rejected'), ('submitted','failed'),
  ('confirmed','responded'), ('confirmed','interviewing'), ('confirmed','rejected'), ('confirmed','offer'),
  ('responded','interviewing'), ('responded','rejected'), ('responded','offer'),
  ('interviewing','offer'), ('interviewing','rejected'),
  ('failed','queued'),
  ('skipped','queued');

-- Every status change goes through this function. It validates the move,
-- stamps the matching timestamp, and writes the events row in one transaction.
create or replace function transition_application(
  p_application_id uuid,
  p_to app_status,
  p_cause text,
  p_detail jsonb default null
) returns applications
language plpgsql security invoker set search_path = public as $$
declare
  v_app applications;
  v_from app_status;
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

-- Block raw status updates that bypass transition_application().
create or replace function guard_status_update() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('app.transitioning', true), 'off') <> 'on' then
    raise exception 'status changes must go through transition_application()' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger applications_guard_status
  before update of status on applications
  for each row execute function guard_status_update();

-- Log creation as the first event.
create or replace function log_application_created() returns trigger
language plpgsql as $$
begin
  insert into events (application_id, job_id, from_status, to_status, cause)
  values (new.id, new.job_id, null, new.status, 'system:create');
  return new;
end;
$$;

create trigger applications_log_create
  after insert on applications
  for each row execute function log_application_created();

-- ---------------------------------------------------------------------------
-- Row Level Security: owner-only on every table.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'companies','jobs','criteria_versions','matches','resume_versions','applications',
    'answer_bank','application_questions','evidence','emails','events','runs','settings',
    'status_transitions'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy owner_all on %I for all to authenticated using (is_owner()) with check (is_owner())', t);
  end loop;
end $$;

-- owner: RLS on, no policies -> only the service role can read/write it.
alter table owner enable row level security;
alter table owner force row level security;

revoke all on all tables in schema public from anon;
revoke execute on function transition_application(uuid, app_status, text, jsonb) from anon, public;
grant execute on function transition_application(uuid, app_status, text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Public status view: the only data the public page may show.
-- Not granted to anon or authenticated; the server route reads it with the
-- service role after checking settings.public_page_enabled.
-- ---------------------------------------------------------------------------
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
