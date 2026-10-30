import { getTimes } from 'suncalc';
import { describe, expect, it } from 'vitest';
import { gece_isik_penceresi, lightFactor, nightWindowValue } from '../src/components/nightLight';
import { TZ_OFFSET_MIN } from '../src/util';
import { ISTAVRIT, MUDANYA } from './helpers';

const day = new Date('2026-11-05T09:00:00Z');
const { sunrise, sunset } = getTimes(day, MUDANYA.lat, MUDANYA.lon, 0, TZ_OFFSET_MIN) as { sunrise: Date; sunset: Date };
const plus = (d: Date, min: number) => new Date(d.getTime() + min * 60_000);
// Local midnight at the end of 2026-11-05 is 21:00Z.
const midnight = new Date('2026-11-05T21:00:00Z');

describe('nightWindowValue boundaries (sunset+1h → 00:00)', () => {
  it.each([
    ['before sunrise (00:30 local)', new Date('2026-11-04T21:30:00Z'), 0.5],
    ['at sunrise', sunrise, 0.1],
    ['noon', new Date('2026-11-05T09:00:00Z'), 0.1],
    ['1 min before sunset', plus(sunset, -1), 0.1],
    ['at sunset', sunset, 0],
    ['sunset + 30 min', plus(sunset, 30), 0.5],
    ['sunset + 1 h', plus(sunset, 60), 1],
    ['23:59 local', plus(midnight, -1), 1],
  ])('%s', (_label, at, expected) => {
    // Times before 2026-11-05 sunrise must use that day's sunrise; the first case belongs to 2026-11-05 local.
    const t = getTimes(at, MUDANYA.lat, MUDANYA.lon, 0, TZ_OFFSET_MIN) as { sunrise: Date; sunset: Date };
    expect(nightWindowValue(at, t.sunrise, t.sunset).value).toBeCloseTo(expected, 6);
  });

  it('00:00 local starts the after-midnight phase', () => {
    const t = getTimes(midnight, MUDANYA.lat, MUDANYA.lon, 0, TZ_OFFSET_MIN) as { sunrise: Date; sunset: Date };
    expect(nightWindowValue(midnight, t.sunrise, t.sunset)).toEqual({ value: 0.5, phase: 'gece yarısından sonra' });
  });
});

describe('lamp factor', () => {
  it.each([
    [true, 1],
    [null, 0.75],
    [false, 0.5],
  ])('has_light=%s → %f', (h, f) => expect(lightFactor(h)).toBe(f));

  it('multiplies the window value and explains the lamp state', () => {
    const ctx = (hasLight: boolean | null) => ({
      series: { at: plus(sunset, 120), now: undefined, offset: () => undefined },
      spot: { ...MUDANYA, hasLight },
      profile: ISTAVRIT,
    });
    expect(gece_isik_penceresi(ctx(true))).toEqual({ value: 1, reason: 'ışık penceresi; lamba var' });
    expect(gece_isik_penceresi(ctx(false)).reason).toContain('lamba yok');
    expect(gece_isik_penceresi(ctx(null)).value).toBe(0.75);
    expect(gece_isik_penceresi(ctx(null)).reason).toContain('bilinmiyor');
  });
});
