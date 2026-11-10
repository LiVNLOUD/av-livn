import { describe, expect, it, vi } from 'vitest';
import { createHourStore, latest, STALE, HOUR_MS } from '../src/scripts/hour';

const NOW = Date.UTC(2026, 10, 10, 16, 20); // 16:20Z → hour 16:00Z
const fakeUrl = (search = '') => {
  const u = { search, replace: vi.fn((s: string) => { u.search = s; }) };
  return u;
};

describe('hour store', () => {
  it('starts at now, clamps, and gives the ISO hour (null = now)', () => {
    const h = createHourStore({ nowMs: NOW });
    expect(h.get()).toMatchObject({ col: 0, iso: null, source: 'init' });
    expect(h.set(3, 'timeline').iso).toBe('2026-11-10T19:00:00.000Z');
    expect(h.set(-5, 'now').col).toBe(0);
    expect(h.set(500, 'slider').col).toBe(71);
  });
  it('notifies subscribers once per change, in order, and not for the same hour', () => {
    const h = createHourStore({ nowMs: NOW });
    const seen: string[] = [];
    h.subscribe((s) => seen.push(`a${s.col}:${s.source}`));
    const off = h.subscribe((s) => seen.push(`b${s.col}`));
    h.set(2, 'timeline');
    h.set(2, 'map');
    off();
    h.set(4, 'slider');
    expect(seen).toEqual(['a2:timeline', 'b2', 'a4:slider']);
  });
  it('reads ?t= on creation and writes it back; now removes it and keeps other params', () => {
    const u = fakeUrl('?tur=levrek&t=2026-11-10T20:00:00.000Z');
    const h = createHourStore({ nowMs: NOW, url: u });
    expect(h.get()).toMatchObject({ col: 4, source: 'url' });
    h.setIso('2026-11-11T01:30:00Z', 'slider');
    expect(h.get().col).toBe(9);
    expect(u.search).toBe('?tur=levrek&t=2026-11-11T01%3A00%3A00.000Z');
    h.set(0, 'now');
    expect(u.search).toBe('?tur=levrek');
  });
  it('ignores a bad ?t=', () => {
    expect(createHourStore({ nowMs: NOW, url: fakeUrl('?t=yarin') }).get().col).toBe(0);
    expect(createHourStore({ nowMs: NOW, url: fakeUrl(`?t=${new Date(NOW - 5 * HOUR_MS).toISOString()}`) }).get().col).toBe(0);
  });
});

describe('latest()', () => {
  const later = <T>(v: T, ms: number) => new Promise<T>((r) => setTimeout(() => r(v), ms));
  it('five quick changes: only the last answer is applied, even when an older one arrives last', async () => {
    const l = latest();
    const applied: number[] = [];
    const delays = [50, 10, 40, 5, 20]; // the first request is the slowest
    await Promise.all(delays.map(async (d, i) => {
      const v = await l.run(() => later(i, d));
      if (v !== STALE) applied.push(v);
    }));
    expect(applied).toEqual([4]);
  });
  it('token(): a check function that turns false once a newer run starts', () => {
    const l = latest();
    const ok = l.token();
    expect(ok()).toBe(true);
    l.token();
    expect(ok()).toBe(false);
  });
});
