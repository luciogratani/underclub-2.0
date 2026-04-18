import { useEffect, useRef, useState } from "react";
import type {
  PublicReservationFormInput,
  PublicEventView,
  CreateReservationResult,
} from "@underclub/shared";
import Hero from "./components/Hero";
import NextDate from "./components/NextDate";
import BookNow from "./components/BookNow";
import ReservationSummary from "./components/ReservationSummary";
import DataNoticeOverlay from "./components/DataNoticeOverlay";
import ErrorToast, { type ErrorToastData } from "./components/ErrorToast";
import { fetchNextEvent, createReservation } from "./lib/api";

const TOTAL_SECTIONS = 4;
const GESTURE_THRESHOLD_PX = 40;
const WHEEL_THRESHOLD = 24;
const DATA_NOTICE_FADE_MS = 360;
const DATA_NOTICE_SESSION_KEY = "underclub.dataNoticeAccepted";
const DEBUG_LOG = import.meta.env.DEV;

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
  const [reservationResult, setReservationResult] = useState<CreateReservationResult | null>(null);
  const [confirmedData, setConfirmedData] = useState<PublicReservationFormInput | null>(null);
  const [confirmedEventDate, setConfirmedEventDate] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<ErrorToastData | null>(null);
  const [toastClosing, setToastClosing] = useState(false);

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
    const target = Math.max(0, Math.min(TOTAL_SECTIONS - 1, targetIndex));
    if (target === current || isNavigatingRef.current) return;
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
    setNextEvent(refreshed);
  };

  const goToSummary = async (
    data: PublicReservationFormInput,
    entryId: string | null,
  ) => {
    setConfirmError(null);

    if (nextEvent && entryId) {
      try {
        const result = await createReservation(data, nextEvent.id, entryId);
        setReservationResult(result);
        const absoluteTicketUrl =
          typeof window !== "undefined"
            ? new URL(result.ticketUrl, window.location.origin).toString()
            : result.ticketUrl;
        console.info("[underclub][reservation] ticket link (tokenized)", {
          reservationId: result.reservationId,
          ticketUrl: absoluteTicketUrl,
          ticketToken: result.ticketToken,
        });
        // Keep entry availability in sync after each successful booking.
        void refreshNextEvent();
        setConfirmedData(data);
        setConfirmedEventDate(nextEvent.date);
        navigateToSection(3);
      } catch (err: unknown) {
        const e = err as { message?: string; details?: string; code?: string };
        setToastClosing(false);
        setConfirmError({
          title: "Reservation failed",
          message: e.message || "Unable to save. Please try again.",
          technicalDetail: e.details,
          code: e.code,
        });
      }
    } else {
      setConfirmedData(data);
      setConfirmedEventDate(nextEvent?.date ?? null);
      navigateToSection(3);
    }
  };

  const goToHero = () => {
    navigateToSection(0);
  };

  const openTicketInNewTab = () => {
    if (!reservationResult?.ticketUrl || typeof window === "undefined") return;
    const absoluteTicketUrl = new URL(reservationResult.ticketUrl, window.location.origin).toString();
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
    gesturesLockedRef.current = dataNoticeVisible || dataNoticeClosing;
  }, [dataNoticeVisible, dataNoticeClosing]);

  useEffect(() => {
    if (dataNoticeVisible || dataNoticeClosing) return;

    // Always run intro when app becomes visible (also when overlay was already
    // accepted in session), and keep it StrictMode-safe.
    setHeroCtaVisible(false);
    setHeroIntroActive(true);
    const timerId = window.setTimeout(() => {
      setHeroCtaVisible(true);
      setHeroIntroActive(false);
    }, 180);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [dataNoticeVisible, dataNoticeClosing]);

  useEffect(() => {
    const elV = scrollRefV.current;
    if (!elV) return;
    const onScrollV = () => {
      if (gesturesLockedRef.current) return;
      const h = elV.clientHeight;
      if (h > 0) {
        currentSectionRef.current = Math.max(
          0,
          Math.min(TOTAL_SECTIONS - 1, Math.round(elV.scrollTop / h))
        );
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

  useEffect(() => {
    let cancelled = false;
    fetchNextEvent().then((ev) => {
      if (DEBUG_LOG) {
        console.info("[underclub][App] fetchNextEvent resolved", {
          hasEvent: Boolean(ev),
          eventId: ev?.id,
          title: ev?.title,
        });
      }
      if (!cancelled && ev) setNextEvent(ev);
    });
    return () => { cancelled = true; };
  }, []);

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
          onNextDateClick={goToNextDate}
          isExited={heroExited || heroIntroActive}
          showNextDateButton={heroCtaVisible}
          nextDateIso={nextEvent?.date}
          nextEventTitle={nextEvent?.title}
        />
      </div>
      <div
        className="h-[100svh] min-h-[100svh] w-full shrink-0 snap-start snap-always overflow-hidden"
        style={{ width: "100vw" }}
      >
        <NextDate onBookNowClick={goToBookNow} isExited={nextDateExited} event={nextEvent} />
      </div>
      <div
        className="h-[100svh] min-h-[100svh] w-full shrink-0 snap-start snap-always overflow-hidden"
        style={{ width: "100vw" }}
      >
        <BookNow
          onBack={goToHero}
          onConfirm={goToSummary}
          isExited={bookNowExited}
          entries={nextEvent?.entries}
        />
      </div>
      <div
        className="h-[100svh] min-h-[100svh] w-full shrink-0 snap-start snap-always overflow-hidden"
        style={{ width: "100vw" }}
      >
        <ReservationSummary
          onGoHome={goToHero}
          onOpenTicket={reservationResult?.ticketUrl ? openTicketInNewTab : undefined}
          fullName={confirmedData?.fullName ?? ""}
          email={confirmedData?.email ?? ""}
          eventDate={confirmedEventDate ?? undefined}
          reservationId={reservationResult?.reservationId}
        />
      </div>

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
    </div>
  );
}

export default App;
