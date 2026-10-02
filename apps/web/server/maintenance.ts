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

// Self-contained: the club's textmark inline, and the site's own font, which
// stays reachable as a static file.
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
*{box-sizing:border-box}
html,body{height:100%;margin:0}
body{background:#111111;color:#baec17;font-family:"Clash Display",ui-sans-serif,system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2.5rem;text-align:center;padding:max(1.5rem,env(safe-area-inset-top)) 1.25rem max(1.5rem,env(safe-area-inset-bottom))}
.logo{display:block;width:min(78vw,26rem);height:auto}
h1{font-size:clamp(3.5rem,20vw,9rem);font-weight:700;line-height:.88;margin:0;text-transform:uppercase}
p{font-size:clamp(1.05rem,4.5vw,1.5rem);font-weight:300;line-height:1.3;margin:1.25rem auto 0;max-width:30ch;opacity:.85}
.foot{margin:0;font-size:.95rem;opacity:.7}
</style>
</head>
<body>
<svg class="logo" viewBox="0 0 367.74 52.1" role="img" aria-label="Underclub" fill="currentColor"><path d="M315.74,0c.48,0,.96.05,1.43.14,2.22.43,3.99,1.21,4.05,3.71l.14,5.89c.19,1.79,1.37,3.05,3.14,3.34,3.41.55,6.74.33,10.17-.19,6.53-.99,13.03-.66,19.51.44,3.58.61,6.55,2.46,8.55,5.49,1.25,1.07,2.33,2.22,3.25,3.59,1.26,2.01,1.9,4.25,1.71,6.65-.13,1.66-.71,3.15-1.23,4.74-.35,1.09-.16,2.31,0,3.46.35,2.48-.29,4.91-2.2,6.58s-4.07,2.96-6.38,4.02c-3.2,1.46-6.55,1.81-10.03,1.33-2.88-.4-5.67-.19-8.54.08-8.57.81-12.36-1.74-16.28-1.65l-5.91.13c-1.47.03-2.9-.01-4.26-.54-1.76-.69-2.26-2.34-2.26-4.29V7.9s.03-4.08.03-4.08c0-1.21.63-2.34,1.66-2.97.61-.37,1.27-.56,1.95-.7C314.74.05,315.24,0,315.74,0h0ZM349.05,41.97c1.74.53,3.31.26,4.65-.84,3.64-2.99,2.76-7.14,1.07-11.22l-2.01-4.85c-.4-.95-1.14-1.69-2.16-1.9l-8.24-1.73c-1.89-.4-3.75-.63-5.67-.43l-8.07.84c-1.21.13-2.34.58-3.43,1.07-1.96.87-3.21,2.61-3.47,4.77-.3,2.45-.13,4.94.45,7.36s2.32,4.25,4.71,5.03c3.37,1.1,6.85,1.22,10.41.91,3.99-.35,7.88-.19,11.76,1Z"/><path d="M32.3,52.08h-.76c-1.68.02-3.35-.22-4.95-.7-.82-.25-1.64-.53-2.47-.79-4.42-1.41-8.86-2.31-13.43-3.1-1.71-.29-3.27-.7-4.79-1.47-2.62-1.33-4.19-3.48-4.95-6.13-.31-1.08-.45-2.2-.46-3.32,0,0,0-3.22-.44-15.57-.18-5.21.44-5.86.76-6.43,1.3-2.32,4.73-2.76,7.45-1.91,1.55.49,2.67,1.87,2.63,3.58-.08,3.13-.46,6.17-.97,9.26-.43,2.6-.45,5.09-.56,7.72-.12,2.78,1.12,5.24,3.72,6.42.95.43,1.97.07,2.57-.84.85-1.28,1.21-2.79,1.24-4.39.05-2.85-.06-5.63-.17-8.49-.07-1.83-.02-3.54.42-5.3,1.63-6.43,7.65-8.6,13.95-8.34,3.03.12,5.98.46,8.94,1.14,3.7.86,4.83,7.45,5.23,11.15.65,6.09,1.43,12.31.23,18.32-.77,3.85-3.47,6.39-6.79,7.86-2.01.89-4.19,1.32-6.38,1.33Z"/><path d="M293.5,52.1h-.7c-1.3,0-2.59-.15-3.85-.46-1.14-.28-2.25-.63-3.41-1-4.29-1.38-8.6-2.29-13.04-3.05-1.55-.27-2.96-.56-4.39-1.13-3.01-1.18-5.14-3.58-5.95-6.72-.49-1.91-.56-3.78-.56-5.79v-12.3s.03-5.14.03-5.14c.01-1.77,1.04-3.28,2.74-3.83s3.57-.55,5.25.03,2.7,2.08,2.51,3.82l-1.07,9.71c-.32,2.9-.56,5.73-.35,8.64.15,2.18,1.81,3.95,3.7,4.8,2.12.95,3.71-2.46,3.67-4.82l-.15-9.53c-.03-1.61.04-3.11.42-4.64,1.57-6.42,7.59-8.65,13.88-8.42,3.04.11,5.99.46,8.96,1.13,3.69.83,4.95,7.36,5.28,11.05l.8,8.78c.29,3.17.07,6.25-.49,9.37-.55,3.09-2.29,5.65-4.96,7.26-.35.21-.71.41-1.07.59-2.25,1.13-4.75,1.67-7.27,1.67Z"/><path d="M120.51,0c.6,0,1.2.07,1.78.22,1.79.46,3.69,1.4,3.69,3.08v8.41c0,4.4.64,8.65,2.08,12.8,2.51,7.23,1.16,13.54-1.15,20.59-.41,1.25-1.07,2.25-2.36,2.74-1.83.7-3.81,1.07-5.8.85l-4.02-.45c-2.23-.25-4.37-.21-6.58.16-6.48,1.09-12.51-.88-15.78-6.71-1.43-2.55-2.21-5.36-2.24-8.32l-.04-3.28c-.21-3.49.5-6.77,2.11-9.84,2.92-5.57,8.95-8.49,15.18-7.36,2.89.53,6.72.93,7.42-2.17.22-.97.09-1.99.08-3.01l-.02-3.28c-.01-2.18,1.2-3.42,2.96-4.05.75-.26,1.54-.38,2.33-.38h.36ZM111.89,37.79l.06-4.42.62-8.77c.12-1.68-.62-2.99-2.28-3.53-1.17-.38-2.52-.4-3.5.51-6.59,6.15.87,20.27,4.43,17.79.39-.27.66-.92.67-1.57Z"/><path d="M250.12.16c1,0,1.98.3,2.76.92.87.7,1.46,1.71,1.56,2.94l1.08,13.84.64,14.01c-.03,2.66.59,5.01,1.98,7.27.95,1.53,1.69,3.19,2.01,4.96.43,2.4-.65,4.49-2.9,5.49-2.44,1.08-5.25,1.42-7.96,1.08-1.89-.24-3.56-.95-5.23-1.77s-3.05-2.41-3.07-4.36l-.05-3.57.68-10.93.3-9.37,1.14-10.54.28-5.82c.08-1.69,1-2.97,2.41-3.68.6-.3,1.26-.44,1.93-.45l2.44-.02Z"/><path d="M67.01,30.09c.04-2.57-.19-6.93-1.3-8.83-.39-.67-1.19-1.03-1.91-.82-2.47.7-3.97,2.64-4.54,5.08-1.06,4.47-1.99,8.89-1.78,13.52.15,3.52,2.18,7.14-.8,7.86-1.11.27-2.23.33-3.4.03-2.22-.56-4.1-2.49-4.08-4.94l.19-25.74c.01-1.61.96-2.94,2.41-3.45.88-.31,1.98-.66,2.91-.49,2.5.44,4.86.68,7.4.39,2.03-.23,3.97-.51,5.97-.93,5.99-1.26,10.76.58,15.97,3.38,2.32,1.25,3.67,3.61,3.34,6.3s-.62,5.5-.43,8.34l.59,8.64c.22,3.29,1.05,7.44-1.56,8.54l-3.88,1.63c-1.99.84-4.04,1.27-6.19,1.23-6.7-.12-10.18-6.24-9.46-12.75.26-2.36.52-4.62.56-7Z"/><path d="M156.11,37.55c3.89-1.04,7.36-.12,10.08,2.68.67.69.64,1.69.02,2.42-3.55,4.17-9.63,6.18-15.07,5.89l-4.37-.23c-4.59-.61-8.56-3.03-11.25-6.79-2-2.8-3.39-5.88-4.13-9.26-1.29-5.91.21-11.26,3.77-16.06,1.83-2.47,4.38-4.28,7.46-4.89,4.19-.83,8.48-.65,12.57.54,5.29,1.54,9.53,5.11,11.83,10.1,1.15,2.49,1.89,5.09,2.08,7.81.11,1.67-.89,2.99-2.47,3.46s-3.44.65-5.22.42c-3.71-.48-7.25-.29-10.88.61-1.73.43-4.75,1.17-4.99,2.5-.05.27.16.93.43,1.04,2.2.92,4.47,1.1,6.8.65l3.35-.89ZM155.02,26.09c.51-.9.21-1.89-.74-2.31-1.61-.72-3.3-1.09-5.1-1.33-1.25.17-2.51.65-3.28,1.67-.87,1.15-.33,2.64.74,3.44,3.03,2.25,6.96,1.05,8.38-1.47Z"/><path d="M227.46,38.17c.92-.81,1.84-1.53,2.88-2.08,2.05-1.1,4.42-1.31,6.58-.51,1.41.52,2.14,1.94,1.67,3.44-1.8,5.74-7.41,9.04-13.33,9.44l-2.54-.04c-9.78-.14-18.19-6.32-20.04-16.03-1.51-7.97,1.33-15.92,9.22-18.8,2.58-.94,5.21-1.4,7.99-1.55,4.65-.25,9.11.81,13.12,3.13,2.75,1.6,4.79,4.09,5.66,7.13.37,1.28-.26,2.46-1.5,2.86-1.33.42-2.75.56-4.16.46-1.71-.12-3.08-.99-4.3-2.12l-1.62-1.51c-.96-.89-2.27-1.27-3.6-1.25-1.69.03-3.17,1.13-3.59,2.85-1.01,4.15-1.7,8.33-2.26,12.58-.2,1.52.65,2.63,1.92,3.17,2.71,1.17,5.6.81,7.89-1.19Z"/><path d="M182.79,46.4l-3.95-.49c-4.38-.54-9.41-5.16-8.48-9.73.64-3.13.93-6.19,1.33-9.37l1.12-9.04c.21-1.67.96-3.12,1.99-4.4,2.08-2.6,5.51-3.26,8.45-1.63,1.21.67,2.42,1.32,3.84,1.49,1.63.2,3.24-.39,4.48-1.46,2.61-2.28,5.72-3.97,8.66-1.84,2.21,1.6,3.11,4.03,2.75,6.73-.13,1.01-.51,1.85-1.71,1.99-4.25.5-6.13,3.58-7.75,7.34-1.85,4.31-2.86,8.81-3.31,13.5l-.54,4.11c-.18,1.4-1.33,2.38-2.73,2.62s-2.74.36-4.16.19Z"/></svg>
<main>
<h1>Back<br>soon</h1>
<p>we're getting the new site ready. the next night opens here.</p>
</main>
<p class="foot">info@underclub.it</p>
</body>
</html>
`;
