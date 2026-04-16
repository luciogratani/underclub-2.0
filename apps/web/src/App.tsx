import { useEffect, useRef, useState } from "react";
import Hero from "./components/Hero";
import NextDate from "./components/NextDate";
import Archive from "./components/Archive";
import Guests from "./components/Guests";
import BookNow from "./components/BookNow";
import ReservationSummary from "./components/ReservationSummary";
import ErrorToast from "./components/ErrorToast";
import PerfMeter from "./components/PerfMeter";

export type ReservationData = {
  fullName: string;
  dateOfBirth: string;
  email: string;
};

export type ToastError = {
  title: string;
  message: string;
  technicalDetail?: string;
  code?: string;
};

function App() {
  const scrollRefH = useRef<HTMLDivElement>(null);
  const scrollRefH2 = useRef<HTMLDivElement>(null);
  const scrollRefH3 = useRef<HTMLDivElement>(null);
  const scrollRefV = useRef<HTMLDivElement>(null);
  const [heroExited, setHeroExited] = useState(false);
  const [nextDateExited, setNextDateExited] = useState(false);
  const [bookNowExited, setBookNowExited] = useState(false);
  const [confirmedData, setConfirmedData] = useState<ReservationData | null>(null);
  const [confirmError, setConfirmError] = useState<ToastError | null>(null);
  const [toastClosing, setToastClosing] = useState(false);

  const scrollToNext = () => {
    const el = scrollRefH.current;
    if (!el) return;
    el.scrollTo({ left: el.clientWidth, behavior: "smooth" });
  };

  const scrollToPrev = () => {
    const el = scrollRefH.current;
    if (!el) return;
    el.scrollTo({ left: 0, behavior: "smooth" });
  };

  const goToNextDate = () => {
    setHeroExited(true);
    setTimeout(() => scrollToNext(), 300);
  };

  const goToAbout = () => {
    setHeroExited(true);
    const elH = scrollRefH.current;
    if (elH) elH.scrollTo({ left: 0, behavior: "auto" });
    setTimeout(() => {
      const el = scrollRefV.current;
      if (!el) return;
      el.scrollTo({ top: el.clientHeight, behavior: "smooth" });
    }, 300);
  };

  const goToBookNow = () => {
    setNextDateExited(true);
    const elH2 = scrollRefH2.current;
    if (elH2) elH2.scrollTo({ left: elH2.clientWidth, behavior: "auto" });
    setTimeout(() => {
      const elV = scrollRefV.current;
      if (!elV) return;
      elV.scrollTo({ top: elV.clientHeight, behavior: "smooth" });
    }, 300);
  };

  const goToSummary = (data: ReservationData) => {
    setConfirmError(null);
    setConfirmedData(data);
    setBookNowExited(true);
    setTimeout(() => {
      const elV = scrollRefV.current;
      const elH3 = scrollRefH3.current;
      if (elV) elV.scrollTo({ top: 2 * elV.clientHeight, behavior: "smooth" });
      if (elH3) elH3.scrollTo({ left: elH3.clientWidth, behavior: "smooth" });
    }, 300);
    // In caso di errore API: setToastClosing(false); setConfirmError({ title, message, ... }); e non fare scroll
  };

  const goToHero = () => {
    const elV = scrollRefV.current;
    const elH = scrollRefH.current;
    const elH2 = scrollRefH2.current;
    const elH3 = scrollRefH3.current;
    if (elV) elV.scrollTo({ top: 0, behavior: "smooth" });
    if (elH) elH.scrollTo({ left: 0, behavior: "smooth" });
    if (elH2) elH2.scrollTo({ left: 0, behavior: "smooth" });
    if (elH3) elH3.scrollTo({ left: 0, behavior: "smooth" });
  };

  const goToNextSection = () => {
    const elH3 = scrollRefH3.current;
    if (elH3) elH3.scrollTo({ left: elH3.clientWidth, behavior: "smooth" });
  };

  useEffect(() => {
    const elH = scrollRefH.current;
    if (!elH) return;
    const onScrollH = () => {
      if (elH.scrollLeft === 0) {
        setHeroExited(false);
        setNextDateExited(false);
      }
    };
    elH.addEventListener("scroll", onScrollH, { passive: true });
    return () => elH.removeEventListener("scroll", onScrollH);
  }, []);

  useEffect(() => {
    const elH2 = scrollRefH2.current;
    if (!elH2) return;
    const onScrollH2 = () => {
      if (elH2.scrollLeft === 0) setBookNowExited(false);
    };
    elH2.addEventListener("scroll", onScrollH2, { passive: true });
    return () => elH2.removeEventListener("scroll", onScrollH2);
  }, []);

  useEffect(() => {
    const elV = scrollRefV.current;
    if (!elV) return;
    const onScrollV = () => {
      const h = elV.clientHeight;
      if (elV.scrollTop < h * 0.5) {
        setHeroExited(false);
        setBookNowExited(false);
      }
    };
    elV.addEventListener("scroll", onScrollV, { passive: true });
    return () => elV.removeEventListener("scroll", onScrollV);
  }, []);

  const dismissToast = () => {
    setToastClosing(true);
  };

  const showTestErrorToast = () => {
    setToastClosing(false);
    setConfirmError({
      title: "Database error",
      message: "Unable to save the reservation. Please try again in a moment.",
      technicalDetail:
        'insert failed: duplicate key value violates unique constraint "reservations_email_key"',
      code: "23505",
    });
  };

  useEffect(() => {
    if (!toastClosing) return;
    const t = setTimeout(() => {
      setConfirmError(null);
      setToastClosing(false);
    }, 300);
    return () => clearTimeout(t);
  }, [toastClosing]);

  return (
    <div
      ref={scrollRefV}
      className="h-[100svh] w-full overflow-y-auto overflow-x-hidden snap-y snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ width: "100vw" }}
    >
      <div
        className="h-[100svh] min-h-[100svh] w-full shrink-0 snap-start snap-always overflow-hidden"
        style={{ width: "100vw" }}
      >
        <div
          ref={scrollRefH}
          className="flex h-full w-full overflow-x-auto overflow-y-hidden snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <Hero
            onNextDateClick={goToNextDate}
            onAboutClick={goToAbout}
            isExited={heroExited}
          />
          <NextDate onBack={scrollToPrev} onBookNowClick={goToBookNow} isExited={nextDateExited} />
        </div>
      </div>
      <div
        className="h-[100svh] min-h-[100svh] w-full shrink-0 snap-start snap-always overflow-hidden"
        style={{ width: "100vw" }}
      >
        <div
          ref={scrollRefH2}
          className="flex h-full w-full overflow-x-auto overflow-y-hidden snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <Archive onBack={goToHero} />
          <BookNow onBack={goToHero} onConfirm={goToSummary} isExited={bookNowExited} />
        </div>
      </div>
      <div
        className="h-[100svh] min-h-[100svh] w-full shrink-0 snap-start snap-always overflow-hidden"
        style={{ width: "100vw" }}
      >
        <div
          ref={scrollRefH3}
          className="flex h-full w-full overflow-x-auto overflow-y-hidden snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <Guests onBack={goToHero} onScrollToNextSection={goToNextSection} />
          <ReservationSummary
            onGoHome={goToHero}
            fullName={confirmedData?.fullName ?? ""}
            dateOfBirth={confirmedData?.dateOfBirth ?? ""}
            email={confirmedData?.email ?? ""}
          />
        </div>
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

      <PerfMeter onTriggerError={showTestErrorToast} />
    </div>
  );
}

export default App;
