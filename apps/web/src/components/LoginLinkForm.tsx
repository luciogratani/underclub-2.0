import { useState, type FormEvent } from "react";
import { BookingApiError, requestLoginLink } from "../lib/bookingApi";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type LoginLinkFormProps = {
  submitLabel: string;
};

/** Email → `POST /api/auth/login-link` → "check your inbox" (flag ON pages, lime background). */
export default function LoginLinkForm({ submitLabel }: LoginLinkFormProps) {
  const [email, setEmail] = useState("");
  const [focused, setFocused] = useState(false);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [networkError, setNetworkError] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);

  const trimmed = email.trim();
  const isValid = trimmed.length >= 5 && EMAIL_REGEX.test(trimmed);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValid || sending) return;
    setSending(true);
    setNetworkError(false);
    setRateLimited(false);
    try {
      await requestLoginLink(trimmed);
      setSentTo(trimmed.toLowerCase());
    } catch (err: unknown) {
      // Anti-enumeration: whatever the server says, the answer is "check your
      // inbox". Only a request that never reached us is worth reporting, and
      // the per-network limit (429), which says nothing about the address.
      if (err instanceof BookingApiError && err.status === 0) {
        setNetworkError(true);
      } else if (err instanceof BookingApiError && err.code === "rate_limited") {
        setRateLimited(true);
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
      {rateLimited && (
        <p className="mt-3 font-sans text-[14px] leading-snug tracking-wide" role="alert">
          too many requests, try again in a few minutes.{/* COPY-DRAFT */}
        </p>
      )}
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
            {sending ? "Sending…" : submitLabel}{/* COPY-DRAFT */}
          </span>
        </button>
      </div>
    </form>
  );
}
