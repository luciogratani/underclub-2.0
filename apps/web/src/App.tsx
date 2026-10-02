import { useCallback, useEffect, useRef, useState } from "react";
import {
  parseDdMmYyyyToIso,
  type PublicReservationFormInput,
  type PublicEventView,
  type BookingRequest,
} from "@underclub/shared";
import Hero from "./components/Hero";
import { RING_WORDS_LOADING, RING_WORDS_NO_EVENT, ringWordsForEvent } from "./components/TextRing";
import FollowUsPanel from "./components/FollowUsPanel";
import NextDate from "./components/NextDate";
import BookNow, { type BookingConsents } from "./components/BookNow";
import ReservationSummary, { type ReservationSummaryVariant } from "./components/ReservationSummary";
import DataNoticeOverlay from "./components/DataNoticeOverlay";
import ErrorToast, { type ErrorToastData } from "./components/ErrorToast";
import SiteMenu from "./components/SiteMenu";
import { fetchNextEvent, type NextEventResult } from "./lib/api";
import { getBookingSource } from "./lib/source";
import { BookingApiError, book } from "./lib/bookingApi";
import { nextTicketUrl, useSession } from "./lib/session";

const TOTAL_SECTIONS = 4;
/** Longest wait for the next night and the session before the home is picked anyway. */
const LOAD_TIMEOUT_MS = 5000;
// COPY-DRAFT: shown on the home without nights when the dates could not be loaded.
const LOAD_FAILED_NOTICE = "we couldn't load the dates. try again later.";
const GESTURE_THRESHOLD_PX = 40;
const WHEEL_THRESHOLD = 24;
const DATA_NOTICE_FADE_MS = 360;
const DATA_NOTICE_SESSION_KEY = "underclub.dataNoticeAccepted";
const DEBUG_LOG = import.meta.env.DEV;

/** Booking API error code → toast copy. */
function toBookingErrorToast(err: unknown): ErrorToastData {
  const code = err instanceof BookingApiError ? err.code : "server_error";
  switch (code) {
    case "sold_out":
      return {
        title: "Sold out",
        message: "This entry just sold out. Pick another one.",
        code,
      };
    case "not_bookable":
      return {
        title: "Bookings closed",
        message: "This night can't be booked anymore.",
        code,
      };
    case "invalid_entry":
      return {
        title: "Entry not available",
        message: "This entry is no longer available. Pick another one.",
        code,
      };
    case "rate_limited":
      return {
        title: "Too many attempts",
        message: "Please wait a few minutes and try again.",
        code,
      };
    case "invalid_input":
      return {
        title: "Check your details",
        message: "Something in the form doesn't look right. Check it and try again.",
        code,
      };
    default:
      return {
        title: "Booking failed",
        message: "Something went wrong on our side. Please try again.",
        code,
      };
  }
}

/**
 * loading: only the ring (name, no cycle), no buttons, no menu.
 * event:   Hero → Next Date → Book Now → summary.
 * none:    one screen, the Hero with FOLLOW US (also after a failed load).
 * Picked once per page view.
 */
type HomeMode = "loading" | "event" | "none";

/** Online booking is open: before the deadline and with at least one entry. */
function isBookingOpen(event: PublicEventView | null): boolean {
  if (!event || event.entries.length === 0) return false;
  return Date.now() < Date.parse(event.bookingDeadline);
}

