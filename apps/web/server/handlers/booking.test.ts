import { describe, expect, it, vi } from 'vitest';
import { handleBooking } from './booking.js';
import {
  ACTIVATION_TOKEN, ENTRY_ID, EVENT_ID, RESERVATION_ID, SESSION_TOKEN, SITE, TICKET_TOKEN,
  bookingRow, jsonOf, makeDeps, req, setCookies,
} from '../test-helpers.js';
import type { BookingRow } from '../rpc.js';

const form = {
  eventId: EVENT_ID,
  entryId: ENTRY_ID,
  fullName: '  Ada   Lovelace ',
  dateOfBirth: '1990-05-17',
  email: ' Ada@Example.COM ',
  consentMarketing: true,
  source: 'Volantino Ottobre',
};

function setup(row: Partial<BookingRow>) {
  return makeDeps({ requestBooking: async () => bookingRow(row) });
}

describe('POST /api/reservations — guard and validation', () => {
  it('rejects a foreign origin, a missing origin and a non-JSON content type with 403', async () => {
    const { deps, rpc } = setup({});
    for (const o of [{ origin: 'https://evil.example' }, { origin: null }, { contentType: 'text/plain' }]) {
      const res = await handleBooking(req('/api/reservations', form, o), deps);
      expect(res.status).toBe(403);
      expect(await jsonOf(res)).toEqual({ error: 'bad_origin' });
    }
    // localhost is not allowed outside dev
    const res = await handleBooking(req('/api/reservations', form, { origin: 'http://localhost:5173' }), deps);
    expect(res.status).toBe(403);
    expect(rpc.calls).toHaveLength(0);
  });

  it('accepts localhost on any port in dev and ALLOWED_ORIGINS entries', async () => {
    const dev = makeDeps({ requestBooking: async () => bookingRow({ activation_token: ACTIVATION_TOKEN }) }, {
      allowLocalhostOrigins: true,
    });
    expect((await handleBooking(req('/api/reservations', form, { origin: 'http://localhost:5190' }), dev.deps)).status).toBe(200);
    const prod = setup({ activation_token: ACTIVATION_TOKEN });
    expect((await handleBooking(req('/api/reservations', form, { origin: 'https://www.underclub.it' }), prod.deps)).status).toBe(200);
  });

  it('accepts application/json with a charset', async () => {
    const { deps } = setup({ activation_token: ACTIVATION_TOKEN });
    const res = await handleBooking(req('/api/reservations', form, { contentType: 'application/json; charset=utf-8' }), deps);
    expect(res.status).toBe(200);
  });

  it('rejects other methods with 405', async () => {
    const { deps } = setup({});
    const res = await handleBooking(req('/api/reservations', undefined, { method: 'GET' }), deps);
    expect(res.status).toBe(405);
  });

  it.each([
    ['invalid JSON', '{nope'],
    ['an array', '[1,2]'],
    ['a string', '"x"'],
    ['an oversized body', JSON.stringify({ ...form, pad: 'x'.repeat(9000) })],
  ])('400 bad_request for %s', async (_label, rawBody) => {
    const { deps, rpc } = setup({});
    const res = await handleBooking(req('/api/reservations', undefined, { rawBody }), deps);
    expect(res.status).toBe(400);
    expect((await jsonOf(res)).error).toBe('bad_request');
    expect(rpc.calls).toHaveLength(0);
  });

  it('400 bad_request for non-UUID ids and wrongly typed fields', async () => {
    const { deps } = setup({});
    for (const body of [
      { ...form, eventId: 'x' },
      { ...form, entryId: 42 },
      { ...form, fullName: 12 },
      { ...form, consentMarketing: 'yes' },
    ]) {
      const res = await handleBooking(req('/api/reservations', body), deps);
      expect(res.status).toBe(400);
      expect((await jsonOf(res)).error).toBe('bad_request');
    }
  });

  it.each([
    ['one-word name', { fullName: 'Ada' }],
    ['too long name', { fullName: `Ada ${'x'.repeat(130)}` }],
    ['bad email', { email: 'ada@' }],
    ['malformed date', { dateOfBirth: '17/05/1990' }],
    ['impossible date', { dateOfBirth: '1990-02-30' }],
    ['future date', { dateOfBirth: '2030-01-01' }],
    ['minor (turns 18 tomorrow in Rome)', { dateOfBirth: '2008-10-02' }],
  ])('400 invalid_input for %s', async (_label, patch) => {
    const { deps, rpc } = setup({});
    const res = await handleBooking(req('/api/reservations', { ...form, ...patch }), deps);
    expect(res.status).toBe(400);
    expect((await jsonOf(res)).error).toBe('invalid_input');
    expect(rpc.calls).toHaveLength(0);
  });

  it('passes normalized values to the database', async () => {
    const { deps, rpc } = setup({ activation_token: ACTIVATION_TOKEN });
    await handleBooking(req('/api/reservations', { ...form, eventId: EVENT_ID.toUpperCase() }), deps);
    expect(rpc.calls[0]!.args[0]).toEqual({
      p_session_token: null,
      p_event_id: EVENT_ID,
      p_entry_id: ENTRY_ID,
      p_full_name: 'Ada Lovelace',
      p_date_of_birth: '1990-05-17',
      p_email: 'ada@example.com',
      p_consent_marketing: true,
      p_consent_profiling: false,
      p_source: 'volantino-ottobre',
    });
  });

  it('turns an unusable source into null instead of failing', async () => {
    const { deps, rpc } = setup({ activation_token: ACTIVATION_TOKEN });
    const res = await handleBooking(req('/api/reservations', { ...form, source: '!!' }), deps);
    expect(res.status).toBe(200);
    expect((rpc.calls[0]!.args[0] as { p_source: unknown }).p_source).toBeNull();
  });

  it('sends only the session token when identity fields are absent', async () => {
    const { deps, rpc } = setup({ outcome: 'confirmed', ticket_token: TICKET_TOKEN });
    await handleBooking(
      req('/api/reservations', { eventId: EVENT_ID, entryId: ENTRY_ID }, { cookie: `uc_session=${SESSION_TOKEN}` }),
      deps,
    );
    expect(rpc.calls[0]!.args[0]).toMatchObject({
      p_session_token: SESSION_TOKEN,
      p_full_name: null,
      p_date_of_birth: null,
      p_email: null,
    });
  });
});

