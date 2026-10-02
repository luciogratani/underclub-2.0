import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PublicReservationFormInput, EntryTierView, SessionContact } from "@underclub/shared";
import HeroButton from "./HeroButton";
import ConfirmReservationButton from "./ConfirmReservationButton";
import { BOOKING_API } from "../lib/flags";

export type BookingConsents = { marketing: boolean; profiling: boolean };

const priceFormatter = new Intl.NumberFormat("it-IT", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function formatEntryPrice(price: number): string {
  return `${priceFormatter.format(price)} €`;
}

const romeTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Europe/Rome",
});

/** `valid_until` timestamp → "02:00" in Europe/Rome, or null if unparseable. */
function formatValidUntil(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return romeTimeFormatter.format(date);
}

const BOOK_NOW_STORAGE_KEY = "underclub.bookNow.form";

function loadFormFromStorage(): { fullName: string; dateOfBirth: string; email: string } {
  if (typeof window === "undefined") return { fullName: "", dateOfBirth: "", email: "" };
  try {
    const raw = window.localStorage.getItem(BOOK_NOW_STORAGE_KEY);
    if (!raw) return { fullName: "", dateOfBirth: "", email: "" };
    const data = JSON.parse(raw) as { fullName?: string; dateOfBirth?: string; email?: string };
    return {
      fullName: typeof data.fullName === "string" ? data.fullName : "",
      dateOfBirth: typeof data.dateOfBirth === "string" ? data.dateOfBirth : "",
      email: typeof data.email === "string" ? data.email : "",
    };
  } catch {
    return { fullName: "", dateOfBirth: "", email: "" };
  }
}

function saveFormToStorage(fullName: string, dateOfBirth: string, email: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      BOOK_NOW_STORAGE_KEY,
      JSON.stringify({ fullName, dateOfBirth, email })
    );
  } catch {
    // ignore
  }
}

function formatDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits.length === 2 ? `${digits}/` : digits;
  if (digits.length <= 4) {
    const part = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return digits.length === 4 ? `${part}/` : part;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Solo lettere (anche accentate), spazi, apostrofo e trattino */
function sanitizeFullName(value: string): string {
  return value.replace(/[^\p{L}\s'-]/gu, "");
}

function isValidFullName(name: string): boolean {
  const trimmed = name.trim();
  const words = trimmed.split(/\s+/).filter((w) => w.length > 0);
  return (
    trimmed.length >= 2 &&
    words.length >= 2 &&
    /^[\p{L}\s'-]+$/u.test(trimmed)
  );
}

function isValidDateOfBirth(ddmmyyyy: string): boolean {
  const digits = ddmmyyyy.replace(/\D/g, "");
  if (digits.length !== 8) return false;
  const day = parseInt(digits.slice(0, 2), 10);
  const month = parseInt(digits.slice(2, 4), 10);
  const year = parseInt(digits.slice(4, 8), 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const birth = new Date(year, month - 1, day);
  if (birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day)
    return false;
  const today = new Date();
  const age = today.getFullYear() - birth.getFullYear();
  const hasHadBirthday =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  return age > 18 || (age === 18 && hasHadBirthday);
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  return trimmed.length >= 5 && EMAIL_REGEX.test(trimmed);
}

function getDateOfBirthError(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 8) return "enter full date DD/MM/YYYY";
  const day = parseInt(digits.slice(0, 2), 10);
  const month = parseInt(digits.slice(2, 4), 10);
  const year = parseInt(digits.slice(4, 8), 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "invalid date";
  const birth = new Date(year, month - 1, day);
  if (birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day)
    return "invalid date";
  const today = new Date();
  const age = today.getFullYear() - birth.getFullYear();
  const hasHadBirthday =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
  if (age < 18 || (age === 18 && !hasHadBirthday)) return "18+ only";
  return null;
}

function getFullNameError(value: string): string | null {
  const trimmed = value.trim();
  const words = trimmed.split(/\s+/).filter((w) => w.length > 0);
  if (trimmed.length === 0) return "required";
  if (trimmed.length < 2) return "min. 2 characters";
  if (words.length < 2) return "i said FULL NAME!";
  if (!/^[\p{L}\s'-]+$/u.test(trimmed)) return "letters and spaces only";
  return null;
}

function getEmailError(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return "required";
  if (!EMAIL_REGEX.test(trimmed)) return "enter a valid email";
  return null;
}

type BookNowProps = {
  onBack?: () => void;
  /** Saves the reservation; resolves true on success. Errors are shown by the caller. */
  onConfirm?: (
    data: PublicReservationFormInput,
    entryId: string | null,
    consents: BookingConsents,
  ) => Promise<boolean>;
  /** Called after a successful confirm, once the clearing animation is over. */
  onConfirmed?: () => void;
  isExited?: boolean;
  entries?: EntryTierView[];
  /** Booking API session (flag ON): identity fields are replaced by this contact. */
  sessionContact?: SessionContact | null;
  onLogout?: () => void | Promise<void>;
};

function clearTextLetterByLetter(
  value: string,
  setValue: (next: string) => void,
  stepMs = 30
): Promise<void> {
  if (!value) return Promise.resolve();
  return new Promise((resolve) => {
    let index = value.length;
    const timer = window.setInterval(() => {
      index -= 1;
      if (index <= 0) {
        setValue("");
        window.clearInterval(timer);
        resolve();
        return;
      }
      setValue(value.slice(0, index));
    }, stepMs);
  });
}

export default function BookNow({
  onBack,
  onConfirm,
  onConfirmed,
  isExited = false,
  entries,
  sessionContact = null,
  onLogout,
}: BookNowProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [ghostSize, setGhostSize] = useState({ width: 0, height: 0 });
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setInView(true);
      },
      { threshold: 0.2, rootMargin: "0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [email, setEmail] = useState("");
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);

  useEffect(() => {
    if (!entries?.length) return;
    const firstAvailable = entries.find((e) => !e.availability.soldOut);
    if (firstAvailable) setSelectedEntryId(firstAvailable.id);
  }, [entries]);

  useEffect(() => {
    const stored = loadFormFromStorage();
    setFullName(stored.fullName);
    setDateOfBirth(stored.dateOfBirth);
    setEmail(stored.email);
  }, []);

  useEffect(() => {
    saveFormToStorage(fullName, dateOfBirth, email);
  }, [fullName, dateOfBirth, email]);

  useEffect(() => {
    const cardEl = cardRef.current;
    if (!cardEl) return;
    const updateCardSize = () => {
      const { width, height } = cardEl.getBoundingClientRect();
      setGhostSize((prev) => (isExited ? prev : { width, height }));
    };
    updateCardSize();
    const ro = new ResizeObserver(updateCardSize);
    ro.observe(cardEl);
    return () => ro.disconnect();
  }, [isExited]);

  useLayoutEffect(() => {
    if (!isExited) return;
    const sectionEl = sectionRef.current;
    if (!sectionEl) return;
    const updateSectionSize = () => {
      setGhostSize({ width: sectionEl.clientWidth, height: sectionEl.clientHeight });
    };
    updateSectionSize();
    const ro = new ResizeObserver(updateSectionSize);
    ro.observe(sectionEl);
    return () => ro.disconnect();
  }, [isExited]);

  const ghostStyle = {
    position: "absolute" as const,
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    width: ghostSize.width,
    height: ghostSize.height,
    zIndex: 0,
  };

  const [touchedFullName, setTouchedFullName] = useState(false);
  const [touchedDateOfBirth, setTouchedDateOfBirth] = useState(false);
  const [touchedEmail, setTouchedEmail] = useState(false);
  const [focusedField, setFocusedField] = useState<"fullName" | "dateOfBirth" | "email" | null>(
    null
  );
  // True from the tap on Confirm until the request (and, on success, the
  // clearing animation) is over: keeps the button disabled meanwhile.
  const [submitting, setSubmitting] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);
  const [consentProfiling, setConsentProfiling] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const hasSession = BOOKING_API && sessionContact !== null;

  const fullNameError = touchedFullName ? getFullNameError(fullName) : null;
  const dateOfBirthError = touchedDateOfBirth ? getDateOfBirthError(dateOfBirth) : null;
  const emailError = touchedEmail ? getEmailError(email) : null;

  const needsEntrySelection = !!entries?.length;
  const isFormValid =
    (hasSession ||
      (isValidFullName(fullName) && isValidDateOfBirth(dateOfBirth) && isValidEmail(email))) &&
    (!needsEntrySelection || selectedEntryId !== null);

  const handleConfirm = async () => {
    if (!isFormValid || submitting) return;
    setSubmitting(true);

    const payload = { fullName, dateOfBirth, email };
    let ok = false;
    try {
      ok = onConfirm
        ? await onConfirm(payload, selectedEntryId, {
            marketing: BOOKING_API && !hasSession && consentMarketing,
            profiling: BOOKING_API && !hasSession && consentProfiling,
          })
        : true;
    } catch {
      ok = false;
    }

    // On failure keep everything the user typed: the caller shows the error.
    if (!ok) {
      setSubmitting(false);
      return;
    }

    if (!hasSession) {
      await Promise.all([
        clearTextLetterByLetter(fullName, setFullName),
        clearTextLetterByLetter(dateOfBirth, setDateOfBirth),
        clearTextLetterByLetter(email, setEmail),
      ]);
    }
    setConsentMarketing(false);
    setConsentProfiling(false);
    onConfirmed?.();
    setSubmitting(false);
  };

  const handleLogout = async () => {
    if (loggingOut || submitting) return;
    setLoggingOut(true);
    try {
      await onLogout?.();
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <section
      ref={sectionRef}
      className="relative flex flex-col items-center justify-center min-w-[100vw] w-[100vw] min-h-[100svh] shrink-0 snap-start snap-always bg-black"
      style={{ height: "100svh" }}
      aria-label="Book now"
    >
      <div
        className={`overflow-hidden bg-primary transition-[width,height,border-radius] duration-300 ease-out ${
          isExited ? "rounded-none" : "rounded-[40px]"
        }`}
        style={ghostStyle}
      />
      <div
        ref={cardRef}
        className="relative z-10 w-[95%] max-w-lg rounded-[40px] overflow-hidden bg-primary text-black"
      >
        <div className={`booknow-content ${inView ? "in-view" : ""}`}>
          <div className="p-4">
            <p
              className="animate-line mt-4.5 text-[50px] font-bold"
              style={{ "--i": 0 } as React.CSSProperties}
            >
              BOOK NOW
            </p>

            {hasSession && sessionContact ? (
              <div
                className="animate-line mt-4.5"
                style={{ "--i": 1 } as React.CSSProperties}
              >
                <p className="font-sans text-[14px] tracking-wide opacity-85">
                  booking as
                </p>
                <p className="mt-0.5 font-sans text-lg font-medium uppercase leading-tight">
                  {sessionContact.fullName}
                </p>
                <p className="font-sans text-[14px] leading-tight opacity-85 break-all">
                  {sessionContact.email}
                </p>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  disabled={loggingOut || submitting}
                  className="mt-1.5 cursor-pointer font-sans text-[14px] tracking-wide underline underline-offset-2 opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  not you? log out
                </button>
              </div>
            ) : (
              <>
            <div
              className="animate-line mt-4.5"
              style={{ "--i": 1 } as React.CSSProperties}
            >
          <label htmlFor="fullName" className="block font-sans text-[14px] tracking-wide opacity-85">
            full name
            {fullNameError && (
              <span className="ml-1 opacity-90" role="alert">
                [{fullNameError}]
              </span>
            )}
          </label>
          <div className="relative mt-0.5">
            <input
              id="fullName"
              type="text"
              name="fullName"
              placeholder="John Doe"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(sanitizeFullName(e.target.value))}
              onFocus={() => setFocusedField("fullName")}
              onBlur={() => {
                setTouchedFullName(true);
                setFocusedField(null);
              }}
              aria-invalid={!!fullNameError}
              aria-describedby={fullNameError ? "fullName-error" : undefined}
              className="w-full border-0 border-b border-black/30 bg-transparent font-sans text-lg font-medium leading-tight text-black placeholder:opacity-50 focus:outline-none focus:ring-0"
            />
            <div
              className="absolute bottom-0 left-0 right-0 h-[1px] bg-black transition-transform duration-300 ease-out"
              style={{
                transformOrigin: focusedField === "fullName" ? "left" : "right",
                transform: focusedField === "fullName" ? "scaleX(1)" : "scaleX(0)",
              }}
              aria-hidden
            />
          </div>
          {fullNameError && (
            <span id="fullName-error" className="sr-only">
              {fullNameError}
            </span>
          )}
            </div>

            <div
              className="animate-line mt-4.5"
              style={{ "--i": 2 } as React.CSSProperties}
            >
          <label htmlFor="dateOfBirth" className="mt-4.5 block font-sans text-[14px] tracking-wide opacity-85">
            date of birth
            {dateOfBirthError && (
              <span className="ml-1 opacity-90" role="alert">
                [{dateOfBirthError}]
              </span>
            )}
          </label>
          <div className="relative mt-0.5">
            <input
              id="dateOfBirth"
              type="text"
              name="dateOfBirth"
              inputMode="numeric"
              autoComplete="bday"
              placeholder="DD/MM/YYYY"
              maxLength={10}
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(formatDateInput(e.target.value))}
              onFocus={() => setFocusedField("dateOfBirth")}
              onBlur={() => {
                setTouchedDateOfBirth(true);
                setFocusedField(null);
              }}
              aria-invalid={!!dateOfBirthError}
              aria-describedby={dateOfBirthError ? "dateOfBirth-error" : "dateOfBirth-hint"}
              className="w-full border-0 border-b border-black/30 bg-transparent font-sans text-lg font-medium leading-tight text-black placeholder:opacity-50 focus:outline-none focus:ring-0"
            />
            <div
              className="absolute bottom-0 left-0 right-0 h-[1px] bg-black transition-transform duration-300 ease-out"
              style={{
                transformOrigin: focusedField === "dateOfBirth" ? "left" : "right",
                transform: focusedField === "dateOfBirth" ? "scaleX(1)" : "scaleX(0)",
              }}
              aria-hidden
            />
          </div>
          <span id="dateOfBirth-hint" className="sr-only">
            Format: day, month and year with slashes, e.g. 26/02/1999
          </span>
          {dateOfBirthError && (
            <span id="dateOfBirth-error" className="sr-only" role="alert">
              {dateOfBirthError}
            </span>
          )}
            </div>

            <div
              className="animate-line mt-4.5"
              style={{ "--i": 3 } as React.CSSProperties}
            >
          <label htmlFor="email" className="mt-4.5 block font-sans text-[14px] tracking-wide opacity-85">
            email
            {emailError && (
              <span className="ml-1 opacity-90" role="alert">
                [{emailError}]
              </span>
            )}
          </label>
          <div className="relative mt-0.5">
            <input
              id="email"
              type="email"
              name="email"
              placeholder="john.doe@email.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setFocusedField("email")}
              onBlur={() => {
                setTouchedEmail(true);
                setFocusedField(null);
              }}
              aria-invalid={!!emailError}
              aria-describedby={emailError ? "email-error" : undefined}
              className="w-full border-0 border-b border-black/30 bg-transparent font-sans text-lg font-medium leading-tight text-black placeholder:opacity-50 focus:outline-none focus:ring-0"
            />
            <div
              className="absolute bottom-0 left-0 right-0 h-[1px] bg-black transition-transform duration-300 ease-out"
              style={{
                transformOrigin: focusedField === "email" ? "left" : "right",
                transform: focusedField === "email" ? "scaleX(1)" : "scaleX(0)",
              }}
              aria-hidden
            />
          </div>
          {emailError && (
            <span id="email-error" className="sr-only" role="alert">
              {emailError}
            </span>
          )}
            </div>

              </>
            )}

            <div
              className="animate-line mt-4.5"
              style={{ "--i": 4 } as React.CSSProperties}
            >
          <p className="font-sans text-[14px] tracking-wide opacity-85">entry</p>
          <div className="mt-0.5">
            {entries?.length ? (
              entries.map((tier) => {
                const isSoldOut = tier.availability.soldOut;
                const isSelected = selectedEntryId === tier.id;
                const showPrice = BOOKING_API && tier.price > 0;
                const validUntil = BOOKING_API ? formatValidUntil(tier.validUntil) : null;
                return (
                  <button
                    key={tier.id}
                    type="button"
                    disabled={isSoldOut}
                    onClick={() => !isSoldOut && setSelectedEntryId(tier.id)}
                    className={`flex w-full items-baseline justify-between gap-4 font-sans text-lg leading-tight py-0.5 transition-opacity ${
                      isSoldOut ? "opacity-40 line-through cursor-not-allowed" : "cursor-pointer"
                    } ${isSelected && !isSoldOut ? "opacity-100" : !isSoldOut ? "opacity-60" : ""}`}
                  >
                    <div className="flex flex-wrap items-baseline gap-x-1 text-left">
                      <span className="font-medium uppercase">{tier.name}</span>
                      {showPrice && (
                        <span className="font-medium">{formatEntryPrice(tier.price)}</span>
                      )}
                      {tier.note && (
                        <span className="flex items-baseline text-[0.5em] leading-none">
                          <span className="font-light lowercase">{tier.note}</span>
                        </span>
                      )}
                      {validUntil && (
                        <span className="flex basis-full items-baseline text-[0.5em] leading-none pb-0.5">
                          <span className="font-light">valid for entry until</span>
                          <span className="ml-0.5 font-medium">{validUntil}</span>
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 font-medium">
                      {isSoldOut
                        ? "SOLD OUT"
                        : tier.availability.left !== null
                          ? `${tier.availability.left} LEFT`
                          : ""}
                    </span>
                  </button>
                );
              })
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-4 font-sans text-lg leading-tight">
                  <div className="flex items-baseline gap-1">
                    <span className="font-medium">10 € + 1 DRINK</span>
                    <span className="flex items-baseline text-[0.5em] leading-none">
                      <span className="font-light">valid until</span>
                      <span className="ml-0.5 font-medium">1:30</span>
                    </span>
                  </div>
                  <span className="shrink-0 font-medium">SOLD OUT</span>
                </div>
                <div className="flex items-baseline justify-between gap-4 font-sans text-lg leading-tight">
                  <div className="flex items-baseline gap-1">
                    <span className="font-medium">15 € + 1 DRINK</span>
                    <span className="flex items-baseline text-[0.5em] leading-none">
                      <span className="font-light">women gets</span>
                      <span className="ml-0.5 font-medium">2 drinks</span>
                    </span>
                  </div>
                  <span className="shrink-0 font-medium">69 LEFT</span>
                </div>
                <div className="flex items-baseline justify-between gap-4 font-sans text-lg leading-tight">
                  <div className="flex items-baseline gap-1">
                    <span className="font-medium">20 € + 1 DRINK</span>
                    <span className="flex items-baseline text-[0.5em] leading-none">
                      <span className="font-light">door ticket</span>
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
            </div>

            {BOOKING_API && !hasSession && (
              <div
                className="animate-line mt-4.5 space-y-1.5"
                style={{ "--i": 5 } as React.CSSProperties}
              >
                <ConsentCheckbox
                  id="consentMarketing"
                  checked={consentMarketing}
                  onChange={setConsentMarketing}
                  disabled={submitting}
                  label="email me news, line-ups and invites (optional)"
                />
                <ConsentCheckbox
                  id="consentProfiling"
                  checked={consentProfiling}
                  onChange={setConsentProfiling}
                  disabled={submitting}
                  label="use my bookings to tailor what you send me (optional)"
                />
                <p className="pl-6 font-sans text-[12px] leading-tight opacity-70">
                  we'll email you a link to confirm.{" "}
                  <a
                    href="/info/privacy-cookie"
                    className="underline underline-offset-2"
                  >
                    privacy policy
                  </a>
                </p>
              </div>
            )}
          </div>

          <div
            className="animate-line mb-10.5 mt-5 w-full"
            style={{ "--i": 6 } as React.CSSProperties}
          >
            <ConfirmReservationButton
            label={submitting ? "Confirming…" : "Confirm"}
            onClick={() => void handleConfirm()}
            disabled={!isFormValid || submitting}
          />
          </div>
        </div>

        <div className="pb-4 pt-0 hidden">
          {onBack && (
            <div className="mt-8 flex justify-start">
              <HeroButton title="Indietro" direction="left" onClick={onBack} />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

type ConsentCheckboxProps = {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
};

/** Optional consent, unticked by default; same black-on-lime language as the inputs. */
function ConsentCheckbox({ id, checked, onChange, label, disabled = false }: ConsentCheckboxProps) {
  return (
    <label
      htmlFor={id}
      className={`flex items-start gap-2 font-sans text-[13px] leading-tight ${
        disabled ? "cursor-not-allowed" : "cursor-pointer"
      }`}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className="mt-px flex h-4 w-4 shrink-0 items-center justify-center border border-black transition-colors peer-checked:bg-black peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-black"
      >
        <svg
          viewBox="0 0 12 12"
          className={`h-2.5 w-2.5 text-primary transition-opacity ${checked ? "opacity-100" : "opacity-0"}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M2 6.5 5 9l5-6" />
        </svg>
      </span>
      <span className={checked ? "opacity-100" : "opacity-85"}>{label}</span>
    </label>
  );
}
