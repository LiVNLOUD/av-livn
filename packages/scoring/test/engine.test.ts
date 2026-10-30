import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileSpecies } from '../scripts/build-species.mjs';
import { assertScorable, getProfile, PROFILES, safetyGate, scoreAt, scoreSeries } from '../src/index';
import { angleDiff, clamp01, hourKey, localParts, nextLocalMidnight } from '../src/util';
import type { HourlyPoint } from '../src/types';
import { hours, ISTAVRIT, MUDANYA } from './helpers';

const AT = new Date('2026-11-05T17:00:00Z'); // 20:00 local, inside the light window
const calm = (back: number): Partial<HourlyPoint> => ({
  pressure: 1015, windSpeed: 8, windDir: 180, windGust: 15, waveH: 0.2, sst: 17, curVel: 0.1,
  ...(back === 72 ? { sst: 17.2 } : {}),
});

describe('safety gate (strict >)', () => {
  it.each([
    [39, 0.5, false],
    [40, 0.5, false],
    [41, 0.5, true],
    [20, 1.19, false],
    [20, 1.2, false],
    [20, 1.21, true],
    [45, 1.5, true],
  ])('gust %f km/h, wave %f m → gated=%s', (gust, wave, gated) => {
    expect(safetyGate({ ts: 'x', windGust: gust, waveH: wave }, ISTAVRIT).length > 0).toBe(gated);
  });

  it('reports both reasons when both limits are exceeded', () => {
    const w = safetyGate({ ts: 'x', windGust: 45, waveH: 1.5 }, ISTAVRIT);
    expect(w).toHaveLength(2);
    expect(w[0]).toContain('Hamle 45');
    expect(w[1]).toContain('Dalga 1.5');
  });

  it('ignores missing data', () => {
    expect(safetyGate(undefined, ISTAVRIT)).toEqual([]);
  });
});

describe('scoreAt', () => {
  const points = hours(AT, 80, calm);

  it('returns every weighted component with contributions and a 0–100 total', () => {
    const r = scoreAt({ spot: MUDANYA, at: AT, profile: ISTAVRIT, points });
    expect(r.components.map((c) => c.key)).toEqual(Object.keys(ISTAVRIT.weights));
    expect(r.missing).toEqual([]);
    expect(r.gated).toBe(false);
    const expected = (r.components.reduce((a, c) => a + c.contribution!, 0) / 100) * 100;
    expect(r.total).toBeCloseTo(expected, 1);
    expect(r.total!).toBeGreaterThan(60);
    expect(r.ts).toBe('2026-11-05T17:00Z');
  });

  it('caps the score at 30 and warns when the gate triggers', () => {
    const stormy = hours(AT, 80, (b) => ({ ...calm(b), windGust: 55 }));
    const r = scoreAt({ spot: MUDANYA, at: AT, profile: ISTAVRIT, points: stormy });
    expect(r.gated).toBe(true);
    expect(r.raw!).toBeGreaterThan(30);
    expect(r.total).toBe(30);
    expect(r.warnings[0]).toContain('güvenli değil');
  });

  it('keeps scores already below the cap', () => {
    const bad = hours(AT, 80, (b) => ({ ...calm(b), windGust: 55, waveH: 1.3, windSpeed: 40, windDir: 0, sst: 8, curVel: 1 }));
    const profile = { ...ISTAVRIT, weights: { ruzgar_dalga_kiyiya_gore: 20, akinti: 10, su_sicakligi_ve_3g_trend: 15 } };
    const r = scoreAt({ spot: MUDANYA, at: AT, profile, points: bad });
    expect(r.raw!).toBeLessThan(30);
    expect(r.total).toBe(r.raw);
  });

  it('renormalises over available components when data is missing', () => {
    const sparse: HourlyPoint[] = [{ ts: AT.toISOString() }];
    const r = scoreAt({ spot: MUDANYA, at: AT, profile: ISTAVRIT, points: sparse });
    expect(r.missing).toEqual(['ruzgar_dalga_kiyiya_gore', 'su_sicakligi_ve_3g_trend', 'basinc_trendi_3_6s', 'akinti']);
    const avail = r.components.filter((c) => c.value !== null);
    const w = avail.reduce((a, c) => a + c.weight, 0);
    expect(r.total).toBeCloseTo((avail.reduce((a, c) => a + c.contribution!, 0) / w) * 100, 1);
  });

  it('returns null total when no component has data or weight', () => {
    const r = scoreAt({ spot: MUDANYA, at: AT, profile: { ...ISTAVRIT, weights: { akinti: 10, mevsim_katsayisi: 0 } }, points: [] });
    expect(r.total).toBeNull();
    expect(r.raw).toBeNull();
  });
});

describe('scoreSeries', () => {
  it('scores consecutive hours from the containing hour', () => {
    const r = scoreSeries({ spot: MUDANYA, from: new Date('2026-11-05T17:40:00Z'), hours: 72, profile: ISTAVRIT, points: hours(AT, 80, calm) });
    expect(r).toHaveLength(72);
    expect(r[0]!.ts).toBe('2026-11-05T17:00Z');
    expect(r[1]!.ts).toBe('2026-11-05T18:00Z');
  });
});

describe('profiles', () => {
  it('istavrit has the agreed v1.1 weights (sum 100) and night multiplier', () => {
    expect(ISTAVRIT.weights).toEqual({
      ruzgar_dalga_kiyiya_gore: 27, su_sicakligi_ve_3g_trend: 20, basinc_trendi_3_6s: 13,
      ay_evresi: 13, akinti: 13, mevsim_katsayisi: 14,
    });
    expect(Object.values(ISTAVRIT.weights).reduce((a, b) => a + b, 0)).toBe(100);
    expect(ISTAVRIT.night_multiplier).toMatchObject({ full: 1, twilight: 0.7, day: 0.25, no_light_factor: 0.75 });
    expect(ISTAVRIT.safety).toEqual({ gust_kmh_max: 40, wave_m_max: 1.2, cap: 30 });
  });

  it.each(['levrek', 'lufer_cinekop', 'kalamar'])('TODO profile %s is rejected', (id) => {
    expect(() => assertScorable(getProfile(id)!)).toThrow(/no weights/);
  });

  it('rejects unknown component keys and unknown species', () => {
    expect(() => assertScorable({ ...ISTAVRIT, weights: { nope: 1 } })).toThrow(/unknown component/);
    expect(getProfile('toString')).toBeUndefined();
  });

  it('generated JSON is in sync with data/species/*.yaml', () => {
    const fromYaml = compileSpecies(new URL('../../../data/species', import.meta.url).pathname);
    expect(fromYaml).toEqual(PROFILES);
    expect(readFileSync(new URL('../src/species.generated.json', import.meta.url), 'utf8')).toBe(JSON.stringify(fromYaml, null, 2) + '\n');
  });
});

describe('util', () => {
  it('clamp01, angleDiff, hourKey, local time helpers', () => {
    expect(clamp01(Number.NaN)).toBe(0);
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(angleDiff(10, 350)).toBe(20);
    expect(angleDiff(350, 10)).toBe(-20);
    expect(angleDiff(180, 0)).toBe(180);
    expect(angleDiff(0, 180)).toBe(180);
    expect(hourKey(new Date('2026-11-05T17:59:59Z'))).toBe('2026-11-05T17:00Z');
    expect(localParts(new Date('2026-10-31T21:30:00Z'))).toMatchObject({ month: 11, day: 1, hour: 0, minute: 30 });
    expect(nextLocalMidnight(new Date('2026-11-05T12:00:00Z')).toISOString()).toBe('2026-11-05T21:00:00.000Z');
  });
});
