-- An offer can come straight after applying (no separate interview step on the board).
insert into application_status_transitions (from_status, to_status) values ('submitted', 'offer')
on conflict do nothing;
