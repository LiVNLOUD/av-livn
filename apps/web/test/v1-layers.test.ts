// V1.8 / D1: weather layers checked with controlled grids (fixtures), not with live pixels.
import { describe, expect, it } from 'vitest';
import { fieldPixels, frameStats, MISSING_RGBA, RAMPS, rampColor, valueAt, type Grid } from '../src/scripts/layers';

/** 3 × 4 lattice, 3 hours; every variable filled with `fill` unless overridden. */
function grid(vars: Partial<Record<string, (number | null)[][]>>, fill = 0): Grid {
  const n = 12, hours = 3;
  const base = () => Array.from({ length: hours }, () => Array(n).fill(fill));
  return { from_hour: 1000, hours, lat0: 40, lon0: 28, dlat: 0.1, dlon: 0.1, nlat: 3, nlon: 4, source: 'fixture', vars: { ws: base(), wd: base(), pr: base(), cc: base(), wh: base(), sst: base(), ...vars } as Grid['vars'] };
}
const px = (a: Uint8ClampedArray, row: number, col: number) => Array.from(a.slice((row * 4 + col) * 4, (row * 4 + col) * 4 + 4));

describe('V1.8 weather layers on fixtures (D1)', () => {
  it('a known rain cell lands on its pixel (north row first); zero rain is transparent', () => {
    const pr = Array.from({ length: 3 }, () => Array(12).fill(0));
    pr[1]![1 * 4 + 2] = 30; // 3 mm/h at lattice row 1 (middle), column 2
    const a = fieldPixels(grid({ pr }), 1, 'yagis');
    const lit = [...Array(12).keys()].filter((p) => a[p * 4 + 3]! > 0);
    expect(lit).toEqual([1 * 4 + 2]); // image row 1 = lattice row 1 (3 rows, flipped: 2 − 1 = 1)
    expect(px(a, 1, 2)[3]).toBe(Math.round(rampColor(RAMPS.yagis.stops, 3)[3] * 255));
    const zero = fieldPixels(grid({}), 0, 'yagis');
    expect(zero.every((v, i) => i % 4 !== 3 || v === 0)).toBe(true);
    expect(frameStats(grid({}), 0, 'yagis')).toEqual({ n: 12, max: 0 });
  });
  it('missing data has its own colour (not zero, not a ramp colour); a cell with no data in any hour stays transparent', () => {
    const pr = Array.from({ length: 3 }, () => Array(12).fill(0));
    pr[2]![5] = null; // missing at hour 2 only
    for (const f of pr) f[11] = null; // never any data (outside the source)
    const a = fieldPixels(grid({ pr }), 2, 'yagis');
    expect(px(a, 2 - 1, 1)).toEqual(MISSING_RGBA); // lattice p=5 → row 1, col 1 → image row 1
    expect(px(a, 0, 3)[3]).toBe(0); // lattice p=11 → row 2, col 3 → image row 0
  });
  it('same data → same image; different data → change only where the data changed', () => {
    const g1 = grid({}), g2 = grid({});
    expect(Array.from(fieldPixels(g1, 0, 'ruzgar'))).toEqual(Array.from(fieldPixels(g2, 0, 'ruzgar')));
    const ws = Array.from({ length: 3 }, () => Array(12).fill(5));
    ws[0]![0] = 30;
    const a = fieldPixels(grid({ ws }), 0, 'ruzgar'), b = fieldPixels(grid({ ws: Array.from({ length: 3 }, () => Array(12).fill(5)) }), 0, 'ruzgar');
    const changed = [...Array(12).keys()].filter((p) => [0, 1, 2, 3].some((c) => a[p * 4 + c] !== b[p * 4 + c]));
    expect(changed).toEqual([2 * 4 + 0]); // lattice p=0 → image row 2, col 0
  });
  it('visibility threshold: calm wind (5 km/h) is drawn at alpha ≥ 0.4 on the fixed 0–65 km/h scale (D2)', () => {
    expect(rampColor(RAMPS.ruzgar.stops, 5)[3]).toBeGreaterThanOrEqual(0.4);
    expect(rampColor(RAMPS.ruzgar.stops, 0)[3]).toBeGreaterThanOrEqual(0.4);
    const a = fieldPixels(grid({ ws: Array.from({ length: 3 }, () => Array(12).fill(5)) }), 0, 'ruzgar');
    expect(Math.min(...[...Array(12).keys()].map((p) => a[p * 4 + 3]!))).toBeGreaterThanOrEqual(Math.round(0.4 * 255));
    // the scale is fixed: the same value gives the same colour whatever the rest of the frame holds
    const b = fieldPixels(grid({ ws: Array.from({ length: 3 }, (_, f) => Array(12).fill(f === 0 ? 5 : 60)) }), 0, 'ruzgar');
    expect(Array.from(a)).toEqual(Array.from(b));
  });
  it('tap read-out: nearest cell; outside the lattice → null', () => {
    const ws = Array.from({ length: 3 }, () => Array(12).fill(5));
    ws[1]![1 * 4 + 3] = 22;
    expect(valueAt(grid({ ws }), 1, 'ruzgar', 28.31, 40.09)).toBe(22);
    expect(valueAt(grid({ ws }), 1, 'ruzgar', 27, 40)).toBeNull();
  });
});