function App() {
  const hasAcceptedDataNoticeInSession = (() => {
    if (typeof window === "undefined") return false;
    try {
      return window.sessionStorage.getItem(DATA_NOTICE_SESSION_KEY) === "1";
    } catch {
      return false;
    }
  })();

  const scrollRefV = useRef<HTMLDivElement>(null);
  const currentSectionRef = useRef(0);
  const isNavigatingRef = useRef(false);
  const gesturesLockedRef = useRef(true);
  const touchStartYRef = useRef<number | null>(null);
  const touchStartedInNativeScrollableRef = useRef(false);
  const lockHeroResetUntilLeaveTopRef = useRef(false);
  const [dataNoticeVisible, setDataNoticeVisible] = useState(!hasAcceptedDataNoticeInSession);
  const [dataNoticeClosing, setDataNoticeClosing] = useState(false);
  const [heroIntroActive, setHeroIntroActive] = useState(true);
  const [heroCtaVisible, setHeroCtaVisible] = useState(false);
  const [heroExited, setHeroExited] = useState(false);
  const [nextDateExited, setNextDateExited] = useState(false);
  const [bookNowExited, setBookNowExited] = useState(false);
  const [nextEvent, setNextEvent] = useState<PublicEventView | null>(null);
  const [homeMode, setHomeMode] = useState<HomeMode>("loading");
  const [loadFailed, setLoadFailed] = useState(false);
  const [nextEventResult, setNextEventResult] = useState<NextEventResult | null>(null);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [followUsOpen, setFollowUsOpen] = useState(false);
  // Re-render at the booking deadline, so BOOK NOW turns into BOOKING CLOSED.
  const [, setDeadlineTick] = useState(0);
  const [confirmedData, setConfirmedData] = useState<PublicReservationFormInput | null>(null);
  const [confirmedEventDate, setConfirmedEventDate] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<ErrorToastData | null>(null);
  // Passwordless session (shared app-wide) + outcome of the last booking.
  const { session, loading: sessionLoading, refresh: refreshSession, logout, forget: forgetSession } = useSession();
  const sessionContact = session?.contact ?? null;
  const homeTicketUrl = nextTicketUrl(session);
  const [menuOpen, setMenuOpen] = useState(false);
  // The menu button steps aside on Book Now, where it would sit on the form.
  const [activeSection, setActiveSection] = useState(0);
  const [summaryVariant, setSummaryVariant] = useState<ReservationSummaryVariant>("in");
  const [bookingTicketUrl, setBookingTicketUrl] = useState<string | null>(null);
  const [toastClosing, setToastClosing] = useState(false);
  const bookingOpen = homeMode === "event" && isBookingOpen(nextEvent);
  // Read by the gesture handlers (registered once).
  const sectionCountRef = useRef(1);
  const bookingOpenRef = useRef(false);
  sectionCountRef.current = homeMode === "event" ? TOTAL_SECTIONS : 1;
  bookingOpenRef.current = bookingOpen;

  const scrollToSection = (index: number) => {
    const el = scrollRefV.current;
    if (!el) return;
    const target = Math.max(0, Math.min(TOTAL_SECTIONS - 1, index));
    currentSectionRef.current = target;
    el.scrollTo({ top: target * el.clientHeight, behavior: "smooth" });
  };

  const navigateToSection = (
    targetIndex: number,
    options?: {
      fromGesture?: boolean;
    }
  ) => {
    if (gesturesLockedRef.current) return;
    const current = currentSectionRef.current;
    const target = Math.max(0, Math.min(sectionCountRef.current - 1, targetIndex));
    if (target === current || isNavigatingRef.current) return;
    // Booking closed: the night stays on show, the form is out of reach.
    if (target >= 2 && !bookingOpenRef.current) return;
    // "YOU'RE IN" (section 4) must never be reachable via gestures.
    // It is reserved for the Confirm flow from Book Now.
    if (options?.fromGesture && target === 3) return;
    if (options?.fromGesture && current === 3 && target < current) return;

    const performScroll = () => {
      scrollToSection(target);
      window.setTimeout(() => {
        isNavigatingRef.current = false;
      }, 420);
    };

    isNavigatingRef.current = true;
    const forward = target > current;

    if (forward && current === 0 && target === 1) {
      lockHeroResetUntilLeaveTopRef.current = true;
      setHeroExited(true);
      window.setTimeout(performScroll, 300);
      return;
    }
    if (forward && current === 1 && target === 2) {
      setNextDateExited(true);
      window.setTimeout(performScroll, 300);
      return;
    }
    if (forward && current === 2 && target === 3) {
      setBookNowExited(true);
      window.setTimeout(performScroll, 300);
      return;
    }

    performScroll();
  };

  const goToNextDate = () => {
    navigateToSection(1);
  };

  const goToBookNow = () => {
    navigateToSection(2);
  };

  const refreshNextEvent = async () => {
    const refreshed = await fetchNextEvent();
    if (refreshed.kind === "event") setNextEvent(refreshed.event);
  };

  const showBookingError = (error: ErrorToastData) => {
    setToastClosing(false);
    setConfirmError(error);
  };

  /**
   * Saves the reservation and prepares the summary. Resolves `true` on success;
   * BookNow then clears the form and calls `goToSummary` to move on. On failure
   * the toast is shown and the form keeps what the user typed.
   */
  const confirmReservation = async (
    data: PublicReservationFormInput,
    entryId: string | null,
    consents: BookingConsents,
  ): Promise<boolean> => {
    setConfirmError(null);

    if (!nextEvent || !entryId) {
      // Unreachable: Book Now is only shown for a night with entries.
      showBookingError(toBookingErrorToast(new BookingApiError("invalid_entry", 400)));
      return false;
    }

    const req: BookingRequest = {
      eventId: nextEvent.id,
      entryId,
      consentMarketing: consents.marketing,
      consentProfiling: consents.profiling,
      source: getBookingSource(),
    };
    const normalizedEmail = data.email.trim().toLowerCase();
    if (!sessionContact) {
      req.fullName = data.fullName.trim();
      req.dateOfBirth = parseDdMmYyyyToIso(data.dateOfBirth);
      req.email = normalizedEmail;
    }

    try {
      const res = await book(req);
      // Keep entry availability in sync after each booking.
      void refreshNextEvent();
      setConfirmedEventDate(nextEvent.date);
      // New reservation (or none, for check_email): keep menu / icon / account in sync.
      void refreshSession();
      if (res.status === "check_email") {
        setSummaryVariant("check_email");
        setBookingTicketUrl(null);
        setConfirmedData({ ...data, email: normalizedEmail });
      } else {
        setSummaryVariant(res.status === "confirmed" ? "in" : "already_booked");
        setBookingTicketUrl(res.ticketUrl);
        setConfirmedData({
          fullName: sessionContact?.fullName ?? data.fullName,
          dateOfBirth: "",
          email: sessionContact?.email ?? normalizedEmail,
        });
      }
      return true;
    } catch (err: unknown) {
      if (err instanceof BookingApiError) {
        if (err.code === "sold_out" || err.code === "invalid_entry" || err.code === "not_bookable") {
          void refreshNextEvent();
        }
        // Session expired between page load and confirm: the server fell
        // back to the anonymous path without form data. Show the form again.
        if (err.code === "invalid_input" && sessionContact) {
          forgetSession();
          showBookingError({
            title: "You've been logged out",
            message: "Fill in your details to book.",
            code: err.code,
          });
          return false;
        }
      }
      showBookingError(toBookingErrorToast(err));
      return false;
    }
  };

  const goToSummary = () => {
    navigateToSection(3);
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // The httpOnly cookie can only be cleared by the server: pretending to be
      // logged out here would leave the session alive on this device.
      showBookingError({
        title: "Couldn't log out",
        message: "Check your connection and try again.",
      });
      return;
    }
  };

  const goToHero = () => {
    navigateToSection(0);
  };

  const summaryTicketUrl = bookingTicketUrl;

  const openTicketInNewTab = () => {
    if (!summaryTicketUrl || typeof window === "undefined") return;
    const absoluteTicketUrl = new URL(summaryTicketUrl, window.location.origin).toString();
    window.open(absoluteTicketUrl, "_blank", "noopener,noreferrer");
  };

  const handleAcceptDataNotice = () => {
    if (dataNoticeClosing || !dataNoticeVisible) return;
    setDataNoticeClosing(true);
    window.setTimeout(() => {
      setDataNoticeVisible(false);
      setDataNoticeClosing(false);
      try {
        window.sessionStorage.setItem(DATA_NOTICE_SESSION_KEY, "1");
      } catch {
        // ignore sessionStorage errors
      }
    }, DATA_NOTICE_FADE_MS);
  };

  useEffect(() => {
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, []);

  useEffect(() => {
    gesturesLockedRef.current = dataNoticeVisible || dataNoticeClosing || menuOpen || followUsOpen;
  }, [dataNoticeVisible, dataNoticeClosing, menuOpen, followUsOpen]);

  const handleMenuOpenChange = useCallback((open: boolean) => {
    // Set the ref right away too: a gesture in the same frame must not slip through.
    if (open) gesturesLockedRef.current = true;
    setMenuOpen(open);
  }, []);

  useEffect(() => {
    if (dataNoticeVisible || dataNoticeClosing || homeMode === "loading") return;

    // Run the intro once the home is picked and visible (also when the notice
    // was already accepted in this session), and keep it StrictMode-safe.
    setHeroCtaVisible(false);
    setHeroIntroActive(true);
    const timerId = window.setTimeout(() => {
      setHeroCtaVisible(true);
      setHeroIntroActive(false);
    }, 180);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [dataNoticeVisible, dataNoticeClosing, homeMode]);

  useEffect(() => {
    const elV = scrollRefV.current;
    if (!elV) return;
    const onScrollV = () => {
      if (gesturesLockedRef.current) return;
      const h = elV.clientHeight;
      if (h > 0) {
        currentSectionRef.current = Math.max(
          0,
          Math.min(sectionCountRef.current - 1, Math.round(elV.scrollTop / h))
        );
        setActiveSection(currentSectionRef.current);
      }
      // While programmatic navigation from Hero -> NextDate starts,
      // ignore top resets until we've actually left the first section.
      if (lockHeroResetUntilLeaveTopRef.current) {
        if (elV.scrollTop > h * 0.08) {
          lockHeroResetUntilLeaveTopRef.current = false;
        } else {
          return;
        }
      }

      // Reset exit animations only when we are back to the first screen.
      // During transitions (0 -> 1), this avoids collapsing Hero mid-animation.
      if (elV.scrollTop <= 2) {
        setHeroExited(false);
        setNextDateExited(false);
        setBookNowExited(false);
      }
    };
    elV.addEventListener("scroll", onScrollV, { passive: true });
    return () => elV.removeEventListener("scroll", onScrollV);
  }, []);

  useEffect(() => {
    const elV = scrollRefV.current;
    if (!elV) return;

    const getNativeScrollable = (target: EventTarget | null): HTMLElement | null => {
      if (!(target instanceof HTMLElement)) return null;
      const scrollable = target.closest(".scrollbar-site, .scrollbar-site-primary");
      return scrollable instanceof HTMLElement ? scrollable : null;
    };

    const canNativeScroll = (target: EventTarget | null, deltaY: number): boolean => {
      const scrollable = getNativeScrollable(target);
      if (!scrollable) return false;

      if (deltaY > 0) {
        return scrollable.scrollTop + scrollable.clientHeight < scrollable.scrollHeight - 1;
      }
      if (deltaY < 0) {
        return scrollable.scrollTop > 0;
      }
      return false;
    };

    const onWheel = (e: WheelEvent) => {
      if (gesturesLockedRef.current) return;
      if (Math.abs(e.deltaY) < WHEEL_THRESHOLD) return;
      // Any interaction inside a native inner scroller should never trigger
      // section gestures.
      if (getNativeScrollable(e.target)) return;
      if (canNativeScroll(e.target, e.deltaY)) return;

      if (e.cancelable) e.preventDefault();
      navigateToSection(
        e.deltaY > 0 ? currentSectionRef.current + 1 : currentSectionRef.current - 1,
        { fromGesture: true }
      );
    };

    const onTouchStart = (e: TouchEvent) => {
      if (gesturesLockedRef.current) return;
      touchStartedInNativeScrollableRef.current = Boolean(getNativeScrollable(e.target));
      touchStartYRef.current = e.touches[0]?.clientY ?? null;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (gesturesLockedRef.current) return;
      if (touchStartedInNativeScrollableRef.current) return;
      const start = touchStartYRef.current;
      const currentY = e.touches[0]?.clientY;
      if (start == null || currentY == null) return;
      const deltaY = start - currentY;
      if (Math.abs(deltaY) < GESTURE_THRESHOLD_PX) return;
      if (getNativeScrollable(e.target)) return;
      if (canNativeScroll(e.target, deltaY)) return;

      if (e.cancelable) e.preventDefault();
      navigateToSection(
        deltaY > 0 ? currentSectionRef.current + 1 : currentSectionRef.current - 1,
        { fromGesture: true }
      );
      touchStartYRef.current = null;
    };

    const onTouchEnd = () => {
      touchStartYRef.current = null;
      touchStartedInNativeScrollableRef.current = false;
    };

    elV.addEventListener("wheel", onWheel, { passive: false });
    elV.addEventListener("touchstart", onTouchStart, { passive: true });
    elV.addEventListener("touchmove", onTouchMove, { passive: false });
    elV.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      elV.removeEventListener("wheel", onWheel);
      elV.removeEventListener("touchstart", onTouchStart);
      elV.removeEventListener("touchmove", onTouchMove);
      elV.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  const dismissToast = () => {
    setToastClosing(true);
  };

  useEffect(() => {
    if (!toastClosing) return;
    const t = setTimeout(() => {
      setConfirmError(null);
      setToastClosing(false);
    }, 300);
    return () => clearTimeout(t);
  }, [toastClosing]);

  // Next night: asked once. A rejection counts as a failed load.
  useEffect(() => {
    let cancelled = false;
    fetchNextEvent()
      .catch((): NextEventResult => ({ kind: "error" }))
      .then((res) => {
        if (DEBUG_LOG) console.info("[underclub][App] fetchNextEvent resolved", res);
        if (!cancelled) setNextEventResult(res);
      });
    const timer = window.setTimeout(() => {
      if (!cancelled) setLoadTimedOut(true);
    }, LOAD_TIMEOUT_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  // Pick the home once: when both the night and the session have answered,
  // or at the timeout with what is there (a silent session = logged out; no
  // answer about the night = home without nights + notice). Later answers
  // never switch it.
  useEffect(() => {
    if (homeMode !== "loading") return;
    if (nextEventResult && (!sessionLoading || loadTimedOut)) {
      if (nextEventResult.kind === "event") {
        setNextEvent(nextEventResult.event);
        setHomeMode("event");
      } else {
        setLoadFailed(nextEventResult.kind === "error");
        setHomeMode("none");
      }
    } else if (loadTimedOut) {
      setLoadFailed(true);
      setHomeMode("none");
    }
  }, [homeMode, nextEventResult, sessionLoading, loadTimedOut]);

  useEffect(() => {
    if (!nextEvent) return;
    const ms = Date.parse(nextEvent.bookingDeadline) - Date.now();
    // setTimeout overflows past ~24.8 days: the page is long reloaded by then.
    if (!(ms > 0) || ms > 2_147_000_000) return;
    const t = window.setTimeout(() => setDeadlineTick((n) => n + 1), ms + 250);
    return () => window.clearTimeout(t);
  }, [nextEvent]);

  const handleFollowUsClosed = useCallback(() => setFollowUsOpen(false), []);

  const ringWords =
    homeMode === "loading"
      ? RING_WORDS_LOADING
      : homeMode === "event" && nextEvent
        ? ringWordsForEvent(nextEvent.date, nextEvent.title)
        : RING_WORDS_NO_EVENT;

  return (
    <div
      ref={scrollRefV}
      className="h-[100svh] w-full overflow-hidden snap-y snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ width: "100vw" }}
    >
      <div
        className="h-[100svh] min-h-[100svh] w-full shrink-0 snap-start snap-always overflow-hidden"
        style={{ width: "100vw" }}
      >
        <Hero
          ringWords={ringWords}
          pillTitle={homeMode === "event" ? "NEXT DATE" : "FOLLOW US"}
          onPillClick={homeMode === "event" ? goToNextDate : () => setFollowUsOpen(true)}
          isExited={heroExited || heroIntroActive}
          showButtons={heroCtaVisible}
          notice={homeMode === "none" && loadFailed ? LOAD_FAILED_NOTICE : null}
          ticketUrl={homeTicketUrl}
        />
      </div>
      {homeMode === "event" && nextEvent && (
        <>
          <div
            className="h-[100svh] min-h-[100svh] w-full shrink-0 snap-start snap-always overflow-hidden"
            style={{ width: "100vw" }}
          >
            <NextDate
              onBookNowClick={goToBookNow}
              isExited={nextDateExited}
              event={nextEvent}
              bookingOpen={bookingOpen}
            />
          </div>
          <div
            className="h-[100svh] min-h-[100svh] w-full shrink-0 snap-start snap-always overflow-hidden"
            style={{ width: "100vw" }}
          >
            <BookNow
              onBack={goToHero}
              onConfirm={confirmReservation}
              onConfirmed={goToSummary}
              isExited={bookNowExited}
              entries={nextEvent.entries}
              sessionContact={sessionContact}
              onLogout={handleLogout}
            />
          </div>
          <div
            className="h-[100svh] min-h-[100svh] w-full shrink-0 snap-start snap-always overflow-hidden"
            style={{ width: "100vw" }}
          >
            <ReservationSummary
              onGoHome={goToHero}
              variant={summaryVariant}
              onOpenTicket={summaryTicketUrl ? openTicketInNewTab : undefined}
              fullName={confirmedData?.fullName ?? ""}
              email={confirmedData?.email ?? ""}
              eventDate={confirmedEventDate ?? undefined}
            />
          </div>
        </>
      )}

      {followUsOpen && <FollowUsPanel onClosed={handleFollowUsClosed} />}

      {confirmError && (
        <div
          className={`fixed inset-0 z-[199] ${toastClosing ? "toast-overlay-exit" : "toast-overlay-enter"}`}
          aria-hidden="false"
        >
          <div
            className="absolute inset-0 bg-black/75 cursor-pointer"
            aria-hidden
            onClick={toastClosing ? undefined : dismissToast}
          />
          <div
            className={`absolute top-4 left-1/2 -translate-x-1/2 z-10 w-[calc(100vw-2rem)] max-w-lg ${toastClosing ? "toast-content-exit" : "toast-content-enter"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <ErrorToast error={confirmError} onDismiss={dismissToast} />
          </div>
        </div>
      )}

      <DataNoticeOverlay
        visible={dataNoticeVisible}
        isClosing={dataNoticeClosing}
        onAccept={handleAcceptDataNotice}
      />

      <SiteMenu
        hidden={dataNoticeVisible || dataNoticeClosing || !heroCtaVisible || activeSection === 2}
        onOpenChange={handleMenuOpenChange}
        onLogout={handleLogout}
      />
    </div>
  );
}

export default App;
