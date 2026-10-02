-- Underclub 2.0 — RLS History
-- Version: 2026-10-02 (night end + online booking close)
--
-- Purpose (decided with Lucio on 2026-10-02):
--   1) Night end. A night is "on" until 06:00 (Europe/Rome) of the day AFTER
--      its date, everywhere: home, my bookings, ticket button, cancellation,
--      ticket page. Before this file everything flipped at midnight, i.e. half
--      an hour before the doors open (00:30). One rule: `event_ends_at(date)`.
--   2) Online booking close, per night: `events.booking_closes_at`; null means
--      the default, 18:00 (Europe/Rome) of the night's date. Meant to be set
--      between 00:00 of the day before and the night end; NOT enforced by a
--      constraint (decided), but a later value is capped at the night end.
--      One rule: `event_booking_deadline(date, booking_closes_at)`.
--      A pending booking requested before the close is still confirmed by its
--      activation link afterwards (30-minute link, never past the night end).
--   3) PostgREST computed fields on `events` for the public site, so the
--      browser never does date maths: `ends_at`, `booking_deadline`, `is_over`.
--   4) `open_public_ticket` gains `event_ended`: the ticket page shows an
--      "expired" notice instead of the QR once the night is over.
--
-- Run AFTER 2026-10-02-booking-endpoints.sql. Re-runnable: `if not exists`,
-- `create or replace`, drop-then-create for `open_public_ticket` (return type
-- changed). Backward compatible with the web app released before it: the
-- replaced functions keep their signatures and outcomes, and the ticket RPC
-- only gains a column. Apply it BEFORE releasing the web app that reads the
-- computed fields.
--
-- The `ep_*` functions and `adopt_legacy_contact` below are the 2026-10-02
-- text with only the date conditions changed (grants are kept by
-- `create or replace`).

-- ---------------------------------------------------------------------------
-- 1) Column
-- ---------------------------------------------------------------------------

-- When online booking closes for this night. Null = default (18:00 Rome of
-- the night's date). Set in SQL for now, later from the admin.
alter table underclub.events
  add column if not exists booking_closes_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2) The two rules
-- ---------------------------------------------------------------------------

-- End of the night dated p_date: 06:00 Europe/Rome of the next day. DST-safe
-- (the wall-clock time is converted, not an interval added to an instant).
create or replace function underclub.event_ends_at(p_date date)
returns timestamptz
language sql
stable
set search_path = underclub, public, extensions
as $$
  select ((p_date + 1) + time '06:00') at time zone 'Europe/Rome'
$$;

-- When online booking closes for the night dated p_date: p_closes_at, or
-- 18:00 Europe/Rome of p_date when null; never later than the night end.
create or replace function underclub.event_booking_deadline(p_date date, p_closes_at timestamptz)
returns timestamptz
language sql
stable
set search_path = underclub, public, extensions
as $$
  select least(
    coalesce(p_closes_at, (p_date + time '18:00') at time zone 'Europe/Rome'),
    underclub.event_ends_at(p_date))
$$;

-- ---------------------------------------------------------------------------
-- 3) Computed fields (PostgREST): `select=*,ends_at,booking_deadline` and
--    filters like `is_over=is.false` on /events. Read-only, no secrets: the
--    row itself is already filtered by the events RLS.
-- ---------------------------------------------------------------------------

create or replace function underclub.ends_at(e underclub.events)
returns timestamptz
language sql
stable
set search_path = underclub, public, extensions
as $$ select underclub.event_ends_at(e.date) $$;

create or replace function underclub.booking_deadline(e underclub.events)
returns timestamptz
language sql
stable
set search_path = underclub, public, extensions
as $$ select underclub.event_booking_deadline(e.date, e.booking_closes_at) $$;

create or replace function underclub.is_over(e underclub.events)
returns boolean
language sql
stable
set search_path = underclub, public, extensions
as $$ select now() >= underclub.event_ends_at(e.date) $$;

revoke all on function underclub.event_ends_at(date)                       from public;
revoke all on function underclub.event_booking_deadline(date, timestamptz) from public;
revoke all on function underclub.ends_at(underclub.events)                 from public;
revoke all on function underclub.booking_deadline(underclub.events)        from public;
revoke all on function underclub.is_over(underclub.events)                 from public;
grant execute on function underclub.event_ends_at(date)                       to anon, authenticated, service_role;
grant execute on function underclub.event_booking_deadline(date, timestamptz) to anon, authenticated, service_role;
grant execute on function underclub.ends_at(underclub.events)                 to anon, authenticated, service_role;
grant execute on function underclub.booking_deadline(underclub.events)        to anon, authenticated, service_role;
grant execute on function underclub.is_over(underclub.events)                 to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) adopt_legacy_contact — legacy bookings of nights not over yet
-- ---------------------------------------------------------------------------

