/** POST /api/reservations/cancel { reservationId } → ep_cancel_reservation. */
import type { OkResponse } from '@underclub/shared';
import { clearedSessionCookie, readSessionCookie, sessionCookie } from '../cookies.js';
import { apiError, guardPost, json, readJsonObject, safeHandler } from '../http.js';
import { requireUuid } from '../validate.js';

export const handleCancel = safeHandler('cancel', 'POST', async (request, deps) => {
  const guard = guardPost(request, deps.env);
  if (guard) return guard;

  const reservationId = requireUuid(await readJsonObject(request), 'reservationId');
  const cookie = readSessionCookie(request);
  const clear = { setCookie: [clearedSessionCookie()] };
  if (!cookie.token) return apiError(401, 'unauthorized', undefined, cookie.sent ? clear : {});

  const outcome = await deps.rpc.cancelReservation(cookie.token, reservationId);
  const renew = { setCookie: [sessionCookie(cookie.token)] };
  switch (outcome) {
    case 'ok':
      return json(200, { status: 'ok' } satisfies OkResponse, renew);
    case 'invalid_session':
      return apiError(401, 'unauthorized', undefined, clear);
    case 'not_found':
      return apiError(404, 'not_found', undefined, renew);
    case 'not_cancellable':
      return apiError(409, 'not_cancellable', undefined, renew);
    default:
      throw new Error(`unknown cancel outcome ${String(outcome)}`);
  }
});
