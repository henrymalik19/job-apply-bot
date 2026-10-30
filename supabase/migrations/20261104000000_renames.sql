-- Table and view names grouped by what they belong to: application_* for an
-- application's children, profile_* for the owner's profile, question_* for
-- the question catalog, worker_* for worker bookkeeping. Also drops the unused
-- free-form facts table.

alter table events rename to application_events;
alter table status_transitions rename to application_status_transitions;
alter table evidence_items rename to application_evidence_items;
-- Free-form facts had no clear role (preferences live in match_criteria; projects
-- can get their own table) and held no rows.
drop table confirmed_facts;
alter table user_skills rename to profile_skills;
alter table answers rename to question_answers;
alter table resume_versions rename to resumes;
alter table runs rename to worker_runs;
alter view run_source_status rename to worker_source_statuses;
alter view public_status rename to public_applications;

-- Function bodies name tables as text, so recreate the two that used old names.
create or replace function transition_application(
  p_application_id uuid,
  p_to text,
  p_cause text,
  p_detail jsonb default null
) returns applications
language plpgsql security invoker set search_path = public as $$
declare
  v_app applications;
  v_from text;
begin
  select * into v_app from applications where id = p_application_id for update;
  if not found then
    raise exception 'application % not found', p_application_id using errcode = 'P0002';
  end if;
  v_from := v_app.status;

  if not exists (select 1 from application_status_transitions where from_status = v_from and to_status = p_to) then
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

  insert into application_events (application_id, job_id, from_status, to_status, cause, detail)
  values (v_app.id, v_app.job_id, v_from, p_to, p_cause, p_detail);

  return v_app;
end;
$$;

create or replace function log_application_created() returns trigger
language plpgsql as $$
begin
  insert into application_events (application_id, job_id, from_status, to_status, cause)
  values (new.id, new.job_id, null, new.status, 'system:create');
  return new;
end;
$$;
