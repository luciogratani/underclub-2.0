-- ep_cleanup: deletes exactly the stale rows and nothing else. Runs after
-- 08 (whose committed rows are all fresh, hence never eligible), so the
-- counts below are exact.

begin;
set local role service_role;

do $$
declare
  E      constant uuid := '10000000-0000-0000-0000-000000000001';
  E_LATE constant uuid := '10000000-0000-0000-0000-000000000005';
  N_UNL  constant uuid := '20000000-0000-0000-0000-000000000012';
  N_LATE constant uuid := '20000000-0000-0000-0000-000000000051';
  c_keep  uuid;
  c_g1    uuid;
  c_g2    uuid;
  c_young uuid;
  c_ver   uuid;
  c_conf  uuid;
  c_live  uuid;
  r_g1p   uuid;
  r_g1c   uuid;
  r_conf_c uuid;
  b   record;
  v   jsonb;
begin
  -- Contacts.
  insert into underclub.contacts (email, full_name, date_of_birth, verified_at, created_at) values
    ('keep@example.com',  'Keep',  '1990-01-01', now() - interval '60 days', now() - interval '60 days')
    returning id into c_keep;
  insert into underclub.contacts (email, full_name, date_of_birth, created_at)
    values ('ghost1@example.com', 'Ghost One', '1990-01-01', now() - interval '8 days') returning id into c_g1;
  insert into underclub.contacts (email, full_name, date_of_birth, created_at)
    values ('ghost2@example.com', 'Ghost Two', '1990-01-01', now() - interval '8 days') returning id into c_g2;
  insert into underclub.contacts (email, full_name, date_of_birth, created_at)
    values ('young@example.com', 'Young', '1990-01-01', now() - interval '6 days') returning id into c_young;
  insert into underclub.contacts (email, full_name, date_of_birth, verified_at, created_at)
    values ('verified@example.com', 'Verified', '1990-01-01', now() - interval '20 days', now() - interval '30 days')
    returning id into c_ver;
  insert into underclub.contacts (email, full_name, date_of_birth, created_at)
    values ('confirmed@example.com', 'Confirmed', '1990-01-01', now() - interval '8 days') returning id into c_conf;

  -- ghost1: a stale pending and a cancelled booking, plus an expired link
  -- (expired 1h ago: not purged directly, it goes with the contact).
  insert into underclub.reservations (event_id, entry_id, contact_id, full_name, date_of_birth, email, status, pending_expires_at)
    values (E, N_UNL, c_g1, 'Ghost One', '1990-01-01', 'ghost1@example.com', 'pending', now() - interval '8 days')
    returning id into r_g1p;
  insert into underclub.reservations (event_id, entry_id, contact_id, full_name, date_of_birth, email, status, cancelled_at)
    values (E_LATE, N_LATE, c_g1, 'Ghost One', '1990-01-01', 'ghost1@example.com', 'cancelled', now())
    returning id into r_g1c;
  insert into underclub.activation_tokens (contact_id, reservation_id, token_hash, expires_at, created_at)
    values (c_g1, r_g1p, 'cl-g1', now() - interval '1 hour', now() - interval '2 hours');

  -- verified: an old cancelled booking, kept with its contact.
  insert into underclub.reservations (event_id, entry_id, contact_id, full_name, date_of_birth, email, status, cancelled_at)
    values (E, N_UNL, c_ver, 'Verified', '1990-01-01', 'verified@example.com', 'cancelled', now());

  -- never verified but holds a confirmed booking (e.g. recovered legacy):
  -- kept, and so is its cancelled row.
  insert into underclub.reservations (event_id, entry_id, contact_id, full_name, date_of_birth, email, status, confirmed_at)
    values (E, N_UNL, c_conf, 'Confirmed', '1990-01-01', 'confirmed@example.com', 'confirmed', now());
  insert into underclub.reservations (event_id, entry_id, contact_id, full_name, date_of_birth, email, status, cancelled_at)
    values (E_LATE, N_LATE, c_conf, 'Confirmed', '1990-01-01', 'confirmed@example.com', 'cancelled', now())
    returning id into r_conf_c;

  -- never verified, old, but booking right now (live link): kept.
  select * into b from underclub.ep_request_booking(
    null, E, N_UNL, 'Live Link', '1990-01-01', 'livelink@example.com', null, null, null, test.secret());
  select id into c_live from underclub.contacts where email = 'livelink@example.com';
  update underclub.contacts set created_at = now() - interval '8 days' where id = c_live;

  -- Activation tokens of the verified contact.
  insert into underclub.activation_tokens (contact_id, token_hash, expires_at, used_at, created_at) values
    (c_keep, 'cl-old-used',   now() - interval '2 days',  now() - interval '2 days', now() - interval '2 days'),
    (c_keep, 'cl-old-unused', now() - interval '25 hours', null,                     now() - interval '26 hours'),
    (c_keep, 'cl-recent-exp', now() - interval '23 hours', null,                     now() - interval '24 hours'),
    (c_keep, 'cl-live',       now() + interval '10 minutes', null,                   now());

  -- Sessions of the verified contact.
  insert into underclub.contact_sessions (contact_id, token_hash, expires_at, revoked_at) values
    (c_keep, 'cs-revoked-31', now() + interval '6 months', now() - interval '31 days'),
    (c_keep, 'cs-revoked-29', now() + interval '6 months', now() - interval '29 days'),
    (c_keep, 'cs-expired-31', now() - interval '31 days',  null),
    (c_keep, 'cs-expired-1',  now() - interval '1 day',    null),
    (c_keep, 'cs-live',       now() + interval '6 months', null);

  -- Throttle windows.
  insert into underclub.request_throttle (key_hash, action, window_start, hits) values
    ('cl-ip', 'booking', now() - interval '2 days', 5),
    ('cl-ip', 'booking', now() - interval '1 hour', 5);

  v := underclub.ep_cleanup();
  assert v = jsonb_build_object(
    'activation_tokens', 2, 'contact_sessions', 2, 'request_throttle', 1,
    'reservations', 2, 'contacts', 2), format('cleanup counts %s', v);

  -- What went.
  assert not exists (select 1 from underclub.activation_tokens where token_hash in ('cl-old-used', 'cl-old-unused')), 'old links gone';
  assert not exists (select 1 from underclub.contact_sessions where token_hash in ('cs-revoked-31', 'cs-expired-31')), 'dead sessions gone';
  assert not exists (select 1 from underclub.request_throttle where key_hash = 'cl-ip' and window_start < now() - interval '1 day'), 'old window gone';
  assert not exists (select 1 from underclub.contacts where id in (c_g1, c_g2)), 'ghosts gone';
  assert not exists (select 1 from underclub.reservations where id in (r_g1p, r_g1c)), 'ghost bookings gone';
  assert not exists (select 1 from underclub.activation_tokens where token_hash = 'cl-g1'), 'ghost link gone by cascade';

  -- What stayed.
  assert (select count(*) from underclub.activation_tokens where token_hash in ('cl-recent-exp', 'cl-live')) = 2, 'recent links kept';
  assert (select count(*) from underclub.contact_sessions where token_hash in ('cs-revoked-29', 'cs-expired-1', 'cs-live')) = 3, 'recent sessions kept';
  assert (select count(*) from underclub.request_throttle where key_hash = 'cl-ip') = 1, 'current window kept';
  assert (select count(*) from underclub.contacts where id in (c_keep, c_young, c_ver, c_conf, c_live)) = 5, 'other contacts kept';
  assert exists (select 1 from underclub.reservations where id = r_conf_c), 'cancelled row of a kept contact kept';
  assert (select count(*) from underclub.reservations where contact_id = c_ver) = 1, 'verified contact''s row kept';
  assert exists (select 1 from underclub.reservations where id = b.reservation_id and status = 'pending'), 'live pending kept';

  -- Idempotent.
  v := underclub.ep_cleanup();
  assert v = jsonb_build_object(
    'activation_tokens', 0, 'contact_sessions', 0, 'request_throttle', 0,
    'reservations', 0, 'contacts', 0), format('second run %s', v);
