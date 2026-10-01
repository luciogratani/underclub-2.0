import type { ServerEnv } from './env.js';

/**
 * Relative ticket URL. Same format as `buildTicketUrl` in
 * `@underclub/shared` (api.ts), duplicated because that package ships raw
 * .ts source and can only be imported as types from a Vercel function.
 */
export function buildTicketUrl(reservationId: string, ticketToken: string): string {
  return `/ticket/${reservationId}?t=${encodeURIComponent(ticketToken)}`;
}

export function absoluteUrl(env: ServerEnv, path: string): string {
  return `${env.publicSiteUrl}${path}`;
}

/** Activation and login links share the same page. */
export function activationLink(env: ServerEnv, token: string): string {
  return absoluteUrl(env, `/activate?token=${encodeURIComponent(token)}`);
}
