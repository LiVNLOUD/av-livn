import { getMoonIllumination, getTimes } from 'suncalc';
import { describe, expect, it } from 'vitest';
import { moonState, sunTimes } from '../src/astro';
import { TZ_OFFSET_MIN } from '../src/util';

describe('memoised astronomy', () => {
  it('matches suncalc for the local civil day', () => {
    const at = new Date('2026-11-05T21:30:00Z'); // 00:30 local on 6 Nov
    const t = getTimes(at, 40.4, 28.9, 0, TZ_OFFSET_MIN);
    expect(sunTimes(at, 40.4, 28.9)).toEqual({ sunrise: t.sunrise, sunset: t.sunset });
    expect(moonState(at, 40.4, 28.9).fraction).toBeCloseTo(getMoonIllumination(new Date('2026-11-05T21:00:00Z')).fraction, 9);
  });

  it('keeps working after the cache is full and cleared', () => {
    const base = Date.UTC(2026, 0, 1);
    for (let h = 0; h < 4200; h++) moonState(new Date(base + h * 3_600_000), 40.4, 28.9);
    expect(moonState(new Date(base), 40.4, 28.9).fraction).toBeCloseTo(getMoonIllumination(new Date(base)).fraction, 9);
  });
});
