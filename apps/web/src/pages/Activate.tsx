import { useEffect, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { BOOKING_API } from "../lib/flags";
import { BookingApiError, activate } from "../lib/bookingApi";
import ConfirmReservationButton from "../components/ConfirmReservationButton";
import LoginLinkForm from "../components/LoginLinkForm";

type ActivateState =
  | "loading"
  | "redirecting"
  | "redirecting_account"
  | "reservation_expired"
  | "reservation_unavailable"
  | "invalid"
  | "error";

/** Reads `?token=` once and strips it from the URL (history, referrer, screenshots). */
function takeTokenFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const token = url.searchParams.get("token");
  if (token !== null) {
    url.searchParams.delete("token");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }
  return token && token.trim() ? token.trim() : null;
}

export default function Activate() {
  if (!BOOKING_API) return <Navigate to="/" replace />;
  return <ActivatePage />;
}

function ActivatePage() {
  const [state, setState] = useState<ActivateState>("loading");
  const startedRef = useRef(false);
  const mountedRef = useRef(true);
  const tokenRef = useRef<string | null>(null);

  const runActivation = async () => {
    const token = tokenRef.current;
    if (!token) {
      setState("invalid");
      return;
    }
    setState("loading");
    try {
      const res = await activate(token);
      if (!mountedRef.current) return;
      if (res.status === "ok") {
        // The token is consumed: never send it again.
        tokenRef.current = null;
        if (res.reservation === "confirmed") {
          setState("redirecting");
          window.location.replace(res.ticketUrl);
          return;
        }
        if (res.reservation === "none") {
          // Plain login link: straight to the bookings page (full navigation,
          // so the session is read fresh there).
          setState("redirecting_account");
          window.location.replace("/account");
          return;
        }
        setState(res.reservation === "expired" ? "reservation_expired" : "reservation_unavailable");
        return;
      }
      tokenRef.current = null;
      setState("invalid");
    } catch (err: unknown) {
      if (!mountedRef.current) return;
      // A 4xx means the server looked at the token and refused it; anything else
      // (network, 5xx) may be transient, so keep the token for a retry.
      if (err instanceof BookingApiError && err.status >= 400 && err.status < 500) {
        tokenRef.current = null;
        setState("invalid");
        return;
      }
      setState("error");
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    // StrictMode runs effects twice in dev: the token is single-use, POST it once.
    if (!startedRef.current) {
      startedRef.current = true;
      tokenRef.current = takeTokenFromUrl();
      void runActivation();
    }
    return () => {
      mountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section
      className="flex min-h-[100svh] w-full flex-col justify-center bg-primary px-4 py-10 text-black"
      aria-label="Activate" // COPY-DRAFT
      aria-live="polite"
    >
      <div className="mx-auto w-full max-w-3xl">
        {state === "loading" && (
          <h1 className="animate-pulse text-[12vw] font-bold uppercase leading-[0.95]">
            Checking your link…{/* COPY-DRAFT */}
          </h1>
        )}

        {state === "redirecting" && (
          <>
            <h1 className="text-[12vw] font-bold uppercase leading-[0.95]">
              You're in!{/* COPY-DRAFT */}
            </h1>
            <p className="mt-4 font-sans text-[4vw] font-light tracking-wide opacity-85">
              opening your ticket…{/* COPY-DRAFT */}
            </p>
          </>
        )}

        {state === "redirecting_account" && (
          <>
            <h1 className="text-[12vw] font-bold uppercase leading-[0.95]">
              You're in!{/* COPY-DRAFT */}
            </h1>
            <p className="mt-4 font-sans text-[4vw] font-light tracking-wide opacity-85">
              opening your bookings…{/* COPY-DRAFT */}
            </p>
          </>
        )}

        {state === "reservation_expired" && (
          <>
            <h1 className="text-[12vw] font-bold uppercase leading-[0.95]">
              Your reservation expired, book again{/* COPY-DRAFT */}
            </h1>
            <p className="mt-4 font-sans text-[4vw] font-light tracking-wide opacity-85">
              the link was valid for 30 minutes. you're logged in now, so it takes one tap.{/* COPY-DRAFT */}
            </p>
            <HomeLink label="Book again" />{/* COPY-DRAFT */}
            <AccountLink />
          </>
        )}

        {state === "reservation_unavailable" && (
          <>
            <h1 className="text-[12vw] font-bold uppercase leading-[0.95]">
              This reservation is no longer available{/* COPY-DRAFT */}
            </h1>
            <p className="mt-4 font-sans text-[4vw] font-light tracking-wide opacity-85">
              you're logged in anyway: check the next date from the home page.{/* COPY-DRAFT */}
            </p>
            <HomeLink label="Home" />{/* COPY-DRAFT */}
            <AccountLink />
          </>
        )}

        {state === "error" && (
          <>
            <h1 className="text-[12vw] font-bold uppercase leading-[0.95]">
              Something went wrong{/* COPY-DRAFT */}
            </h1>
            <p className="mt-4 font-sans text-[4vw] font-light tracking-wide opacity-85">
              we couldn't check your link. try again in a moment.{/* COPY-DRAFT */}
            </p>
            <div className="mt-8">
              <ConfirmReservationButton
                label="Try again" // COPY-DRAFT
                onClick={() => void runActivation()}
              />
            </div>
          </>
        )}

        {state === "invalid" && (
          <>
            <h1 className="text-[12vw] font-bold uppercase leading-[0.95]">
              This link is no longer valid{/* COPY-DRAFT */}
            </h1>
            <p className="mt-4 font-sans text-[4vw] font-light tracking-wide opacity-85">
              links work once and only for 30 minutes. get a new one:{/* COPY-DRAFT */}
            </p>
            <LoginLinkForm submitLabel="Send me a new link" />{/* COPY-DRAFT */}
          </>
        )}
      </div>
    </section>
  );
}

function HomeLink({ label }: { label: string }) {
  return (
    <a href="/" className="mt-8 block text-[12vw] font-bold uppercase leading-[0.95] underline underline-offset-[0.12em]">
      {label} →
    </a>
  );
}

function AccountLink() {
  return (
    <a href="/account" className="mt-3 block text-[8vw] font-bold uppercase leading-[0.95] underline underline-offset-[0.12em]">
      My bookings →{/* COPY-DRAFT */}
    </a>
  );
}
