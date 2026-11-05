-- Some companies take only so many applications from one person ("2 jobs over a span of 60 days", Vanta).
-- The rule is the company's, the same for everyone: companies.apply_limit / apply_limit_days, learned from
-- the message when a submission is refused. When you can apply there again is yours:
-- user_companies.paused_until, with what they said in pause_reason. Until then nothing new is prepared there.
alter table companies
  add column apply_limit integer check (apply_limit > 0),
  add column apply_limit_days integer check (apply_limit_days > 0),
  add constraint companies_apply_limit_pair check ((apply_limit is null) = (apply_limit_days is null));

alter table user_companies
  add column paused_until timestamptz,
  add column pause_reason text;

-- Other names a company's email comes under (Oneapp mails as Onepay), learned when you link one of its emails
-- to an application by hand, so its next ones match on their own.
alter table companies add column other_names text[] not null default '{}';

-- Vanta's, from its refusal on 5 Nov 2026: "limiting applications to a total of 2 jobs over a span of 60 days".
update companies set apply_limit = 2, apply_limit_days = 60 where ats = 'ashby' and lower(board_token) = 'vanta';
