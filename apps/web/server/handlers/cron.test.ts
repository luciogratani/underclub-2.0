import { describe, expect, it, vi } from 'vitest';
import { handleCronCleanup, safeEqual } from './cronCleanup.js';
import { CRON_SECRET, jsonOf, makeDeps, req } from '../test-helpers.js';

const counts = { activation_tokens: 4, contact_sessions: 1, request_throttle: 12, reservations: 2, contacts: 1 };

function get(authorization?: string): Request {
  return req('/api/cron/cleanup', undefined, { method: 'GET', headers: authorization ? { authorization } : {} });
}

describe('GET /api/cron/cleanup', () => {
  it.each([
    ['missing', undefined],
    ['wrong', 'Bearer not-the-secret'],
    ['without Bearer', CRON_SECRET],
    ['with a suffix', `Bearer ${CRON_SECRET}x`],
  ])('%s token → 401 and no cleanup', async (_label, authorization) => {
    const { deps, rpc } = makeDeps({ cleanup: async () => counts });
    const res = await handleCronCleanup(get(authorization), deps);
    expect(res.status).toBe(401);
    expect(await jsonOf(res)).toEqual({ error: 'unauthorized' });
    expect(rpc.calls).toHaveLength(0);
  });

  it('right token → runs ep_cleanup, returns and logs only the counts', async () => {
    const { deps, rpc } = makeDeps({ cleanup: async () => counts });
    const spy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const res = await handleCronCleanup(get(`Bearer ${CRON_SECRET}`), deps);
    const logged = spy.mock.calls.flat().join(' ');
    spy.mockRestore();
    expect(res.status).toBe(200);
    expect(await jsonOf(res)).toEqual(counts);
    expect(rpc.calls).toEqual([{ fn: 'cleanup', args: [] }]);
    expect(logged).toContain('"request_throttle":12');
    expect(logged).not.toContain(CRON_SECRET);
  });

  it('POST is not allowed', async () => {
    const { deps } = makeDeps();
    expect((await handleCronCleanup(req('/api/cron/cleanup', {}), deps)).status).toBe(405);
  });

  it('safeEqual compares exactly, whatever the lengths', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});
