import { getTimes } from 'suncalc';
import { describe, expect, it } from 'vitest';
import { gece_carpani, nightPhase, nightValue } from '../src/multipliers/night';
import { DEFAULT_NIGHT, nightOf } from '../src/params';
import { scoreAt } from '../src/engine';
import { TZ_OFFSET_MIN } from '../src/util';
import type { HourlyPoint } from '../src/types';
import { hours, ISTAVRIT, MUDANYA } from './helpers';

const DAY = new Date('2026-11-05T09:00:00Z');
const { sunrise, sunset } = getTimes(DAY, MUDANYA.lat, MUDANYA.lon, 0, TZ_OFFSET_MIN) as { sunrise: Date; sunset: Date };
const at = (base: Date, min: number) => new Date(base.getTime() + min * 60_000);

describe('nightPhase boundaries', () => {
  it.each([
    ['sunset −31 min', at(sunset, -31), 'day'],
    ['sunset −30 min', at(sunset, -30), 'twilight'],
    ['sunset', sunset, 'twilight'],
    ['sunset +44 min', at(sunset, 44), 'twilight'],
    ['sunset +45 min', at(sunset, 45), 'full'],
    ['23:59 local', new Date('2026-11-05T20:59:00Z'), 'full'],
    ['sunrise −61 min', at(sunrise, -61), 'full'],
    ['sunrise −60 min', at(sunrise, -60), 'twilight'],
    ['sunrise +14 min', at(sunrise, 14), 'twilight'],
    ['sunrise +15 min', at(sunrise, 15), 'day'],
    ['noon', new Date('2026-11-05T10:00:00Z'), 'day'],
  ])('%s → %s', (_l, t, phase) => {
    expect(nightPhase(t, sunrise, sunset, DEFAULT_NIGHT)).toBe(phase);
  });
});

describe('nightValue: lamp vs no lamp', () => {
  it.each([
    ['full', true, 1],
    ['full', false, 0.75],
    ['full', null, 0.75],
    ['twilight', true, 0.7],
    ['twilight', false, 0.525],
    ['day', true, 0.25],
    ['day', false, 0.25],
    ['day', null, 0.25],
  ] as const)('%s, has_light=%s → ×%f', (phase, light, v) => {
    expect(nightValue(phase, light, DEFAULT_NIGHT)).toBeCloseTo(v, 9);
  });

  it('explains phase and lamp state', () => {
    expect(gece_carpani(at(sunset, 120), { ...MUDANYA, hasLight: true }, ISTAVRIT)).toMatchObject({ value: 1, phase: 'full', reason: 'tam gece; lamba var' });
    expect(gece_carpani(at(sunset, 120), { ...MUDANYA, hasLight: false }, ISTAVRIT).reason).toBe('tam gece; lamba yok');
    expect(gece_carpani(at(sunset, 120), { ...MUDANYA, hasLight: null }, ISTAVRIT).reason).toContain('lambasız sayıldı');
    expect(gece_carpani(new Date('2026-11-05T10:00:00Z'), MUDANYA, ISTAVRIT)).toMatchObject({ value: 0.25, reason: 'gündüz' });
  });

  it('uses defaults when a profile has no night_multiplier', () => {
    expect(nightOf({ ...ISTAVRIT, night_multiplier: undefined })).toEqual(DEFAULT_NIGHT);
  });
});

describe('multiplier in the total', () => {
  const perfect = (_b: number): Partial<HourlyPoint> => ({ pressure: 1015, windSpeed: 5, windDir: 180, windGust: 10, waveH: 0.1, sst: 17, curVel: 0.1 });

  it('daytime stays below 30 even in perfect conditions', () => {
    const noon = new Date('2026-11-05T10:00:00Z');
    const r = scoreAt({ spot: MUDANYA, at: noon, profile: ISTAVRIT, points: hours(noon, 80, perfect) });
    expect(r.raw!).toBeGreaterThan(90);
    expect(r.total!).toBeLessThan(30);
    expect(r.total).toBeCloseTo(r.raw! * 0.25, 0);
    expect(r.multipliers[0]).toMatchObject({ key: 'gece_carpani', value: 0.25, phase: 'day' });
  });

  it('full night with lamp keeps the raw score; without lamp ×0.75', () => {
    const night = at(sunset, 180);
    const pts = hours(night, 80, perfect);
    const lit = scoreAt({ spot: MUDANYA, at: night, profile: ISTAVRIT, points: pts });
    const dark = scoreAt({ spot: { ...MUDANYA, hasLight: false }, at: night, profile: ISTAVRIT, points: pts });
    expect(lit.total).toBe(lit.raw);
    expect(dark.total).toBeCloseTo(dark.raw! * 0.75, 0);
  });

  it('night + safety gate: multiplier first, then the 30 cap', () => {
    const night = at(sunset, 180);
    const stormy = hours(night, 80, (b) => ({ ...perfect(b), windGust: 50 }));
    const r = scoreAt({ spot: MUDANYA, at: night, profile: ISTAVRIT, points: stormy });
    expect(r.gated).toBe(true);
    expect(r.total).toBe(30);
    const day = scoreAt({ spot: MUDANYA, at: new Date('2026-11-05T10:00:00Z'), profile: ISTAVRIT, points: hours(new Date('2026-11-05T10:00:00Z'), 80, (b) => ({ ...perfect(b), windGust: 50 })) });
    expect(day.gated).toBe(true);
    expect(day.total!).toBeLessThan(30);
  });
});
