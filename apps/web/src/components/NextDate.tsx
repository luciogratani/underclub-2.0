import { useEffect, useLayoutEffect, useRef, useState } from "react";
import HeroButton from "./HeroButton";
import BookNowButton from "./BookNowButton";

type NextDateProps = {
  onBack?: () => void;
  onBookNowClick?: () => void;
  isExited?: boolean;
};

const MOCK_DATE = "SATURDAY MARCH 07";
const MOCK_TIME = "FROM 00:30 TILL LATE";
const MOCK_EVENT = "TECHNOROOM: GIRLS POWER";

export default function NextDate({ onBack, onBookNowClick, isExited = false }: NextDateProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [ghostSize, setGhostSize] = useState({ width: 0, height: 0 });

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
        <div className="p-4">
          <p className="mt-4.5 text-[50px] font-bold">NEXT DATE</p>
          <p className="mt-4.5 font-sans text-[14px] tracking-wide opacity-85">when</p>
          <p className="mt-0.5 font-sans text-lg font-medium leading-tight">
            {MOCK_DATE} <br /> {MOCK_TIME}
          </p>

          <p className="mt-4.5 font-sans text-[14px] tracking-wide opacity-85">event</p>
          <p className="mt-0.5 font-sans text-lg font-medium leading-tight">{MOCK_EVENT}</p>

          <p className="mt-4.5 font-sans text-[14px] tracking-wide opacity-85">lineup</p>
          <div className="mt-0.5">
            <div className="flex items-baseline gap-1 font-sans text-lg leading-tight">
              <span className="font-medium">ISABEL</span>
              <span className="flex items-baseline text-[0.5em] leading-none">
                <span className="font-light">from</span>
                <span className="ml-0.5 font-medium">WAREHOUSE 303</span>
              </span>
            </div>
            <div className="flex items-baseline gap-1 font-sans text-lg leading-tight">
              <span className="font-medium">MÅDVI</span>
              <span className="flex items-baseline text-[0.5em] leading-none">
                <span className="font-light">from</span>
                <span className="ml-0.5 font-medium">TECHNOROOM</span>
              </span>
            </div>
            <div className="flex items-baseline gap-1 font-sans text-lg leading-tight">
              <span className="font-medium">SKLENA</span>
              <span className="flex items-baseline text-[0.5em] leading-none">
                <span className="font-light">from</span>
                <span className="ml-0.5 font-medium">TRANCE ITALY</span>
              </span>
            </div>
          </div>
        </div>

        <div className="mb-11 mt-5 w-[calc(115%-2rem)] -mx-3">
          <BookNowButton onClick={onBookNowClick} />
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
