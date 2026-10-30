import { describe, expect, it } from 'vitest';
import { declutter, groups } from '../src/scripts/declutter';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('marker declutter', () => {
  it('groups transitively by screen distance', () => {
    expect(groups([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 100, y: 0 }], 12).map((g) => g.length).sort()).toEqual([1, 3]);
  });

  it('spreads overlapping markers at least `min` apart and keeps lone ones in place', () => {
    const pts = [{ x: 0, y: 0 }, { x: 3, y: 1 }, { x: 1, y: 4 }, { x: 2, y: 2 }, { x: 200, y: 200 }];
    const out = declutter(pts, 24);
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) expect(dist(out[i]!, out[j]!)).toBeGreaterThanOrEqual(24 - 1e-9);
    expect(out[4]).toEqual(pts[4]);
    expect(out).toHaveLength(5);
  });

  it('handles identical positions', () => {
    const out = declutter([{ x: 5, y: 5 }, { x: 5, y: 5 }], 20);
    expect(dist(out[0]!, out[1]!)).toBeCloseTo(20, 6);
  });
});
