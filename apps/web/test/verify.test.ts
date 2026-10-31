import { describe, expect, it } from 'vitest';
import { byBin, meanCI, rankPairs, rows, wilson, type Session } from '../src/scripts/verify';

const s = (id: string, spot: string, start: string, cpue: number, total: number | null, rank: number | null, zero = 0): Session => ({
  id, spot_id: spot, start_at: start, zero_catch: zero, cpue, model: total === null ? null : { hours: [{ total, p10: total - 10, p90: total + 10, rank }, { total: total + 2, p10: 'x', rank }] },
});

describe('verify', () => {
  it('rows: session means of the frozen hours, local evening date, zero flag', () => {
    const r = rows([s('1', 'a', '2026-10-31T20:30:00Z', 2, 70, 1), s('2', 'b', '2026-10-31T21:30:00Z', 0, null, null, 1)]);
    expect(r[0]).toMatchObject({ total: 71, p10: 60, p90: 80, rank: 1, hours: 2, day: '2026-10-31', zero: false });
    expect(r[1]).toMatchObject({ total: null, day: '2026-11-01', zero: true, hours: 0 });
  });
  it('meanCI and wilson intervals', () => {
    expect(meanCI([])).toEqual({ n: 0, mean: null, lo: null, hi: null });
    expect(meanCI([3])).toMatchObject({ n: 1, mean: 3, lo: null });
    const c = meanCI([1, 2, 3]);
    expect(c.mean).toBe(2);
    expect(c.lo).toBe(0);
    expect(c.hi!).toBeCloseTo(2 + (4.3 * 1) / Math.sqrt(3), 5);
    expect(meanCI(Array.from({ length: 40 }, (_, i) => i % 2)).hi!).toBeCloseTo(0.5 + (1.96 * Math.sqrt(40 / 39 / 4)) / Math.sqrt(40), 4);
    expect(wilson(0, 0).p).toBeNull();
    const w = wilson(0, 5);
    expect(w.p).toBe(0);
    expect(w.lo).toBe(0);
    expect(w.hi!).toBeCloseTo(0.4345, 3);
  });
  it('bins by mean score', () => {
    const r = rows([s('1', 'a', '2026-10-31T18:00:00Z', 1, 30, 3), s('2', 'a', '2026-11-01T18:00:00Z', 3, 70, 1), s('3', 'a', '2026-11-02T18:00:00Z', 0, 70, 1, 1), s('4', 'a', 'x', 0, null, null)]);
    const b = byBin(r);
    expect(b.map((x) => [x.lo, x.hi, x.cpue.n])).toEqual([[0, 40, 1], [40, 65, 0], [65, 80, 2], [80, 100, 0]]);
    expect(b[2]!.zero.p).toBe(0.5);
  });
  it('rank pairs on the same evening only', () => {
    const r = rows([
      s('1', 'a', '2026-10-31T17:00:00Z', 4, 80, 1), s('2', 'b', '2026-10-31T18:00:00Z', 1, 60, 5),
      s('3', 'c', '2026-10-31T18:30:00Z', 6, 50, 9), s('4', 'a', '2026-11-05T18:00:00Z', 1, 50, 2),
      s('5', 'd', '2026-10-31T19:00:00Z', 4, 50, 1), s('6', 'e', '2026-10-31T19:00:00Z', 4, null, null),
    ]);
    const p = rankPairs(r);
    // a(1)>b(5) hit, a(1) vs c(9) miss, b(5) vs c(9) miss, d(1)… rank tie with a skipped; d vs b hit, d vs c miss
    expect(p.pairs.length).toBe(5);
    expect(p.acc.p).toBeCloseTo(2 / 5, 5);
  });
});
