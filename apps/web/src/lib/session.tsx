/**
 * Passwordless session shared by the whole app: one fetch of
 * `GET /api/session` feeds the home (BookNow, Hero ticket icon), the menu and
 * `/account`.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SessionResponse } from "@underclub/shared";
import { fetchSession, logout as logoutRequest } from "./bookingApi";

type SessionState = {
  session: SessionResponse | null;
  /** True until the first answer from the server. */
  loading: boolean;
  /** Re-reads the session; on a network/5xx failure keeps the current one. */
  refresh: () => Promise<SessionResponse | null>;
  /** Ends the session on the server. Throws if the server could not be reached: the session is kept. */
  logout: () => Promise<void>;
  /** Drops the session locally (the server already told us it is gone). */
  forget: () => void;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const sessionRef = useRef<SessionResponse | null>(null);
  // Only the latest request may write: a slow refresh must not undo a logout.
  const seqRef = useRef(0);

  const apply = useCallback((next: SessionResponse | null) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  const refresh = useCallback(async () => {
    const seq = ++seqRef.current;
    try {
      const next = await fetchSession();
      if (seq === seqRef.current) apply(next);
      return next;
    } catch {
      return sessionRef.current;
    } finally {
      setLoading(false);
    }
  }, [apply]);

  const logout = useCallback(async () => {
    // The httpOnly cookie can only be cleared by the server: if this throws,
    // the caller keeps the session and tells the user.
    await logoutRequest();
    seqRef.current += 1;
    apply(null);
  }, [apply]);

  const forget = useCallback(() => {
    seqRef.current += 1;
    apply(null);
  }, [apply]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ session, loading, refresh, logout, forget }),
    [session, loading, refresh, logout, forget],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}

/** Ticket link of the soonest confirmed reservation that has one, or null. */
export function nextTicketUrl(session: SessionResponse | null): string | null {
  if (!session) return null;
  const withTicket = session.reservations
    .filter((r) => r.status === "confirmed" && r.ticketUrl)
    .sort((a, b) => `${a.eventDate} ${a.eventTime}`.localeCompare(`${b.eventDate} ${b.eventTime}`));
  return withTicket[0]?.ticketUrl ?? null;
}
