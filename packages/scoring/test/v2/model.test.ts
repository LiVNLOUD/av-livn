import { describe, expect, it } from 'vitest';
import {
  ambientLogLux, calibrate, DEFAULTS, depthPrior, drawParams, dynamicTerms, exposure, fieldBand, fieldWeight, IDEAL_SPOT, IDEAL_WEATHER, lampPrior,
  PARAMS, R_IDEAL, R_WORST, rawScore, rng, SCALE, season, staticTerms, WORST_SPOT, WORST_WEATHER, type SpotV2, type Weather,
} from '../../src';
import { BASE, CALM } from './fixtures';

const at = (o: Partial<Weather>): Weather => ({ ...CALM, ...o });
const P = DEFAULTS;
const score = (s: SpotV2, w: Weather) => calibrate(rawScore(s, w, P).raw);

describe('v2 scale calibration (documented log-linear map)', () => {
  it('ideal reference ≥ 85 and worst reference ≤ 15', () => {
    expect(score(IDEAL_SPOT, IDEAL_WEATHER)).toBeGreaterThanOrEqual(85);
    expect(score(WORST_SPOT, WORST_WEATHER)).toBeLessThanOrEqual(15);
    expect(calibrate(R_IDEAL)).toBe(SCALE.ideal);
    expect(calibrate(R_WORST)).toBe(SCALE.worst);
  });

  it('near-ideal variants stay high and near-worst variants stay low', () => {
    expect(score({ ...IDEAL_SPOT, lamp: null, ferry: true }, IDEAL_WEATHER)).toBeGreaterThanOrEqual(80);
    expect(score(IDEAL_SPOT, { ...IDEAL_WEATHER, sunAlt: -4 })).toBeGreaterThanOrEqual(75);
    expect(score(WORST_SPOT, { ...WORST_WEATHER, sunAlt: -30 })).toBeLessThanOrEqual(20);
  });

  it('is monotone, clipped to 0–100 and keeps the ideal/worst raw ordering', () => {
    expect(R_IDEAL).toBeGreaterThan(R_WORST);
    expect(calibrate(0.2)).toBeLessThan(calibrate(0.3));
    expect(calibrate(1e-6)).toBe(0);
    expect(calibrate(10)).toBe(100);
  });
});

describe('v2 direction tests (docs/MODEL.md §7)', () => {
  it('1: same spot with a lamp: night > twilight > day', () => {
    const lit = { ...BASE, lamp: true };
    const n = score(lit, at({ sunAlt: -30 }));
    const t = score(lit, at({ sunAlt: -4 }));
    const d = score(lit, at({ sunAlt: 40 }));
    expect(n).toBeGreaterThan(t);
    expect(t).toBeGreaterThan(d);
  });

  it('2: daytime, deep structured spot > shallow beach pier', () => {
    const deep: SpotV2 = { ...BASE, kind: 'breakwater', lengthM: 1000, lamp: false };
    const shallow: SpotV2 = { ...BASE, lengthM: 15, dtm: { d0_50: 0.3, d50_150: 1, interpolated: false }, substrate: { eusm: 'Muddy sand', conf: 2 }, lamp: false };
    expect(score(deep, at({ sunAlt: 40 }))).toBeGreaterThan(score(shallow, at({ sunAlt: 40 })) + 20);
  });

  it('3: onshore ≥ 30 km/sa + 1 m wave: exposed < sheltered (habitat equal)', () => {
    const storm = at({ sunAlt: 40, windKmh: 35, gustKmh: 50, windDir: 225, waveM: 1, waveDir: 225 });
    const exposed = { ...BASE, lamp: false, fetchKm: BASE.fetchKm!.map(() => 30) };
    const sheltered = { ...BASE, lamp: false, fetchKm: BASE.fetchKm!.map(() => 0.05) };
    expect(score(exposed, storm)).toBeLessThan(score(sheltered, storm) - 5);
  });

  it('4: unknown lamp lies between yes and no', () => {
    const w = at({ sunAlt: -30 });
    const u = score({ ...BASE, lamp: null }, w);
    expect(u).toBeLessThan(score({ ...BASE, lamp: true }, w));
    expect(u).toBeGreaterThan(score({ ...BASE, lamp: false }, w));
  });

  it('5: September (post-spawning feeding) > July (spawning peak)', () => {
    expect(score(BASE, at({ sunAlt: -4, doy: 263 }))).toBeGreaterThan(score(BASE, at({ sunAlt: -4, doy: 196 })));
  });
});

