/** The `uc_session` cookie: httpOnly, 12 months, rolling. */

export const SESSION_COOKIE = 'uc_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

// Tokens are base64url of 32 random bytes (43 chars); allow some slack.
const TOKEN_RE = /^[A-Za-z0-9_-]{20,200}$/;

export function isWellFormedToken(value: unknown): value is string {
  return typeof value === 'string' && TOKEN_RE.test(value);
}

function parseCookieHeader(header: string | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    if (!name || out.has(name)) continue;
    let value = part.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    try {
      out.set(name, decodeURIComponent(value));
    } catch {
      out.set(name, value);
    }
  }
  return out;
}

export interface SessionCookieState {
  /** The client sent a `uc_session` cookie (well-formed or not). */
  sent: boolean;
  /** The token, only when well-formed. */
  token: string | null;
}

export function readSessionCookie(request: Request): SessionCookieState {
  const raw = parseCookieHeader(request.headers.get('cookie')).get(SESSION_COOKIE);
  if (raw === undefined) return { sent: false, token: null };
  return { sent: true, token: isWellFormedToken(raw) ? raw : null };
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}