create or replace function underclub.adopt_legacy_contact(p_email text)
returns uuid
language plpgsql
security definer
set search_path = underclub, public, extensions
as $$
declare
  v_id   uuid;
  v_name text;
  v_dob  date;
begin
  if p_email is null or p_email <> lower(btrim(p_email)) or position('@' in p_email) <= 1 then
    return null;
  end if;

  perform underclub.lock_contact(p_email);

  select c.id into v_id from underclub.contacts c where c.email = p_email;
  if v_id is not null then
    return v_id;
  end if;

  select btrim(x.j ->> 'full_name'), (x.j ->> 'date_of_birth')::date
    into v_name, v_dob
    from underclub.reservations r
    join underclub.events e on e.id = r.event_id
    cross join lateral (select to_jsonb(r) as j) x
   where r.contact_id is null
     and r.status = 'confirmed'
     and underclub.event_ends_at(e.date) > now()
     and lower(btrim(x.j ->> 'email')) = p_email
     and nullif(btrim(x.j ->> 'full_name'), '') is not null
     and x.j ->> 'date_of_birth' is not null
   order by r.created_at desc
   limit 1;

  if v_name is null then
    return null;
  end if;

  insert into underclub.contacts (email, full_name, date_of_birth)
  values (p_email, v_name, v_dob)
  returning id into v_id;

  -- All contact-less rows of the address, any status or date. The legacy
  -- unique index is on the RAW email, so 'A@x.it' and 'a@x.it' may both be
  -- active on one event; the contact index allows one, so only the latest
  -- active row per event is linked (cancelled rows never collide).
  update underclub.reservations r
     set contact_id = v_id
   where r.contact_id is null
     and lower(btrim(to_jsonb(r) ->> 'email')) = p_email
     and (r.status = 'cancelled'
          or r.id in (
            select distinct on (x.event_id) x.id
              from underclub.reservations x
             where x.contact_id is null
               and x.status <> 'cancelled'
               and lower(btrim(to_jsonb(x) ->> 'email')) = p_email
             order by x.event_id, x.created_at desc));

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) ep_request_booking — refused (`not_bookable`) from the booking deadline on
-- ---------------------------------------------------------------------------

create or replace function underclub.ep_request_booking(
  p_session_token text,
  p_event_id uuid,
  p_entry_id uuid,
  p_full_name text,
  p_date_of_birth date,
  p_email text,
  p_consent_marketing boolean,
  p_consent_profiling boolean,
  p_source text,
  p_ticket_secret text
)
returns table (
  outcome           text,
  reservation_id    uuid,
  ticket_token      text,
  activation_token  text,
  contact_email     text,
  contact_full_name text,
  event_title       text,
  event_date        date,
  event_time        time,
  entry_name        text
)
language plpgsql
security definer
set search_path = underclub, public, extensions
as $$
#variable_conflict use_column
declare
  v_deadline      timestamptz;
  v_event_found   boolean;
  v_event_status  text;
  v_event_title   text;
  v_event_date    date;
  v_event_time    time;
  v_entry_found   boolean;
  v_entry_name    text;
  v_entry_quota   int;
  v_has_session   boolean := false;
  v_contact_id    uuid;
  v_contact_email text;
  v_contact_name  text;
  v_contact_dob   date;
  v_email         text := lower(btrim(p_email));
  v_name          text := btrim(p_full_name);
  v_source        text;
  v_res_id        uuid;
  v_ticket        text;
  v_activation    text;
