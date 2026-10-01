/**
 * HTTP contract between the public web app and the serverless booking
 * endpoints (passwordless booking, activation, session, cancellation).
 *
 * All responses are JSON. Errors come back as `ApiError` with a 4xx/5xx status.
 */

export type ApiErrorCode =
  | 'bad_origin'
  | 'bad_request'
  | 'invalid_input'
  | 'not_bookable'
  | 'invalid_entry'
  | 'sold_out'
  | 'unauthorized'
  | 'not_found'
  | 'not_cancellable'
  | 'server_error';

export interface ApiError {
  error: ApiErrorCode;
  message?: string;
}

// POST /api/reservations (optional `uc_session` cookie)
export interface BookingRequest {
  eventId: string;
  entryId: string;
  // Required when there is no session.
  fullName?: string;
  dateOfBirth?: string; // YYYY-MM-DD
  email?: string;
  consentMarketing?: boolean;
  consentProfiling?: boolean;
  source?: string | null;
}

export type BookingResponse =
  | { status: 'confirmed'; reservationId: string; ticketUrl: string } // with session
  | { status: 'already_booked'; reservationId: string; ticketUrl: null } // with session
  | { status: 'check_email' }; // without session: pending OR already booked (anti-enumeration)
// sold_out / not_bookable / invalid_entry / invalid_input → error 409/409/400/400

// POST /api/auth/activate
export interface ActivateRequest {
  token: string;
}

export type ActivateResponse =
  | { status: 'ok'; reservation: 'confirmed'; ticketUrl: string }
  | { status: 'ok'; reservation: 'expired' | 'unavailable' | 'none' }
  | { status: 'invalid' }
  | { status: 'expired' }; // 200 also for invalid/expired

// POST /api/auth/login-link → always CheckEmailResponse
export interface LoginLinkRequest {
  email: string;
}

export interface CheckEmailResponse {
  status: 'check_email';
}

// POST /api/auth/logout, POST /api/reservations/cancel
export interface OkResponse {
  status: 'ok';
}

// POST /api/reservations/cancel → OkResponse | unauthorized / not_found / not_cancellable
export interface CancelReservationRequest {
  reservationId: string;
}

// GET /api/session → 200 SessionResponse | 401 { error: 'unauthorized' }
export interface SessionContact {
  email: string;
  fullName: string;
  marketingConsent: boolean;
  profilingConsent: boolean;
}

export interface MyReservation {
  reservationId: string;
  status: 'confirmed' | 'pending';
  eventTitle: string;
  eventDate: string;
  eventTime: string;
  entryName: string;
  entryPrice: number;
  entryValidUntil: string | null;
  qrScanned: boolean;
}

export interface SessionResponse {
  contact: SessionContact;
  reservations: MyReservation[];
}

/** Relative URL of the ticket page for a reservation and its clear ticket token. */
export function buildTicketUrl(reservationId: string, ticketToken: string): string {
  return `/ticket/${reservationId}?t=${encodeURIComponent(ticketToken)}`;
}
