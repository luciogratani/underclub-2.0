/** GET /api/session → ep_session_overview (one call: contact + reservations). */
import type { MyReservation, SessionResponse } from '@underclub/shared';
import { clearedSessionCookie, readSessionCookie, sessionCookie } from '../cookies.js';
import { apiError, json, safeHandler } from '../http.js';
import { buildTicketUrl } from '../links.js';
import type { OverviewReservation } from '../rpc.js';

export function toMyReservation(r: OverviewReservation): MyReservation {
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
    // Only derivable tickets come with a token; the others are in the email.
    ticketUrl: r.ticket_token ? buildTicketUrl(r.reservation_id, r.ticket_token) : null,
  };
}

export const handleSession = safeHandler('session', 'GET', async (request, deps) => {
  const cookie = readSessionCookie(request);
  if (!cookie.token) {
    return apiError(401, 'unauthorized', undefined, cookie.sent ? { setCookie: [clearedSessionCookie()] } : {});
  }

  const overview = await deps.rpc.sessionOverview(cookie.token);
  if (!overview) return apiError(401, 'unauthorized', undefined, { setCookie: [clearedSessionCookie()] });

  const { contact } = overview;
  const res: SessionResponse = {
    contact: {
      email: contact.email,
      fullName: contact.full_name,
      marketingConsent: contact.marketing_consent,
      profilingConsent: contact.profiling_consent,
    },
    reservations: (overview.reservations ?? []).map(toMyReservation),
  };
  return json(200, res, { setCookie: [sessionCookie(cookie.token)] });
});