end $$;

rollback;

-- A contact whose address is locked by a running request is skipped (try
-- lock), and purged by the next run once the lock is gone. Committed data:
-- this needs a second real session; removed at the end.
insert into underclub.contacts (email, full_name, date_of_birth, created_at)
values ('ghostlock@example.com', 'Ghost Lock', '1990-01-01', now() - interval '8 days');

select set_config('test.dsn', :'dsn', false) is not null as dsn_set \gset

do $$
declare
  v jsonb;
begin
  perform extensions.dblink_connect('cl', current_setting('test.dsn'));
  perform extensions.dblink_exec('cl', 'begin');
  perform * from extensions.dblink('cl',
    $q$select pg_advisory_xact_lock(hashtext('underclub.contact'), hashtext('ghostlock@example.com'))::text$q$)
    as t(x text);

  v := underclub.ep_cleanup();
  assert (v ->> 'contacts')::int = 0, format('locked address skipped: %s', v);
  assert exists (select 1 from underclub.contacts where email = 'ghostlock@example.com'), 'still there';

  perform extensions.dblink_exec('cl', 'commit');
  perform extensions.dblink_disconnect('cl');
end $$;

do $$
declare
  v jsonb;
begin
  v := underclub.ep_cleanup();
  assert (v ->> 'contacts')::int = 1, format('purged once unlocked: %s', v);
  assert not exists (select 1 from underclub.contacts where email = 'ghostlock@example.com'), 'gone';
end $$;
