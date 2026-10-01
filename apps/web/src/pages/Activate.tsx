import { useEffect, useRef, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { BOOKING_API } from "../lib/flags";
import { BookingApiError, activate, requestLoginLink } from "../lib/bookingApi";
import ConfirmReservationButton from "../components/ConfirmReservationButton";

type ActivateState =
  | "loading"
  | "redirecting"
  | "logged_in"
  | "reservation_expired"
  | "reservation_unavailable"
  | "invalid"
  | "error";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
        setState(
          res.reservation === "expired"
            ? "reservation_expired"
            : res.reservation === "unavailable"
              ? "reservation_unavailable"
              : "logged_in",
        );
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

        {state === "logged_in" && (
          <>
            <h1 className="text-[12vw] font-bold uppercase leading-[0.95]">
              You're logged in{/* COPY-DRAFT */}
            </h1>
            <p className="mt-4 font-sans text-[4vw] font-light tracking-wide opacity-85">
              you can book without filling the form again.{/* COPY-DRAFT */}
            </p>
            <HomeLink label="Book now" />{/* COPY-DRAFT */}
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
            <LoginLinkForm />
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

function LoginLinkForm() {
  const [email, setEmail] = useState("");
  const [focused, setFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState(false);

  const trimmed = email.trim();
  const isValid = trimmed.length >= 5 && EMAIL_REGEX.test(trimmed);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValid || sending) return;
    setSending(true);
    setNetworkError(false);
    try {
      await requestLoginLink(trimmed);
      setSentTo(trimmed.toLowerCase());
    } catch (err: unknown) {
      // Anti-enumeration: whatever the server says, the answer is "check your
      // inbox". Only a request that never reached us is worth reporting.
      if (err instanceof BookingApiError && err.status === 0) {
        setNetworkError(true);
      } else {
        setSentTo(trimmed.toLowerCase());
      }
    } finally {
      setSending(false);
    }
  };

  if (sentTo) {
    return (
      <div className="mt-8" role="status">
        <p className="text-[8vw] font-bold uppercase leading-[0.95]">
          Check your inbox{/* COPY-DRAFT */}
        </p>
        <p className="mt-3 font-sans text-[4vw] font-light leading-snug tracking-wide opacity-85">
          if <span className="font-medium">{sentTo}</span> is registered, a new link is on its way. it's valid for 30 minutes.{/* COPY-DRAFT */}
        </p>
      </div>
    );
  }

  return (
    <form className="mt-8" onSubmit={(e) => void handleSubmit(e)} noValidate>
      <label htmlFor="loginEmail" className="block font-sans text-[14px] tracking-wide opacity-85">
        email{/* COPY-DRAFT */}
        {networkError && (
          <span className="ml-1 opacity-90" role="alert">
            [couldn't reach us, try again]{/* COPY-DRAFT */}
          </span>
        )}
      </label>
      <div className="relative mt-0.5">
        <input
          id="loginEmail"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="john.doe@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="w-full border-0 border-b border-black/30 bg-transparent font-sans text-lg font-medium leading-tight text-black placeholder:opacity-50 focus:outline-none focus:ring-0"
        />
        <div
          className="absolute bottom-0 left-0 right-0 h-[1px] bg-black transition-transform duration-300 ease-out"
          style={{
            transformOrigin: focused ? "left" : "right",
            transform: focused ? "scaleX(1)" : "scaleX(0)",
          }}
          aria-hidden
        />
      </div>
      <div className="mt-6">
        <button
          type="submit"
          disabled={!isValid || sending}
          aria-disabled={!isValid || sending}
          className={`w-full rounded-none border-0 bg-black py-5.5 text-[19px] font-bold leading-none ${
            !isValid || sending ? "cursor-not-allowed" : "cursor-pointer"
          }`}
        >
          <span className={!isValid || sending ? "text-primary opacity-25 transition-opacity" : "text-primary"}>
            {sending ? "Sending…" : "Send me a new link"}{/* COPY-DRAFT */}
          </span>
        </button>
      </div>
    </form>
  );
}
