-- Steps only you can do (an assessment, a file other than the resume) no longer hold an application
-- back: the apply runner fills the rest of the form and leaves them to you in the Chrome window.
-- Prepare now queues these for approval; this moves the ones it already sorted the old way.

insert into application_status_transitions (from_status, to_status) values ('manual', 'queued')
on conflict do nothing;

-- A required file other than the resume was a question for you to answer, with nowhere to answer it.
update application_questions
set bucket = 'cannot_automate', reason = 'a file to attach in the Chrome window'
where bucket = 'needs_user' and reason = 'file upload' and required;

-- Can't fill automatically (prepare's, not a runner hand-back) or Missing answers held only by those
-- steps: back to Ready to approve.
select transition_application(a.id, 'queued', 'system:your_steps_in_chrome')
from applications a
where (a.status = 'needs_input' or (a.status = 'manual' and a.apply_note is null and a.prepare_error is null))
  and exists (select 1 from application_questions q where q.application_id = a.id and q.required and q.bucket = 'cannot_automate')
  and not exists (select 1 from application_questions q where q.application_id = a.id and q.required and q.bucket = 'needs_user');