begin
  -- 0. Configuration error, not an outcome.
  perform underclub.require_ticket_secret(p_ticket_secret);

  -- 1. Event and entry. Looked up first so their labels are returned even
  --    when the answer is a refusal.
  select true, e.status, e.title, e.date, e.time,
         underclub.event_booking_deadline(e.date, e.booking_closes_at)
    into v_event_found, v_event_status, v_event_title, v_event_date, v_event_time, v_deadline
    from underclub.events e
   where e.id = p_event_id;

  select true, ee.name, ee.quota
    into v_entry_found, v_entry_name, v_entry_quota
    from underclub.event_entries ee
   where ee.id = p_entry_id
     and ee.event_id = p_event_id;

  if v_event_found is null or v_event_status <> 'published' or now() >= v_deadline then
    return query select 'not_bookable'::text, null::uuid, null::text, null::text,
      null::text, null::text, v_event_title, v_event_date, v_event_time, v_entry_name;
    return;
  end if;

  if v_entry_found is null then
    return query select 'invalid_entry'::text, null::uuid, null::text, null::text,
      null::text, null::text, v_event_title, v_event_date, v_event_time, null::text;
    return;
  end if;

  -- 2. Who is booking: the session if valid, otherwise the form.
  v_contact_id := (underclub.renew_contact_session(p_session_token)).contact_id;
  v_has_session := v_contact_id is not null;

  if not v_has_session then
    -- Same shape the contacts CHECKs enforce, answered as `invalid_input`
    -- instead of a constraint error.
    if v_name is null or v_name = ''
       or p_date_of_birth is null
       or v_email is null or position('@' in v_email) <= 1 then
      return query select 'invalid_input'::text, null::uuid, null::text, null::text,
        null::text, null::text, v_event_title, v_event_date, v_event_time, v_entry_name;
      return;
    end if;
    v_contact_email := v_email;
  else
    select c.email into v_contact_email from underclub.contacts c where c.id = v_contact_id;
  end if;

  -- Lock order everywhere: person+event, then contact, then entry.
  perform underclub.lock_booking(v_contact_email, p_event_id);
  if not v_has_session then
    -- The form path may create the contact and issues links: both must be
    -- exact against requests for the same address on OTHER events and
    -- against log-in requests.
    perform underclub.lock_contact(v_contact_email);
  end if;

  -- Without a session the contact may not exist yet; it is created only once
  -- the request is known to lead somewhere (below), never on a refusal.
  select c.id, c.full_name, c.date_of_birth
    into v_contact_id, v_contact_name, v_contact_dob
    from underclub.contacts c
   where c.email = v_contact_email;

  -- 2b. Per-address cap on activation links (tunables at the top). Checked
  --     under the locks so the count is exact; nothing is written or issued.
  if not v_has_session and v_contact_id is not null
     and underclub.activation_rate_limited(v_contact_id) then
    return query select 'rate_limited'::text, null::uuid, null::text, null::text,
      v_contact_email, v_contact_name, v_event_title, v_event_date, v_event_time, v_entry_name;
    return;
  end if;

  -- Keep the source only if it already is a valid slug; never fail on it.
  v_source := case
    when p_source ~ '^[a-z0-9][a-z0-9_-]{0,62}[a-z0-9]$' then p_source
  end;

  -- 3. Already booked? A confirmed row always counts; a live pending counts
  --    only with a session (without one, re-booking refreshes the pending).
  --    Contact-less legacy rows with the same address count too.
  select r.id into v_res_id
    from underclub.reservations r
   where r.event_id = p_event_id
     and (
       (r.contact_id = v_contact_id
         and (r.status = 'confirmed'
              or (v_has_session and r.status = 'pending' and r.pending_expires_at > now())))
       or (r.contact_id is null
           and r.status = 'confirmed'
           and lower(btrim(r.email)) = v_contact_email)
     )
   order by r.created_at
   limit 1;

  if v_res_id is not null then
    if not v_has_session then
      -- "You're already in": the email carries a log-in link instead. A
      -- legacy-only address has no contact yet: recover it from its legacy
      -- bookings (same as ep_request_login), so the link leads to them.
      if v_contact_id is null then
        v_contact_id := underclub.adopt_legacy_contact(v_contact_email);
        if v_contact_id is null then
          -- Defensive only: a confirmed legacy row on a bookable event always
          -- qualifies for recovery.
          insert into underclub.contacts (email, full_name, date_of_birth)
          values (v_contact_email, v_name, p_date_of_birth)
          returning id into v_contact_id;
        end if;
        select c.full_name, c.date_of_birth into v_contact_name, v_contact_dob
          from underclub.contacts c where c.id = v_contact_id;
      end if;
      v_activation := underclub.issue_activation_token(v_contact_id, null, null, null);
    end if;
    return query select 'already_booked'::text, v_res_id, null::text, v_activation,
      v_contact_email, v_contact_name, v_event_title, v_event_date, v_event_time, v_entry_name;
    return;
  end if;

  -- 4. Quota counts confirmed rows only; the entry lock makes count + insert
  --    atomic against other confirmations on the same entry.
  perform pg_advisory_xact_lock(hashtext('underclub.entry_quota'), hashtext(p_entry_id::text));

  if v_entry_quota is not null and (
       select count(*)
         from underclub.reservations r
        where r.entry_id = p_entry_id
          and r.status = 'confirmed'
     ) >= v_entry_quota then
    return query select 'sold_out'::text, null::uuid, null::text, null::text,
      v_contact_email, v_contact_name, v_event_title, v_event_date, v_event_time, v_entry_name;
    return;
  end if;

  -- First booking from this address: create the contact from the form. An
  -- existing contact is never modified here: whoever types an address must
  -- not be able to rename its owner or touch their consents. The contact lock
  -- serializes every creator of this address, so no conflict is expected.
  if v_contact_id is null then
    insert into underclub.contacts (email, full_name, date_of_birth)
    values (v_contact_email, v_name, p_date_of_birth)
    returning id, full_name, date_of_birth into v_contact_id, v_contact_name, v_contact_dob;
  end if;

  -- Any pending row of this contact for this event (live or stale) is reused:
  -- the partial unique index allows only one non-cancelled row per pair.
  select r.id into v_res_id
    from underclub.reservations r
   where r.event_id = p_event_id
     and r.contact_id = v_contact_id
     and r.status = 'pending'
   for update;

  -- Links of a superseded pending must die before a new one is issued. Done
  -- before touching the reservation, the same order ep_activate uses.
  if v_res_id is not null then
    update underclub.activation_tokens t
       set used_at = now()
     where t.reservation_id = v_res_id
       and t.used_at is null;
  end if;

  begin
    if v_has_session then
      -- 5. Confirmed immediately. Legacy NOT NULL columns are filled from the
      --    contact. CLEANUP: drop them from these writes before the column
      --    drop in the 2026-10-01 "NEXT STEP" list.
      if v_res_id is not null then
        -- Only a stale pending can get here (a live one is already_booked).
        update underclub.reservations r
           set entry_id = p_entry_id,
               source = coalesce(v_source, r.source),
               status = 'confirmed',
               confirmed_at = now(),
               pending_expires_at = null
         where r.id = v_res_id;
      else
        insert into underclub.reservations
          (event_id, entry_id, contact_id, full_name, date_of_birth, email,
           status, confirmed_at, source)
        values
          (p_event_id, p_entry_id, v_contact_id, v_contact_name, v_contact_dob, v_contact_email,
           'confirmed', now(), v_source)
        returning id into v_res_id;
      end if;

      v_ticket := underclub.issue_derived_ticket_token(v_res_id, p_ticket_secret);

      return query select 'confirmed'::text, v_res_id, v_ticket, null::text,
        v_contact_email, v_contact_name, v_event_title, v_event_date, v_event_time, v_entry_name;
      return;
    end if;

    -- 6. Pending, no ticket token: the QR exists only after confirmation.
    if v_res_id is not null then
      update underclub.reservations r
         set entry_id = p_entry_id,
             source = coalesce(v_source, r.source),
             pending_expires_at = now() + interval '30 minutes'
       where r.id = v_res_id;
    else
      -- CLEANUP: same legacy columns as above.
      insert into underclub.reservations
        (event_id, entry_id, contact_id, full_name, date_of_birth, email,
         status, pending_expires_at, source)
      values
        (p_event_id, p_entry_id, v_contact_id, v_contact_name, v_contact_dob, v_contact_email,
         'pending', now() + interval '30 minutes', v_source)
      returning id into v_res_id;
    end if;
  exception when unique_violation then
    -- Only reachable through the legacy anon path racing us on the same
    -- address (the advisory lock covers every ep_* writer). The other
    -- booking won: answer as already booked.
    select r.id into v_res_id
      from underclub.reservations r
     where r.event_id = p_event_id
       and r.status <> 'cancelled'
       and (r.contact_id = v_contact_id or lower(btrim(r.email)) = v_contact_email)
     order by r.created_at
     limit 1;
    if not v_has_session then
      v_activation := underclub.issue_activation_token(v_contact_id, null, null, null);
    end if;
    return query select 'already_booked'::text, v_res_id, null::text, v_activation,
      v_contact_email, v_contact_name, v_event_title, v_event_date, v_event_time, v_entry_name;
    return;
  end;

  v_activation := underclub.issue_activation_token(
    v_contact_id, v_res_id, p_consent_marketing, p_consent_profiling);

  return query select 'pending'::text, v_res_id, null::text, v_activation,
    v_contact_email, v_contact_name, v_event_title, v_event_date, v_event_time, v_entry_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6) ep_activate — confirms a live pending until the night is over
