const ITEMS = Array.from({ length: 60 }, (_, i) => i);
const STEP = 360 / ITEMS.length;
const WORD = "1   5    10   15   20    25   30   35   40   45   50   55   ";

export default function TextRing() {
  return (
    <div className="text-ring-container relative w-screen h-screen overflow-hidden flex items-center justify-center bg-orange">
      <div className="text-ring-visual relative w-full h-full flex items-center justify-center rotate-[12deg]">
        <ul className="text-ring-list">
        {WORD.length}
          {ITEMS.map((_, index) => {
            const angle = index * STEP;
            const translateY = -43;

            return (
              <li
                key={index}
                className="absolute top-1/2 left-1/2 whitespace-nowrap bg-white text-orange"
                style={{
                  transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(${translateY}vw) rotateX(90deg)`,
                }}
              >
                {WORD[index % WORD.length] === " " ? "\u00A0" : WORD[index % WORD.length]}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
