-- M5 prepare: the answer bank stores one answer per topic (not per wording),
-- variants map each question wording seen to its topic, and applications and
-- their questions gain what the prepare worker and approval screens need.

-- ---------------------------------------------------------------------------
-- Answer bank, reshaped. The M1 table was never written to; refuse to drop it
-- if it somehow has rows.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from answer_bank) then
    raise exception 'answer_bank has rows; migrate them before reshaping the table';
  end if;
end $$;

alter table application_questions drop constraint application_questions_answer_bank_id_fkey;
drop table answer_bank;

-- One row per topic answered once. Rows, not columns: new topics need no migration.
create table answer_bank (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  category text not null default 'other'
    check (category in ('authorization','salary','logistics','eeo','skills','links','other')),
  value_type text not null check (value_type in ('boolean','number','range','text','choice')),
  -- false | 8 | {"min":150000,"max":180000} | "2 weeks". Null for fact topics
  -- (read from confirmed_facts) and for topics not answered yet.
  value jsonb,
  source text not null default 'bank' check (source in ('bank','fact')),
  updated_at timestamptz not null default now()
);

-- Every question wording seen, mapped to its topic.
create table answer_bank_variants (
  normalized_text text primary key,
  answer_bank_id uuid not null references answer_bank(id) on delete cascade,
  -- 'inverted': the wording asks the opposite ("authorized WITHOUT sponsorship?").
  polarity text not null default 'same' check (polarity in ('same','inverted')),
  confidence numeric,
  confirmed boolean not null default false,
  created_at timestamptz not null default now()
);
create index answer_bank_variants_topic_idx on answer_bank_variants (answer_bank_id);

-- ---------------------------------------------------------------------------
-- Applications and their questions.
-- ---------------------------------------------------------------------------
alter table applications
  -- {kind: 'ai_restriction'|'ai_directed_text'|..., excerpt, question_id}
  add column flags jsonb not null default '[]',
  add column prepare_error text,
  add column prepared_at timestamptz;

alter table application_questions
  add column field_name text,             -- the form's field id, for filling it later
  add column description text,            -- help text shown with the question
  add column sort_order int not null default 0,
  add column answer_value jsonb,          -- structured answer (option ids, boolean) when not free text
  add column answer_source text check (answer_source in ('bank','fact','drafted','user')),
  add column needs_check boolean not null default false,  -- derived from an unconfirmed variant
  add column reason text,                 -- why it's needs_user / cannot_automate
  add column created_at timestamptz not null default now(),
  add constraint application_questions_answer_bank_id_fkey
    foreign key (answer_bank_id) references answer_bank(id) on delete set null;
create index application_questions_app_idx on application_questions (application_id, sort_order);

-- Fact topics: their value comes from confirmed_facts, so they exist from the start.
insert into answer_bank (key, label, category, value_type, source) values
  ('work_authorization', 'Authorized to work in the US', 'authorization', 'boolean', 'fact'),
  ('requires_sponsorship', 'Requires visa sponsorship', 'authorization', 'boolean', 'fact'),
  ('current_location', 'Where I live (city, state)', 'logistics', 'text', 'fact'),
  ('linkedin_url', 'LinkedIn URL', 'links', 'text', 'fact'),
  ('github_url', 'GitHub URL', 'links', 'text', 'fact'),
  ('website_url', 'Website or portfolio URL', 'links', 'text', 'fact');

do $$
declare t text;
begin
  foreach t in array array['answer_bank','answer_bank_variants'] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format(
      'create policy owner_all on %I for all to authenticated using (is_owner()) with check (is_owner())', t);
  end loop;
end $$;

revoke all on answer_bank, answer_bank_variants from anon;