describe('v2 static terms and sources', () => {
  it('depth: field pairs > DTM survey > structure-length estimate', () => {
    expect(staticTerms({ ...BASE, fieldDepths: [{ distance_m: 20, depth_m: 6 }, { distance_m: 120, depth_m: 9 }] }, P).sources.depth).toBe('saha');
    expect(staticTerms({ ...BASE, dtm: { d0_50: 5, d50_150: 8, interpolated: false } }, P).sources.depth).toBe('DTM-ölçüm');
    expect(staticTerms(BASE, P).sources.depth).toBe('yapı-uzunluğu-tahmini');
    const none = staticTerms({ ...BASE, dtm: { d0_50: null, d50_150: Number.NaN, interpolated: true } }, P);
    expect(none.depthM).toBeCloseTo(depthPrior(BASE), 6);
  });

  it('depth priors by kind, ferry floor, missing length', () => {
    expect(depthPrior({ ...BASE, kind: 'breakwater', lengthM: 400 })).toBeCloseTo(2 + 4 * (1 - Math.exp(-1)), 6);
    expect(depthPrior({ ...BASE, lengthM: 20, ferry: true })).toBe(5);
    expect(depthPrior({ ...BASE, lengthM: null })).toBeCloseTo(1 + 4 * (1 - Math.exp(-0.2)), 6);
  });

  it('field profile band interpolates and holds flat outside the measured range', () => {
    const pairs = [{ distance_m: 100, depth_m: 8 }, { distance_m: 20, depth_m: 4 }];
    expect(fieldBand(pairs, 20, 100)).toBeCloseTo(6, 6);
    expect(fieldBand(pairs, 0, 10)).toBe(4);
    expect(fieldBand(pairs, 150, 200)).toBe(8);
  });

  it('structure from the field form and OSM kind', () => {
    const L = { lengthM: null };
    expect(staticTerms({ ...BASE, ...L, fieldStructure: 'mendirek' }, P).struct).toBeCloseTo(0.85 * (0.4 + 0.6 * (1 - Math.exp(-0.05 / 0.15))), 6);
    expect(staticTerms({ ...BASE, fieldStructure: 'dogal_kaya' }, P).sources.struct).toBe('saha');
    expect(staticTerms({ ...BASE, fieldStructure: 'iskele' }, P).struct).toBeLessThan(staticTerms({ ...BASE, kind: 'breakwater' }, P).struct);
    expect(staticTerms(BASE, P).sources.struct).toBe('OSM');
  });

  it('substrate: field > snag hint > EUSeaMap (confidence-weighted) > prior', () => {
    const f = staticTerms({ ...BASE, substrate: { eusm: 'Fine mud', conf: 2, field: ['kum', 'kaya'] } }, P);
    expect(f.substrate).toBeCloseTo(0.9 * 0.95 + 0.1 * 0.75, 6);
    expect(f.sources.substrate).toBe('saha');
    expect(staticTerms({ ...BASE, substrate: { eusm: 'Fine mud', conf: 2, hint: 'midyeli' } }, P).substrate).toBeCloseTo(0.4 * 0.95 + 0.6 * 0.75, 6);
    expect(staticTerms({ ...BASE, substrate: { eusm: 'Fine mud', conf: null, field: [] } }, P).substrate).toBeCloseTo(0.2 * 0.7 + 0.8 * 0.75, 6);
    expect(staticTerms({ ...BASE, substrate: { eusm: 'Lava', conf: 9 } }, P).substrate).toBeCloseTo(0.75, 6);
    const none = staticTerms({ ...BASE, substrate: { eusm: null, conf: null } }, P);
    expect([none.substrate, none.sources.substrate]).toEqual([0.75, 'önsel']);
  });

  it('lamp priors', () => {
    expect([lampPrior({ ...BASE, ferry: true }), lampPrior(BASE), lampPrior({ ...BASE, kind: 'breakwater' }), lampPrior({ ...BASE, kind: 'manual' })]).toEqual([0.85, 0.5, 0.3, 0.5]);
  });
});

