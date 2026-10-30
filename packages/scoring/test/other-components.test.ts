import { describe, expect, it } from 'vitest';
import { akinti, currentValue } from '../src/components/current';
import { basinc_trendi_3_6s, pressureValue } from '../src/components/pressure';
import { mevsim_katsayisi } from '../src/components/season';
import { su_sicakligi_ve_3g_trend, sstLevel, sstTrend } from '../src/components/sst';
import type { HourlyPoint, SeriesView } from '../src/types';
import { ISTAVRIT, MUDANYA } from './helpers';

function ctx(now: Partial<HourlyPoint> | undefined, past: Record<number, Partial<HourlyPoint>> = {}, at = '2026-11-01T18:00:00Z') {
  const series: SeriesView = {
    at: new Date(at),
    now: now && { ts: at, ...now },
    offset: (h) => (past[h] ? { ts: 'x', ...past[h] } : undefined),
  };
  return { series, spot: MUDANYA, profile: ISTAVRIT };
}

describe('pressure tendency', () => {
  it.each([
    [0, 1],
    [0.3, 1],
    [0.9, 0.5],
    [1.5, 0],
    [3, 0],
    [-0.5, 1],
    [-1.25, 0.65],
    [-2, 0.3],
    [-5, 0.3],
  ])('%f hPa/h → %f', (rate, expected) => expect(pressureValue(rate)).toBeCloseTo(expected, 6));

  it('averages 3 h and 6 h rates and labels the trend', () => {
    expect(basinc_trendi_3_6s(ctx({ pressure: 1010 }, { [-3]: { pressure: 1010 }, [-6]: { pressure: 1010 } })).reason).toContain('stabil');
    expect(basinc_trendi_3_6s(ctx({ pressure: 1010 }, { [-3]: { pressure: 1011 } })).reason).toContain('yavaş düşüyor');
    expect(basinc_trendi_3_6s(ctx({ pressure: 1004 }, { [-6]: { pressure: 1010 } })).reason).toContain('hızlı düşüyor');
    const rising = basinc_trendi_3_6s(ctx({ pressure: 1015 }, { [-3]: { pressure: 1012 }, [-6]: { pressure: 1009 } }));
    expect(rising.value).toBeCloseTo(pressureValue(1), 6);
    expect(rising.reason).toContain('yükseliyor');
  });

  it('is null without current pressure or history', () => {
    expect(basinc_trendi_3_6s(ctx({})).value).toBeNull();
    expect(basinc_trendi_3_6s(ctx({ pressure: 1010 })).reason).toBe('basınç geçmişi yok');
  });
});

describe('sea surface temperature level + 3-day trend', () => {
  it.each([
    [10, 0],
    [12, 0.5],
    [14, 1],
    [17, 1],
    [20, 1],
    [22, 0.5],
    [24, 0],
  ])('level %f °C → %f', (t, expected) => expect(sstLevel(t, [14, 20])).toBeCloseTo(expected, 6));

  it.each([
    [0, 1],
    [0.5, 1],
    [-1.25, 0.5],
    [2, 0],
    [-3, 0],
  ])('trend Δ%f °C → %f', (d, expected) => expect(sstTrend(d)).toBeCloseTo(expected, 6));

  it('weights level 0.7 and trend 0.3, falls back to level only', () => {
    const r = su_sicakligi_ve_3g_trend(ctx({ sst: 16 }, { [-72]: { sst: 17.25 } }));
    expect(r.value).toBeCloseTo(0.7 + 0.3 * 0.5, 6);
    expect(r.reason).toContain('-1.3');
    const up = su_sicakligi_ve_3g_trend(ctx({ sst: 16 }, { [-72]: { sst: 15.8 } }));
    expect(up.reason).toContain('+0.2');
    expect(su_sicakligi_ve_3g_trend(ctx({ sst: 22 })).value).toBeCloseTo(0.5, 6);
    expect(su_sicakligi_ve_3g_trend(ctx(undefined)).value).toBeNull();
  });

  it('uses the default ideal range when a profile has none', () => {
    const c = ctx({ sst: 17 });
    expect(su_sicakligi_ve_3g_trend({ ...c, profile: { ...ISTAVRIT, params: {} } }).value).toBe(1);
  });
});

describe('current triangle', () => {
  it.each([
    [0, 0.3],
    [0.025, 0.65],
    [0.05, 1],
    [0.25, 1],
    [0.425, 0.5],
    [0.6, 0],
    [1, 0],
  ])('%f m/s → %f', (v, expected) => expect(currentValue(v)).toBeCloseTo(expected, 6));

  it('labels slack, moderate, strong and uses profile/default params', () => {
    expect(akinti(ctx({ curVel: 0.01 })).reason).toContain('durgun');
    expect(akinti(ctx({ curVel: 0.1 })).reason).toContain('orta');
    expect(akinti(ctx({ curVel: 0.4 })).reason).toContain('sert');
    expect(akinti(ctx({})).value).toBeNull();
    const c = ctx({ curVel: 0.1 });
    expect(akinti({ ...c, profile: { ...ISTAVRIT, params: {} } }).value).toBe(1);
  });
});

describe('season table (local month)', () => {
  it.each([
    [1, 0.6], [2, 0.4], [3, 0.4], [4, 0.6], [5, 0.8], [6, 0.6],
    [7, 0.6], [8, 0.6], [9, 0.8], [10, 1.0], [11, 1.0], [12, 0.8],
  ])('month %i → %f', (m, v) => {
    const at = new Date(Date.UTC(2026, m - 1, 15, 12)).toISOString();
    expect(mevsim_katsayisi(ctx(undefined, {}, at)).value).toBe(v);
  });

  it('uses local time: 31 Oct 22:00Z is already November in Istanbul', () => {
    expect(mevsim_katsayisi(ctx(undefined, {}, '2026-10-31T22:00:00Z')).reason).toContain('Kasım');
  });

  it('is null when the profile has no table', () => {
    const c = ctx(undefined);
    expect(mevsim_katsayisi({ ...c, profile: { ...ISTAVRIT, season: {} } }).value).toBeNull();
  });
});
