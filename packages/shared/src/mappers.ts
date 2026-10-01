import type { Database } from './database';
import type {
  Event,
  EventArtist,
  EventEntry,
  EventWithDetails,
  Reservation,
  ReservationWithEntry,
  ArtistView,
  EntryAvailability,
  EntryTierView,
  PublicEventView,
  PublicReservationFormInput,
  CreateReservationCommand,
  TicketViewData,
  AdminReservationView,
  AdminScanResult,
  AdminScanResultCode,
  ReservationStatus,
} from './types';

type ReservationsInsert = Database['underclub']['Tables']['reservations']['Insert'];
type Functions = Database['underclub']['Functions'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert DD/MM/YYYY → YYYY-MM-DD. Returns input unchanged if unparseable. */
export function parseDdMmYyyyToIso(ddmmyyyy: string): string {
  const digits = ddmmyyyy.replace(/\D/g, '');
  if (digits.length !== 8) return ddmmyyyy;
  return `${digits.slice(4, 8)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`;
}

// ---------------------------------------------------------------------------
// Public mappers
// ---------------------------------------------------------------------------

export function toArtistView(row: EventArtist): ArtistView {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    origin: row.origin,
    sortOrder: row.sort_order,
  };
}

export function toEntryAvailability(
  quota: number | null,
  reservationCount: number,
): EntryAvailability {
  return {
    soldOut: quota !== null && reservationCount >= quota,
    left: quota !== null ? Math.max(0, quota - reservationCount) : null,
  };
}

export function toEntryTierView(
  row: EventEntry,
  reservationCount: number,
): EntryTierView {
  return {
    id: row.id,
    eventId: row.event_id,
    name: row.name,
    note: row.note,
    quota: row.quota,
    sortOrder: row.sort_order,
    // `numeric` columns: PostgREST sends a JSON number, coerce defensively.
    // `?? 0` / `?? null`: on a DB without the 2026-10-01 migration the
    // columns are absent and would otherwise surface as NaN / undefined.
    price: Number(row.price ?? 0),
    validUntil: row.valid_until ?? null,
    availability: toEntryAvailability(row.quota, reservationCount),
  };
}

export function toPublicEventView(
  event: EventWithDetails,
  reservationCounts: Map<string, number>,
): PublicEventView {
  return {
    id: event.id,
    title: event.title,
    date: event.date,
    time: event.time,
    lineup: event.event_artists
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(toArtistView),
    entries: event.event_entries
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((e) => toEntryTierView(e, reservationCounts.get(e.id) ?? 0)),
  };
}

// ---------------------------------------------------------------------------
// Reservation creation
// ---------------------------------------------------------------------------

export function toCreateReservationCommand(
  input: PublicReservationFormInput,
  eventId: string,
  entryId: string,
): CreateReservationCommand {
  return {
    eventId,
    entryId,
    fullName: input.fullName.trim(),
    dateOfBirthIso: parseDdMmYyyyToIso(input.dateOfBirth),
    email: input.email.trim().toLowerCase(),
  };
}

export function toReservationInsert(cmd: CreateReservationCommand): ReservationsInsert {
  return {
    event_id: cmd.eventId,
    entry_id: cmd.entryId,
    full_name: cmd.fullName,
    date_of_birth: cmd.dateOfBirthIso,
    email: cmd.email,
  };
}

// ---------------------------------------------------------------------------
// Ticket
// ---------------------------------------------------------------------------

export function toTicketViewData(
  reservation: Reservation,
  event: Event,
  entry: EventEntry,
): TicketViewData {
  return {
    reservationId: reservation.id,
    fullName: reservation.full_name,
    email: reservation.email,
    eventName: event.title,
    eventDate: event.date,
    entryName: entry.name,
    status: reservation.status,
  };
}

/** Row shape returned by the `open_public_ticket` RPC. */
type PublicTicketRow = Functions['open_public_ticket']['Returns'][number];

export function toTicketViewDataFromPublicTicket(row: PublicTicketRow): TicketViewData {
  return {
    reservationId: row.reservation_id,
    fullName: row.full_name ?? '',
    email: row.email ?? '',
    eventName: row.event_title,
    eventDate: row.event_date,
    entryName: row.entry_name,
    status: row.status as ReservationStatus,
  };
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export function toAdminReservationView(row: ReservationWithEntry): AdminReservationView {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    entryName: row.entry.name,
    status: row.status,
    ticketOpened: row.ticket_opened_at !== null,
    qrScanned: row.qr_scanned_at !== null,
    createdAt: row.created_at,
  };
}

/** Row shape returned by `scan_ticket_check_in` RPC. */
type ScanTicketCheckInRow = Functions['scan_ticket_check_in']['Returns'][number];

export function toAdminScanResult(row: ScanTicketCheckInRow): AdminScanResult {
  return {
    code: row.result_code as AdminScanResultCode,
    reservationId: row.reservation_id ?? undefined,
    fullName: row.full_name ?? undefined,
    entryName: row.entry_name ?? undefined,
    eventTitle: row.event_title ?? undefined,
    eventDate: row.event_date ?? undefined,
    scannedAt: row.scanned_at ?? undefined,
    formulaExpired: row.formula_expired ?? undefined,
  };
}
