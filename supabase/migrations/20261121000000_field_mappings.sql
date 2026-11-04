-- Fields the apply runner found on a form outside the prepared questions (a section it didn't know
-- about, say), filled from your profile by Claude, and what it learned from how you handled them.
-- A mapping is learned after 2 submits where you left the value as it was, or at once when you
-- corrected it; a learned mapping is filled without asking Claude and without holding auto mode.
create table field_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  ats text not null,
  -- The company's board token: the same field on the same company's forms.
  company text not null,
  field_name text not null,
  label text not null,
  -- What goes in: text, or the option labels to choose.
  value jsonb not null,
  -- "ai": Claude's answer; "you": your correction.
  source text not null check (source in ('ai', 'you')),
  confirmations integer not null default 0,
  learned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, ats, company, field_name)
);
alter table field_mappings enable row level security;
create policy own_rows on field_mappings for all
  using (user_id = auth.uid() and is_member()) with check (user_id = auth.uid() and is_member());
create trigger set_updated_at before update on field_mappings for each row execute function set_updated_at();
revoke all on field_mappings from anon;
