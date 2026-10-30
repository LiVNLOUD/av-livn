import { describe, expect, it } from 'vitest';
import { ruzgar_dalga_kiyiya_gore, waveValue, windValue } from '../src/components/windWave';
import type { SeriesView } from '../src/types';
import { ISTAVRIT, MUDANYA } from './helpers';

describe('windValue: wind-to-shore angle × speed', () => {
  // angle = wind-from − seaward shore normal; 0° = blowing straight onshore, 180° = straight offshore.
  it.each([
    [0, 10, 1],
    [0, 35, 0],
    [45, 10, 1],
    [45, 35, 1 - Math.SQRT1_2],
    [90, 10, 1],
    [90, 35, 0.625],
    [135, 10, 1],
    [135, 35, 0.625],
    [180, 10, 1],
    [180, 35, 0.625],
  ])('angle %i°, %i km/h → %f', (angle, speed, expected) => {
    expect(windValue(speed, angle)).toBeCloseTo(expected, 6);
  });

  it('onshore 22.5 km/h is half penalised; strong offshore floors at 0.5', () => {
    expect(windValue(22.5, 0)).toBeCloseTo(0.5, 6);
    expect(windValue(60, 180)).toBeCloseTo(0.5, 6);
  });

  it('unknown direction is treated as side wind', () => {
    expect(windValue(35, null)).toBeCloseTo(0.625, 6);
  });

  it('orders onshore-strong as the worst case', () => {
    const v = [0, 45, 90, 135, 180].map((a) => windValue(35, a));
    expect(Math.min(...v)).toBe(v[0]);
  });
});

describe('waveValue boundaries', () => {
  it.each([
    [0, 1],
    [0.3, 1],
    [0.45, 0.85],
    [0.6, 0.7],
    [0.9, 0.35],
    [1.2, 0],
    [2, 0],
  ])('%f m → %f', (h, expected) => {
    expect(waveValue(h)).toBeCloseTo(expected, 6);
  });
});

function view(p: object): SeriesView {
  return { at: new Date('2026-11-01T18:00:00Z'), now: { ts: '2026-11-01T18:00:00Z', ...p }, offset: () => undefined };
}

describe('ruzgar_dalga_kiyiya_gore component', () => {
  const ctx = (p: object, spot = MUDANYA) => ({ series: view(p), spot, profile: ISTAVRIT });

  it('combines wind and wave multiplicatively', () => {
    const r = ruzgar_dalga_kiyiya_gore(ctx({ windSpeed: 35, windDir: 0, waveH: 0.3 }));
    expect(r.value).toBeCloseTo(0, 6);
    expect(r.reason).toContain('kıyıya vuruyor');
    const r2 = ruzgar_dalga_kiyiya_gore(ctx({ windSpeed: 10, windDir: 180, waveH: 0.6 }));
    expect(r2.value).toBeCloseTo(0.7, 6);
    expect(r2.reason).toContain('karadan');
  });

  it('labels side wind and unknown direction', () => {
    expect(ruzgar_dalga_kiyiya_gore(ctx({ windSpeed: 10, windDir: 90 })).reason).toContain('yandan');
    expect(ruzgar_dalga_kiyiya_gore(ctx({ windSpeed: 10 })).reason).toContain('yön bilinmiyor');
    expect(ruzgar_dalga_kiyiya_gore(ctx({ windSpeed: 10, windDir: 0 }, { ...MUDANYA, shoreNormalDeg: null })).reason).toContain('yön bilinmiyor');
  });

  it('uses wave alone when wind is missing, null when both missing', () => {
    expect(ruzgar_dalga_kiyiya_gore(ctx({ waveH: 0.45 })).value).toBeCloseTo(0.85, 6);
    expect(ruzgar_dalga_kiyiya_gore(ctx({})).value).toBeNull();
  });
});
