-- Shared fixtures, COMMITTED: every later file starts from this state and
-- rolls back its own changes (except 08, which needs real concurrent sessions).
--
-- Events (dates relative to "today" in Europe/Rome):
--   ...0001 Future Night  published  today+7   entries 0011 Ridotto quota 1
--                                                      0012 Intero  unlimited
--                                                      0013 Early   valid_until in the past
--   ...0002 Past Night    published  today-3   entry   0021
--   ...0003 Draft Night   draft      today+10  entry   0031
--   ...0004 Race Night    published  today+14  entries 0041 quota 1, 0042 unlimited
--   ...0005 Later Night   published  today+21  entry   0051 unlimited

create schema test;
grant usage on schema test to public;

create function test.today() returns date
language sql stable
as $$ select (now() at time zone 'Europe/Rome')::date $$;

-- A contact with a ready session, without going through the email link.
-- Runs with the caller's rights (service_role in the tests).
create function test.new_session(p_email text, p_name text default 'Test Person')
returns text
language plpgsql
as $$
declare
  v_id  uuid;
  v_tok text := 'sess-' || p_email || '-' || gen_random_uuid();
begin
  insert into underclub.contacts (email, full_name, date_of_birth)
  values (p_email, p_name, '1990-01-01')
  on conflict (email) do nothing;
  select id into v_id from underclub.contacts where email = p_email;
  insert into underclub.contact_sessions (contact_id, token_hash, expires_at)
  values (v_id, underclub.hash_ticket_token(v_tok), now() + interval '1 day');
  return v_tok;
end;
$$;

-- The endpoint's TICKET_SECRET (>= 32 chars), and a second one to prove the
-- derived ticket token depends on it. Test values only.
create function test.secret() returns text
language sql immutable
as $$ select 'test-ticket-secret-0123456789abcdef-0001' $$;

create function test.other_secret() returns text
language sql immutable
as $$ select 'test-ticket-secret-0123456789abcdef-0002' $$;

-- Push a contact's activation links out of the per-address rate-limit window
-- (only their creation time; validity untouched), so a test can issue more.
create function test.age_tokens(p_email text)
returns void
language sql
as $$
  update underclub.activation_tokens t
     set created_at = t.created_at - interval '2 days'
    from underclub.contacts c
   where c.id = t.contact_id and c.email = p_email;
$$;

grant execute on all functions in schema test to public;

insert into underclub.events (id, title, date, time, status) values
  ('10000000-0000-0000-0000-000000000001', 'Future Night', test.today() + 7,  '23:00', 'published'),
  ('10000000-0000-0000-0000-000000000002', 'Past Night',   test.today() - 3,  '23:00', 'published'),
  ('10000000-0000-0000-0000-000000000003', 'Draft Night',  test.today() + 10, '23:00', 'draft'),
  ('10000000-0000-0000-0000-000000000004', 'Race Night',   test.today() + 14, '22:30', 'published'),
  ('10000000-0000-0000-0000-000000000005', 'Later Night',  test.today() + 21, '23:30', 'published');

insert into underclub.event_entries (id, event_id, name, quota, price, valid_until, sort_order) values
  ('20000000-0000-0000-0000-000000000011', '10000000-0000-0000-0000-000000000001', 'Ridotto', 1,    10, null, 1),
  ('20000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000001', 'Intero',  null, 15, null, 2),
  ('20000000-0000-0000-0000-000000000013', '10000000-0000-0000-0000-000000000001', 'Early',   null, 5,  now() - interval '1 hour', 3),
  ('20000000-0000-0000-0000-000000000021', '10000000-0000-0000-0000-000000000002', 'Past entry',  null, 10, null, 1),
  ('20000000-0000-0000-0000-000000000031', '10000000-0000-0000-0000-000000000003', 'Draft entry', null, 10, null, 1),
  ('20000000-0000-0000-0000-000000000041', '10000000-0000-0000-0000-000000000004', 'Race one',    1,    10, null, 1),
  ('20000000-0000-0000-0000-000000000042', '10000000-0000-0000-0000-000000000004', 'Race open',   null, 10, null, 2),
  ('20000000-0000-0000-0000-000000000051', '10000000-0000-0000-0000-000000000005', 'Later entry', null, 12, '2099-01-01', 1);

do $$
begin
  assert (select count(*) from underclub.events) = 5, 'fixture events';
  assert (select count(*) from underclub.event_entries) = 8, 'fixture entries';
end $$;
