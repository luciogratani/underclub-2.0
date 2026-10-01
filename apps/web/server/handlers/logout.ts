/** POST /api/auth/logout → ep_logout (when a cookie exists), cookie cleared. */
import type { OkResponse } from '@underclub/shared';
import { clearedSessionCookie, readSessionCookie } from '../cookies.js';
import { apiError, guardPost, json, safeHandler } from '../http.js';

export const handleLogout = safeHandler('logout', 'POST', async (request, deps) => {
  const guard = guardPost(request, deps.env);
  if (guard) return guard;

  // No body is needed: it is not read.
  const cookie = readSessionCookie(request);
  const setCookie = [clearedSessionCookie()];
  if (cookie.token) {
    try {
      await deps.rpc.logout(cookie.token);
    } catch (err) {
      // The cookie goes away on this device anyway, but say the server-side revoke failed.
      console.error('[api:logout] revoke failed:', err instanceof Error ? err.message : 'unknown');
      return apiError(500, 'server_error', undefined, { setCookie });
    }
  }
  return json(200, { status: 'ok' } satisfies OkResponse, { setCookie });
});
