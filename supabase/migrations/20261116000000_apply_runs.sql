-- Apply runner logs in the app. The runner keeps a record of every attempt (the step log, screenshots,
-- the form's HTML) on the computer it runs on; it now also uploads each one when the run ends, so the
-- application's page shows why a field wasn't filled without anyone digging through data/apply-debug.

create table apply_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  application_id uuid not null references applications(id) on delete cascade,
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  -- "submitted", or "handed back: <reason>".
  outcome text not null,
  -- Storage folder in apply-runs: <user id>/<application id>/<run id>.
  folder text not null,
  -- File names in that folder, in the order they were written (run.log, 01-opened.png, …).
  files text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index apply_runs_application on apply_runs (application_id, started_at desc);
alter table apply_runs enable row level security;
create policy own_rows on apply_runs for all
  using (user_id = auth.uid() and is_member()) with check (user_id = auth.uid() and is_member());
revoke all on apply_runs from anon;

-- The files: private, each user reads and writes only their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('apply-runs', 'apply-runs', false, 20971520, array['text/plain', 'text/html', 'image/png'])
on conflict (id) do nothing;
create policy apply_runs_own_read on storage.objects for select to authenticated
  using (bucket_id = 'apply-runs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy apply_runs_own_write on storage.objects for insert to authenticated
  with check (bucket_id = 'apply-runs' and (storage.foldername(name))[1] = auth.uid()::text);
