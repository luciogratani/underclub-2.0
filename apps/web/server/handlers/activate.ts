/** POST /api/auth/activate { token } → ep_activate. */
import type { ActivateResponse } from '@underclub/shared';
import { isWellFormedToken, sessionCookie } from '../cookies.js';
import { guardPost, json, readJsonObject, safeHandler } from '../http.js';
import { readActivationToken } from '../validate.js';
import { absoluteUrl, buildTicketUrl } from '../links.js';
import { ticketEmail, type EventInfo } from '../emails/templates.js';
import type { Deps } from '../deps.js';

/** ep_activate does not return event details: read them through the new session. */
async function eventFor(deps: Deps, sessionToken: string, reservationId: string): Promise<EventInfo> {
  const empty: EventInfo = { title: null, date: null, time: null, entryName: null };
  try {
    const r = (await deps.rpc.myReservations(sessionToken)).find((x) => x.reservation_id === reservationId);
    return r ? { title: r.event_title, date: r.event_date, time: r.event_time, entryName: r.entry_name } : empty;
  } catch {
    return empty;
  }
}

export const handleActivate = safeHandler('activate', 'POST', async (request, deps) => {
  const guard = guardPost(request, deps.env);
  if (guard) return guard;

  const token = readActivationToken(await readJsonObject(request));
  if (!isWellFormedToken(token)) return json(200, { status: 'invalid' } satisfies ActivateResponse);

  const row = await deps.rpc.activate(token);
  if (row.outcome === 'invalid' || row.outcome === 'expired') {
    return json(200, { status: row.outcome } satisfies ActivateResponse);
  }
  if (row.outcome !== 'ok' || !row.session_token) throw new Error('activate ok without session token');

  const setCookie = [sessionCookie(row.session_token)];
  const reservation = row.reservation_outcome ?? 'none';

  if (reservation === 'confirmed') {
    if (!row.reservation_id || !row.ticket_token) throw new Error('confirmed without reservation/ticket');
    const ticketUrl = buildTicketUrl(row.reservation_id, row.ticket_token);
    if (row.contact_email) {
      const mail = ticketEmail({
        fullName: row.contact_full_name,
        ticketLink: absoluteUrl(deps.env, ticketUrl),
        event: await eventFor(deps, row.session_token, row.reservation_id),
      });
      // Not fatal: the booking is confirmed and the ticketUrl is in the response.
      await deps.email.send({ kind: 'ticket', to: row.contact_email, ...mail }).catch((err: unknown) => {
        console.error('[api:activate] ticket email failed:', err instanceof Error ? err.message : 'unknown');
      });
    }
    return json(200, { status: 'ok', reservation: 'confirmed', ticketUrl } satisfies ActivateResponse, { setCookie });
  }

  return json(200, { status: 'ok', reservation } satisfies ActivateResponse, { setCookie });
});
