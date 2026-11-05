-- In-app notifications: what happened that you'd want to know (an interview invite, the runner waiting for
-- you, applications ready to review), one row each, with where to go. Workers (service role) and the app (as
-- you) add them; you read and mark them read. `dedupe_key` keeps one per event when a worker runs again.
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references users(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  href text,
  application_id uuid references applications(id) on delete cascade,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
create index notifications_recent on notifications (user_id, created_at desc);
create index notifications_unread on notifications (user_id) where read_at is null;
alter table notifications enable row level security;
create policy own_rows on notifications for all
  using (user_id = auth.uid() and is_member()) with check (user_id = auth.uid() and is_member());
revoke all on notifications from anon;

-- Live updates in the app (Supabase Realtime): the bell when a notification arrives, the board and To do
-- when an application changes. Each signed-in user only receives their own rows (RLS).
alter publication supabase_realtime add table notifications, applications;
