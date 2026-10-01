import { describe, expect, it, vi } from 'vitest';
import { handleActivate } from './activate.js';
import { handleLoginLink } from './loginLink.js';
import { handleLogout } from './logout.js';
import {
  ACTIVATION_TOKEN, RESERVATION_ID, SESSION_TOKEN, SITE, TICKET_TOKEN, jsonOf, makeDeps, req, setCookies,
} from '../test-helpers.js';
import type { ActivateRow, MyReservationRow } from '../rpc.js';

const CLEARED = 'uc_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax';
const SET = `uc_session=${SESSION_TOKEN}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`;

function activateRow(over: Partial<ActivateRow>): ActivateRow {
  return {
    outcome: 'ok',
    reservation_outcome: 'none',
    session_token: SESSION_TOKEN,
    contact_id: '44444444-4444-4444-8444-444444444444',
    reservation_id: null,
    ticket_token: null,
    contact_email: 'ada@example.com',
    contact_full_name: 'Ada Lovelace',
    ...over,
  };
}

const myRes: MyReservationRow = {
  reservation_id: RESERVATION_ID,
  status: 'confirmed',
  event_id: '11111111-1111-4111-8111-111111111111',
  event_title: 'Opening Night',
  event_date: '2026-10-10',
  event_time: '23:00:00',
  entry_name: 'Ridotto',
  entry_price: 10,
  entry_valid_until: null,
  qr_scanned_at: null,
  created_at: '2026-10-01T10:00:00.000Z',
};

describe('POST /api/auth/activate', () => {
  it('guards origin and content type', async () => {
    const { deps } = makeDeps();
    const res = await handleActivate(req('/api/auth/activate', { token: ACTIVATION_TOKEN }, { origin: 'https://x.dev' }), deps);
    expect(res.status).toBe(403);
  });

  it('400 when token is missing or not a string', async () => {
    const { deps } = makeDeps();
    for (const body of [{}, { token: 1 }]) {
      const res = await handleActivate(req('/api/auth/activate', body), deps);
      expect(res.status).toBe(400);
      expect((await jsonOf(res)).error).toBe('bad_request');
    }
  });

  it('malformed token → invalid without hitting the DB', async () => {
    const { deps, rpc } = makeDeps();
    const res = await handleActivate(req('/api/auth/activate', { token: 'short' }), deps);
    expect(await jsonOf(res)).toEqual({ status: 'invalid' });
    expect(rpc.calls).toHaveLength(0);
  });

  it.each(['invalid', 'expired'] as const)('%s → 200 with that status and no cookie', async (outcome) => {
    const { deps } = makeDeps({
      activate: async () => activateRow({ outcome, reservation_outcome: null, session_token: null }),
    });
    const res = await handleActivate(req('/api/auth/activate', { token: ACTIVATION_TOKEN }), deps);
    expect(res.status).toBe(200);
    expect(await jsonOf(res)).toEqual({ status: outcome });
    expect(setCookies(res)).toEqual([]);
  });

  it('ok + confirmed → cookie, ticketUrl, ticket email with event details', async () => {
    const { deps, email, rpc } = makeDeps({
      activate: async () =>
        activateRow({ reservation_outcome: 'confirmed', reservation_id: RESERVATION_ID, ticket_token: TICKET_TOKEN }),
      myReservations: async () => [myRes],
    });
    const res = await handleActivate(req('/api/auth/activate', { token: ACTIVATION_TOKEN }), deps);
    const ticketUrl = `/ticket/${RESERVATION_ID}?t=${encodeURIComponent(TICKET_TOKEN)}`;
    expect(await jsonOf(res)).toEqual({ status: 'ok', reservation: 'confirmed', ticketUrl });
    expect(setCookies(res)).toEqual([SET]);
    expect(rpc.calls[0]!.args).toEqual([ACTIVATION_TOKEN]);
    expect(email.sent).toHaveLength(1);
    expect(email.sent[0]!.kind).toBe('ticket');
    expect(email.sent[0]!.text).toContain(`${SITE}${ticketUrl}`);
    expect(email.sent[0]!.text).toContain('Saturday, 10 October 2026 at 23:00');
    expect(email.sent[0]!.subject).toContain('Opening Night');
  });

  it('ok + confirmed still answers when the event lookup or the email fails', async () => {
    const { deps, email } = makeDeps({
      activate: async () =>
        activateRow({ reservation_outcome: 'confirmed', reservation_id: RESERVATION_ID, ticket_token: TICKET_TOKEN }),
      myReservations: async () => { throw new Error('boom'); },
    });
    email.failWith = new Error('down');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await handleActivate(req('/api/auth/activate', { token: ACTIVATION_TOKEN }), deps);
    spy.mockRestore();
    expect(res.status).toBe(200);
    expect((await jsonOf(res)).reservation).toBe('confirmed');
  });

  it.each(['none', 'expired', 'unavailable'] as const)('ok + %s → cookie, no email', async (reservation) => {
    const { deps, email } = makeDeps({ activate: async () => activateRow({ reservation_outcome: reservation }) });
    const res = await handleActivate(req('/api/auth/activate', { token: ACTIVATION_TOKEN }), deps);
    expect(await jsonOf(res)).toEqual({ status: 'ok', reservation });
    expect(setCookies(res)).toEqual([SET]);
    expect(email.sent).toHaveLength(0);
  });
});

