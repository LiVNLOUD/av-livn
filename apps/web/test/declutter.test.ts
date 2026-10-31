import { describe, expect, it } from 'vitest';
import { declutter, groups, placeBadges, settlementKey } from '../src/scripts/declutter';

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

describe('G5 settlement badges and limited spreading', () => {
  it('groups by settlement, keeps singletons and spots without a place single', () => {
    const r = placeBadges([
      { id: 'a', place: 'Armutlu', lon: 28.8, lat: 40.5, total: 52 },
      { id: 'b', place: 'Armutlu', lon: 28.9, lat: 40.6, total: 80 },
      { id: 'c', place: 'Armutlu', lon: 28.7, lat: 40.4, total: null },
      { id: 'd', place: 'Kumla', lon: 29, lat: 40.4, total: 60 },
      { id: 'e', place: null, lon: 29, lat: 40.3, total: 61 },
    ]);
    expect(r.badges).toHaveLength(1);
    expect(r.badges[0]).toMatchObject({ place: 'Armutlu', count: 3, best: 80, ids: ['a', 'b', 'c'] });
    expect(r.badges[0]!.lon).toBeCloseTo(28.8);
    expect(r.single.sort()).toEqual(['d', 'e']);
    expect(placeBadges([{ id: 'x', place: 'P', lon: 0, lat: 0, total: null }, { id: 'y', place: 'P', lon: 0, lat: 0, total: null }]).badges[0]!.best).toBeNull();
  });
  it('neighbouring quarters share one badge', () => {
    expect(settlementKey('Güzelyalı Siteler')).toBe('Güzelyalı');
    expect(settlementKey('Ömerbey Mah.')).toBe('Ömerbey');
    const r = placeBadges([
      { id: 'a', place: 'Güzelyalı Siteler', lon: 0, lat: 0, total: 1 },
      { id: 'b', place: 'Güzelyalı Burgaz', lon: 0, lat: 0, total: 2 },
    ]);
    expect(r.badges.map((b) => [b.place, b.count])).toEqual([['Güzelyalı', 2]]);
  });
  it('declutter leaves groups above maxGroup in place', () => {
    const pts = Array.from({ length: 10 }, (_, i) => ({ x: 100 + i, y: 100 }));
    expect(declutter(pts, 24, 8)).toEqual(pts);
    const small = pts.slice(0, 3);
    expect(declutter(small, 24, 8)).not.toEqual(small);
  });
});
