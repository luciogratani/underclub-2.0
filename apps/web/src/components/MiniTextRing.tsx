const WORD = "ERROR ";
const ITEMS = Array.from({ length: 24 }, (_, i) => i);
const STEP = 360 / ITEMS.length;
const RADIUS_REM = 2.25;

export default function MiniTextRing() {
  return (
    <div className="relative w-[4.5rem] h-[4.5rem] flex items-center justify-center overflow-hidden shrink-0">
      <ul className="text-ring-list-mini">
        {ITEMS.map((_, index) => {
        const angle = index * STEP;
        return (
          <li
            key={index}
            className="absolute top-1/2 left-1/2 whitespace-nowrap bg-error text-deep-grey"
            style={{
              transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-${RADIUS_REM}rem) rotateX(90deg)`,
            }}
          >
            {WORD[index % WORD.length] === " " ? "\u00A0" : WORD[index % WORD.length]}
          </li>
        );
      })}
      </ul>
    </div>
  );
}
