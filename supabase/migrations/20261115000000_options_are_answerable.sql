-- A question with options to pick ("How do you use AI tools today?") can always be answered, so it is
-- never a step only you can do in Chrome. Prepare sorts these to Missing answers now; this fixes the
-- ones it already filed the old way.
update application_questions
set bucket = 'needs_user'
where bucket = 'cannot_automate'
  and jsonb_typeof(options) = 'array' and jsonb_array_length(options) > 0;

-- Ready to approve with one of those now unanswered: it waits on Missing answers instead.
select transition_application(a.id, 'needs_input', 'system:question_answerable')
from applications a
where a.status = 'queued'
  and exists (select 1 from application_questions q where q.application_id = a.id and q.required and q.bucket = 'needs_user');
