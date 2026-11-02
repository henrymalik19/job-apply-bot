-- "Try the runner again": a handed-back application goes back to approved so the
-- apply runner picks it up (the app only offers this after a runner hand-back).
insert into application_status_transitions (from_status, to_status) values ('manual', 'approved')
on conflict do nothing;
