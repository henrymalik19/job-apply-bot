-- The fields each run couldn't fill with their first value (and whether another value then took),
-- kept on the run so Health can list them across runs without reading every log.
alter table apply_runs add column failed_fields jsonb not null default '[]';
