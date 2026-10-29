-- M2 discovery: board sync functions used by the discover worker (service role only).

create index jobs_company_source_idx on jobs (company_id, source) where company_id is not null;

-- Title pre-filter applied before inserting. Empty include = keep everything.
insert into settings (key, value) values
  ('discover_filter', '{"include": [], "exclude": []}')
on conflict (key) do nothing;

-- Inserts new jobs from a board. Rows that collide on (source, external_id) or
-- dedup_key (the same posting seen through another source) are skipped.
create function insert_discovered_jobs(p_jobs jsonb)
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_inserted int;
begin
  with ins as (
    insert into jobs (
      company_id, company_name, source, external_id, url, apply_url, title, location, remote_type,
      salary_min, salary_max, salary_currency, description_md, posted_at, dedup_key, raw
    )
    select
      company_id, company_name, source, external_id, url, apply_url, title, location, remote_type,
      salary_min, salary_max, salary_currency, description_md, posted_at, dedup_key, raw
    from jsonb_populate_recordset(null::jobs, p_jobs)
    on conflict do nothing
    returning 1
  )
  select count(*) into v_inserted from ins;

  return jsonb_build_object(
    'inserted', v_inserted,
    'duplicates', jsonb_array_length(p_jobs) - v_inserted
  );
end;
$$;

-- Records a successful fetch of a board: jobs still listed get last_seen_at
-- (and reopen if they had closed); jobs from this board no longer listed close.
-- Only call this after a successful fetch, never after an error.
create function sync_board(p_company_id uuid, p_source text, p_external_ids text[])
returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  v_seen int;
  v_closed int;
begin
  update jobs set last_seen_at = now(), closed_at = null
  where company_id = p_company_id and source = p_source and external_id = any(p_external_ids);
  get diagnostics v_seen = row_count;

  update jobs set closed_at = now()
  where company_id = p_company_id and source = p_source and closed_at is null
    and not (external_id = any(p_external_ids));
  get diagnostics v_closed = row_count;

  return jsonb_build_object('seen', v_seen, 'closed', v_closed);
end;
$$;

-- Latest state per worker source (e.g. 'greenhouse:stripe'), for backoff and
-- the Health page. Unfinished runs (ok is null) are ignored.
create view run_source_status with (security_invoker = true) as
with finished as (
  select worker, source, started_at, ok, error, counts
  from runs
  where ok is not null and source is not null
),
latest as (
  select distinct on (worker, source) worker, source, started_at, ok, error, counts
  from finished
  order by worker, source, started_at desc
),
last_success as (
  select worker, source, max(started_at) as at
  from finished
  where ok
  group by worker, source
)
select
  l.worker,
  l.source,
  l.started_at as last_run_at,
  l.ok as last_ok,
  l.error as last_error,
  l.counts as last_counts,
  s.at as last_success_at,
  (select count(*) from finished f
    where f.worker = l.worker and f.source = l.source
      and f.started_at > coalesce(s.at, '-infinity'::timestamptz))::int as consecutive_failures,
  (select min(f.started_at) from finished f
    where f.worker = l.worker and f.source = l.source) as first_run_at
from latest l
left join last_success s using (worker, source);

revoke all on run_source_status from anon, public;
grant select on run_source_status to authenticated, service_role;

revoke execute on function insert_discovered_jobs(jsonb) from anon, authenticated, public;
revoke execute on function sync_board(uuid, text, text[]) from anon, authenticated, public;
grant execute on function insert_discovered_jobs(jsonb) to service_role;
grant execute on function sync_board(uuid, text, text[]) to service_role;
