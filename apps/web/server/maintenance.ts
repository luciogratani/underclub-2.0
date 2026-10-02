/**
 * Maintenance mode, run by the Routing Middleware (../middleware.ts) before
 * every page and API route.
 *
 * MAINTENANCE_MODE=1 closes the site: pages get a 503 page, API routes a 503
 * JSON. Still open: the cron, static files and ticket pages (a QR already
 * sent must open at the door). Opening `/?bypass=<MAINTENANCE_BYPASS_SECRET>`
 * sets a cookie that lets the whole site through, so the team can keep
 * working on the real domain.
 *
 * The switch lives in env for now (changing it needs a redeploy). The admin
 * switch will replace `readMaintenanceConfig`'s source, nothing else.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { parseCookieHeader } from './cookies.js';

export const BYPASS_COOKIE = 'uc_bypass';
export const BYPASS_PARAM = 'bypass';
const BYPASS_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const MIN_SECRET_LENGTH = 16;
const RETRY_AFTER_SECONDS = 3600;

export interface MaintenanceConfig {
  on: boolean;
  /** null when unset or too short: nobody gets through. */
  bypassSecret: string | null;
}

export type MaintenanceDecision =
  | { kind: 'pass' }
  /** Valid `?bypass=`: set the cookie and redirect to the clean URL. */
  | { kind: 'grant'; location: string }
  | { kind: 'page' }
  | { kind: 'api' };

export function readMaintenanceConfig(source: Record<string, string | undefined>): MaintenanceConfig {
  const flag = (source.MAINTENANCE_MODE ?? '').trim().toLowerCase();
  const on = flag === '1' || flag === 'true';
  const secret = (source.MAINTENANCE_BYPASS_SECRET ?? '').trim();
  if (on && secret.length < MIN_SECRET_LENGTH) {
    console.warn('[maintenance] on without a usable MAINTENANCE_BYPASS_SECRET: bypass disabled');
  }
  return { on, bypassSecret: secret.length >= MIN_SECRET_LENGTH ? secret : null };
}

/** The cookie holds a hash of the secret: changing the secret revokes every cookie. */
function bypassToken(secret: string): string {
  return createHash('sha256').update(`${BYPASS_COOKIE}:${secret}`).digest('base64url');
}

/** Constant-time comparison (hashing first makes the lengths equal). */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

function isAlwaysOpen(pathname: string): boolean {
  if (pathname.startsWith('/api/cron/')) return true;
  if (pathname.startsWith('/ticket/')) return true;
  // Static files (JS, CSS, fonts, images, models), but never an HTML page.
  const last = pathname.slice(pathname.lastIndexOf('/') + 1);
  return last.includes('.') && !last.endsWith('.html');
}

export function decideMaintenance(url: URL, cookieHeader: string | null, config: MaintenanceConfig): MaintenanceDecision {
  if (!config.on) return { kind: 'pass' };
  if (isAlwaysOpen(url.pathname)) return { kind: 'pass' };

  const secret = config.bypassSecret;
  if (secret) {
    const param = url.searchParams.get(BYPASS_PARAM);
    if (param !== null && safeEqual(param, secret)) {
      const clean = new URL(url);
      clean.searchParams.delete(BYPASS_PARAM);
      return { kind: 'grant', location: clean.pathname + clean.search };
    }
    const cookie = parseCookieHeader(cookieHeader).get(BYPASS_COOKIE);
    if (cookie !== undefined && safeEqual(cookie, bypassToken(secret))) return { kind: 'pass' };
  }

  return url.pathname === '/api' || url.pathname.startsWith('/api/') ? { kind: 'api' } : { kind: 'page' };
}

const CLOSED_HEADERS = {
  'Cache-Control': 'no-store',
  'Retry-After': String(RETRY_AFTER_SECONDS),
  'X-Robots-Tag': 'noindex',
};

/** The Response for a decision other than `pass`. */
export function maintenanceResponse(decision: Exclude<MaintenanceDecision, { kind: 'pass' }>, config: MaintenanceConfig): Response {
  switch (decision.kind) {
    case 'grant': {
      const headers = new Headers({ Location: decision.location, 'Cache-Control': 'no-store' });
      headers.append(
        'Set-Cookie',
        `${BYPASS_COOKIE}=${bypassToken(config.bypassSecret!)}; Path=/; Max-Age=${BYPASS_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`,
      );
      return new Response(null, { status: 302, headers });
    }
    case 'api':
      return new Response(JSON.stringify({ error: 'maintenance' }), {
        status: 503,
        headers: { ...CLOSED_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
      });
    case 'page':
      return new Response(MAINTENANCE_PAGE, {
        status: 503,
        headers: { ...CLOSED_HEADERS, 'Content-Type': 'text/html; charset=utf-8' },
      });
  }
}

// Self-contained: only the site's own fonts, which stay reachable as static files.
// COPY-DRAFT
const MAINTENANCE_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#111111">
<title>Underclub — back soon</title>
<style>
@font-face{font-family:"Clash Display";src:url("/fonts/ClashDisplay-Variable.woff2") format("woff2");font-weight:200 700;font-display:swap}
@font-face{font-family:"Larabie";src:url("/fonts/larabiefont.woff2") format("woff2");font-weight:700;font-display:swap}
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{background:#111111;color:#baec17;font-family:"Clash Display",ui-sans-serif,system-ui,sans-serif;display:flex;flex-direction:column;justify-content:space-between;padding:max(1.5rem,env(safe-area-inset-top)) 1.25rem max(1.5rem,env(safe-area-inset-bottom))}
.logo{font-family:"Larabie",monospace;font-size:clamp(2rem,11vw,5rem);line-height:1;margin:0}
h1{font-size:clamp(3.5rem,22vw,11rem);font-weight:700;line-height:.88;margin:0;text-transform:uppercase}
p{font-size:clamp(1.05rem,4.5vw,1.5rem);font-weight:300;line-height:1.3;margin:1.25rem 0 0;max-width:30ch;opacity:.85}
a{color:inherit;text-underline-offset:.15em}
.foot{font-size:.95rem;font-weight:300;opacity:.7}
</style>
</head>
<body>
<p class="logo">UNDERCLUB</p>
<main>
<h1>Back<br>soon</h1>
<p>we're getting the new site ready. the next night opens here.</p>
</main>
<p class="foot">info@underclub.it</p>
</body>
</html>
`;
