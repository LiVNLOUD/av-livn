import { describe, expect, it } from 'vitest';
import { badgeLabel, badgeSize, declutter, groups, mergeBadges, placeBadges, settlementKey, type PlaceBadge } from '../src/scripts/declutter';

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

describe('N4: overlapping settlement badges merge', () => {
  // 1 px per 0.001° (planar test projection)
  const px = (lon: number, lat: number) => ({ x: lon * 1000, y: -lat * 1000 });
  const b = (place: string, count: number, lon: number, lat: number, best: number | null = 50): PlaceBadge => ({ place, ids: Array.from({ length: count }, (_, k) => `${place}-${k}`), count, best, lon, lat });
  it('three stacked badges become one named after the largest; distant ones stay; counts and ids kept', () => {
    const input = [b('Mudanya', 6, 28.88, 40.375, 70), b('Ömerbey', 3, 28.9, 40.38, null), b('Hasanbey', 2, 28.92, 40.37, 80), b('Armutlu', 26, 28.83, 40.52, 60)];
    const out = mergeBadges(input, px);
    expect(out).toHaveLength(2);
    const m = out.find((x) => x.place === 'Mudanya')!;
    expect(m.places).toEqual(['Mudanya', 'Ömerbey', 'Hasanbey']);
    expect([m.count, m.best, m.ids.length]).toEqual([11, 80, 11]);
    expect(m.lon).toBeCloseTo((28.88 * 6 + 28.9 * 3 + 28.92 * 2) / 11, 6);
    expect(badgeLabel(m)).toBe('Mudanya çevresi · 11 mera');
    expect(badgeLabel(out.find((x) => x.place === 'Armutlu')!)).toBe('Armutlu · 26 mera');
    expect(out.reduce((a, x) => a + x.count, 0)).toBe(input.reduce((a, x) => a + x.count, 0));
    // no two remaining badges overlap
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      const [p, q] = [px(out[i]!.lon, out[i]!.lat), px(out[j]!.lon, out[j]!.lat)];
      const [[wa, ha], [wb, hb]] = [badgeSize(out[i]!), badgeSize(out[j]!)];
      expect(Math.abs(p.x - q.x) >= (wa + wb) / 2 || Math.abs(p.y - q.y) >= (ha + hb) / 2).toBe(true);
    }
  });
  it('nothing overlapping → unchanged; best stays null when no scores', () => {
    const far = [b('A', 2, 0, 0), b('B', 2, 1, 1)];
    expect(mergeBadges(far, px).map((x) => [x.place, x.count])).toEqual([['A', 2], ['B', 2]]);
    expect(mergeBadges([b('A', 2, 0, 0, null), b('B', 3, 0.001, 0, null)], px)[0]!.best).toBeNull();
    expect(mergeBadges([b('A', 2, 0, 0, 40), b('B', 3, 0.001, 0, null)], px)[0]!.best).toBe(40);
  });
});