-- ---------------------------------------------------------------------------

create or replace function underclub.ep_activate(p_token text, p_ticket_secret text)
returns table (
  outcome            text,
  reservation_outcome text,
  session_token      text,
  contact_id         uuid,
  reservation_id     uuid,
  ticket_token       text,
  contact_email      text,
  contact_full_name  text
)
language plpgsql
security definer
set search_path = underclub, public, extensions
as $$
#variable_conflict use_column
declare
  v_hash        text;
  v_token_id    uuid;
  v_contact_id  uuid;
  v_res_id      uuid;
  v_expires     timestamptz;
  v_used        timestamptz;
  v_consent_m   boolean;
  v_consent_p   boolean;
  v_event_id    uuid;
  v_res_status  text;
  v_res_stale   boolean;
  v_res_outcome text := 'none';
  v_session     text;
  v_ticket      text;
  v_email       text;
  v_name        text;
begin
  perform underclub.require_ticket_secret(p_ticket_secret);

  if p_token is null or btrim(p_token) = '' then
    return query select 'invalid'::text, null::text, null::text, null::uuid,
      null::uuid, null::text, null::text, null::text;
    return;
  end if;

  v_hash := underclub.hash_ticket_token(p_token);

  -- Peek without consuming: an expired link must stay distinguishable from a
  -- used one, and the contact/event are needed to take the lock.
  select t.id, t.contact_id, t.reservation_id, t.expires_at, t.used_at
    into v_token_id, v_contact_id, v_res_id, v_expires, v_used
    from underclub.activation_tokens t
   where t.token_hash = v_hash;

  if v_token_id is null or v_used is not null then
    return query select 'invalid'::text, null::text, null::text, null::uuid,
      null::uuid, null::text, null::text, null::text;
    return;
  end if;

  if v_expires <= now() then
    return query select 'expired'::text, null::text, null::text, null::uuid,
      null::uuid, null::text, null::text, null::text;
    return;
  end if;

  if v_res_id is not null then
    select r.event_id into v_event_id from underclub.reservations r where r.id = v_res_id;
    if v_event_id is not null then
      -- Same lock as ep_request_booking: a re-booking that burns this link
      -- and this activation cannot interleave.
      perform underclub.lock_booking(
        (select c.email from underclub.contacts c where c.id = v_contact_id), v_event_id);
    end if;
  end if;

  -- Atomic consumption: of two concurrent openings exactly one gets the row.
  update underclub.activation_tokens t
     set used_at = now()
   where t.id = v_token_id
     and t.used_at is null
     and t.expires_at > now()
  returning t.consent_marketing, t.consent_profiling
       into v_consent_m, v_consent_p;

  if not found then
    -- Lost the race, or burned by a re-booking while we waited on the lock.
    return query select 'invalid'::text, null::text, null::text, null::uuid,
      null::uuid, null::text, null::text, null::text;
    return;
  end if;

  -- A consent is (re)granted only if not currently active; false/null never
  -- revokes (revocation has its own path).
  update underclub.contacts c
     set verified_at = coalesce(c.verified_at, now()),
         marketing_consent_at = case
           when v_consent_m is true
            and not (c.marketing_consent_at is not null
                     and (c.marketing_consent_revoked_at is null
                          or c.marketing_consent_revoked_at < c.marketing_consent_at))
           then now() else c.marketing_consent_at end,
         marketing_consent_revoked_at = case
           when v_consent_m is true
            and not (c.marketing_consent_at is not null
                     and (c.marketing_consent_revoked_at is null
                          or c.marketing_consent_revoked_at < c.marketing_consent_at))
           then null else c.marketing_consent_revoked_at end,
         profiling_consent_at = case
           when v_consent_p is true
            and not (c.profiling_consent_at is not null
                     and (c.profiling_consent_revoked_at is null
                          or c.profiling_consent_revoked_at < c.profiling_consent_at))
           then now() else c.profiling_consent_at end,
         profiling_consent_revoked_at = case
           when v_consent_p is true
            and not (c.profiling_consent_at is not null
                     and (c.profiling_consent_revoked_at is null
                          or c.profiling_consent_revoked_at < c.profiling_consent_at))
           then null else c.profiling_consent_revoked_at end
   where c.id = v_contact_id
  returning c.email, c.full_name into v_email, v_name;

  v_session := underclub.new_opaque_token();
  insert into underclub.contact_sessions (contact_id, token_hash, expires_at)
  values (v_contact_id, underclub.hash_ticket_token(v_session), now() + interval '12 months');

  if v_res_id is not null then
    -- Only the reservation this link was issued for, only if still a live
    -- pending of this same contact, and only while its event is published
    -- and not over (unpublished or over since the booking → `unavailable`).
    -- The booking deadline is NOT checked: the request came before it.
    update underclub.reservations r
       set status = 'confirmed',
           confirmed_at = now(),
           pending_expires_at = null
     where r.id = v_res_id
       and r.contact_id = v_contact_id
       and r.status = 'pending'
       and r.pending_expires_at > now()
       and exists (
         select 1 from underclub.events e
          where e.id = r.event_id
            and e.status = 'published'
            and underclub.event_ends_at(e.date) > now()
       );

    if found then
      v_ticket := underclub.issue_derived_ticket_token(v_res_id, p_ticket_secret);
      v_res_outcome := 'confirmed';
    else
      -- A stale pending stays pending: booking again sends a fresh link. A
      -- live pending whose event is no longer bookable is `unavailable`.
      select r.status, r.pending_expires_at <= now()
        into v_res_status, v_res_stale
        from underclub.reservations r where r.id = v_res_id;
      v_res_outcome := case when v_res_status = 'pending' and v_res_stale then 'expired' else 'unavailable' end;
    end if;
  end if;

  return query select 'ok'::text, v_res_outcome, v_session, v_contact_id,
    v_res_id, v_ticket, v_email, v_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) ep_session_overview — reservations of nights not over yet
