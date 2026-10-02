import { describe, expect, it, vi } from 'vitest';
import {
  BYPASS_COOKIE,
  decideMaintenance,
  maintenanceResponse,
  readMaintenanceConfig,
  type MaintenanceConfig,
} from './maintenance.js';

const SECRET = 'a-long-enough-bypass-secret';
const ON: MaintenanceConfig = { on: true, bypassSecret: SECRET };
const site = (path: string) => new URL(path, 'https://underclub.it');

/** The cookie a valid `?bypass=` hands out. */
function grantedCookie(): string {
  const decision = decideMaintenance(site(`/?bypass=${SECRET}`), null, ON);
  if (decision.kind !== 'grant') throw new Error('expected a grant');
  const setCookie = maintenanceResponse(decision, ON).headers.get('set-cookie')!;
  return setCookie.split(';')[0]!;
}

describe('maintenance config', () => {
  it('reads the flag and ignores a short secret', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(readMaintenanceConfig({})).toEqual({ on: false, bypassSecret: null });
    expect(readMaintenanceConfig({ MAINTENANCE_MODE: '1', MAINTENANCE_BYPASS_SECRET: SECRET })).toEqual(ON);
    expect(readMaintenanceConfig({ MAINTENANCE_MODE: 'TRUE' }).on).toBe(true);
    expect(readMaintenanceConfig({ MAINTENANCE_MODE: '0' }).on).toBe(false);
    expect(readMaintenanceConfig({ MAINTENANCE_MODE: '1', MAINTENANCE_BYPASS_SECRET: 'short' })).toEqual({
      on: true,
      bypassSecret: null,
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('maintenance decision', () => {
  it('lets everything through when off', () => {
    const off = { on: false, bypassSecret: SECRET };
    expect(decideMaintenance(site('/'), null, off).kind).toBe('pass');
    expect(decideMaintenance(site('/api/reservations'), null, off).kind).toBe('pass');
  });

  it('closes pages and API routes when on', () => {
    expect(decideMaintenance(site('/'), null, ON).kind).toBe('page');
    expect(decideMaintenance(site('/account'), null, ON).kind).toBe('page');
    expect(decideMaintenance(site('/index.html'), null, ON).kind).toBe('page');
    expect(decideMaintenance(site('/api/reservations'), null, ON).kind).toBe('api');
    expect(decideMaintenance(site('/api/session'), null, ON).kind).toBe('api');
  });

  it('keeps the cron, ticket pages and static files open', () => {
    expect(decideMaintenance(site('/api/cron/cleanup'), null, ON).kind).toBe('pass');
    expect(decideMaintenance(site('/ticket/3f1c?t=abc'), null, ON).kind).toBe('pass');
    expect(decideMaintenance(site('/fonts/larabiefont.woff2'), null, ON).kind).toBe('pass');
    expect(decideMaintenance(site('/ticket/Card.glb'), null, ON).kind).toBe('pass');
  });

  it('grants the cookie on the right secret only, and drops it from the URL', () => {
    const decision = decideMaintenance(site(`/account?bypass=${SECRET}&src=flyer`), null, ON);
    expect(decision).toEqual({ kind: 'grant', location: '/account?src=flyer' });
    expect(decideMaintenance(site('/?bypass=wrong'), null, ON).kind).toBe('page');
    expect(decideMaintenance(site(`/?bypass=${SECRET}`), null, { on: true, bypassSecret: null }).kind).toBe('page');
  });

  it('lets the bypass cookie through, and only while the secret is the same', () => {
    const cookie = grantedCookie();
    expect(cookie.startsWith(`${BYPASS_COOKIE}=`)).toBe(true);
    expect(cookie).not.toContain(SECRET);
    expect(decideMaintenance(site('/'), `other=1; ${cookie}`, ON).kind).toBe('pass');
    expect(decideMaintenance(site('/api/reservations'), cookie, ON).kind).toBe('pass');
    expect(decideMaintenance(site('/'), `${BYPASS_COOKIE}=forged`, ON).kind).toBe('page');
    const rotated = { on: true, bypassSecret: 'another-long-bypass-secret' };
    expect(decideMaintenance(site('/'), cookie, rotated).kind).toBe('page');
  });
});

describe('maintenance responses', () => {
  it('answer 503, uncached and not indexed', async () => {
    const page = maintenanceResponse({ kind: 'page' }, ON);
    expect(page.status).toBe(503);
    expect(page.headers.get('cache-control')).toBe('no-store');
    expect(page.headers.get('x-robots-tag')).toBe('noindex');
    expect(page.headers.get('retry-after')).toBeTruthy();
    expect(await page.text()).toContain('<title>');

    const api = maintenanceResponse({ kind: 'api' }, ON);
    expect(api.status).toBe(503);
    expect(await api.json()).toEqual({ error: 'maintenance' });
  });

  it('grant redirects with an httpOnly cookie', () => {
    const res = maintenanceResponse({ kind: 'grant', location: '/' }, ON);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/');
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly; Secure; SameSite=Lax/);
  });
});
