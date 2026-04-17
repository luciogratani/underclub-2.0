import {
  type PublicEventView,
  type PublicReservationFormInput,
  type CreateReservationResult,
  type TicketViewData,
  type ReservationStatus,
  toPublicEventView,
  toCreateReservationCommand,
  toTicketViewData,
} from '@underclub/shared';
import { createTicketSupabaseClient, supabase } from './supabase';

const DEBUG_LOG = import.meta.env.DEV;

// ---------------------------------------------------------------------------
// Next published event
// ---------------------------------------------------------------------------

export async function fetchNextEvent(): Promise<PublicEventView | null> {
  if (!supabase) {
    if (DEBUG_LOG) {
      console.info('[underclub][fetchNextEvent] supabase client not configured');
    }
    return null;
  }

  const today = new Date().toISOString().split('T')[0];
  if (DEBUG_LOG) {
    console.info('[underclub][fetchNextEvent] querying next published event', { today });
  }

  const { data: event, error } = await supabase
    .from('events')
    .select('*, event_artists(*), event_entries(*)')
    .eq('status', 'published')
    .gte('date', today)
    .order('date', { ascending: true })
    .limit(1)
    .single();

  if (error || !event) {
    if (DEBUG_LOG) {
      console.warn('[underclub][fetchNextEvent] no event returned', {
        hasError: Boolean(error),
        errorCode: error?.code,
        errorMessage: error?.message,
      });
    }
    return null;
  }

  if (DEBUG_LOG) {
    console.info('[underclub][fetchNextEvent] event found', {
      id: event.id,
      title: event.title,
      date: event.date,
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

  const view = toPublicEventView(event, counts);
  if (DEBUG_LOG) {
    console.info('[underclub][fetchNextEvent] mapped public event view', {
      id: view.id,
      title: view.title,
      entriesCount: view.entries.length,
    });
  }
  return view;
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
    ticketUrl: `/ticket/${data.reservation_id}?t=${encodeURIComponent(data.ticket_token)}`,
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
