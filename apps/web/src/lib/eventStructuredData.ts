/**
 * schema.org `MusicEvent` for the night on the home, so it can show up in
 * Google's event results. The club itself (`NightClub`) is static in
 * index.html; this is injected only when a night is on show.
 */
import type { PublicEventView } from "@underclub/shared";

const ROME = "Europe/Rome";

/** Minutes Europe/Rome is ahead of UTC at the instant `utcMs`. */
function romeOffsetMinutes(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ROME,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - utcMs) / 60_000);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * When the doors open, as ISO 8601 with the Rome offset. A night is listed
 * under its date and starts that evening or after midnight: a time before
 * 12:00 (e.g. 00:30) is on the next calendar day.
 */
export function nightStartIso(dateIso: string, time: string): string {
  const [y = 0, m = 1, d = 1] = dateIso.split("-").map(Number);
  const [hh = 0, mm = 0] = time.split(":").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d + (hh < 12 ? 1 : 0)));
  const wall = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hh, mm);
  // Offset at the instant the wall-clock time maps to (twice: DST edges).
  let offset = romeOffsetMinutes(wall - 60 * 60_000);
  offset = romeOffsetMinutes(wall - offset * 60_000);
  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const ymd = `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`;
  return `${ymd}T${pad(hh)}:${pad(mm)}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export function buildMusicEventJsonLd(event: PublicEventView, origin: string): Record<string, unknown> {
  const url = `${origin}/`;
  return {
    "@context": "https://schema.org",
    "@type": "MusicEvent",
    name: event.title,
    startDate: nightStartIso(event.date, event.time),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    url,
    image: `${origin}/og.png`,
    location: {
      "@type": "NightClub",
      name: "Underclub",
      url,
      address: {
        "@type": "PostalAddress",
        streetAddress: "Viale Porto Torres 5",
        postalCode: "07100",
        addressLocality: "Sassari",
        addressRegion: "SS",
        addressCountry: "IT",
      },
    },
    organizer: { "@type": "Organization", name: "Underclub", url },
    ...(event.lineup.length > 0 && {
      performer: event.lineup.map((a) => ({ "@type": "Person", name: a.name })),
    }),
    ...(event.entries.length > 0 && {
      offers: event.entries.map((e) => ({
        "@type": "Offer",
        name: e.name,
        price: e.price,
        priceCurrency: "EUR",
        url,
        availability: e.availability.soldOut ? "https://schema.org/SoldOut" : "https://schema.org/InStock",
        validThrough: event.bookingDeadline,
      })),
    }),
  };
}