-- ---------------------------------------------------------------------------

create or replace function underclub.ep_session_overview(p_token text, p_ticket_secret text)
returns jsonb
language plpgsql
security definer
set search_path = underclub, public, extensions
as $$
declare
  v_session      record;
  v_contact      jsonb;
  v_reservations jsonb;
begin
  perform underclub.require_ticket_secret(p_ticket_secret);

  v_session := underclub.renew_contact_session(p_token);
  if v_session.contact_id is null then
    return null;
  end if;

  select jsonb_build_object(
           'email',              c.email,
           'full_name',          c.full_name,
           'marketing_consent',  (c.marketing_consent_at is not null
                                   and (c.marketing_consent_revoked_at is null
                                        or c.marketing_consent_revoked_at < c.marketing_consent_at)),
           'profiling_consent',  (c.profiling_consent_at is not null
                                   and (c.profiling_consent_revoked_at is null
                                        or c.profiling_consent_revoked_at < c.profiling_consent_at)),
           'session_expires_at', v_session.expires_at)
    into v_contact
    from underclub.contacts c
   where c.id = v_session.contact_id;

  if v_contact is null then
    return null;
  end if;

  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'reservation_id',    r.id,
               'status',            r.status,
               'event_id',          e.id,
               'event_title',       e.title,
               'event_date',        e.date,
               'event_time',        e.time,
               'entry_name',        ee.name,
               'entry_price',       ee.price,
               'entry_valid_until', ee.valid_until,
               'qr_scanned_at',     r.qr_scanned_at,
               'created_at',        r.created_at,
               'ticket_token',      case
                                      when r.status = 'confirmed'
                                       and r.ticket_access_token_hash = underclub.hash_ticket_token(d.token)
                                      then d.token
                                    end)
             order by e.date, e.time, r.created_at),
           '[]'::jsonb)
    into v_reservations
    from underclub.reservations r
    join underclub.events e         on e.id = r.event_id
    join underclub.event_entries ee on ee.id = r.entry_id
    cross join lateral (select underclub.derive_ticket_token(r.id, p_ticket_secret) as token) d
   where r.contact_id = v_session.contact_id
     and underclub.event_ends_at(e.date) > now()
     and (r.status = 'confirmed'
          or (r.status = 'pending' and r.pending_expires_at > now()));

  return jsonb_build_object('contact', v_contact, 'reservations', v_reservations);
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) ep_cancel_reservation — cancellable until the night is over
-- ---------------------------------------------------------------------------

