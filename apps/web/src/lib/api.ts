import {
  type EventWithDetails,
  type PublicEventView,
  type TicketViewData,
  toPublicEventView,
  toTicketViewDataFromPublicTicket,
} from '@underclub/shared';
import { supabase } from './supabase';

const DEBUG_LOG = import.meta.env.DEV;

// ---------------------------------------------------------------------------
// Next published event
// ---------------------------------------------------------------------------

/**
 * The home is picked from this, once: a night (`event`), no night published
 * (`none`), or the database could not be read (`error`). "Next" = the first
 * published night that is not over (`is_over`, computed by the database: a
 * night ends at 06:00 Europe/Rome of the day after its date). No date maths
 * in the browser.
 */
export type NextEventResult =
  | { kind: 'event'; event: PublicEventView }
  | { kind: 'none' }
  | { kind: 'error' };

export async function fetchNextEvent(): Promise<NextEventResult> {
  if (!supabase) {
    if (DEBUG_LOG) {
      console.info('[underclub][fetchNextEvent] supabase client not configured');
    }
    return { kind: 'error' };
  }

  // `booking_deadline` and `is_over` are computed fields (SQL functions on
  // the events row), see rls-history/2026-10-02-night-end-booking-close.sql.
  const { data, error } = await supabase
    .from('events')
    .select('*, booking_deadline, event_artists(*), event_entries(*)')
    .eq('status', 'published')
    .eq('is_over', false)
    .order('date', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (DEBUG_LOG) {
      console.warn('[underclub][fetchNextEvent] query failed', {
        errorCode: error.code,
        errorMessage: error.message,
      });
    }
    return { kind: 'error' };
  }
  if (!data) {
    if (DEBUG_LOG) console.info('[underclub][fetchNextEvent] no published night');
    return { kind: 'none' };
  }

  const event = data as unknown as EventWithDetails & { booking_deadline: string };
  if (DEBUG_LOG) {
    console.info('[underclub][fetchNextEvent] event found', {
      id: event.id,
      title: event.title,
      date: event.date,
      bookingDeadline: event.booking_deadline,
      lineupCount: event.event_artists?.length ?? 0,
      entriesCount: event.event_entries?.length ?? 0,
    });
  }

  const { data: reservations, error: countsError } = await supabase.rpc(
    'get_public_entry_counts',
    { p_event_id: event.id },
  );

  if (countsError && DEBUG_LOG) {
    console.warn('[underclub][fetchNextEvent] count RPC failed', {
      errorCode: countsError.code,
      errorMessage: countsError.message,
    });
  }

  const counts = new Map<string, number>();
  for (const r of reservations ?? []) {
    counts.set(r.entry_id, r.confirmed_count);
  }

  return { kind: 'event', event: toPublicEventView(event, counts) };
}

// ---------------------------------------------------------------------------
// Ticket page
// ---------------------------------------------------------------------------

export async function fetchTicketData(
  reservationId: string,
  ticketToken: string | null,
): Promise<TicketViewData | null> {
  if (!ticketToken) {
    if (DEBUG_LOG) {
      console.warn('[underclub][fetchTicketData] missing ticket token');
    }
    return null;
  }

  if (!supabase) return null;
  const { data, error } = await supabase
    .rpc('open_public_ticket', { p_reservation_id: reservationId, p_token: ticketToken })
    .maybeSingle();
  // No row = the token does not match this reservation.
  if (error || !data) return null;
  return toTicketViewDataFromPublicTicket(data);
}
