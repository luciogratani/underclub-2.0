import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import type { MyReservation } from "@underclub/shared";
import { BOOKING_API } from "../lib/flags";
import { useSession } from "../lib/session";
import { BookingApiError, cancelReservation } from "../lib/bookingApi";
import SiteMenu from "../components/SiteMenu";
import LoginLinkForm from "../components/LoginLinkForm";

const priceFormatter = new Intl.NumberFormat("it-IT", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** "2026-10-11" → "SATURDAY OCTOBER 11", like NextDate / ReservationSummary. */
function formatEventDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
  const month = d.toLocaleDateString("en-US", { month: "long" }).toUpperCase();
  return `${day} ${month} ${String(d.getDate()).padStart(2, "0")}`;
}

function cancelErrorMessage(err: unknown): string {
  const code = err instanceof BookingApiError ? err.code : "server_error";
  switch (code) {
    case "not_cancellable":
      return "this booking can't be cancelled anymore."; // COPY-DRAFT
    case "not_found":
      return "we couldn't find this booking: it may be cancelled already."; // COPY-DRAFT
    case "unauthorized":
      return "you've been logged out. ask for a new link to manage your bookings."; // COPY-DRAFT
    default:
      return "something went wrong. try again in a moment."; // COPY-DRAFT
  }
}

export default function Account() {
  if (!BOOKING_API) return <Navigate to="/" replace />;
  return <AccountPage />;
}

function AccountPage() {
  const { session, loading, logout } = useSession();
  const [logoutError, setLogoutError] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError(false);
    try {
      await logout();
    } catch {
      // The httpOnly cookie can only be cleared by the server: keep the session.
      setLogoutError(true);
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <section
      className="min-h-[100svh] w-full bg-primary px-4 pb-28 pt-10 text-black"
      aria-label="My bookings" // COPY-DRAFT
      aria-busy={loading}
    >
      <div className="mx-auto w-full max-w-3xl">
        {loading ? (
          <h1 className="animate-pulse text-[12vw] font-bold uppercase leading-[0.95]">
            Loading…{/* COPY-DRAFT */}
          </h1>
        ) : session ? (
          <>
            <h1 className="text-[12vw] font-bold uppercase leading-[0.95]">
              My bookings{/* COPY-DRAFT */}
            </h1>
            <div className="mt-4 font-sans">
              <p className="text-[14px] tracking-wide opacity-85">logged in as{/* COPY-DRAFT */}</p>
              <p className="mt-0.5 text-lg font-medium uppercase leading-tight">{session.contact.fullName}</p>
              <p className="break-all text-[14px] leading-tight opacity-85">{session.contact.email}</p>
            </div>

            {logoutError && (
              <p className="mt-4 font-sans text-[14px] tracking-wide" role="alert">
                couldn't log out: check your connection and try again.{/* COPY-DRAFT */}
              </p>
            )}

            {session.reservations.length === 0 ? (
              <div className="mt-10">
                <p className="text-[8vw] font-bold uppercase leading-[0.95]">
                  No upcoming bookings{/* COPY-DRAFT */}
                </p>
                <Link
                  to="/"
                  className="mt-4 block text-[8vw] font-bold uppercase leading-[0.95] underline underline-offset-[0.12em]"
                >
                  Book the next date →{/* COPY-DRAFT */}
                </Link>
              </div>
            ) : (
              <ul className="mt-10 space-y-8">
                {session.reservations.map((r) => (
                  <ReservationItem key={r.reservationId} reservation={r} />
                ))}
              </ul>
            )}

            <div className="mt-12 font-sans">
              <p className="text-[14px] tracking-wide opacity-85">your consents{/* COPY-DRAFT */}</p>
              <p className="mt-1 text-lg font-medium uppercase leading-tight">
                news: {session.contact.marketingConsent ? "yes" : "no"}{/* COPY-DRAFT */}
              </p>
              <p className="text-lg font-medium uppercase leading-tight">
                personalised: {session.contact.profilingConsent ? "yes" : "no"}{/* COPY-DRAFT */}
              </p>
              <p className="mt-2 text-[14px] leading-snug tracking-wide opacity-85">
                to withdraw a consent, write to{" "}
                <a href="mailto:info@underclub.it" className="underline underline-offset-2">
                  info@underclub.it
                </a>{" "}
                (see the{" "}
                <Link to="/info/privacy-cookie" className="underline underline-offset-2">
                  privacy policy
                </Link>
                ).{/* COPY-DRAFT */}
              </p>
            </div>

            <div className="mt-10">
              <button
                type="button"
                onClick={() => void handleLogout()}
                disabled={loggingOut}
                className="w-full cursor-pointer rounded-none border-0 bg-black py-5.5 text-[19px] font-bold leading-none disabled:cursor-not-allowed"
              >
                <span className={loggingOut ? "text-primary opacity-25" : "text-primary"}>
                  LOG OUT{/* COPY-DRAFT */}
                </span>
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-[12vw] font-bold uppercase leading-[0.95]">
              Recover booking{/* COPY-DRAFT */}
            </h1>
            <p className="mt-4 font-sans text-[4vw] font-light tracking-wide opacity-85">
              enter the email you booked with: we'll send you a link to see your bookings and tickets.{/* COPY-DRAFT */}
            </p>
            <LoginLinkForm submitLabel="Send me a link" />{/* COPY-DRAFT */}
            <Link
              to="/"
              className="mt-10 block text-[8vw] font-bold uppercase leading-[0.95] underline underline-offset-[0.12em]"
            >
              Home →{/* COPY-DRAFT */}
            </Link>
          </>
        )}
      </div>

      <SiteMenu hidden={loading} onLogout={handleLogout} />
    </section>
  );
}

