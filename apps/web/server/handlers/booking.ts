/** POST /api/reservations → ep_request_booking. */
import type { BookingResponse } from '@underclub/shared';
import { clearedSessionCookie, readSessionCookie, sessionCookie } from '../cookies.js';
import { apiError, guardPost, json, readJsonObject, safeHandler } from '../http.js';
import { validateBooking } from '../validate.js';
import { absoluteUrl, activationLink, buildTicketUrl } from '../links.js';
import { activationEmail, alreadyBookedEmail, ticketEmail, type EventInfo } from '../emails/templates.js';
import type { BookingRow } from '../rpc.js';

function eventInfo(row: BookingRow): EventInfo {
  return { title: row.event_title, date: row.event_date, time: row.event_time, entryName: row.entry_name };
}

export const handleBooking = safeHandler('reservations', 'POST', async (request, deps) => {
  const guard = guardPost(request, deps.env);
  if (guard) return guard;

  const body = await readJsonObject(request);
  const input = validateBooking(body, deps.now?.() ?? new Date());
  const cookie = readSessionCookie(request);
  // The client sends identity fields only when it shows the form, i.e. when it
  // believes nobody is logged in. Honour that: a leftover cookie (failed
  // logout, shared phone, session check that failed on load) must never turn
  // someone else's form into a confirmed booking on the cookie's account.
  const formBooking = input.fullName !== null || input.dateOfBirth !== null || input.email !== null;
  const sessionToken = formBooking ? null : cookie.token;

  const row = await deps.rpc.requestBooking({
    p_session_token: sessionToken,
    p_event_id: input.eventId,
    p_entry_id: input.entryId,
    p_full_name: input.fullName,
    p_date_of_birth: input.dateOfBirth,
    p_email: input.email,
    p_consent_marketing: input.consentMarketing,
    p_consent_profiling: input.consentProfiling,
    p_source: input.source,
  });

  // The DB took the no-session path although a session token was sent: it is
  // dead. A cookie deliberately left out for a form booking is not touched.
  const clearIfSent = cookie.sent && !formBooking ? [clearedSessionCookie()] : [];
  const renew = sessionToken ? [sessionCookie(sessionToken)] : [];
  // A malformed cookie is never valid: drop it whatever the outcome.
  const clearIfMalformed = cookie.sent && !cookie.token ? [clearedSessionCookie()] : [];
  const checkEmail = (): Response => json(200, { status: 'check_email' } satisfies BookingResponse, { setCookie: clearIfSent });

  switch (row.outcome) {
    case 'not_bookable':
      return apiError(409, 'not_bookable', undefined, { setCookie: clearIfMalformed });
    case 'sold_out':
      return apiError(409, 'sold_out', undefined, { setCookie: clearIfMalformed });
    case 'invalid_entry':
      return apiError(400, 'invalid_entry', undefined, { setCookie: clearIfMalformed });
    case 'invalid_input':
      // Only the no-session path can miss identity fields.
      return apiError(400, 'invalid_input', 'fullName, dateOfBirth and email are required', { setCookie: clearIfSent });

    case 'confirmed': {
      if (!row.reservation_id || !row.ticket_token) throw new Error('confirmed without reservation/ticket');
      const ticketUrl = buildTicketUrl(row.reservation_id, row.ticket_token);
      if (row.contact_email) {
        // The clear ticket token is stored nowhere: this email is the user's
        // durable copy. A failure is logged but does not fail the booking,
        // which is already confirmed and returned with its ticketUrl.
        const mail = ticketEmail({
          fullName: row.contact_full_name,
          ticketLink: absoluteUrl(deps.env, ticketUrl),
          event: eventInfo(row),
        });
        await deps.email.send({ kind: 'ticket', to: row.contact_email, ...mail }).catch((err: unknown) => {
          console.error('[api:reservations] ticket email failed:', err instanceof Error ? err.message : 'unknown');
        });
      }
      const res: BookingResponse = { status: 'confirmed', reservationId: row.reservation_id, ticketUrl };
      return json(200, res, { setCookie: renew });
    }

    case 'pending': {
      if (!row.activation_token || !row.contact_email) throw new Error('pending without activation token');
      const mail = activationEmail({
        fullName: row.contact_full_name,
        link: activationLink(deps.env, row.activation_token),
        event: eventInfo(row),
      });
      // Failure → 502: the pending row is reused on retry, so retrying is safe.
      if (!(await sendOrReport(deps.email.send({ kind: 'activation', to: row.contact_email, ...mail })))) {
        return apiError(502, 'server_error', 'Email could not be sent', { setCookie: clearIfSent });
      }
      return checkEmail();
    }

    case 'already_booked': {
      if (row.activation_token) {
        // No-session path: answer exactly like `pending` (anti-enumeration)
        // and tell the owner of the address by email, with a login link.
        if (!row.contact_email) throw new Error('already_booked without contact email');
        const mail = alreadyBookedEmail({
          fullName: row.contact_full_name,
          loginLink: activationLink(deps.env, row.activation_token),
          event: eventInfo(row),
        });
        if (!(await sendOrReport(deps.email.send({ kind: 'already_booked', to: row.contact_email, ...mail })))) {
          return apiError(502, 'server_error', 'Email could not be sent', { setCookie: clearIfSent });
        }
        return checkEmail();
      }
      if (!sessionToken || !row.reservation_id) {
        // Should not happen (no session, no login token): never reveal the booking.
        console.error('[api:reservations] already_booked without session nor login token');
        return checkEmail();
      }
      const res: BookingResponse = { status: 'already_booked', reservationId: row.reservation_id, ticketUrl: null };
      return json(200, res, { setCookie: renew });
    }

    default:
      throw new Error(`unknown outcome ${String((row as { outcome: unknown }).outcome)}`);
  }
});

async function sendOrReport(sending: Promise<void>): Promise<boolean> {
  try {
    await sending;
    return true;
  } catch (err) {
    console.error('[api:reservations] email failed:', err instanceof Error ? err.message : 'unknown');
    return false;
  }
}
