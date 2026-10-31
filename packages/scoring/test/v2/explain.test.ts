import { describe, expect, it } from 'vitest';
import { DEFAULTS, explain, type SpotV2 } from '../../src';
import { BASE, CALM } from './fixtures';

describe('main reason (term ablation)', () => {
  it('names the lamp prior when only the lamp differs', () => {
    const spots: SpotV2[] = [{ ...BASE, lamp: null, ferry: false, lampP: 0.85, lampSource: null }, { ...BASE, lamp: null }, { ...BASE, lamp: null }];
    const r = explain(spots, spots.map(() => CALM), DEFAULTS);
    expect(r[0]!.key).toBe('lamba');
    expect(r[0]!.delta).toBeGreaterThan(0);
    expect(r[1]!.delta).toBeLessThan(0);
  });

  it('names structure, depth, substrate and exposure when they dominate', () => {
    const day = { ...CALM, sunAlt: 40 };
    const shallow = { ...BASE, lamp: false, dtm: { d0_50: 0.5, d50_150: 1, interpolated: false } };
    const r1 = explain([{ ...BASE, lamp: false, dtm: { d0_50: 9, d50_150: 12, interpolated: false } }, shallow, shallow], [day, day, day], DEFAULTS);
    expect(r1[0]!.key).toBe('derinlik');
    const r2 = explain([{ ...BASE, lamp: false, lengthM: 1000, kind: 'breakwater' }, { ...BASE, lamp: false, lengthM: 15 }], [CALM, CALM], DEFAULTS);
    expect(['yapi', 'derinlik']).toContain(r2[0]!.key);
    const r3 = explain([{ ...BASE, lamp: false, substrate: { eusm: null, conf: null, field: ['kaya'] } }, { ...BASE, lamp: false, substrate: { eusm: null, conf: null, field: ['camur'] } }], [CALM, CALM], DEFAULTS);
    expect(r3[0]!.key).toBe('taban');
    const storm = { ...CALM, sunAlt: 40, windKmh: 40, gustKmh: 55, windDir: 180, waveM: 1.2, waveDir: 180 };
    const r4 = explain([{ ...BASE, lamp: false, fetchKm: BASE.fetchKm!.map(() => 40) }, { ...BASE, lamp: false, fetchKm: BASE.fetchKm!.map(() => 0.05) }], [storm, storm], DEFAULTS);
    expect(r4[0]!.key).toBe('maruziyet');
    expect(r4[0]!.delta).toBeLessThan(0);
  });

  it('lamp-known spots and single spots', () => {
    const r = explain([{ ...BASE, lamp: true }, { ...BASE, lamp: false }], [CALM, CALM], DEFAULTS);
    expect(r[0]!.key).toBe('lamba');
    expect(explain([BASE], [CALM], DEFAULTS)).toEqual([null]);
  });
});
