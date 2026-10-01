/**
 * End-to-end flow of the handlers against a real Postgres with the whole
 * migration chain (supabase/tests/run.sh --keep prints TEST_PG_URL):
 *
 *   TEST_PG_URL=postgres://postgres@127.0.0.1:55432/postgres pnpm --filter web test
 *
 * Skipped when TEST_PG_URL is not set. Never point it at a real Supabase.
 */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPgRpc, type PgRpc } from './rpc-pg.js';
import { createCapturingTransport } from './email.js';
import { handleBooking } from './handlers/booking.js';
import { handleActivate } from './handlers/activate.js';
import { handleSession } from './handlers/session.js';
import { handleCancel } from './handlers/cancel.js';
import { handleLoginLink } from './handlers/loginLink.js';
import { handleLogout } from './handlers/logout.js';
import type { Deps } from './deps.js';
import { SITE, jsonOf, req, setCookies, testEnv } from './test-helpers.js';

const url = process.env.TEST_PG_URL;
if (!url) {
  console.info('[integration] TEST_PG_URL not set: skipping (run supabase/tests/run.sh --keep to get one).');
}

describe.skipIf(!url)('booking flow against the harness DB', () => {
  let rpc: PgRpc;
  let admin: pg.Client;
  const email = createCapturingTransport();
  let deps: Deps;
  const run = randomUUID().slice(0, 8);
  const address = `it-${run}@example.com`;
  const ev: Record<'a' | 'b', { event: string; entry: string }> = {
    a: { event: '', entry: '' },
    b: { event: '', entry: '' },
  };
  let cookie = '';

  function lastLink(kind: string): string {
    const mail = [...email.sent].reverse().find((m) => m.kind === kind);
    const m = mail?.text.match(/\/activate\?token=(\S+)/);
    if (!m) throw new Error(`no ${kind} link captured`);
    return decodeURIComponent(m[1]!);
  }

  function cookieFrom(res: Response): string {
    const c = setCookies(res).find((s) => s.startsWith('uc_session=') && !s.includes('Max-Age=0'));
    if (!c) throw new Error('no session cookie set');
    return c.split(';')[0]!;
  }

  beforeAll(async () => {
    rpc = createPgRpc(url!);
    admin = new pg.Client({ connectionString: url });
    await admin.connect();
    for (const key of ['a', 'b'] as const) {
      const e = await admin.query<{ id: string }>(
        `insert into underclub.events (title, date, time, status)
         values ($1, current_date + 7, '23:00', 'published') returning id`,
        [`Integration ${key.toUpperCase()} ${run}`],
      );
      const n = await admin.query<{ id: string }>(
        `insert into underclub.event_entries (event_id, name, quota, price) values ($1, 'Ridotto', 50, 10) returning id`,
        [e.rows[0]!.id],
      );
      ev[key] = { event: e.rows[0]!.id, entry: n.rows[0]!.id };
    }
    deps = { rpc, email, env: testEnv() };
  });

  afterAll(async () => {
    await admin?.end();
    await rpc?.close();
  });

  const form = () => ({
    eventId: ev.a.event,
    entryId: ev.a.entry,
    fullName: 'Ada Integration',
    dateOfBirth: '1995-03-04',
    email: address.toUpperCase(),
    consentMarketing: true,
    source: 'Meta Ads',
  });

  it('book without session → check_email and an activation link', async () => {
    const res = await handleBooking(req('/api/reservations', form()), deps);
    expect(res.status).toBe(200);
    expect(await jsonOf(res)).toEqual({ status: 'check_email' });
    expect(email.sent.at(-1)!.kind).toBe('activation');
    expect(email.sent.at(-1)!.to).toBe(address);
    expect(email.sent.at(-1)!.text).toContain(`${SITE}/activate?token=`);
    const row = await admin.query(`select status, source from underclub.reservations where event_id = $1`, [ev.a.event]);
    expect(row.rows).toEqual([{ status: 'pending', source: 'meta-ads' }]);
  });

  it('activate → session cookie, confirmed ticket, ticket email', async () => {
    const token = lastLink('activation');
    const res = await handleActivate(req('/api/auth/activate', { token }), deps);
    const body = await jsonOf(res);
    expect(body).toMatchObject({ status: 'ok', reservation: 'confirmed' });
    expect(body.ticketUrl).toMatch(/^\/ticket\/[0-9a-f-]{36}\?t=/);
    cookie = cookieFrom(res);
    const mail = email.sent.at(-1)!;
    expect(mail.kind).toBe('ticket');
    expect(mail.text).toContain(`${SITE}${body.ticketUrl}`);
    expect(mail.subject).toContain(`Integration A ${run}`);

    const again = await handleActivate(req('/api/auth/activate', { token }), deps);
    expect(await jsonOf(again)).toEqual({ status: 'invalid' });
  });

  it('GET /api/session with the cookie', async () => {
    const res = await handleSession(req('/api/session', undefined, { method: 'GET', cookie }), deps);
    expect(res.status).toBe(200);
    const body = await jsonOf(res);
    expect(body.contact).toEqual({ email: address, fullName: 'Ada Integration', marketingConsent: true, profilingConsent: false });
    expect(body.reservations).toHaveLength(1);
    expect(body.reservations[0]).toMatchObject({ status: 'confirmed', eventTitle: `Integration A ${run}`, entryPrice: 10, qrScanned: false });
    expect(setCookies(res)[0]).toContain('Max-Age=31536000');
  });

  let bReservation = '';

  it('second booking with the cookie only → confirmed immediately', async () => {
    const res = await handleBooking(req('/api/reservations', { eventId: ev.b.event, entryId: ev.b.entry }, { cookie }), deps);
    const body = await jsonOf(res);
    expect(body.status).toBe('confirmed');
    expect(body.ticketUrl).toContain(`/ticket/${body.reservationId}?t=`);
    bReservation = body.reservationId;
    expect(email.sent.at(-1)!.kind).toBe('ticket');
  });

  it('same event again: already_booked with session, check_email without', async () => {
    const withSession = await handleBooking(req('/api/reservations', { eventId: ev.a.event, entryId: ev.a.entry }, { cookie }), deps);
    expect(await jsonOf(withSession)).toMatchObject({ status: 'already_booked', ticketUrl: null });

    const before = email.sent.length;
    const anonymous = await handleBooking(req('/api/reservations', form()), deps);
    expect(await jsonOf(anonymous)).toEqual({ status: 'check_email' });
    expect(email.sent.length).toBe(before + 1);
    expect(email.sent.at(-1)!.kind).toBe('already_booked');
  });

  it('cancel → ok, then not_cancellable; rebook → confirmed again', async () => {
    const res = await handleCancel(req('/api/reservations/cancel', { reservationId: bReservation }, { cookie }), deps);
    expect(await jsonOf(res)).toEqual({ status: 'ok' });
    const again = await handleCancel(req('/api/reservations/cancel', { reservationId: bReservation }, { cookie }), deps);
    expect(again.status).toBe(409);
    const unknown = await handleCancel(req('/api/reservations/cancel', { reservationId: randomUUID() }, { cookie }), deps);
    expect(unknown.status).toBe(404);

    const session = await jsonOf(await handleSession(req('/api/session', undefined, { method: 'GET', cookie }), deps));
    expect(session.reservations).toHaveLength(1);

    const rebook = await handleBooking(req('/api/reservations', { eventId: ev.b.event, entryId: ev.b.entry }, { cookie }), deps);
    const body = await jsonOf(rebook);
    expect(body.status).toBe('confirmed');
    expect(body.reservationId).not.toBe(bReservation);
  });

  it('login link → activate with reservation none; logout kills the session', async () => {
    const res = await handleLoginLink(req('/api/auth/login-link', { email: address }), deps);
    expect(await jsonOf(res)).toEqual({ status: 'check_email' });
    const act = await handleActivate(req('/api/auth/activate', { token: lastLink('login') }), deps);
    expect(await jsonOf(act)).toEqual({ status: 'ok', reservation: 'none' });
    const second = cookieFrom(act);

    const unknownBefore = email.sent.length;
    await handleLoginLink(req('/api/auth/login-link', { email: `nobody-${run}@example.com` }), deps);
    expect(email.sent.length).toBe(unknownBefore);

    const out = await handleLogout(req('/api/auth/logout', {}, { cookie }), deps);
    expect(out.status).toBe(200);
    const dead = await handleSession(req('/api/session', undefined, { method: 'GET', cookie }), deps);
    expect(dead.status).toBe(401);
    expect(setCookies(dead)[0]).toContain('Max-Age=0');
    // The other device's session is untouched.
    expect((await handleSession(req('/api/session', undefined, { method: 'GET', cookie: second }), deps)).status).toBe(200);
  });
});
