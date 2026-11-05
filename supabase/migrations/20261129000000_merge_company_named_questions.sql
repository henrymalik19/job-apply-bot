-- "Have you worked here before?" is one question for every employer (previously_employed_here, answered
-- from your work history). Before the prompt said so, Claude made some named for one company
-- ("Previously employed at Affirm"); a later form could be matched to one and reuse an answer meant for
-- that company. Each is merged into the general question: its wordings and unsent applications' questions
-- point there, and it goes, with its saved answers (they were about that one company).
do $$
declare
  general uuid := (select id from questions where key = 'previously_employed_here');
  q record;
begin
  if general is null then
    raise notice 'previously_employed_here is missing; nothing merged';
    return;
  end if;
  for q in
    select id, key, label from questions
    where key <> 'previously_employed_here'
      and key ~ '^(previously_(employed|worked)_(at|for|by|with)_|former_.+_employee$)'
  loop
    raise notice 'merging % (%)', q.key, q.label;
    -- A wording already pointing at the general question stays as it is.
    update question_aliases set question_id = general, skill_id = null, confirmed = false
      where question_id = q.id;
    update application_questions aq set question_id = general
      from applications a
      where aq.application_id = a.id and aq.question_id = q.id and a.status in ('queued', 'needs_input', 'manual', 'approved');
    delete from questions where id = q.id;
  end loop;
end $$;