function ReservationItem({ reservation: r }: { reservation: MyReservation }) {
  const { refresh } = useSession();
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCancel = async () => {
    if (cancelling) return;
    setCancelling(true);
    setError(null);
    try {
      await cancelReservation(r.reservationId);
      await refresh();
    } catch (err: unknown) {
      setError(cancelErrorMessage(err));
      setConfirming(false);
      // Whatever happened, show the server's current view.
      if (err instanceof BookingApiError && err.status > 0) void refresh();
    } finally {
      setCancelling(false);
    }
  };

  return (
    <li className="border-t border-black/30 pt-4">
      <p className="font-sans text-[14px] tracking-wide opacity-85">
        {formatEventDate(r.eventDate)} · {r.eventTime.slice(0, 5)}
      </p>
      <p className="mt-1 text-[8vw] font-bold uppercase leading-[0.95]">{r.eventTitle}</p>
      <p className="mt-2 font-sans text-lg font-medium uppercase leading-tight">
        {r.entryName} — {priceFormatter.format(r.entryPrice)} €
      </p>
      <p className="mt-1 font-sans text-[14px] tracking-wide opacity-85">
        {r.status === "pending"
          ? "waiting for email confirmation" // COPY-DRAFT
          : r.qrScanned
            ? "checked in" // COPY-DRAFT
            : "confirmed"}{/* COPY-DRAFT */}
      </p>

      {r.status === "confirmed" &&
        (r.ticketUrl ? (
          <a
            href={r.ticketUrl}
            className="mt-4 block w-full bg-black py-5.5 text-center text-[19px] font-bold leading-none text-primary"
          >
            TICKET{/* COPY-DRAFT */}
          </a>
        ) : (
          <p className="mt-3 font-sans text-[14px] tracking-wide opacity-85">
            your ticket link is in your email.{/* COPY-DRAFT */}
          </p>
        ))}

      {error && (
        <p className="mt-3 font-sans text-[14px] leading-snug tracking-wide" role="alert">
          {error}
        </p>
      )}

      {!r.qrScanned &&
        (confirming ? (
          <div className="mt-4 font-sans">
            <p className="text-lg font-medium uppercase leading-tight">
              Cancel this booking?{/* COPY-DRAFT */}
            </p>
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                onClick={() => void handleCancel()}
                disabled={cancelling}
                className="flex-1 cursor-pointer rounded-none border-0 bg-black py-4 text-[16px] font-bold leading-none text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                {cancelling ? "Cancelling…" : "YES, CANCEL"}{/* COPY-DRAFT */}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={cancelling}
                className="flex-1 cursor-pointer rounded-none border border-black bg-transparent py-4 text-[16px] font-bold leading-none text-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                KEEP IT{/* COPY-DRAFT */}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setError(null);
              setConfirming(true);
            }}
            className="mt-3 cursor-pointer border-0 bg-transparent p-0 font-sans text-[14px] tracking-wide underline underline-offset-2"
          >
            CANCEL{/* COPY-DRAFT */}
          </button>
        ))}
    </li>
  );
}
