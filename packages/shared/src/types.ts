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

export interface Event {
  id: string;
  title: string;
  date: string;       // ISO date (YYYY-MM-DD)
  time: string;       // HH:MM
  status: EventStatus;
  created_at: string;  // ISO timestamptz
}

export interface EventArtist {
  id: string;
  event_id: string;
  name: string;
  origin: string | null;
  sort_order: number;
}

export interface EventEntry {
  id: string;
  event_id: string;
  name: string;
  note: string | null;
  quota: number | null;  // null = unlimited
  sort_order: number;
}

export interface Reservation {
  id: string;
  event_id: string;
  entry_id: string;
  full_name: string;
  date_of_birth: string; // ISO date
  email: string;
  status: ReservationStatus;
  ticket_opened_at: string | null;
  qr_scanned_at: string | null;
  created_at: string;
}

/** Event with its related lineup and ticket tiers. */
export interface EventWithDetails extends Event {
  event_artists: EventArtist[];
  event_entries: EventEntry[];
}

/** Reservation with the entry tier it was booked under. */
export interface ReservationWithEntry extends Reservation {
  event_entry: EventEntry;
}
