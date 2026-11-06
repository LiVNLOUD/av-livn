import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { refreshWeather } from '../src/cron';
import { app } from '../src/index';
import { bestWindows, plainReason, type SpotHours } from '../src/lib/windows';
import type { ListEntryV2 } from '../src/precompute_v2';
import { omFetch, resetAndSeed, writeScoresV2 } from './helpers';

const e = (t: number | null, rank = 1, gated: 0 | 1 = 0): ListEntryV2 => [t, t === null ? null : t - 10, t === null ? null : t + 5, rank, gated, null, t === null ? null : ['lamba', 3, `neden ${t}`]];
const spot = (id: string, totals: (number | null)[], gatedAt: number[] = []): SpotHours => ({ id, name: id.toUpperCase(), start_hour: 100, list: totals.map((t, i) => e(t, 1, gatedAt.includes(i) ? 1 : 0)) });

// start_hour 100 → local (UTC+3) day boundary at epoch hour 117 (117+3 = 120 = 5×24)
describe('bestWindows (E3)', () => {
  it('window around the peak: ≥ max(65, peak − 8), contiguous, at most 4 h, grows towards the better side', () => {
    const r = bestWindows([spot('a', [60, 70, 80, 88, 85, 79, 81, 70])], 100, 8, { n: 9 });
    expect(r.windows.map((w) => [w.start - 100, w.end - 100, w.total, w.peak - 100])).toEqual([[2, 5, 88, 3]]); // 79 at +5 breaks it; 81 at +6 is not contiguous
    // gating breaks the run
    const g = bestWindows([spot('b', [85, 90, 88], [2])], 100, 3);
    expect(g.windows.map((w) => [w.start - 100, w.end - 100])).toEqual([[0, 2]]);
  });
  it('one window per spot per local day; the list shows each spot once; sorted by peak then time', () => {
    const day = (v: number) => Array(24).fill(50).map((x, i) => (i === 10 ? v : x));
    const spots = [spot('a', [...day(90), ...day(95)]), spot('b', [...day(92), ...day(70)]), spot('c', day(92))];
    const all = bestWindows(spots, 100, 48, { n: 9, perSpot: 9, threshold: 65 }).windows;
    expect(all.map((w) => [w.spot_id, w.total])).toEqual([['a', 95], ['b', 92], ['c', 92], ['a', 90], ['b', 70]]);
    const top = bestWindows(spots, 100, 48).windows;
    expect(top.map((w) => w.spot_id)).toEqual(['a', 'b', 'c']);
    expect(new Set(top.slice(0, 5).map((w) => w.spot_id)).size).toBe(top.length);
  });
  it('plain reason and assumption badge; percentile fallback; no data', () => {
    const r = bestWindows([spot('a', [40, 41, 42, 43, 60]), spot('b', [30, 31, 32, 33, 34])], 100, 5);
    expect(r.threshold).toBeLessThan(65);
    expect(r.windows[0]!.spot_id).toBe('a');
    expect(bestWindows([spot('a', [null as unknown as number])], 100, 1).windows).toEqual([]);
    expect(plainReason('Öne çıkaran: lamba olasılığı 0,85 — varsayım (C), saha verisi yok')).toEqual({ why: 'Lamba olasılığı 0,85', assumed: true });
    expect(plainReason('Geri çeken: rüzgar 30 km/sa — Open-Meteo')).toEqual({ why: 'Zayıf yanı: rüzgar 30 km/sa', assumed: false });
    expect(plainReason(null)).toEqual({ why: null, assumed: false });
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

describe('GET /api/hours', () => {
  it('72 h grid per active spot with band width and gated hours; scored_at on the list', async () => {
    const b = await (await app.request('/api/hours', {}, env)).json<{ hours: number; scored_at: string; spots: { id: string; t: (number | null)[]; w: (number | null)[]; g: number[] }[] }>();
    expect(b.hours).toBe(72);
    expect(b.spots.length).toBeGreaterThan(0);
    for (const s of b.spots) {
      expect(s.t).toHaveLength(72);
      expect(s.w).toHaveLength(72);
      expect(s.t.some((x) => x !== null)).toBe(true);
    }
    expect(b.scored_at).toBeTruthy();
    const l = await (await app.request('/api/spots', {}, env)).json<{ scored_at: string }>();
    expect(l.scored_at).toBe(b.scored_at);
  });
});

describe('I2: strong vs relative, missing data, access', () => {
  const withMask = (id: string, totals: number[], mask: number, access: string | null = 'acik'): SpotHours => ({
    id, name: id, access, start_hour: 100,
    list: totals.map((t): ListEntryV2 => [t, t - 5, t + 5, 1, 0, null, null, mask]),
  });
  it('a window ≥ 65 with complete data is strong; a lowered floor gives relative windows', () => {
    const strong = bestWindows([withMask('a', [70, 80, 70], 0)], 100, 3);
    expect(strong.windows[0]).toMatchObject({ tier: 'guclu', data: 'tam', missing: null });
    expect(strong.strong).toBe(1);
    const weak = bestWindows([withMask('b', [40, 50, 45], 0), withMask('c', [30, 35, 30], 0)], 100, 3);
    expect(weak.threshold).toBeLessThan(65);
    expect(weak.strong).toBe(0);
    expect(weak.windows.every((w) => w.tier === 'goreli')).toBe(true);
  });
  it('missing current/turbidity caps a high window at relative; missing wind/wave drops the hours', () => {
    const cur = bestWindows([withMask('a', [90, 90], 4)], 100, 2).windows[0]!;
    expect(cur).toMatchObject({ tier: 'goreli', data: 'goreli', missing: 'eksik veri: akıntı' });
    expect(bestWindows([withMask('w', [95, 95], 1)], 100, 2, { threshold: 10 }).windows).toEqual([]);
  });
  it('openOnly keeps open-access spots only, and the body carries both lists', () => {
    const spots = [withMask('ferry', [95, 95], 0, 'kisitli_feribot'), withMask('open', [70, 70], 0)];
    expect(bestWindows(spots, 100, 2).windows[0]!.spot_id).toBe('ferry');
    expect(bestWindows(spots, 100, 2, { openOnly: true }).windows.map((w) => w.spot_id)).toEqual(['open']);
  });
});

describe('I9: today windows in the body', () => {
  it('covers now → 06:00 local tomorrow, for all and open-access spots', async () => {
    const { windowsBody } = await import('../src/lib/views');
    const from = 117 + 18; // 117 = local midnight (UTC+3) → 117 + 18 = 18:00 local
    const row = (id: string, access: string) => ({ id, name: id, access, start_hour: from, list_json: JSON.stringify(Array.from({ length: 30 }, (_, i): ListEntryV2 => [i === 3 ? 80 : 50, 40, 90, 1, 0, null, null, 0, 0.5])) });
    const b = windowsBody([row('a', 'acik'), row('f', 'kisitli_feribot')], from, 72);
    expect(b.today.hours).toBe(12);
    expect(b.today.all.windows.map((w) => w.spot_id).sort()).toEqual(['a', 'f']);
    expect(b.today.open.windows.map((w) => w.spot_id)).toEqual(['a']);
    expect(b.today.all.windows[0]).toMatchObject({ tier: 'guclu', top3: 0.5 });
  });
});

describe('L: plan candidates in the body', () => {
  it('drop private marinas and outside-Bursa spots even when they fill the overall top 5', async () => {
    const { windowsBody } = await import('../src/lib/views');
    const from = 117 + 18;
    const list = (v: number) => JSON.stringify(Array.from({ length: 80 }, (_, i): ListEntryV2 => [i % 24 === 3 ? v : 50, 40, 90, 1, 0, null, null, 0, 0.5]));
    const row = (id: string, v: number, province: string, private_marina = 0) => ({ id, name: id, access: 'acik', province, private_marina, start_hour: from, list_json: list(v) });
    const rows = [row('m1', 95, 'bursa', 1), row('m2', 94, 'bursa', 1), row('y1', 93, 'yalova'), row('y2', 92, 'yalova'), row('y3', 91, 'yalova'), row('b1', 80, 'bursa')];
    const b = windowsBody(rows, from, 72);
    expect(b.windows.map((w) => w.spot_id)).not.toContain('b1');
    expect(b.plan.bursa.all.windows.map((w) => w.spot_id)).toEqual(['b1']);
    expect(b.plan.bursa.today.all.windows.map((w) => w.spot_id)).toEqual(['b1']);
    expect(b.plan.wide.all.windows.map((w) => w.spot_id)).toEqual(['y1', 'y2', 'y3', 'b1']);
    expect(b.plan.wide.open.windows.every((w) => !w.spot_id.startsWith('m'))).toBe(true);
  });
});
