/**
 * Client for the passwordless booking endpoints (see `@underclub/shared` api.ts
 * for the HTTP contract). The session lives in the httpOnly `uc_session`
 * cookie: this module never sees it, it only sends same-origin requests.
 */
import type {
  ActivateResponse,
  ApiErrorCode,
  BookingRequest,
  BookingResponse,
  CheckEmailResponse,
  OkResponse,
  SessionResponse,
} from "@underclub/shared";

const KNOWN_ERROR_CODES: readonly ApiErrorCode[] = [
  "bad_origin",
  "bad_request",
  "invalid_input",
  "not_bookable",
  "invalid_entry",
  "sold_out",
  "unauthorized",
  "not_found",
  "not_cancellable",
  "server_error",
];

/** Non-2xx answer (or unreadable response) from a booking endpoint. */
export class BookingApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, status: number, message?: string) {
    super(message || code);
    this.name = "BookingApiError";
    this.code = code;
    this.status = status;
  }
}

async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
    });
  } catch {
    throw new BookingApiError("server_error", 0, "Network error");
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }

  if (!res.ok) {
    const payload = (json ?? {}) as { error?: unknown; message?: unknown };
    const code = KNOWN_ERROR_CODES.includes(payload.error as ApiErrorCode)
      ? (payload.error as ApiErrorCode)
      : "server_error";
    const message = typeof payload.message === "string" ? payload.message : undefined;
    throw new BookingApiError(code, res.status, message);
  }

  if (json === null) {
    throw new BookingApiError("server_error", res.status, "Invalid response");
  }
  return json as T;
}

/** Current session, or null when there is none (401) or the API is unreachable. */
export async function getSession(): Promise<SessionResponse | null> {
  try {
    return await request<SessionResponse>("GET", "/api/session");
  } catch {
    return null;
  }
}

export function book(req: BookingRequest): Promise<BookingResponse> {
  return request<BookingResponse>("POST", "/api/reservations", req);
}

export function activate(token: string): Promise<ActivateResponse> {
  return request<ActivateResponse>("POST", "/api/auth/activate", { token });
}

export function requestLoginLink(email: string): Promise<CheckEmailResponse> {
  return request<CheckEmailResponse>("POST", "/api/auth/login-link", {
    email: email.trim().toLowerCase(),
  });
}

export function logout(): Promise<OkResponse> {
  return request<OkResponse>("POST", "/api/auth/logout");
}

export function cancelReservation(reservationId: string): Promise<OkResponse> {
  return request<OkResponse>("POST", "/api/reservations/cancel", { reservationId });
}
