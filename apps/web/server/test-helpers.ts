/** Shared fixtures for the server unit tests (not a test file itself). */
import type { ServerEnv } from './env.js';
import type { Deps } from './deps.js';
import type { BookingRow, Rpc } from './rpc.js';
import { createCapturingTransport, type CapturingTransport } from './email.js';

export const SITE = 'https://underclub.it';
export const NOW = new Date('2026-10-01T10:00:00Z');
export const EVENT_ID = '11111111-1111-4111-8111-111111111111';
export const ENTRY_ID = '22222222-2222-4222-8222-222222222222';
export const RESERVATION_ID = '33333333-3333-4333-8333-333333333333';
export const SESSION_TOKEN = 'sessSESSsessSESSsessSESSsessSESSsessSESS_-1';
export const ACTIVATION_TOKEN = 'actvACTVactvACTVactvACTVactvACTVactvACTV-_2';
export const TICKET_TOKEN = 'tickTICKtickTICKtickTICKtickTICKtickTICK-_3';
export const TICKET_SECRET = 'test-ticket-secret-0123456789abcdefghij';
export const IP_HASH_SECRET = 'test-ip-hash-secret-0123456789abcdefghij';
export const CRON_SECRET = 'test-cron-secret-0123456789';

export function testEnv(over: Partial<ServerEnv> = {}): ServerEnv {
  return {
    production: true,
    publicSiteUrl: SITE,
    allowedOrigins: [SITE, 'https://www.underclub.it'],
    allowLocalhostOrigins: false,
    emailTransport: 'console',
    emailFrom: 'Underclub <test@underclub.it>',
    resendApiKey: null,
    supabaseUrl: null,
    supabaseServiceRoleKey: null,
    ticketSecret: TICKET_SECRET,
    ipHashSecret: IP_HASH_SECRET,
    cronSecret: CRON_SECRET,
    ...over,
  };
}

/**
 * `calls` records the business calls; `throttle` (the per-IP limit, allowed
 * by default) is recorded apart in `throttleCalls` so it does not shift them.
 */
export type FakeRpc = Rpc & {
  calls: Array<{ fn: keyof Rpc; args: unknown[] }>;
  throttleCalls: Array<Parameters<Rpc['throttle']>>;
};

export function fakeRpc(impl: Partial<Rpc> = {}): FakeRpc {
  const calls: FakeRpc['calls'] = [];
  const throttleCalls: FakeRpc['throttleCalls'] = [];
  const names: Array<keyof Rpc> = [
    'requestBooking', 'activate', 'requestLogin', 'sessionOverview', 'logout', 'cancelReservation', 'cleanup',
  ];
  const rpc = { calls, throttleCalls } as FakeRpc;
  rpc.throttle = async (...args) => {
    throttleCalls.push(args);
    return impl.throttle ? impl.throttle(...args) : true;
  };
  for (const name of names) {
    (rpc as unknown as Record<string, unknown>)[name] = async (...args: unknown[]) => {
      calls.push({ fn: name, args });
      const fn = impl[name] as ((...a: unknown[]) => Promise<unknown>) | undefined;
      if (!fn) throw new Error(`unexpected rpc call ${name}`);
      return fn(...args);
    };
  }
  return rpc;
}

export interface TestDeps {
  deps: Deps;
  rpc: FakeRpc;
  email: CapturingTransport;
}

export function makeDeps(
  impl: Partial<Rpc> = {},
  env: Partial<ServerEnv> = {},
  extra: Partial<Pick<Deps, 'botCheck'>> = {},
): TestDeps {
  const rpc = fakeRpc(impl);
  const email = createCapturingTransport();
  return { rpc, email, deps: { rpc, email, env: testEnv(env), now: () => NOW, botCheck: async () => false, ...extra } };
}

export interface ReqOptions {
  /** Extra request headers (e.g. x-real-ip, authorization). */
  headers?: Record<string, string>;
  origin?: string | null;
  contentType?: string | null;
  cookie?: string | null;
  rawBody?: string;
  method?: string;
}

export function req(path: string, body?: unknown, o: ReqOptions = {}): Request {
  const method = o.method ?? 'POST';
  const headers = new Headers();
  const origin = o.origin === undefined ? SITE : o.origin;
  if (origin) headers.set('Origin', origin);
  const type = o.contentType === undefined ? 'application/json' : o.contentType;
  if (type && method !== 'GET') headers.set('Content-Type', type);
  if (o.cookie) headers.set('Cookie', o.cookie);
  for (const [k, v] of Object.entries(o.headers ?? {})) headers.set(k, v);
  const payload = method === 'GET' ? undefined : (o.rawBody ?? (body === undefined ? undefined : JSON.stringify(body)));
  return new Request(`${SITE}${path}`, { method, headers, body: payload });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function jsonOf(res: Response): Promise<any> {
  return res.json();
}

export function setCookies(res: Response): string[] {
  return res.headers.getSetCookie();
}

export function bookingRow(over: Partial<BookingRow> = {}): BookingRow {
  return {
    outcome: 'pending',
    reservation_id: RESERVATION_ID,
    ticket_token: null,
    activation_token: null,
    contact_email: 'ada@example.com',
    contact_full_name: 'Ada Lovelace',
    event_title: 'Opening Night',
    event_date: '2026-10-10',
    event_time: '23:00:00',
    entry_name: 'Ridotto',
    ...over,
  };
}
