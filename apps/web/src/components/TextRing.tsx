import { useEffect, useRef, useState } from "react";

const RING_LENGTH = 60;
const ITEMS = Array.from({ length: RING_LENGTH }, (_, i) => i);
const STEP = 360 / ITEMS.length;
const WORD = "UNDERCLUB.IT - ";
const DIVISORS_OF_60 = [1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30, 60] as const;

const DISPLAY_MS = 2000;
const TRANSITION_MS = 3000;
const BLINK_MS = 500;
const BLINK_CHARS = new Set(["-", "<", ">"]);

type TextRingProps = {
  nextDateIso?: string | null;
  nextEventTitle?: string | null;
};

function formatDateForRing(dateIso?: string | null): string {
  if (!dateIso) return "??.??";
  const [year, month, day] = dateIso.split("-");
  if (!year || !month || !day) return "07.03";
  return `${day.padStart(2, "0")}.${month.padStart(2, "0")}`;
}

function sanitizeTitle(value?: string | null): string {
  if (!value) return "UNDERCLUB.IT";
  return value
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(/[<>]/g, "")
    .trim();
}

/**
 * Keeps the ring phrase length on an integer fraction of 60.
 * The separator between repetitions is dynamic:
 * " " + ">".repeat(spaceBetweenWords - 2) + " ".
 */
function buildIntegralRingWord(rawTitle: string): string {
  const safeTitle = sanitizeTitle(rawTitle);
  const minSeparatorLen = 3; // " > "
  const minChunkLen = safeTitle.length + minSeparatorLen;

  // Pick the first divisor that can contain the base chunk.
  const targetChunkLen =
    DIVISORS_OF_60.find((d) => d >= minChunkLen) ?? RING_LENGTH;

  // If the title is very long, cap to full ring length.
  if (targetChunkLen === RING_LENGTH && minChunkLen > RING_LENGTH) {
    const trimmed = safeTitle.slice(0, Math.max(1, RING_LENGTH - minSeparatorLen)).trimEnd();
    const spaceBetweenWords = Math.max(minSeparatorLen, RING_LENGTH - trimmed.length);
    const separator = ` ${">".repeat(spaceBetweenWords - 2)} `;
    return `${trimmed}${separator}`;
  }

  const spaceBetweenWords = Math.max(minSeparatorLen, targetChunkLen - safeTitle.length);
  const separator = ` ${">".repeat(spaceBetweenWords - 2)} `;
  return `${safeTitle}${separator}`;
}

export default function TextRing({
  nextDateIso,
  nextEventTitle,
}: TextRingProps) {
  const startRef = useRef<number>(0);
  const [now, setNow] = useState(0);

  useEffect(() => {
    startRef.current = typeof performance !== "undefined" ? performance.now() : Date.now();
    let rafId: number;
    const tick = () => {
      setNow(typeof performance !== "undefined" ? performance.now() : Date.now());
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const dateWord = `NEXT DATE > ${formatDateForRing(nextDateIso)} < `;
  const eventWord = buildIntegralRingWord(nextEventTitle ?? "TECHNOROOM");
  const WORDS = [WORD, dateWord, eventWord];

  const elapsed = Math.max(0, now - startRef.current);
  const cycle = Math.floor(elapsed / (DISPLAY_MS + TRANSITION_MS)) % WORDS.length;
  const phaseInSlot = elapsed % (DISPLAY_MS + TRANSITION_MS);
  const inTransition = phaseInSlot >= DISPLAY_MS;
  const transitionElapsed = inTransition ? (phaseInSlot - DISPLAY_MS) / TRANSITION_MS : 0;
  const currentWord = WORDS[cycle];
  const nextWord = WORDS[(cycle + 1) % WORDS.length];
  const blinkOff = (elapsed % BLINK_MS) / BLINK_MS >= 0.5;
  const blinkActive = !inTransition;

  return (
    <div className="text-ring-container absolute inset-0 w-full h-full overflow-hidden flex items-center justify-center bg-primary">
      <div className="text-ring-visual relative w-full h-full flex items-center justify-center rotate-[12deg]">
        <ul className="text-ring-list">
          {ITEMS.map((_, index) => {
            const angle = index * STEP;
            const translateY = -43.3;
            const waveFront = transitionElapsed * ITEMS.length;
            const showNext = inTransition && index < waveFront;
            const word = showNext ? nextWord : currentWord;
            let char = word[index % word.length];
            if (blinkActive && BLINK_CHARS.has(char) && blinkOff) char = " ";

            return (
              <li
                key={index}
                className="absolute top-1/2 left-1/2 whitespace-nowrap bg-deep-grey text-primary"
                style={{
                  transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(${translateY}vw) rotateX(90deg)`,
                }}
              >
                {char === " " ? "\u00A0" : char}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
