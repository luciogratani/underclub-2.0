/**
 * Booking source capture (`reservations.source`).
 *
 * On landing we read `?src=` (preferred) or `?utm_source=` (fallback),
 * normalize it to the DB slug convention and keep it for the visit in
 * sessionStorage. First touch wins: a later landing with another source in the
 * same tab does not overwrite it. Anything that is not a valid slug is ignored,
 * so the endpoint receives either a clean slug or null (null = direct/unknown).
 */

const SOURCE_SESSION_KEY = "underclub.source";
const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,62}[a-z0-9]$/;

export function normalizeSource(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/_{2,}/g, "_")
    .replace(/^[-_]+|[-_]+$/g, "");
  return SLUG_RE.test(slug) ? slug : null;
}

export function captureBookingSource(search?: string): void {
  if (typeof window === "undefined") return;
  try {
    if (window.sessionStorage.getItem(SOURCE_SESSION_KEY)) return;
    const params = new URLSearchParams(search ?? window.location.search);
    const slug = normalizeSource(params.get("src")) ?? normalizeSource(params.get("utm_source"));
    if (slug) window.sessionStorage.setItem(SOURCE_SESSION_KEY, slug);
  } catch {
    // sessionStorage unavailable (private mode, blocked storage): no source.
  }
}

export function getBookingSource(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return normalizeSource(window.sessionStorage.getItem(SOURCE_SESSION_KEY));
  } catch {
    return null;
  }
}
