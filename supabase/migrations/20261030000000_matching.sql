-- M4 matching: lessons, confirmed facts, LLM usage, match status, and
-- filtered-out samples from discovery.

-- Rules learned from edits and skips, fed into LLM prompts by scope.
create table lessons (
  id uuid primary key default gen_random_uuid(),
  rule text not null,
  scope text not null default 'global'
    check (scope in ('global','scoring','tailoring','answers','cover_letter','platform')),
  platform text,
  source text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Facts about the owner. Scoring reads every active fact; tailoring (M5)
-- accepts only reviewed ones (the fact guard).
create table confirmed_facts (
  id uuid primary key default gen_random_uuid(),
  category text not null
    check (category in ('summary','employment','education','skill','metric','authorization','logistics','link','other')),
  fact text not null,
  structured jsonb,
  source text,
  reviewed boolean not null default false,
  active boolean not null default true,
  sort_order int not null default 0,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- One row per LLM call, for the monthly spend cap.
create table llm_usage (
  id uuid primary key default gen_random_uuid(),
  purpose text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_read_tokens int not null default 0,
  cache_write_tokens int not null default 0,
  cost_usd numeric(12,6) not null default 0,
  job_id uuid references jobs(id) on delete set null,
  created_at timestamptz not null default now()
);
create index llm_usage_created_idx on llm_usage (created_at);

-- Match outcome: filtered by a hard rule, scored, or failed (invalid output twice).
alter table matches
  add column status text not null default 'scored' check (status in ('filtered','scored','failed')),
  add column error text;
create index matches_version_score_idx on matches (criteria_version_id, score desc);

-- A few titles each board run skipped, with the reason, for the Search page.
alter table runs add column samples jsonb;

do $$
declare t text;
begin
  foreach t in array array['lessons','confirmed_facts','llm_usage'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy owner_all on %I for all to authenticated using (is_owner()) with check (is_owner())', t);
    execute format('revoke all on %I from anon', t);
  end loop;
end $$;

insert into settings (key, value) values ('llm_monthly_cap_usd', '5') on conflict (key) do nothing;
