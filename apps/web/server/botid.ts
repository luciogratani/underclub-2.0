/**
 * Vercel BotID, server side (https://vercel.com/docs/botid/get-started).
 *
 * - The client (`initBotId` from `botid/client/core`) attaches the
 *   classification headers to the protected fetches; without it every
 *   request to a protected route looks like a bot in production.
 * - On Vercel, `checkBotId()` reads the request headers from the function's
 *   request context (no need to pass them) and calls the BotID API with the
 *   deployment's OIDC token (VERCEL_OIDC_TOKEN, on by default).
 * - Off Vercel (NODE_ENV !== 'production') the library answers "human".
 *   The Vite dev server and the tests inject `notABot` instead anyway.
 */
import { checkBotId } from 'botid/server';

/** Returns true when the request must be refused as a bot. */
export type BotCheck = (request: Request) => Promise<boolean>;

export const notABot: BotCheck = async () => false;

export const vercelBotCheck: BotCheck = async () => {
  try {
    const verification = await checkBotId();
    return verification.isBot;
  } catch (err) {
    // Fail open: a BotID outage or misconfiguration (e.g. OIDC disabled)
    // must not stop bookings. The per-IP and per-address limits still apply.
    console.error('[api:botid] check failed:', err instanceof Error ? err.message : 'unknown');
    return false;
  }
};
