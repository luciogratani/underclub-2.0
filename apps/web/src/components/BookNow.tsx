import { useEffect, useLayoutEffect, useRef, useState } from "react";
import HeroButton from "./HeroButton";
import ConfirmReservationButton from "./ConfirmReservationButton";

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
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
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
  onConfirm?: (data: { fullName: string; dateOfBirth: string; email: string }) => void;
  isExited?: boolean;
};

export default function BookNow({ onBack, onConfirm, isExited = false }: BookNowProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [ghostSize, setGhostSize] = useState({ width: 0, height: 0 });

  const [fullName, setFullName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [email, setEmail] = useState("");

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

  const fullNameError = touchedFullName ? getFullNameError(fullName) : null;
  const dateOfBirthError = touchedDateOfBirth ? getDateOfBirthError(dateOfBirth) : null;
  const emailError = touchedEmail ? getEmailError(email) : null;

  const isFormValid =
    isValidFullName(fullName) && isValidDateOfBirth(dateOfBirth) && isValidEmail(email);

  return (
    <section
      ref={sectionRef}
      className="relative flex flex-col items-center justify-center min-h-[100svh] w-full shrink-0 snap-start snap-always bg-black"
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
      <div className="p-4">
          <p className="mt-4.5 text-[50px] font-bold">BOOK NOW</p>

          <label htmlFor="fullName" className="mt-4.5 block font-sans text-[14px] tracking-wide opacity-85">
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

          <p className="mt-4.5 font-sans text-[14px] tracking-wide opacity-85">entry</p>
          <div className="mt-0.5">
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
                  <span className="ml-0.5 font-medium"></span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-10.5 mt-5 w-full">
          <ConfirmReservationButton
            label="Confirm"
            onClick={() =>
              isFormValid && onConfirm?.({ fullName, dateOfBirth, email })
            }
            disabled={!isFormValid}
          />
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