describe('POST /api/auth/login-link', () => {
  it('known address → login email, check_email', async () => {
    const { deps, email, rpc } = makeDeps({
      requestLogin: async () => ({ outcome: 'sent', activation_token: ACTIVATION_TOKEN, contact_full_name: 'Ada Lovelace' }),
    });
    const res = await handleLoginLink(req('/api/auth/login-link', { email: ' ADA@example.com' }), deps);
    expect(await jsonOf(res)).toEqual({ status: 'check_email' });
    expect(rpc.calls[0]!.args).toEqual(['ada@example.com']);
    expect(email.sent[0]!.kind).toBe('login');
    expect(email.sent[0]!.to).toBe('ada@example.com');
    expect(email.sent[0]!.html).toContain(`${SITE}/activate?token=${encodeURIComponent(ACTIVATION_TOKEN)}`);
  });

  it('unknown address and email failure answer exactly like a known one', async () => {
    const known = makeDeps({
      requestLogin: async () => ({ outcome: 'sent', activation_token: ACTIVATION_TOKEN, contact_full_name: 'Ada' }),
    });
    const unknown = makeDeps({
      requestLogin: async () => ({ outcome: 'unknown', activation_token: null, contact_full_name: null }),
    });
    const failing = makeDeps({
      requestLogin: async () => ({ outcome: 'sent', activation_token: ACTIVATION_TOKEN, contact_full_name: 'Ada' }),
    });
    failing.email.failWith = new Error('down');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const responses = await Promise.all(
      [known, unknown, failing].map((d) => handleLoginLink(req('/api/auth/login-link', { email: 'ada@example.com' }), d.deps)),
    );
    spy.mockRestore();
    const bodies = await Promise.all(responses.map((r) => r.text()));
    expect(new Set(responses.map((r) => r.status))).toEqual(new Set([200]));
    expect(new Set(bodies).size).toBe(1);
    expect(unknown.email.sent).toHaveLength(0);
  });

  it('invalid email → 400 invalid_input', async () => {
    const { deps, rpc } = makeDeps();
    const res = await handleLoginLink(req('/api/auth/login-link', { email: 'nope' }), deps);
    expect(res.status).toBe(400);
    expect((await jsonOf(res)).error).toBe('invalid_input');
    expect(rpc.calls).toHaveLength(0);
  });

  it('guards origin', async () => {
    const { deps } = makeDeps();
    const res = await handleLoginLink(req('/api/auth/login-link', { email: 'a@b.it' }, { origin: 'null' }), deps);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the session and clears the cookie', async () => {
    const { deps, rpc } = makeDeps({ logout: async () => true });
    const res = await handleLogout(req('/api/auth/logout', {}, { cookie: `uc_session=${SESSION_TOKEN}` }), deps);
    expect(await jsonOf(res)).toEqual({ status: 'ok' });
    expect(rpc.calls[0]!.args).toEqual([SESSION_TOKEN]);
    expect(setCookies(res)).toEqual([CLEARED]);
  });

  it('without a cookie: no DB call, still ok and cleared', async () => {
    const { deps, rpc } = makeDeps();
    const res = await handleLogout(req('/api/auth/logout'), deps);
    expect(res.status).toBe(200);
    expect(rpc.calls).toHaveLength(0);
    expect(setCookies(res)).toEqual([CLEARED]);
  });

  it('guards origin', async () => {
    const { deps } = makeDeps();
    expect((await handleLogout(req('/api/auth/logout', {}, { origin: 'https://evil.example' }), deps)).status).toBe(403);
  });
});
