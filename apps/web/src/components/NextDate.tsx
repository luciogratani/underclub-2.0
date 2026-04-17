import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PublicEventView } from "@underclub/shared";
import HeroButton from "./HeroButton";
import BookNowButton from "./BookNowButton";

type NextDateProps = {
  onBack?: () => void;
  onBookNowClick?: () => void;
  isExited?: boolean;
  event?: PublicEventView | null;
};

const MOCK_DATE = "SATURDAY MARCH 07";
const MOCK_TIME = "FROM 00:30 TILL LATE";
const MOCK_EVENT = "TECHNOROOM: GIRLS POWER";
const MOCK_LINEUP = [
  { name: "ISABEL", origin: "WAREHOUSE 303" },
  { name: "MÅDVI", origin: "TECHNOROOM" },
  { name: "SKLENA", origin: "TRANCE ITALY" },
];

/** Altezza max della sezione when→lineup: oltre questa solo quest’area scrolla */
const CONTENT_AREA_MAX_HEIGHT_PX = 255;

function formatEventDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const day = d.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
  const month = d.toLocaleDateString("en-US", { month: "long" }).toUpperCase();
  const dd = String(d.getDate()).padStart(2, "0");
  return `${day} ${month} ${dd}`;
}

function formatEventTime(time: string): string {
  return `FROM ${time.slice(0, 5)} TILL LATE`;
}

export default function NextDate({ onBack, onBookNowClick, isExited = false, event }: NextDateProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const contentAreaRef = useRef<HTMLDivElement>(null);
  const [ghostSize, setGhostSize] = useState({ width: 0, height: 0 });
  const [inView, setInView] = useState(false);
  const [hintVisible, setHintVisible] = useState(true);
  const [contentScrollable, setContentScrollable] = useState(false);

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

  useEffect(() => {
    if (!inView) return;
    const el = contentAreaRef.current;
    if (!el) return;
    const checkScrollable = () => {
      setContentScrollable(el.scrollHeight > el.clientHeight);
    };
    checkScrollable();
    const ro = new ResizeObserver(checkScrollable);
    ro.observe(el);
    return () => ro.disconnect();
  }, [inView]);

  useEffect(() => {
    if (!inView || !contentScrollable) return;
    const t = setTimeout(() => setHintVisible(false), 4000);
    return () => clearTimeout(t);
  }, [inView, contentScrollable]);

  useEffect(() => {
    const el = contentAreaRef.current;
    if (!el) return;
    const onScroll = () => setHintVisible(false);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  /* Ghost sempre centrata: si anima solo width/height → espansione uniforme dal centro */
  const ghostStyle = {
    position: "absolute" as const,
    left: "50%",
    top: "50%",
    transform: "translate(-50%, -50%)",
    width: ghostSize.width,
    height: ghostSize.height,
    zIndex: 0,
  };

  return (
    <section
      ref={sectionRef}
      className="relative flex flex-col items-center justify-center w-[100vw] min-w-[100vw] h-[100svh] shrink-0 snap-start snap-always bg-primary"
      aria-label="Prossima data"
    >
      {/* Card fantasma: stessa bg, z-index inferiore, copia le dimensioni della card reale e si espande/ritrae */}
      <div
        className={`overflow-hidden bg-black transition-[width,height,border-radius] duration-300 ease-out ${
          isExited ? "rounded-none" : "rounded-[40px]"
        }`}
        style={ghostStyle}
      />
      {/* Card reale: contenuto, dimensioni al contenuto, sopra la fantasma */}
      <div
        ref={cardRef}
        className="relative z-10 w-[95%] max-w-lg rounded-[40px] overflow-visible bg-black text-primary"
      >
        <div className={`nextdate-content ${inView ? "in-view" : ""}`}>
          <div className="p-4">
          <p
            className="animate-line mt-4.5 text-[50px] font-bold"
            style={{ "--i": 0 } as React.CSSProperties}
          >
            NEXT DATE
          </p>
          <div
            ref={contentAreaRef}
            className="scrollbar-site-primary relative min-h-0 overflow-y-auto overflow-x-hidden"
            style={{ maxHeight: CONTENT_AREA_MAX_HEIGHT_PX }}
          >
            {contentScrollable && (
              <div
                className={`absolute bottom-0 left-0 right-0 flex justify-center pb-1 pt-6 bg-gradient-to-t from-black to-transparent transition-opacity duration-500 ${
                  hintVisible ? "opacity-100" : "scroll-hint-fade-out"
                }`}
                aria-hidden
              >
                <span className="scroll-hint-arrow text-primary" style={{ fontSize: "1.25rem" }}>
                  ↓
                </span>
              </div>
            )}
            <div
              className="animate-line mt-4.5"
              style={{ "--i": 1 } as React.CSSProperties}
            >
              <p className="font-sans text-[14px] tracking-wide opacity-85">when</p>
              <p className="mt-0.5 font-sans text-lg font-medium leading-tight">
                {event ? formatEventDate(event.date) : MOCK_DATE} <br /> {event ? formatEventTime(event.time) : MOCK_TIME}
              </p>
            </div>

            <div
              className="animate-line mt-4.5"
              style={{ "--i": 2 } as React.CSSProperties}
            >
              <p className="font-sans text-[14px] tracking-wide opacity-85">event</p>
              <p className="mt-0.5 font-sans text-lg font-medium leading-tight">{event?.title ?? MOCK_EVENT}</p>
            </div>

            <div
              className="animate-line mt-4.5"
              style={{ "--i": 3 } as React.CSSProperties}
            >
              <p className="font-sans text-[14px] tracking-wide opacity-85">lineup</p>
              <div className="mt-0.5">
                {(event ? event.lineup.map((a) => ({ name: a.name, origin: a.origin })) : MOCK_LINEUP).map((artist, i) => (
                  <div key={i} className="flex items-baseline gap-1 font-sans text-lg leading-tight">
                    <span className="font-medium">{artist.name}</span>
                    {artist.origin && (
                      <span className="flex items-baseline text-[0.5em] leading-none">
                        <span className="font-light">from</span>
                        <span className="ml-0.5 font-medium">{artist.origin}</span>
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
          </div>

          <div
            className="animate-line mb-11 mt-5"
            style={{ "--i": 4 } as React.CSSProperties}
          >
            <BookNowButton onClick={onBookNowClick} />
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
