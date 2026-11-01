-- M9 apply runner (v1: Greenhouse, supervised). A local worker signed in as the
-- user fills approved applications in a visible Chrome window and records
-- evidence; the user clicks Submit until a platform has earned auto mode.

-- The runner hands an application back (CAPTCHA, unanswerable field, tab closed).
insert into application_status_transitions (from_status, to_status) values ('approved', 'manual')
on conflict do nothing;

-- Progress while the runner works on an approved application; null when idle.
alter table applications
  add column apply_step text check (apply_step in ('filling', 'waiting_for_you', 'submitting')),
  add column apply_note text;

-- What a piece of evidence shows: answers as filled, resume sha256, fields the user changed.
alter table application_evidence_items add column detail jsonb;

-- Per-platform trust: supervised until required_streak clean runs, then the user may pick auto.
create table platforms (
  user_id uuid not null references users(id) on delete cascade,
  ats text not null,
  mode text not null default 'supervised' check (mode in ('supervised', 'auto')),
  clean_streak integer not null default 0,
  required_streak integer not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, ats)
);
alter table platforms enable row level security;
create policy own_rows on platforms for all
  using (user_id = auth.uid() and is_member()) with check (user_id = auth.uid() and is_member());
create trigger set_updated_at before update on platforms for each row execute function set_updated_at();
revoke all on platforms from anon;

-- Auto mode only once the streak is earned.
create function platforms_guard_auto() returns trigger language plpgsql as $$
begin
  if new.mode = 'auto' and new.clean_streak < new.required_streak then
    raise exception 'auto needs % clean runs (has %)', new.required_streak, new.clean_streak using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger platforms_guard_auto before insert or update on platforms for each row execute function platforms_guard_auto();

-- Evidence screenshots: private, each user reads and writes only their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence', 'evidence', false, 10485760, array['image/png'])
on conflict (id) do nothing;
create policy evidence_own_read on storage.objects for select to authenticated
  using (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text);
create policy evidence_own_write on storage.objects for insert to authenticated
  with check (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text);
create policy evidence_own_update on storage.objects for update to authenticated
  using (bucket_id = 'evidence' and (storage.foldername(name))[1] = auth.uid()::text);
