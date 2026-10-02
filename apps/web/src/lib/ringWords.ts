/** Phrases of the home ring (TextRing): 60 characters around, phrases divide 60. */

export const RING_LENGTH = 60;
const WORD = "UNDERCLUB.IT - ";
const DIVISORS_OF_60 = [1, 2, 3, 4, 5, 6, 10, 12, 15, 20, 30, 60] as const;

/** While the home is loading: the name only, no cycle. */
export const RING_WORDS_LOADING = [WORD] as const;
/** Home without nights: the name and an unknown next date (20 chars). */
export const RING_WORDS_NO_EVENT = [WORD, " < NEXT DATE > ??.??"] as const;

/** Home with a night: name, date, title. */
export function ringWordsForEvent(dateIso: string, title: string): string[] {
  return [WORD, `NEXT DATE > ${formatDateForRing(dateIso)} < `, buildIntegralRingWord(title)];
}

function formatDateForRing(dateIso: string): string {
  const [, month = "", day = ""] = dateIso.split("-");
  return `${day.padStart(2, "0")}.${month.padStart(2, "0")}`;
}

function sanitizeTitle(value: string): string {
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
