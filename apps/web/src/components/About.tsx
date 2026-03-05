type AboutProps = {
  onBack?: () => void;
};

type ArchiveEvent = {
  title: string;
  date: string;
};

const MOCK_ARCHIVE: { year: number; events: ArchiveEvent[] }[] = [
  {
    year: 2026,
    events: [
      { title: "TECHNOROOM: GIRLS POWER", date: "MAR. 07" },
      { title: "BELLA VITA", date: "FEB. 14" },
      { title: "TECHNOROOM", date: "FEB. 14" },
    ],
  },
  {
    year: 2025,
    events: [
      { title: "TECHNOROOM", date: "DEC. 31" },
      { title: "TECHNOROOM: CHRISTMAS PARTY", date: "DEC. 24" },
      { title: "BREAKOUT x NTK x ZETABASS", date: "DEC. 20" },
      { title: "TECHNOROOM", date: "DEC. 06" },
      { title: "TECHNOROOM", date: "NOV. 22" },
      { title: "HALLOWEEN: PARTY NIGHT", date: "OCT. 31" },
      { title: "TECHNOROOM", date: "DEC. 31" },
      { title: "TECHNOROOM: CHRISTMAS PARTY", date: "DEC. 24" },
      { title: "BREAKOUT x NTK x ZETABASS", date: "DEC. 20" },
      { title: "TECHNOROOM", date: "DEC. 06" },
      { title: "TECHNOROOM", date: "NOV. 22" },
      { title: "HALLOWEEN: PARTY NIGHT", date: "OCT. 31" },
    ],
  },
];

export default function About({ onBack: _onBack }: AboutProps) {
  return (
    <section
      className="relative flex flex-col items-center min-w-[100vw] w-[100vw] min-h-[100svh] h-[100svh] shrink-0 snap-start snap-always overflow-hidden bg-primary text-black"
      style={{ height: "100svh" }}
      aria-label="About"
    >
      <div className="w-[95%] max-w-lg shrink-0 p-4">
        <div className="mt-5.5 mb-10 flex items-start justify-between gap-4">
          <p className="text-[50px] font-bold leading-none">ARCHIVE</p>
          <p className="text-[10px] font-bold mt-2 shrink-0 leading-none">DATE</p>
        </div>
      </div>
      <div className="scrollbar-site min-h-0 w-[95%] max-w-lg flex-1 overflow-y-auto px-4 pb-4">
        {MOCK_ARCHIVE.map(({ year, events }) => (
          <div key={year}>
            <div
              className="my-4 flex items-center gap-2"
              aria-label={`Archivio ${year}`}
            >
              <span className="text-[10px] font-bold leading-none shrink-0">{year}</span>
              <div className="h-[2px] min-w-0 flex-1 bg-black" aria-hidden />
            </div>
            <ul className="mt-2 list-none space-y-2">
              {events.map((event, i) => (
                <li
                  key={`${year}-${i}`}
                  className="flex items-start justify-between gap-4 text-[20px] font-bold leading-[20px] uppercase"
                >
                  <span className="min-w-0">{event.title}</span>
                  <span className="shrink-0">{event.date}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
