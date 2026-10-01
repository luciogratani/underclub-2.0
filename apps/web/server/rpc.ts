/**
 * The minimal database surface the booking handlers need: one method per
 * `underclub.ep_*` function (execute granted to service_role only).
 *
 * Two implementations: supabase-js with the service role key (Vercel) and a
 * `pg`-backed one for local dev/integration tests (`./rpc-pg.ts`).
 */
import { createClient } from '@supabase/supabase-js';
// Type-only: @underclub/shared ships raw .ts source, a runtime import would
// not resolve inside a Vercel function.
import type { Database, EpCleanupCounts, EpSessionOverview, EpSessionOverviewReservation } from '@underclub/shared';

type Fns = Database['underclub']['Functions'];

/** Booking arguments as the handler builds them; the Rpc adds `p_ticket_secret`. */
export type BookingArgs = Omit<Fns['ep_request_booking']['Args'], 'p_ticket_secret'>;
export type BookingRow = Fns['ep_request_booking']['Returns'][number];
export type ActivateRow = Fns['ep_activate']['Returns'][number];
export type LoginRow = Fns['ep_request_login']['Returns'][number];
export type SessionOverview = EpSessionOverview;
export type OverviewReservation = EpSessionOverviewReservation;
export type CancelOutcome = Fns['ep_cancel_reservation']['Returns'];
export type CleanupCounts = EpCleanupCounts;

/**
 * The ticket secret is bound when the Rpc is created and added to the calls
 * that derive ticket tokens, so handlers (and their logs) never see it.
 */
export interface Rpc {
  requestBooking(args: BookingArgs): Promise<BookingRow>;
  activate(token: string): Promise<ActivateRow>;
  requestLogin(email: string): Promise<LoginRow>;
  /** Contact + upcoming reservations; null when the session is not valid. */
  sessionOverview(token: string): Promise<SessionOverview | null>;
  logout(token: string): Promise<boolean>;
  cancelReservation(token: string, reservationId: string): Promise<CancelOutcome>;
  /** One hit on a fixed window; true while still within the limit. */
  throttle(keyHash: string, action: string, limit: number, windowSeconds: number): Promise<boolean>;
  /** Periodic cleanup: deleted row counts. */
  cleanup(): Promise<CleanupCounts>;
}

/** Error from the database layer. The message never contains arguments. */
export class RpcError extends Error {
  constructor(fn: string, detail: string) {
    super(`${fn}: ${detail}`);
    this.name = 'RpcError';
  }
}

function single<T>(fn: string, rows: T[] | null): T {
  const row = rows?.[0];
  if (!row) throw new RpcError(fn, 'no row returned');
  return row;
}

export function createSupabaseRpc(url: string, serviceRoleKey: string, ticketSecret: string): Rpc {
  const client = createClient<Database, 'underclub'>(url, serviceRoleKey, {
    db: { schema: 'underclub' },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // supabase-js resolves to { data, error } and does not throw.
  async function call<N extends keyof Fns & string>(fn: N, args: Fns[N]['Args']): Promise<Fns[N]['Returns']> {
    const { data, error } = await client.rpc(fn, args as never);
    if (error) throw new RpcError(fn, `${error.code ?? ''} ${error.message}`.trim());
    return data as Fns[N]['Returns'];
  }

  return {
    async requestBooking(args) {
      return single('ep_request_booking', await call('ep_request_booking', { ...args, p_ticket_secret: ticketSecret }));
    },
    async activate(token) {
      return single('ep_activate', await call('ep_activate', { p_token: token, p_ticket_secret: ticketSecret }));
    },
    async requestLogin(email) {
      return single('ep_request_login', await call('ep_request_login', { p_email: email }));
    },
    async sessionOverview(token) {
      return (await call('ep_session_overview', { p_token: token, p_ticket_secret: ticketSecret })) ?? null;
    },
    async logout(token) {
      return Boolean(await call('ep_logout', { p_token: token }));
    },
    async cancelReservation(token, reservationId) {
      return call('ep_cancel_reservation', { p_token: token, p_reservation_id: reservationId });
    },
    async throttle(keyHash, action, limit, windowSeconds) {
      const allowed = await call('ep_throttle', {
        p_key_hash: keyHash, p_action: action, p_limit: limit, p_window_seconds: windowSeconds,
      });
      return allowed === true;
    },
    async cleanup() {
      return (await call('ep_cleanup', {})) ?? {};
    },
  };
}