describe('v2 dynamic terms', () => {
  it('ambient light: night, twilight, day, moon and cloud', () => {
    expect(ambientLogLux(-40, -10, 1, 0)).toBeCloseTo(Math.log10(2e-3), 2); // twilight floor + starlight
    expect(ambientLogLux(-40, 60, 1, null)).toBeGreaterThan(-1);
    expect(ambientLogLux(40, 0, 0, 0)).toBeGreaterThan(4.8);
    expect(ambientLogLux(40, 0, 0, 100)).toBeCloseTo(ambientLogLux(40, 0, 0, 0) + Math.log10(0.25), 2);
    expect(ambientLogLux(95, 0, 0, 0)).toBeCloseTo(Math.log10(1.3e5), 2);
  });

  it('season wraps around the year end', () => {
    expect(season(1, P)).toBeCloseTo(season(365, P), 1);
    expect(season(285, P)).toBe(1);
  });

  it('exposure: rose lookup, negative angles, unknown rose', () => {
    expect(exposure(BASE.fetchKm, 180, P)).toBeCloseTo(99 / 102, 6);
    expect(exposure(BASE.fetchKm, -22.5, P)).toBeCloseTo(0.4 / 3.4, 6);
    expect(exposure(null, 0, P)).toBe(0.5);
  });

  it('missing inputs drop out of the geometric mean', () => {
    const st = staticTerms(BASE, P);
    const d = dynamicTerms(BASE, st, at({ windKmh: null, gustKmh: null, windDir: null, waveM: null, waveDir: null, rain48: null, sstD48: null, pressD3: null, currentMs: null }), P, false);
    expect([d.wind, d.turb, d.sst, d.sstDev, d.press, d.current]).toEqual([null, null, null, null, null, null]);
    const g = dynamicTerms(BASE, st, at({ waveDir: null, gustKmh: null, rain48: null, sstDev: 1 }), P, true);
    expect(g.turb).not.toBeNull();
    expect(g.sstDev).toBeCloseTo(Math.exp(-0.5 * 0.25), 6);
    const noDir = dynamicTerms(BASE, st, at({ waveDir: null, windDir: null }), P, true);
    expect(noDir.wind).not.toBeNull();
  });

  it('rawScore: known lamp, unknown mixture, Monte Carlo lamp draw', () => {
    const w = at({});
    expect(rawScore({ ...BASE, lamp: true }, w, P).dyn).toHaveLength(1);
    const mix = rawScore(BASE, w, P);
    expect([mix.dyn.length, mix.lampP]).toEqual([2, 0.5]);
    expect(rawScore(BASE, w, P, true).raw).toBeCloseTo(rawScore({ ...BASE, lamp: true }, w, P).raw, 10);
  });
});

describe('v2 parameters', () => {
  it('every parameter has unit, evidence and a numeric default', () => {
    for (const d of Object.values(PARAMS)) {
      expect(['A', 'B', 'C']).toContain(d.evidence);
      expect(Number.isFinite(d.value)).toBe(true);
    }
  });

  it('draws are deterministic and wider for weaker evidence', () => {
    const a = rng(1);
    const b = rng(1);
    expect(drawParams(a.normal)).toEqual(drawParams(b.normal));
    const r = rng(3);
    const ds = Array.from({ length: 400 }, () => drawParams(r.normal));
    const spread = (k: 'season_spawn_w' | 'lamp_lux') => {
      const l = ds.map((d) => Math.log(d[k] / PARAMS[k].value));
      const m = l.reduce((x, y) => x + y) / l.length;
      return Math.sqrt(l.reduce((x, y) => x + (y - m) ** 2, 0) / l.length);
    };
    expect(spread('season_spawn_w')).toBeLessThan(0.15);
    expect(spread('lamp_lux')).toBeGreaterThan(0.4);
    const doy = ds.map((d) => d.season_autumn_doy);
    expect(Math.max(...doy) - Math.min(...doy)).toBeGreaterThan(3);
    expect(Math.max(...ds.map((d) => Math.abs(d.twilight_centre + 3)))).toBeGreaterThan(0.5);
  });
});

describe('field depth weights', () => {
  it('plumb > calibrated sink > uncalibrated sink', () => {
    expect(fieldWeight([{ distance_m: 10, depth_m: 3 }])).toBe(0.95);
    expect(fieldWeight([{ distance_m: 10, depth_m: 3, quality: 'sink_cal' }])).toBe(0.9);
    expect(fieldWeight([{ distance_m: 10, depth_m: 3, quality: 'sink' }])).toBe(0.7);
  });
});

describe('source kinds and lamp probability', () => {
  it('uses lampP over the structure prior and labels non-field sources', () => {
    expect(lampPrior({ ...BASE, lampP: 0.95 })).toBe(0.95);
    const st = staticTerms(
      { ...BASE, fieldDepths: [{ distance_m: 50, depth_m: 6, quality: 'desk' }], fieldDepthKind: 'masabasi', substrate: { eusm: null, conf: null, field: ['kum'], fieldKind: 'uzaktan', fieldWeight: 0.7 }, fieldStructure: 'iskele', fieldStructureKind: 'uzaktan' },
      P,
    );
    expect(st.sources).toEqual({ struct: 'uzaktan gözlem', substrate: 'uzaktan gözlem', depth: 'masa başı' });
    expect(st.substrate).toBeCloseTo(0.7 * 0.8 + 0.3 * 0.75, 6);
    expect(fieldWeight([{ distance_m: 1, depth_m: 1, quality: 'remote' }])).toBe(0.6);
  });

  it('term overrides recompute HSI_s', () => {
    const a = rawScore(BASE, CALM, P);
    const b = rawScore(BASE, CALM, P, undefined, { struct: 1, substrate: 1 });
    expect(b.st.hsiS).toBe(1);
    expect(b.raw).toBeGreaterThan(a.raw);
  });
});
