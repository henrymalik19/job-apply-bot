-- Each run's tally (filled, couldn't fill, not on the form, errors), read from its step log when it's
-- uploaded, so Admin > Runs lists runs as a table without downloading every log.
alter table apply_runs add column counts jsonb;