create or replace function underclub.ep_cancel_reservation(p_token text, p_reservation_id uuid)
returns text
language plpgsql
security definer
set search_path = underclub, public, extensions
as $$
declare
  v_contact_id uuid;
  v_status     text;
  v_scanned    timestamptz;
  v_event_date date;
begin
  v_contact_id := (underclub.renew_contact_session(p_token)).contact_id;
  if v_contact_id is null then
    return 'invalid_session';
  end if;

  -- Someone else's reservation answers exactly like a missing one.
  select r.status, r.qr_scanned_at, e.date
    into v_status, v_scanned, v_event_date
    from underclub.reservations r
    join underclub.events e on e.id = r.event_id
   where r.id = p_reservation_id
     and r.contact_id = v_contact_id;

  if v_status is null then
    return 'not_found';
  end if;

  if v_status = 'cancelled'
     or v_scanned is not null
     or now() >= underclub.event_ends_at(v_event_date) then
    return 'not_cancellable';
  end if;

  -- Re-checked in the write itself: a scan or a concurrent cancel landing
  -- between the read and here makes it a no-op.
  update underclub.reservations r
     set status = 'cancelled',
         cancelled_at = now(),
         pending_expires_at = null
   where r.id = p_reservation_id
     and r.contact_id = v_contact_id
     and r.status <> 'cancelled'
     and r.qr_scanned_at is null;

  if not found then
    return 'not_cancellable';
  end if;
  return 'ok';
