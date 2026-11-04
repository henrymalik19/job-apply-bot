-- A job whose scoring failed (a one-off API error, an answer in the wrong shape) is scored again on a
-- later run, up to 3 tries in all, instead of staying "failed" for good.
alter table matches add column attempts smallint not null default 1;
