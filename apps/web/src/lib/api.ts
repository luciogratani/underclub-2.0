import {
  type EventWithDetails,
  type PublicEventView,
  type PublicReservationFormInput,
  type CreateReservationResult,
  type TicketViewData,
  type ReservationStatus,
  toPublicEventView,
  toCreateReservationCommand,
  toTicketViewData,
  toTicketViewDataFromPublicTicket,
  buildTicketUrl,
} from '@underclub/shared';
import { createTicketSupabaseClient, supabase } from './supabase';
import { BOOKING_API } from './flags';

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
// Create reservation
// ---------------------------------------------------------------------------

export async function createReservation(
  input: PublicReservationFormInput,
  eventId: string,
  entryId: string,
): Promise<CreateReservationResult> {
  if (!supabase) {
    throw new Error('Supabase not configured');
  }

  const cmd = toCreateReservationCommand(input, eventId, entryId);
  const { data, error } = await supabase
    .rpc('create_public_reservation', {
      p_event_id: cmd.eventId,
      p_entry_id: cmd.entryId,
      p_full_name: cmd.fullName,
      p_date_of_birth: cmd.dateOfBirthIso,
      p_email: cmd.email,
    })
    .single();

  if (error || !data) {
    throw error ?? new Error('Unable to create reservation');
  }

  return {
    reservationId: data.reservation_id,
    status: data.reservation_status as ReservationStatus,
    ticketToken: data.ticket_token,
    ticketUrl: buildTicketUrl(data.reservation_id, data.ticket_token),
  };
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

  if (BOOKING_API) {
    if (!supabase) return null;
    const { data, error } = await supabase
      .rpc('open_public_ticket', { p_reservation_id: reservationId, p_token: ticketToken })
      .maybeSingle();
    // No row = token does not match: same outcome as the RLS path below.
    if (error || !data) return null;
    return toTicketViewDataFromPublicTicket(data);
  }

  const ticketSupabase = createTicketSupabaseClient(ticketToken);
  if (!ticketSupabase) return null;

  const { data: reservation, error } = await ticketSupabase
    .from('reservations')
    .select('*')
    .eq('id', reservationId)
    .single();

  if (error || !reservation) return null;

  const [{ data: event }, { data: entry }] = await Promise.all([
    ticketSupabase.from('events').select('*').eq('id', reservation.event_id).single(),
    ticketSupabase
      .from('event_entries')
      .select('*')
      .eq('id', reservation.entry_id)
      .single(),
  ]);

  if (!event || !entry) return null;

  return toTicketViewData(reservation, event, entry);
}

export async function markTicketOpened(
  reservationId: string,
  ticketToken: string | null,
): Promise<void> {
  if (!ticketToken) return;
  const ticketSupabase = createTicketSupabaseClient(ticketToken);
  if (!ticketSupabase) return;

  await ticketSupabase
    .from('reservations')
    .update({ ticket_opened_at: new Date().toISOString() })
    .eq('id', reservationId)
    .is('ticket_opened_at', null);
}
