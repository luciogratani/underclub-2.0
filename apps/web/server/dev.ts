/**
 * Dev-only bridge: the Vite dev server routes `/api/*` here (via
 * `ssrLoadModule`, see vite.config.ts) so the same handlers run locally.
 *
 * - Env comes from Vite's `loadEnv(mode, envDir, '')`: server-only, never
 *   exposed to the client bundle.
 * - `DEV_PG_URL` set → `pg`-backed Rpc against a local Postgres (the harness
 *   of supabase/tests/run.sh); otherwise supabase-js with the service key.
 * - Email always goes to the console transport: links are printed in the
 *   terminal, nothing is sent.
 * - Any http://localhost:<port> origin is accepted.
 * - BotID never blocks (`notABot`); TICKET_SECRET / IP_HASH_SECRET /
 *   CRON_SECRET fall back to dev-only defaults when unset (see env.ts).
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readEnv } from './env.js';
import { createConsoleTransport } from './email.js';
import { createSupabaseRpc, type Rpc } from './rpc.js';
import { apiError } from './http.js';
import { routes } from './routes.js';
import type { Deps } from './deps.js';
import { notABot } from './botid.js';

type EnvSource = Record<string, string | undefined>;

// Survives module re-evaluation on HMR, so the pg pool is not recreated.
const store = globalThis as typeof globalThis & { __ucDevRpc?: Map<string, Rpc> };
store.__ucDevRpc ??= new Map();

async function rpcFor(source: EnvSource, ticketSecret: string): Promise<Rpc> {
  const pgUrl = source.DEV_PG_URL?.trim();
  const target = pgUrl ? `pg:${pgUrl}` : `supabase:${source.SUPABASE_URL ?? ''}`;
  // In-memory only: a changed secret in .env gets its own Rpc.
  const key = `${target}|${ticketSecret}`;
  let rpc = store.__ucDevRpc!.get(key);
  if (!rpc) {
    if (pgUrl) {
      const { createPgRpc } = await import('./rpc-pg.js');
      rpc = createPgRpc(pgUrl, ticketSecret);
    } else {
      rpc = createSupabaseRpc(source.SUPABASE_URL ?? '', source.SUPABASE_SERVICE_ROLE_KEY ?? '', ticketSecret);
    }
    store.__ucDevRpc!.set(key, rpc);
  }
  return rpc;
}

async function devDeps(source: EnvSource, host: string): Promise<Deps> {
  const withDefaults: EnvSource = {
    ...source,
    PUBLIC_SITE_URL: source.PUBLIC_SITE_URL || `http://${host}`,
    EMAIL_TRANSPORT: 'console',
  };
  const env = readEnv(withDefaults, { dev: true, requireSupabase: !source.DEV_PG_URL?.trim() });
  return { env, rpc: await rpcFor(source, env.ticketSecret), email: createConsoleTransport(), botCheck: notABot };
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

async function toWebRequest(req: IncomingMessage, host: string): Promise<Request> {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => headers.append(name, v));
    else headers.set(name, value);
  }
  const method = req.method ?? 'GET';
  const body = method === 'GET' || method === 'HEAD' ? undefined : new Uint8Array(await readBody(req));
  return new Request(new URL(req.url ?? '/', `http://${host}`), { method, headers, body });
}

async function sendWebResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  const cookies = response.headers.getSetCookie();
  response.headers.forEach((value, name) => {
    if (name.toLowerCase() !== 'set-cookie') res.setHeader(name, value);
  });
  if (cookies.length > 0) res.setHeader('Set-Cookie', cookies);
  res.end(Buffer.from(await response.arrayBuffer()));
}

/** Returns false when the path is not an API route (let Vite continue). */
export async function handleDevRequest(
  req: IncomingMessage,
  res: ServerResponse,
  source: EnvSource,
): Promise<boolean> {
  const path = (req.url ?? '/').split('?')[0]!.replace(/\/+$/, '');
  const handler = routes[path];
  const host = req.headers.host ?? 'localhost';
  if (!handler) {
    await sendWebResponse(res, apiError(404, 'not_found'));
    return true;
  }
  let deps: Deps;
  try {
    deps = await devDeps(source, host);
  } catch (err) {
    console.error('[api:dev] configuration error:', err instanceof Error ? err.message : 'unknown');
    await sendWebResponse(res, apiError(500, 'server_error', 'Dev API not configured, see apps/web/.env.example'));
    return true;
  }
  await sendWebResponse(res, await handler(await toWebRequest(req, host), deps));
  return true;
}
