import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { refreshWeather } from '../src/cron';
import { app } from '../src/index';
import { bestWindows, type SpotHours } from '../src/lib/windows';
import type { ListEntryV2 } from '../src/precompute_v2';
import { omFetch, resetAndSeed, writeScoresV2 } from './helpers';

const e = (t: number | null, rank = 1, gated: 0 | 1 = 0): ListEntryV2 => [t, t === null ? null : t - 10, t === null ? null : t + 5, rank, gated, null, t === null ? null : ['lamba', 3, `neden ${t}`]];
const spot = (id: string, totals: (number | null)[], gatedAt: number[] = []): SpotHours => ({ id, name: id.toUpperCase(), start_hour: 100, list: totals.map((t, i) => e(t, 1, gatedAt.includes(i) ? 1 : 0)) });

describe('bestWindows', () => {
  it('finds runs above the threshold, peak values, gating breaks a run, per-spot cap', () => {
    const r = bestWindows([spot('a', [70, 80, 75, 50, 66, 90, 67]), spot('b', [70, 70, 90, 90, 40], [3])], 100, 7, { n: 10, perSpot: 2, threshold: 65 });
    expect(r.windows.map((w) => [w.spot_id, w.start - 100, w.end - 100, w.total])).toEqual([
      ['b', 0, 3, 90], ['a', 4, 7, 90], ['a', 0, 3, 80],
    ]);
    expect(r.windows[1]!.peak).toBe(105);
    expect(r.windows[1]!.reason).toBe('neden 90');
    expect(bestWindows([spot('a', [70, 80, 75, 50, 66, 90, 67])], 100, 7, { perSpot: 1, threshold: 65 }).windows).toHaveLength(1);
    expect(bestWindows([spot('a', [70, null, 70])], 100, 3, { threshold: 65, minLen: 2 }).windows).toHaveLength(0);
    const long = bestWindows([spot('a', Array(30).fill(70))], 100, 30, { threshold: 65, maxLen: 12, n: 9, perSpot: 9 }).windows;
    expect(long.map((w) => w.end - w.start)).toEqual([12, 12, 6]);
  });
  it('falls back to the 85th percentile when too few windows reach 65', () => {
    const r = bestWindows([spot('a', [40, 41, 42, 43, 60]), spot('b', [30, 31, 32, 33, 34])], 100, 5);
    expect(r.threshold).toBeLessThan(65);
    expect(r.windows[0]!.spot_id).toBe('a');
    expect(bestWindows([spot('a', [null, null])], 100, 2).windows).toEqual([]);
  });
});

describe('GET /api/windows and ?at=', () => {
  beforeAll(async () => {
    await resetAndSeed();
    const now = new Date();
    await refreshWeather(env, now, omFetch(now));
    await writeScoresV2(now);
  });
  it('returns ISO windows within 72 h', async () => {
    const b = await (await app.request('/api/windows', {}, env)).json<{ windows: { start: string; end: string; total: number; spot_id: string }[]; hours: number }>();
    expect(b.hours).toBe(72);
    expect(b.windows.length).toBeGreaterThan(0);
    for (const w of b.windows) expect(Date.parse(w.end)).toBeGreaterThan(Date.parse(w.start));
  });
  it('lists the requested hour, clamped to the next 72 h', async () => {
    const at = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000 + 5 * 3_600_000).toISOString();
    const b = await (await app.request(`/api/spots?at=${at}`, {}, env)).json<{ at: string; count: number }>();
    expect(b.at).toBe(at);
    const far = await (await app.request('/api/spots?at=2099-01-01T00:00:00Z', {}, env)).json<{ at: string }>();
    expect(Date.parse(far.at) - Date.now()).toBeLessThan(72 * 3_600_000);
  });
});