describe('POST /api/reservations — outcomes', () => {
  it('pending → check_email + activation email with the activate link', async () => {
    const { deps, email } = setup({ outcome: 'pending', activation_token: ACTIVATION_TOKEN });
    const res = await handleBooking(req('/api/reservations', form), deps);
    expect(res.status).toBe(200);
    expect(await jsonOf(res)).toEqual({ status: 'check_email' });
    expect(setCookies(res)).toEqual([]);
    expect(email.sent).toHaveLength(1);
    const [mail] = email.sent;
    expect(mail!.kind).toBe('activation');
    expect(mail!.to).toBe('ada@example.com');
    const link = `${SITE}/activate?token=${encodeURIComponent(ACTIVATION_TOKEN)}`;
    expect(mail!.text).toContain(link);
    expect(mail!.html).toContain(`href="${link}"`);
    expect(mail!.subject).toContain('Opening Night');
  });

  it('anti-enumeration: pending and already-booked-without-session answer identically', async () => {
    const a = setup({ outcome: 'pending', activation_token: ACTIVATION_TOKEN });
    const b = setup({ outcome: 'already_booked', activation_token: ACTIVATION_TOKEN });
    const ra = await handleBooking(req('/api/reservations', form), a.deps);
    const rb = await handleBooking(req('/api/reservations', form), b.deps);
    expect(rb.status).toBe(ra.status);
    expect(await rb.text()).toBe(await ra.text());
    expect([...rb.headers.entries()]).toEqual([...ra.headers.entries()]);
    expect(b.email.sent[0]!.kind).toBe('already_booked');
    expect(b.email.sent[0]!.text).toContain(`${SITE}/activate?token=${encodeURIComponent(ACTIVATION_TOKEN)}`);
  });

  it('confirmed (session) → ticketUrl, renewed cookie, ticket email', async () => {
    const { deps, email } = setup({ outcome: 'confirmed', ticket_token: TICKET_TOKEN });
    const res = await handleBooking(req('/api/reservations', form, { cookie: `other=1; uc_session=${SESSION_TOKEN}` }), deps);
    expect(res.status).toBe(200);
    const ticketUrl = `/ticket/${RESERVATION_ID}?t=${encodeURIComponent(TICKET_TOKEN)}`;
    expect(await jsonOf(res)).toEqual({ status: 'confirmed', reservationId: RESERVATION_ID, ticketUrl });
    expect(setCookies(res)).toEqual([
      `uc_session=${SESSION_TOKEN}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`,
    ]);
    expect(email.sent[0]!.kind).toBe('ticket');
    expect(email.sent[0]!.text).toContain(`${SITE}${ticketUrl}`);
  });

  it('confirmed stays 200 when the ticket email fails', async () => {
    const { deps, email } = setup({ outcome: 'confirmed', ticket_token: TICKET_TOKEN });
    email.failWith = new Error('down');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await handleBooking(req('/api/reservations', form, { cookie: `uc_session=${SESSION_TOKEN}` }), deps);
    spy.mockRestore();
    expect(res.status).toBe(200);
    expect((await jsonOf(res)).status).toBe('confirmed');
  });

  it('already_booked with session → reservationId, ticketUrl null, renewed cookie, no email', async () => {
    const { deps, email } = setup({ outcome: 'already_booked' });
    const res = await handleBooking(req('/api/reservations', form, { cookie: `uc_session=${SESSION_TOKEN}` }), deps);
    expect(await jsonOf(res)).toEqual({ status: 'already_booked', reservationId: RESERVATION_ID, ticketUrl: null });
    expect(setCookies(res)[0]).toMatch(/^uc_session=sess.*Max-Age=31536000/);
    expect(email.sent).toHaveLength(0);
  });

  it('already_booked without session nor login token never reveals the booking', async () => {
    const { deps } = setup({ outcome: 'already_booked' });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await handleBooking(req('/api/reservations', form), deps);
    spy.mockRestore();
    expect(await jsonOf(res)).toEqual({ status: 'check_email' });
  });

  it('a cookie that turned out invalid (no-session path) is cleared', async () => {
    for (const outcome of ['pending', 'already_booked'] as const) {
      const { deps } = setup({ outcome, activation_token: ACTIVATION_TOKEN });
      const res = await handleBooking(req('/api/reservations', form, { cookie: `uc_session=${SESSION_TOKEN}` }), deps);
      expect(await jsonOf(res)).toEqual({ status: 'check_email' });
      expect(setCookies(res)).toEqual(['uc_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax']);
    }
  });

  it('invalid_input from the DB → 400 and clears a sent cookie', async () => {
    const { deps } = setup({ outcome: 'invalid_input' });
    const body = { eventId: EVENT_ID, entryId: ENTRY_ID };
    const res = await handleBooking(req('/api/reservations', body, { cookie: `uc_session=${SESSION_TOKEN}` }), deps);
    expect(res.status).toBe(400);
    expect((await jsonOf(res)).error).toBe('invalid_input');
    expect(setCookies(res)[0]).toContain('Max-Age=0');
    const res2 = await handleBooking(req('/api/reservations', body), deps);
    expect(setCookies(res2)).toEqual([]);
  });

  it.each([
    ['sold_out', 409],
    ['not_bookable', 409],
    ['invalid_entry', 400],
  ] as const)('%s → %i', async (outcome, status) => {
    const { deps, email } = setup({ outcome });
    const res = await handleBooking(req('/api/reservations', form), deps);
    expect(res.status).toBe(status);
    expect(await jsonOf(res)).toEqual({ error: outcome });
    expect(email.sent).toHaveLength(0);
  });

  it('a malformed cookie is not sent to the DB and is cleared', async () => {
    const { deps, rpc } = setup({ outcome: 'sold_out' });
    const res = await handleBooking(req('/api/reservations', form, { cookie: 'uc_session=bad token!' }), deps);
    expect((rpc.calls[0]!.args[0] as { p_session_token: unknown }).p_session_token).toBeNull();
    expect(setCookies(res)[0]).toContain('Max-Age=0');
  });

  it('email failure on pending → 502 server_error', async () => {
    const { deps, email } = setup({ outcome: 'pending', activation_token: ACTIVATION_TOKEN });
    email.failWith = new Error('resend responded 500');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await handleBooking(req('/api/reservations', form), deps);
    expect(res.status).toBe(502);
    expect((await jsonOf(res)).error).toBe('server_error');
    expect(spy.mock.calls.flat().join(' ')).not.toContain(ACTIVATION_TOKEN);
    spy.mockRestore();
  });

  it('unexpected DB error → 500 server_error, log without tokens or body', async () => {
    const { deps } = makeDeps({ requestBooking: async () => { throw new Error('connection reset'); } });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await handleBooking(req('/api/reservations', form, { cookie: `uc_session=${SESSION_TOKEN}` }), deps);
    expect(res.status).toBe(500);
    expect(await jsonOf(res)).toEqual({ error: 'server_error' });
    const logged = spy.mock.calls.flat().join(' ');
    expect(logged).toContain('connection reset');
    expect(logged).not.toContain(SESSION_TOKEN);
    expect(logged).not.toContain('ada@example.com');
    spy.mockRestore();
  });

  it('responses are JSON and never cached', async () => {
    const { deps } = setup({ outcome: 'sold_out' });
    const res = await handleBooking(req('/api/reservations', form), deps);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(res.headers.get('cache-control')).toBe('no-store');
  });
});
