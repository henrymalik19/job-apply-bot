-- Every table has created_at and updated_at, and one trigger keeps updated_at
-- current on every update (code never sets it). Also drops two unused things:
-- companies.priority (it only ordered board fetches, and every board is fetched
-- each run) and the score_threshold setting (the threshold lives in the match
-- criteria).

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  for t in
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
  loop
    execute format('alter table %I add column if not exists created_at timestamptz not null default now()', t);
    execute format('alter table %I add column if not exists updated_at timestamptz not null default now()', t);
    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format(
      'create trigger set_updated_at before update on %I for each row execute function set_updated_at()', t);
  end loop;
end $$;

alter table companies drop column priority;
delete from settings where key = 'score_threshold';
