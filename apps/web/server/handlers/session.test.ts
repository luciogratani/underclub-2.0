import { describe, expect, it } from 'vitest';
import { handleSession } from './session.js';
import { handleCancel } from './cancel.js';
import { RESERVATION_ID, SESSION_TOKEN, jsonOf, makeDeps, req, setCookies } from '../test-helpers.js';
import type { SessionRow } from '../rpc.js';

const CLEARED = 'uc_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax';
const SET = `uc_session=${SESSION_TOKEN}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`;
const cookie = `uc_session=${SESSION_TOKEN}`;

const contact: SessionRow = {
  contact_id: '44444444-4444-4444-8444-444444444444',
  email: 'ada@example.com',
  full_name: 'Ada Lovelace',
  date_of_birth: '1990-05-17',
  marketing_consent: true,
  profiling_consent: false,
  session_expires_at: '2027-10-01T10:00:00.000Z',
};

describe('GET /api/session', () => {
  it('no cookie → 401 without Set-Cookie', async () => {
    const { deps, rpc } = makeDeps();
    const res = await handleSession(req('/api/session', undefined, { method: 'GET' }), deps);
    expect(res.status).toBe(401);
    expect(await jsonOf(res)).toEqual({ error: 'unauthorized' });
    expect(setCookies(res)).toEqual([]);
    expect(rpc.calls).toHaveLength(0);
  });

  it('invalid session → 401 and cookie cleared', async () => {
    const { deps } = makeDeps({ session: async () => null });
    const res = await handleSession(req('/api/session', undefined, { method: 'GET', cookie }), deps);
    expect(res.status).toBe(401);
    expect(setCookies(res)).toEqual([CLEARED]);
  });

  it('valid session → contact + reservations, cookie renewed', async () => {
    const { deps } = makeDeps({
      session: async () => contact,
      myReservations: async () => [
        {
          reservation_id: RESERVATION_ID,
          status: 'pending',
          event_id: '11111111-1111-4111-8111-111111111111',
          event_title: 'Opening Night',
          event_date: '2026-10-10',
          event_time: '23:00:00',
          entry_name: 'Ridotto',
          entry_price: '12.50' as unknown as number,
          entry_valid_until: '2026-10-11T00:30:00.000Z',
          qr_scanned_at: '2026-10-10T23:10:00.000Z',
          created_at: '2026-10-01T10:00:00.000Z',
        },
      ],
    });
    const res = await handleSession(req('/api/session', undefined, { method: 'GET', cookie }), deps);
    expect(res.status).toBe(200);
    expect(await jsonOf(res)).toEqual({
      contact: { email: 'ada@example.com', fullName: 'Ada Lovelace', marketingConsent: true, profilingConsent: false },
      reservations: [
        {
          reservationId: RESERVATION_ID,
          status: 'pending',
          eventTitle: 'Opening Night',
          eventDate: '2026-10-10',
          eventTime: '23:00:00',
          entryName: 'Ridotto',
          entryPrice: 12.5,
          entryValidUntil: '2026-10-11T00:30:00.000Z',
          qrScanned: true,
        },
      ],
    });
    expect(setCookies(res)).toEqual([SET]);
  });

  it('POST is not allowed', async () => {
    const { deps } = makeDeps();
    expect((await handleSession(req('/api/session', {}), deps)).status).toBe(405);
  });
});

describe('POST /api/reservations/cancel', () => {
  const body = { reservationId: RESERVATION_ID };

  it('guards origin and validates the id', async () => {
    const { deps } = makeDeps();
    expect((await handleCancel(req('/api/reservations/cancel', body, { origin: 'https://evil.example', cookie }), deps)).status).toBe(403);
    const bad = await handleCancel(req('/api/reservations/cancel', { reservationId: 'nope' }, { cookie }), deps);
    expect(bad.status).toBe(400);
  });

  it('no cookie → 401 without DB call', async () => {
    const { deps, rpc } = makeDeps();
    const res = await handleCancel(req('/api/reservations/cancel', body), deps);
    expect(res.status).toBe(401);
    expect(rpc.calls).toHaveLength(0);
  });

  it.each([
    ['ok', 200, { status: 'ok' }, SET],
    ['invalid_session', 401, { error: 'unauthorized' }, CLEARED],
    ['not_found', 404, { error: 'not_found' }, SET],
    ['not_cancellable', 409, { error: 'not_cancellable' }, SET],
  ] as const)('%s → %i', async (outcome, status, json, setCookie) => {
    const { deps, rpc } = makeDeps({ cancelReservation: async () => outcome });
    const res = await handleCancel(req('/api/reservations/cancel', body, { cookie }), deps);
    expect(res.status).toBe(status);
    expect(await jsonOf(res)).toEqual(json);
    expect(setCookies(res)).toEqual([setCookie]);
    expect(rpc.calls[0]!.args).toEqual([SESSION_TOKEN, RESERVATION_ID]);
  });
});