end;
$$;

-- ---------------------------------------------------------------------------
-- 9) open_public_ticket — gains `event_ended`
-- ---------------------------------------------------------------------------
-- Same as 2026-10-02 plus `event_ended` (the night is over: the page shows an
-- expired notice, not the QR). An ended ticket is no longer marked opened.
-- Return type changed: drop and recreate, then restore the grants.

drop function if exists underclub.open_public_ticket(uuid, text);

create function underclub.open_public_ticket(p_reservation_id uuid, p_token text)
returns table (
  reservation_id   uuid,
  status           text,
  full_name        text,
  email            text,
  event_title      text,
  event_date       date,
  entry_name       text,
  ticket_opened_at timestamptz,
  qr_scanned_at    timestamptz,
  event_ended      boolean
)
language plpgsql
security definer
volatile
set search_path = underclub, public, extensions
as $$
#variable_conflict use_column
declare
  v_row record;
begin
  select r.id,
         r.status,
         coalesce(c.full_name, to_jsonb(r) ->> 'full_name') as full_name,
         coalesce(c.email,     to_jsonb(r) ->> 'email')     as email,
         e.title as event_title,
         e.date  as event_date,
         ee.name as entry_name,
         r.ticket_opened_at,
         r.qr_scanned_at,
         now() >= underclub.event_ends_at(e.date) as event_ended
    into v_row
    from underclub.reservations r
    join underclub.events e         on e.id = r.event_id
    join underclub.event_entries ee on ee.id = r.entry_id
    left join underclub.contacts c  on c.id = r.contact_id
   where r.id = p_reservation_id
     and r.ticket_access_token_hash is not null
     and r.ticket_access_token_hash = underclub.hash_ticket_token(p_token)
     for update of r;

  if v_row.id is null then
    return;
  end if;

  if v_row.status = 'confirmed' and v_row.qr_scanned_at is null and v_row.ticket_opened_at is null
     and not v_row.event_ended then
    update underclub.reservations r
       set ticket_opened_at = now()
     where r.id = v_row.id;
  end if;

  return query select v_row.id, v_row.status, v_row.full_name, v_row.email,
    v_row.event_title, v_row.event_date, v_row.entry_name,
    v_row.ticket_opened_at, v_row.qr_scanned_at, v_row.event_ended;
end;
$$;

revoke all on function underclub.open_public_ticket(uuid, text) from public;
grant execute on function underclub.open_public_ticket(uuid, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
--   select underclub.event_ends_at('2026-10-24');            -- 2026-10-25 05:00:00+00 (CET)
--   select underclub.event_booking_deadline('2026-10-24', null); -- 2026-10-24 16:00:00+00
--   select id, title, date, booking_closes_at from underclub.events order by date;
--
-- Full behavioural suite: supabase/tests/run.sh (throwaway local cluster).

-- PostgREST: pick up the new column and computed fields now.
notify pgrst, 'reload schema';
