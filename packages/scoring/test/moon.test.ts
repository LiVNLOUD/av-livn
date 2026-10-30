import { describe, expect, it } from 'vitest';
import { ay_evresi, moonValue } from '../src/components/moon';
import { ISTAVRIT, MUDANYA } from './helpers';

describe('moonValue: illumination × moon above horizon', () => {
  it.each([
    [0, true, 1],
    [0, false, 1],
    [0.5, true, 0.5],
    [0.5, false, 0.8],
    [1, true, 0],
    [1, false, 0.6],
  ])('fraction %f, up=%s → %f', (f, up, expected) => {
    expect(moonValue(f, up)).toBeCloseTo(expected, 6);
  });
});

describe('ay_evresi component', () => {
  it('is dark around the 2026-11-09 new moon and bright around the 2026-11-24 full moon', () => {
    const at = (iso: string) => ({ series: { at: new Date(iso), now: undefined, offset: () => undefined }, spot: MUDANYA, profile: ISTAVRIT });
    const dark = ay_evresi(at('2026-11-09T19:00:00Z'));
    const full = ay_evresi(at('2026-11-24T21:00:00Z'));
    expect(dark.value!).toBeGreaterThan(0.95);
    expect(full.value!).toBeLessThan(0.1);
    expect(full.reason).toContain('ufkun üstünde');
    const fullBelow = ay_evresi(at('2026-11-24T10:00:00Z'));
    expect(fullBelow.reason).toContain('ufkun altında');
    expect(fullBelow.value!).toBeGreaterThan(0.55);
  });
});
