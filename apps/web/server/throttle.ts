/**
 * Per-IP limits on the endpoints that send email (contract v2 §F).
 *
 * The client IP never reaches the database: it is reduced to an
 * HMAC-SHA256 with IP_HASH_SECRET first, and it is never logged.
 */
import { createHmac } from 'node:crypto';
import { apiError } from './http.js';
import type { Deps } from './deps.js';

export interface IpLimit {
  /** `request_throttle.action`. */
  action: string;
  limit: number;
  windowSeconds: number;
}

/**
 * Bookings: 20 per 10 minutes per IP. Generous on purpose: at an event many
 * people share the venue's wifi (one public IP) and book in the same minutes.
 */
export const BOOKING_IP_LIMIT: IpLimit = { action: 'booking', limit: 20, windowSeconds: 600 };

/** Login links: 5 per 10 minutes per IP; nobody needs more to sign in. */
export const LOGIN_LINK_IP_LIMIT: IpLimit = { action: 'login_link', limit: 5, windowSeconds: 600 };

/**
 * Client IP as set by Vercel's edge: `x-real-ip`, else the first entry of
 * `x-forwarded-for`, else `unknown` (all such requests share one bucket).
 */
export function clientIp(request: Request): string {
  const real = request.headers.get('x-real-ip')?.trim();
  if (real) return real;
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || 'unknown';
}

/** Hex HMAC-SHA256 of the IP: the only form stored in `request_throttle`. */
export function ipKeyHash(ip: string, secret: string): string {
  return createHmac('sha256', secret).update(ip).digest('hex');
}

/** 429 `rate_limited` when this IP is over the limit, otherwise null. */
export async function enforceIpLimit(request: Request, deps: Deps, rule: IpLimit): Promise<Response | null> {
  const key = ipKeyHash(clientIp(request), deps.env.ipHashSecret);
  const allowed = await deps.rpc.throttle(key, rule.action, rule.limit, rule.windowSeconds);
  if (allowed) return null;
  const res = apiError(429, 'rate_limited');
  res.headers.set('Retry-After', String(rule.windowSeconds));
  return res;
}
