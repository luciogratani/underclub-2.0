import type { Database } from './database';

type Tables = Database['underclub']['Tables'];

// ---------------------------------------------------------------------------
// Status constants (runtime values + type extraction)
// ---------------------------------------------------------------------------

export const EVENT_STATUS = {
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
} as const;

export type EventStatus = (typeof EVENT_STATUS)[keyof typeof EVENT_STATUS];

export const RESERVATION_STATUS = {
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
} as const;

export type ReservationStatus =
  (typeof RESERVATION_STATUS)[keyof typeof RESERVATION_STATUS];

// Admin check-in (QR scan) outcomes.
export const ADMIN_SCAN_RESULT = {
  OK: 'ok',
  ALREADY_SCANNED: 'already_scanned',
  CANCELLED: 'cancelled',
  INVALID: 'invalid',
  UNAUTHORIZED: 'unauthorized',
} as const;

export type AdminScanResultCode =
  (typeof ADMIN_SCAN_RESULT)[keyof typeof ADMIN_SCAN_RESULT];

// ---------------------------------------------------------------------------
// Domain types — derived from DB rows (single source of truth)
// ---------------------------------------------------------------------------

export type Event = Tables['events']['Row'];
export type EventInsert = Tables['events']['Insert'];
export type EventUpdate = Tables['events']['Update'];

export type EventArtist = Tables['event_artists']['Row'];
export type EventArtistInsert = Tables['event_artists']['Insert'];

export type EventEntry = Tables['event_entries']['Row'];
export type EventEntryInsert = Tables['event_entries']['Insert'];

export type Reservation = Tables['reservations']['Row'];
export type ReservationInsert = Tables['reservations']['Insert'];
export type ReservationUpdate = Tables['reservations']['Update'];

/** Event with its related lineup and ticket tiers. */
export interface EventWithDetails extends Event {
  event_artists: EventArtist[];
  event_entries: EventEntry[];
}

/** Reservation with the entry tier it was booked under. */
export interface ReservationWithEntry extends Reservation {
  entry: EventEntry;
}

// ---------------------------------------------------------------------------
// Application contracts — public web
// ---------------------------------------------------------------------------

/** UI payload emitted by the public Book Now form (camelCase, DD/MM/YYYY). */
export interface PublicReservationFormInput {
  fullName: string;
  dateOfBirth: string; // DD/MM/YYYY from input
  email: string;
}

/** Normalized create command ready for DB insert. */
export interface CreateReservationCommand {
  eventId: string;
  entryId: string;
  fullName: string;
  dateOfBirthIso: string; // YYYY-MM-DD
  email: string;
}

/** Response after a successful reservation insert. */
export interface CreateReservationResult {
  reservationId: string;
  status: ReservationStatus;
  ticketToken: string;
  ticketUrl: string;
}

/** Artist view model used by public/admin UIs (camelCase). */
export interface ArtistView {
  id: string;
  eventId: string;
  name: string;
  origin: string | null;
  sortOrder: number;
}

/** Ticket tier availability for public rendering. */
export interface EntryAvailability {
  soldOut: boolean;
  left: number | null; // null = unlimited
}

/** Entry tier view model for cards and booking UIs. */
export interface EntryTierView {
  id: string;
  eventId: string;
  name: string;
  note: string | null;
  quota: number | null;
  sortOrder: number;
  availability: EntryAvailability;
}

/** Event shape consumed by the public "Next Date" section. */
export interface PublicEventView {
  id: string;
  title: string;
  date: string; // ISO (YYYY-MM-DD) — formatting is done in the UI layer
  time: string;
  lineup: ArtistView[];
  entries: EntryTierView[];
}

/** Data needed by the ticket page / lanyard card. */
export interface TicketViewData {
  reservationId: string;
  fullName: string;
  email: string;
  eventName: string;
  eventDate: string; // ISO (YYYY-MM-DD)
  entryName: string;
}

/** Input data for the BookNow section (event context + available tiers). */
export interface BookNowPageData {
  eventId: string;
  eventTitle: string;
  entries: EntryTierView[];
}

// ---------------------------------------------------------------------------
// Application contracts — admin
// ---------------------------------------------------------------------------

/** Event row for the admin list / stat cards. */
export interface AdminEventView {
  id: string;
  title: string;
  date: string; // ISO
  time: string;
  status: EventStatus;
  createdAt: string;
  artistCount: number;
  entryCount: number;
  reservationCount: number;
}

/** Reservation row for the admin guest list / check-in. */
export interface AdminReservationView {
  id: string;
  fullName: string;
  email: string;
  entryName: string;
  status: ReservationStatus;
  ticketOpened: boolean;
  qrScanned: boolean;
  createdAt: string;
}

/** Aggregated stats for the admin dashboard home. */
export interface AdminDashboardStats {
  nextEventTitle: string | null;
  nextEventDate: string | null;
  totalReservations: number;
  ticketsOpened: number;
  qrScanned: number;
}

/** Normalized admin-side result of a ticket check-in scan. */
export interface AdminScanResult {
  code: AdminScanResultCode;
  reservationId?: string;
  fullName?: string;
  entryName?: string;
  eventTitle?: string;
  eventDate?: string; // ISO (YYYY-MM-DD)
  scannedAt?: string; // ISO timestamp
}
