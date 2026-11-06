-- Staffing agencies, recruiters and job aggregators post other companies' jobs (common on LinkedIn Easy Apply):
-- matching rules them out unless you turn this off on the Search page.
alter table match_criteria add column skip_staffing_agencies boolean not null default true;
