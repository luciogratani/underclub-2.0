import { useCallback, useEffect, useRef, useState } from "react";

type GuestsProps = {
  onBack?: () => void;
  onScrollToNextSection?: () => void;
};

/** Mock: in futuro arriva dal db come lista di nomi */
const GUEST_NAMES: string[] = [
  "Alex Akashi",
  "Axiver",
  "Bulls",
  "Cristian Fois",
  "Dolce Potente",
  "GRX",
  "Isabel",
  "JO//KX",
  "Jonny Mele",
  "Lucianø",
  "Mådvi",
  "Mannu",
  "Marta Martinez",
  "PACKAPUNCH909",
  "Paola del Bene",
  "Peppe Amore",
  "Resa Utopica",
  "Richimpa",
  "Sergione",
  "Shifta",
  "SKLENA",
  "Soli IV",
  "SYRA",
  "Tecnik Curr",
  "Xander Doorn",
];

const TOUCH_THRESHOLD_PX = 40;

export default function Guests({ onBack, onScrollToNextSection }: GuestsProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartY = useRef<number>(0);
  const touchFired = useRef<"up" | "down" | null>(null);

  const length = GUEST_NAMES.length;
  const atFirst = activeIndex === 0;
  const atLast = activeIndex === length - 1;

  const wheelHandler = useCallback(
    (e: WheelEvent) => {
      if (e.deltaY > 0) {
        if (!atLast) {
          setActiveIndex((i) => Math.min(i + 1, length - 1));
          e.preventDefault();
        } else {
          onScrollToNextSection?.();
        }
      } else if (e.deltaY < 0) {
        if (!atFirst) {
          setActiveIndex((i) => Math.max(i - 1, 0));
          e.preventDefault();
        } else {
          onBack?.();
        }
      }
    },
    [atFirst, atLast, length, onBack, onScrollToNextSection]
  );

  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    touchFired.current = null;
  }, []);

  const touchMoveHandler = useCallback(
    (e: TouchEvent) => {
      const currentY = e.touches[0].clientY;
      const delta = currentY - touchStartY.current;

      if (delta > TOUCH_THRESHOLD_PX && touchFired.current !== "down") {
        touchFired.current = "down";
        if (!atLast) {
          setActiveIndex((i) => Math.min(i + 1, length - 1));
          e.preventDefault();
        } else {
          onScrollToNextSection?.();
        }
      } else if (delta < -TOUCH_THRESHOLD_PX && touchFired.current !== "up") {
        touchFired.current = "up";
        if (!atFirst) {
          setActiveIndex((i) => Math.max(i - 1, 0));
          e.preventDefault();
        } else {
          onBack?.();
        }
      }
    },
    [atFirst, atLast, length, onBack, onScrollToNextSection]
  );

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    el.addEventListener("wheel", wheelHandler, { passive: false });
    return () => el.removeEventListener("wheel", wheelHandler);
  }, [wheelHandler]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    el.addEventListener("touchmove", touchMoveHandler, { passive: false });
    return () => el.removeEventListener("touchmove", touchMoveHandler);
  }, [touchMoveHandler]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const onTouchEnd = () => {
      touchFired.current = null;
    };
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => el.removeEventListener("touchend", onTouchEnd);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        if (!atLast) {
          setActiveIndex((i) => Math.min(i + 1, length - 1));
          e.preventDefault();
        } else {
          onScrollToNextSection?.();
        }
      } else if (e.key === "ArrowUp") {
        if (!atFirst) {
          setActiveIndex((i) => Math.max(i - 1, 0));
          e.preventDefault();
        } else {
          onBack?.();
        }
      }
    },
    [atFirst, atLast, length, onBack, onScrollToNextSection]
  );

  return (
    <section
      className="relative flex flex-col items-center min-w-[100vw] w-[100vw] min-h-[100svh] h-[100svh] shrink-0 snap-start snap-always overflow-hidden bg-primary text-black"
      style={{ height: "100svh" }}
      aria-label="Guests"
      aria-roledescription="Lista ospiti, scorri per cambiare nome"
    >
      <div
        ref={wrapperRef}
        className="flex w-[95%] max-w-lg flex-1 flex-col min-h-0 outline-none"
        tabIndex={0}
        onTouchStart={handleTouchStart}
        onKeyDown={handleKeyDown}
        style={{ touchAction: "none" }}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="w-full shrink-0 p-4">
            <div className="mt-5.5 mb-10 flex items-start justify-between gap-4">
              <p className="text-[50px] font-bold leading-none">ALL TIME GUESTS</p>
              <p className="text-[10px] font-bold mt-2 shrink-0 leading-none">A-Z</p>
            </div>
          </div>
          <div className="flex flex-1 items-center px-4 pb-4 min-h-0">
            <p
              className="guests-current-name text-[36px] font-bold leading-tight"
              aria-current="true"
              aria-label={`Ospite ${activeIndex + 1} di ${length}: ${GUEST_NAMES[activeIndex]}`}
            >
              {GUEST_NAMES[activeIndex]}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
