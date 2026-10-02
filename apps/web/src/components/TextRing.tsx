import { useEffect, useRef, useState } from "react";
import { RING_LENGTH, RING_WORDS_LOADING } from "../lib/ringWords";

const ITEMS = Array.from({ length: RING_LENGTH }, (_, i) => i);
const STEP = 360 / ITEMS.length;

const DISPLAY_MS = 2000;
const TRANSITION_MS = 3000;
const BLINK_MS = 500;
const BLINK_CHARS = new Set(["-", "<", ">"]);

type TextRingProps = {
  /**
   * Phrases shown in turn, each repeated around the ring (lengths should
   * divide 60). One phrase = no cycle. The cycle restarts when they change.
   */
  words: readonly string[];
};

function clockNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export default function TextRing({ words }: TextRingProps) {
  const startRef = useRef<number>(0);
  const [now, setNow] = useState(0);
  const wordsKey = words.join("\u0000");

  // New phrases: start the cycle again from the first one.
  useEffect(() => {
    startRef.current = clockNow();
  }, [wordsKey]);

  useEffect(() => {
    let rafId: number;
    const tick = () => {
      setNow(clockNow());
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const WORDS = words.length > 0 ? words : RING_WORDS_LOADING;

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
