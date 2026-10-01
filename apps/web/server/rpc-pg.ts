/**
 * `pg`-backed Rpc for local dev (`DEV_PG_URL`) and integration tests
 * (`TEST_PG_URL`) against the throwaway Postgres of `supabase/tests/run.sh`.
 *
 * Never imported by `api/`: `pg` is a devDependency and is not shipped to
 * Vercel. Each call runs in its own transaction as `service_role`, the only
 * role allowed to execute the `ep_*` functions, like PostgREST does.
 */
import pg from 'pg';
import { RpcError, type Rpc } from './rpc.js';

// Mirror PostgREST's JSON shapes: date/time as strings, timestamptz as ISO,
// numeric as number (pg's defaults would give Date objects and strings).
const OID_DATE = 1082;
const OID_TIME = 1083;
const OID_TIMESTAMPTZ = 1184;
const OID_NUMERIC = 1700;

const types = {
  getTypeParser(oid: number, format?: string) {
    if (oid === OID_DATE || oid === OID_TIME) return (v: string) => v;
    if (oid === OID_TIMESTAMPTZ) return (v: string) => new Date(v).toISOString();
    if (oid === OID_NUMERIC) return (v: string) => Number(v);
    return pg.types.getTypeParser(oid, format as 'text');
  },
};

export interface PgRpc extends Rpc {
  close(): Promise<void>;
}

export function createPgRpc(connectionString: string): PgRpc {
  const pool = new pg.Pool({ connectionString, max: 4, types: types as never });

  async function query<T>(fn: string, sql: string, params: unknown[]): Promise<T[]> {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query('set local role service_role');
      const res = await client.query(sql, params);
      await client.query('commit');
      return res.rows as T[];
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      const code = (err as { code?: string }).code ?? '';
      throw new RpcError(fn, `${code} ${(err as Error).message}`.trim());
    } finally {
      client.release();
    }
  }

  async function one<T>(fn: string, sql: string, params: unknown[]): Promise<T> {
    const row = (await query<T>(fn, sql, params))[0];
    if (!row) throw new RpcError(fn, 'no row returned');
    return row;
  }

  return {
    requestBooking(a) {
      return one('ep_request_booking',
        `select * from underclub.ep_request_booking(
           p_session_token => $1, p_event_id => $2::uuid, p_entry_id => $3::uuid,
           p_full_name => $4, p_date_of_birth => $5::date, p_email => $6,
           p_consent_marketing => $7::boolean, p_consent_profiling => $8::boolean, p_source => $9)`,
        [a.p_session_token, a.p_event_id, a.p_entry_id, a.p_full_name, a.p_date_of_birth,
          a.p_email, a.p_consent_marketing, a.p_consent_profiling, a.p_source]);
    },
    activate(token) {
      return one('ep_activate', 'select * from underclub.ep_activate(p_token => $1)', [token]);
    },
    requestLogin(email) {
      return one('ep_request_login', 'select * from underclub.ep_request_login(p_email => $1)', [email]);
    },
    async session(token) {
      const rows = await query<NonNullable<Awaited<ReturnType<Rpc['session']>>>>(
        'ep_session', 'select * from underclub.ep_session(p_token => $1)', [token]);
      return rows[0] ?? null;
    },
    async logout(token) {
      const row = await one<{ r: boolean }>('ep_logout', 'select underclub.ep_logout(p_token => $1) as r', [token]);
      return Boolean(row.r);
    },
    myReservations(token) {
      return query('ep_my_reservations', 'select * from underclub.ep_my_reservations(p_token => $1)', [token]);
    },
    async cancelReservation(token, reservationId) {
      const row = await one<{ r: Awaited<ReturnType<Rpc['cancelReservation']>> }>('ep_cancel_reservation',
        'select underclub.ep_cancel_reservation(p_token => $1, p_reservation_id => $2::uuid) as r',
        [token, reservationId]);
      return row.r;
    },
    close() {
      return pool.end();
    },
  };
}
