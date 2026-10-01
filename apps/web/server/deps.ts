/** Handler dependencies, and how a Vercel function builds them from env. */
import { readEnv, type ServerEnv } from './env.js';
import { createEmailTransport, type EmailTransport } from './email.js';
import { createSupabaseRpc, type Rpc } from './rpc.js';
import { apiError } from './http.js';

export interface Deps {
  rpc: Rpc;
  email: EmailTransport;
  env: ServerEnv;
  /** Injectable clock (tests). */
  now?: () => Date;
}

export type Handler = (request: Request, deps: Deps) => Promise<Response>;

let cached: Deps | null = null;

/** Deps for the Vercel runtime, built once per function instance. */
export function depsFromProcessEnv(): Deps {
  if (cached) return cached;
  const env = readEnv(process.env);
  cached = {
    env,
    rpc: createSupabaseRpc(env.supabaseUrl!, env.supabaseServiceRoleKey!),
    email: createEmailTransport(env),
  };
  return cached;
}

/** Entry point used by every file in `api/`. */
export async function runVercel(handler: Handler, request: Request): Promise<Response> {
  let deps: Deps;
  try {
    deps = depsFromProcessEnv();
  } catch (err) {
    console.error('[api] configuration error:', err instanceof Error ? err.message : 'unknown');
    return apiError(500, 'server_error');
  }
  return handler(request, deps);
}
