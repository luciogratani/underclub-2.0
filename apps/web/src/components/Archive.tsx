import { useEffect, useRef, useState } from "react";

type ArchiveProps = {
  onBack?: () => void;
};

type ArchiveEvent = {
  title: string;
  date: string;
  lineup?: string[];
};

const MOCK_ARCHIVE: { year: number; events: ArchiveEvent[] }[] = [
  {
    year: 2026,
    events: [
      { title: "TECHNOROOM: GIRLS POWER", date: "MAR. 07", lineup: ["ISABEL", "MÅDVI", "SKLENA",] },
      { title: "BELLA VITA", date: "FEB. 14", lineup: ["TBA"] },
      { title: "TECHNOROOM", date: "FEB. 14", lineup: ["DJ SET"] },
    ],
  },
  {
    year: 2025,
    events: [
      { title: "TECHNOROOM", date: "DEC. 31", lineup: ["ISABEL", "MÅDVI"] },
      { title: "TECHNOROOM: CHRISTMAS PARTY", date: "DEC. 24", lineup: ["SKLENA", "SPECIAL GUESTS"] },
      { title: "BREAKOUT x NTK x ZETABASS", date: "DEC. 20", lineup: ["NTK", "ZETABASS"] },
      { title: "TECHNOROOM", date: "DEC. 06", lineup: ["ISABEL"] },
      { title: "TECHNOROOM", date: "NOV. 22", lineup: ["MÅDVI", "SKLENA"] },
      { title: "HALLOWEEN: PARTY NIGHT", date: "OCT. 31", lineup: ["ISABEL", "MÅDVI", "SKLENA"] },
    ],
  },
];

export default function Archive({ onBack: _onBack }: ArchiveProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [expandedYears, setExpandedYears] = useState<Set<number>>(
    () => new Set(MOCK_ARCHIVE.slice(0, 2).map((a) => a.year))
  );

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setInView(true);
      },
      { threshold: 0.5, rootMargin: "0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const toggleYear = (year: number) => {
    setExpandedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  return (
    <section
      ref={sectionRef}
      className="relative flex flex-col items-center min-w-[100vw] w-[100vw] min-h-[100svh] h-[100svh] shrink-0 snap-start snap-always overflow-hidden bg-primary text-black"
      style={{ height: "100svh" }}
      aria-label="Archive"
    >
      <div className={`archive-content w-[95%] max-w-lg shrink-0 flex-1 flex flex-col min-h-0 ${inView ? "in-view" : ""}`}>
        <div
          className="animate-line flex min-h-0 flex-1 flex-col"
          style={{ "--i": 0 } as React.CSSProperties}
        >
          <div className="w-full shrink-0 p-4">
            <div
              className="mt-5.5 mb-10 flex items-start justify-between gap-4 animate-line"
              style={{ "--i": 1 } as React.CSSProperties}
            >
              <p className="text-[50px] font-bold leading-none">ARCHIVE</p>
              <p className="text-[10px] font-bold mt-2 shrink-0 leading-none">DATE</p>
            </div>
          </div>
          <div className="scrollbar-site min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {MOCK_ARCHIVE.map(({ year, events }, idx) => {
              const isExpanded = expandedYears.has(year);
              return (
                <div
                  key={year}
                  className="animate-line"
                  style={{ "--i": idx + 2 } as React.CSSProperties}
                >
                  <button
                    type="button"
                    onClick={() => toggleYear(year)}
                    className="my-4 flex w-full items-center gap-2 text-left"
                    aria-expanded={isExpanded}
                    aria-controls={`archive-${year}`}
                    id={`archive-btn-${year}`}
                  >
                    <span className="text-[10px] font-bold leading-none shrink-0">{year}</span>
                    <div className="h-[2px] min-w-0 flex-1 bg-black" aria-hidden />
                    <span
                      className="shrink-0 text-[10px] font-bold leading-none transition-transform"
                      aria-hidden
                      style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
                    >
                      ▼
                    </span>
                  </button>
                  <div
                    id={`archive-${year}`}
                    role="region"
                    aria-labelledby={`archive-btn-${year}`}
                    hidden={!isExpanded}
                  >
                    {isExpanded && (
                      <ul className="mt-2 list-none space-y-2 pb-2">
                        {events.map((event, i) => (
                          <li
                            key={`${year}-${i}`}
                            className="flex items-start justify-between gap-4"
                          >
                            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="text-[20px] font-bold leading-[20px] uppercase">{event.title}</span>
                              {event.lineup && event.lineup.length > 0 && (
                                <p className="text-[12px] font-normal leading-tight uppercase opacity-80">
                                  {event.lineup.join(", ")}
                                </p>
                              )}
                            </div>
                            <span className="shrink-0 text-[20px] font-bold leading-[20px] uppercase">{event.date}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
