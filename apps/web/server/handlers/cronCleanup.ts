/**
 * GET /api/cron/cleanup → ep_cleanup. Called daily by Vercel Cron, which
 * sends `Authorization: Bearer ${CRON_SECRET}`.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { apiError, json, safeHandler } from '../http.js';

/** Constant-time comparison (hashing first makes the lengths equal). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

export const handleCronCleanup = safeHandler('cron-cleanup', 'GET', async (request, deps) => {
  const auth = request.headers.get('authorization') ?? '';
  if (!safeEqual(auth, `Bearer ${deps.env.cronSecret}`)) return apiError(401, 'unauthorized');

  const counts = await deps.rpc.cleanup();
  // Counts only: the function returns nothing else, but stay strict.
  const numeric = Object.fromEntries(Object.entries(counts).filter(([, v]) => typeof v === 'number'));
  console.info('[api:cron-cleanup] deleted:', JSON.stringify(numeric));
  return json(200, numeric);
});
