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
import type { Database } from '@underclub/shared';

type Fns = Database['underclub']['Functions'];

export type BookingArgs = Fns['ep_request_booking']['Args'];
export type BookingRow = Fns['ep_request_booking']['Returns'][number];
export type ActivateRow = Fns['ep_activate']['Returns'][number];
export type LoginRow = Fns['ep_request_login']['Returns'][number];
export type SessionRow = Fns['ep_session']['Returns'][number];
export type MyReservationRow = Fns['ep_my_reservations']['Returns'][number];
export type CancelOutcome = Fns['ep_cancel_reservation']['Returns'];

export interface Rpc {
  requestBooking(args: BookingArgs): Promise<BookingRow>;
  activate(token: string): Promise<ActivateRow>;
  requestLogin(email: string): Promise<LoginRow>;
  /** null when the session is not valid. */
  session(token: string): Promise<SessionRow | null>;
  logout(token: string): Promise<boolean>;
  myReservations(token: string): Promise<MyReservationRow[]>;
  cancelReservation(token: string, reservationId: string): Promise<CancelOutcome>;
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

export function createSupabaseRpc(url: string, serviceRoleKey: string): Rpc {
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
      return single('ep_request_booking', await call('ep_request_booking', args));
    },
    async activate(token) {
      return single('ep_activate', await call('ep_activate', { p_token: token }));
    },
    async requestLogin(email) {
      return single('ep_request_login', await call('ep_request_login', { p_email: email }));
    },
    async session(token) {
      const rows = await call('ep_session', { p_token: token });
      return rows?.[0] ?? null;
    },
    async logout(token) {
      return Boolean(await call('ep_logout', { p_token: token }));
    },
    async myReservations(token) {
      return (await call('ep_my_reservations', { p_token: token })) ?? [];
    },
    async cancelReservation(token, reservationId) {
      return call('ep_cancel_reservation', { p_token: token, p_reservation_id: reservationId });
    },
  };
}
