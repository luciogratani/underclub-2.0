/** JSON responses, error mapping and the CSRF guard shared by every handler. */
import type { ApiErrorCode } from '@underclub/shared';
import type { ServerEnv } from './env.js';
import type { Deps, Handler } from './deps.js';

export const MAX_BODY_BYTES = 8 * 1024;

/** Extra response headers; `setCookie` entries become separate Set-Cookie headers. */
export interface ResponseExtras {
  setCookie?: string[];
}

export function json(status: number, body: unknown, extras: ResponseExtras = {}): Response {
  const headers = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  for (const cookie of extras.setCookie ?? []) headers.append('Set-Cookie', cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

export function apiError(
  status: number,
  error: ApiErrorCode,
  message?: string,
  extras?: ResponseExtras,
): Response {
  return json(status, message ? { error, message } : { error }, extras);
}

/** Thrown by body parsing/validation, turned into a 4xx by `safeHandler`. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'HttpError';
  }
}

function isLocalhostOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  } catch {
    return false;
  }
}

export function isAllowedOrigin(origin: string | null, env: ServerEnv): boolean {
  if (!origin || origin === 'null') return false;
  if (env.allowedOrigins.includes(origin)) return true;
  return env.allowLocalhostOrigins && isLocalhostOrigin(origin);
}

/**
 * CSRF guard for every POST: JSON content type (not a "simple" request, so
 * cross-site forms cannot send it without a preflight) and an allowed Origin.
 */
export function guardPost(request: Request, env: ServerEnv): Response | null {
  const type = (request.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase();
  if (type !== 'application/json' || !isAllowedOrigin(request.headers.get('origin'), env)) {
    return apiError(403, 'bad_origin');
  }
  return null;
}

async function readCapped(request: Request): Promise<string> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) throw new HttpError(400, 'bad_request', 'Body too large');
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new HttpError(400, 'bad_request', 'Body too large');
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(all);
}

/** Reads a JSON object body (max 8 KB). Anything else is a 400 bad_request. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  let text: string;
  try {
    text = await readCapped(request);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, 'bad_request', 'Unreadable body');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(400, 'bad_request', 'Body must be JSON');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new HttpError(400, 'bad_request', 'Body must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

/**
 * Wraps a handler: method check, HttpError → 4xx, anything else → 500 with a
 * log line that carries the error message only (never the body or tokens).
 */
export function safeHandler(name: string, method: 'GET' | 'POST', handler: Handler): Handler {
  return async (request: Request, deps: Deps) => {
    if (request.method !== method) {
      const res = apiError(405, 'bad_request', 'Method not allowed');
      res.headers.set('Allow', method);
      return res;
    }
    try {
      return await handler(request, deps);
    } catch (err) {
      if (err instanceof HttpError) return apiError(err.status, err.code, err.message);
      console.error(`[api:${name}] unexpected error:`, err instanceof Error ? err.message : 'unknown');
      return apiError(500, 'server_error');
    }
  };
}
