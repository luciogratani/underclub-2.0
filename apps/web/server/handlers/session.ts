/** GET /api/session → ep_session + ep_my_reservations. */
import type { MyReservation, SessionResponse } from '@underclub/shared';
import { clearedSessionCookie, readSessionCookie, sessionCookie } from '../cookies.js';
import { apiError, json, safeHandler } from '../http.js';
import type { MyReservationRow } from '../rpc.js';

function toMyReservation(r: MyReservationRow): MyReservation {
  return {
    reservationId: r.reservation_id,
    status: r.status,
    eventTitle: r.event_title,
    eventDate: r.event_date,
    eventTime: r.event_time,
    entryName: r.entry_name,
    entryPrice: Number(r.entry_price),
    entryValidUntil: r.entry_valid_until,
    qrScanned: r.qr_scanned_at !== null,
  };
}

export const handleSession = safeHandler('session', 'GET', async (request, deps) => {
  const cookie = readSessionCookie(request);
  if (!cookie.token) {
    return apiError(401, 'unauthorized', undefined, cookie.sent ? { setCookie: [clearedSessionCookie()] } : {});
  }

  const contact = await deps.rpc.session(cookie.token);
  if (!contact) return apiError(401, 'unauthorized', undefined, { setCookie: [clearedSessionCookie()] });

  const reservations = await deps.rpc.myReservations(cookie.token);
  const res: SessionResponse = {
    contact: {
      email: contact.email,
      fullName: contact.full_name,
      marketingConsent: contact.marketing_consent,
      profilingConsent: contact.profiling_consent,
    },
    reservations: reservations.map(toMyReservation),
  };
  return json(200, res, { setCookie: [sessionCookie(cookie.token)] });
});
