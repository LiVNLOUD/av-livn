import { describe, expect, it } from 'vitest';
import {
  calibrate, calibrateLevrek, DEFAULTS, drawLevrek, explainLevrek, LEVREK_DEFAULTS, LEVREK_IDEAL_SPOT, LEVREK_IDEAL_WEATHER, LEVREK_PARAMS, LEVREK_WORST_SPOT,
  LEVREK_WORST_WEATHER, levrekAt, levrekTerms, rawLevrek, rawScore, rng, scoreSeriesLevrek, type HourlyPoint, type SpotV2, type Weather,
} from '../../src';
import { BASE } from './fixtures';

const OPEN = Array.from({ length: 16 }, () => 4);
const ROCK: SpotV2 = { ...BASE, kind: 'rocky', lengthM: null, fetchKm: OPEN, lamp: false, substrate: { eusm: 'Rock', conf: 2 } };
const MOUTH: SpotV2 = { ...BASE, kind: 'river_mouth', lengthM: null, fetchKm: OPEN, lamp: false };
const BEACH: SpotV2 = { ...BASE, kind: 'beach', lengthM: null, fetchKm: OPEN, lamp: false };
const PIER: SpotV2 = { ...BASE, kind: 'pier', fetchKm: OPEN };
// January night, Gemlik Bay
const CALM_CLEAR: Weather = {
  sunAlt: -30, moonAlt: -10, moonFrac: 0.3, cloud: 20, windKmh: 6, gustKmh: 10, windDir: 0, waveM: 0.15, waveDir: 0,
  rain48: 0, sstD48: 0, sstDev: 0, pressD3: 0, currentMs: 0.1, doy: 20, waveMax48: 0.3, rain72: 0,
};
const POST_STORM: Weather = { ...CALM_CLEAR, rain48: 8, waveM: 0.7, waveMax48: 1.8, rain72: 12, sstD48: -0.3 };
const NOON: Weather = { ...CALM_CLEAR, sunAlt: 30 };
const DUSK: Weather = { ...CALM_CLEAR, sunAlt: -3 };
const AFTER_RAIN: Weather = { ...CALM_CLEAR, sunAlt: -3, rain48: 20, rain72: 30, waveM: 0.4, waveMax48: 0.6, sstD48: -0.5 };
const COLD: Weather = { ...CALM_CLEAR, rain48: 2, rain72: 2, waveM: 0.3, waveMax48: 0.5, sstD48: -3 };

describe('levrek engine (H3) — direction tests with the real engine (docs/species/levrek/MODEL.md §5)', () => {
  it('1. after a storm, turbid water beats clear calm water (rocky, night)', () => {
    expect(levrekAt(ROCK, POST_STORM)).toBeGreaterThan(levrekAt(ROCK, CALM_CLEAR));
    expect(levrekTerms(ROCK, POST_STORM, LEVREK_DEFAULTS, false).postStorm).toBe(true);
  });
  it('2. dusk and night beat midday', () => {
    expect(levrekAt(ROCK, DUSK)).toBeGreaterThan(levrekAt(ROCK, NOON));
    expect(levrekAt(ROCK, CALM_CLEAR)).toBeGreaterThan(levrekAt(ROCK, NOON));
  });
  it('3. after rain, a river mouth beats an open beach', () => {
    expect(levrekAt(MOUTH, AFTER_RAIN)).toBeGreaterThan(levrekAt(BEACH, AFTER_RAIN));
    expect(levrekAt(MOUTH, AFTER_RAIN)).toBeGreaterThan(levrekAt(MOUTH, DUSK)); // the rain itself lifts the mouth
  });
  it('4. a winter cold snap lowers the score (−3 °C in 48 h; < 9 °C floor)', () => {
    expect(levrekAt(ROCK, COLD)).toBeLessThan(levrekAt(ROCK, CALM_CLEAR));
    expect(levrekAt(ROCK, { ...CALM_CLEAR, sst: 8 } as Weather)).toBeLessThan(levrekAt(ROCK, { ...CALM_CLEAR, sst: 11 } as Weather));
  });
  it('5. during a storm an exposed spot is under the safety gate (≤ 30)', () => {
    const from = new Date('2027-01-20T18:00:00Z');
    const points: HourlyPoint[] = Array.from({ length: 80 }, (_, i) => ({
      ts: new Date(from.getTime() + (i - 72) * 3_600_000).toISOString(), windSpeed: 45, windGust: 70, windDir: 0, waveH: 2.2, waveDir: 0, cloud: 90, precip: 1, sst: 11, pressure: 1005,
    }));
    const h = scoreSeriesLevrek({ spot: { ...ROCK, lat: 40.43, lon: 29.0 }, points, from, hours: 3 });
    expect(h.every((x) => x.gated && x.total !== null && x.total <= 30)).toBe(true);
  });
  it('6. a lit pier beats an unlit pier, by less than for istavrit (lamp effect: medium)', () => {
    const lit = levrekAt({ ...PIER, lamp: true }, CALM_CLEAR);
    const dark = levrekAt({ ...PIER, lamp: false }, CALM_CLEAR);
    expect(lit).toBeGreaterThan(dark);
    const iLit = calibrate(rawScore({ ...PIER, lamp: true }, CALM_CLEAR, DEFAULTS).raw);
    const iDark = calibrate(rawScore({ ...PIER, lamp: false }, CALM_CLEAR, DEFAULTS).raw);
    expect(lit - dark).toBeLessThan(iLit - iDark);
    expect(lit - dark).toBeGreaterThan(1); // medium, not negligible
  });
});

describe('levrek engine — scale, band, metadata, explain', () => {
  it('scale anchors 92 / 8 and clamp', () => {
    expect(calibrateLevrek(rawLevrek(LEVREK_IDEAL_SPOT, LEVREK_IDEAL_WEATHER, LEVREK_DEFAULTS).raw)).toBe(92);
    expect(calibrateLevrek(rawLevrek(LEVREK_WORST_SPOT, LEVREK_WORST_WEATHER, LEVREK_DEFAULTS).raw)).toBe(8);
    expect(calibrateLevrek(1e-9)).toBe(0);
    expect(calibrateLevrek(1)).toBeLessThanOrEqual(100);
  });
  it('every parameter has unit, evidence and source; B only where a source supports it', () => {
    const defs = Object.values(LEVREK_PARAMS);
    expect(defs.length).toBe(43);
    for (const d of defs) expect(['A', 'B', 'C']).toContain(d.evidence);
    expect(defs.filter((d) => d.evidence === 'B').length).toBe(3);
    expect(defs.filter((d) => (d.evidence as string) === 'A').length).toBe(0);
    expect(LEVREK_PARAMS.l_lamp_gain.value).toBe(0.15);
  });
  it('unknown lamp mixes both scenarios; missing weather terms are left out; field structure maps', () => {
    const r = rawLevrek({ ...PIER, lamp: null }, CALM_CLEAR, LEVREK_DEFAULTS);
    expect(r.terms).toHaveLength(2);
    expect(r.lampP).toBeGreaterThan(0);
    const t = levrekTerms(PIER, { ...CALM_CLEAR, rain48: null, waveM: null, sstD48: null, pressD3: null, waveMax48: null, rain72: null }, LEVREK_DEFAULTS, false);
    expect([t.turb, t.wave, t.sst, t.press]).toEqual([null, null, null, null]);
    expect(levrekTerms({ ...PIER, fieldStructure: 'mendirek' }, CALM_CLEAR, LEVREK_DEFAULTS, false).struct).toBe(LEVREK_DEFAULTS.l_struct_breakwater);
    expect(levrekTerms({ ...PIER, fieldStructure: 'dogal_kaya' }, CALM_CLEAR, LEVREK_DEFAULTS, false).struct).toBe(LEVREK_DEFAULTS.l_struct_rocky);
    expect(levrekTerms({ ...MOUTH }, { ...AFTER_RAIN, rain72: null }, LEVREK_DEFAULTS, false).river).toBe(0.5);
  });
  it('series with band, no-weather hours, components', () => {
    const from = new Date('2027-01-20T18:00:00Z');
    const points: HourlyPoint[] = Array.from({ length: 80 }, (_, i) => ({
      ts: new Date(from.getTime() + (i - 72) * 3_600_000).toISOString(), windSpeed: 10, windGust: 15, windDir: 0, waveH: 0.4, waveDir: 0, cloud: 50, precip: 0.2, sst: 11, pressure: 1012,
    }));
    const h = scoreSeriesLevrek({ spot: { ...PIER, lamp: null, lat: 40.43, lon: 29.0 }, points, from, hours: 4, draws: 30 });
    expect(h[0]!.p10).not.toBeNull();
    expect(h[0]!.p10!).toBeLessThanOrEqual(h[0]!.p90!);
    expect(h[0]!.components.map((c) => c.key)).toEqual(['yapi', 'taban', 'lamba', 'diel', 'mevsim', 'bulaniklik', 'dalga', 'su_degisim', 'dere', 'basinc']);
    expect(h[0]!.components.find((c) => c.key === 'mevsim')!.evidence).toBe('B');
    expect(scoreSeriesLevrek({ spot: { ...PIER, lamp: null, lat: 40.43, lon: 29.0 }, points, from, hours: 1, draws: 3, keepSamples: true })[0]!.samples).toHaveLength(3);
    const known = scoreSeriesLevrek({ spot: { ...PIER, lamp: true, lat: 40.43, lon: 29.0 }, points, from, hours: 2, draws: 4 });
    expect(known[0]!.lampP).toBeNull();
    const empty = scoreSeriesLevrek({ spot: { ...MOUTH, lat: 40.43, lon: 29.0 }, points: [], from, hours: 1 });
    expect(empty[0]!.total).toBeNull();
    const d = drawLevrek(rng(3).normal);
    expect(Object.keys(d)).toHaveLength(43);
  });
  it('explain: main reason per spot; one spot → none', () => {
    const r = explainLevrek([ROCK, { ...PIER, lamp: true }, BEACH], [CALM_CLEAR, CALM_CLEAR, CALM_CLEAR]);
    expect(r.every((x) => x !== null && ['yapi', 'taban', 'lamba', 'maruziyet'].includes(x.key))).toBe(true);
    expect(explainLevrek([ROCK], [CALM_CLEAR])).toEqual([null]);
    expect(explainLevrek([{ ...ROCK, lamp: null }, { ...PIER, lamp: null }], [CALM_CLEAR, CALM_CLEAR])).toHaveLength(2);
  });
});

describe('levrek engine — remaining branches', () => {
  it('turbidity from rain only / wave only; missing 48 h wave max', () => {
    expect(levrekTerms(ROCK, { ...CALM_CLEAR, waveM: null, rain48: 6 }, LEVREK_DEFAULTS, false).turb).not.toBeNull();
    expect(levrekTerms(ROCK, { ...CALM_CLEAR, rain48: null, waveM: 0.5 }, LEVREK_DEFAULTS, false).turb).not.toBeNull();
    const { waveMax48: _w, ...noMax } = POST_STORM;
    expect(levrekTerms(ROCK, noMax as Weather, LEVREK_DEFAULTS, false).postStorm).toBe(false);
  });
  it('component texts over a whole day, data gaps, lamp and substrate sources', () => {
    const from = new Date('2027-01-20T00:00:00Z');
    const mk = (extra: object) => Array.from({ length: 100 }, (_, i) => ({ ts: new Date(from.getTime() + (i - 72) * 3_600_000).toISOString(), windSpeed: 8, cloud: 40, ...extra }));
    const full = scoreSeriesLevrek({ spot: { ...ROCK, lamp: null, lampSource: 'uzaktan', lampP: 0.4, lat: 40.43, lon: 29.0 }, points: mk({ precip: 0.3, waveH: 0.5, sst: 11, pressure: 1010 }), from, hours: 24 });
    const texts = full.map((h) => h.components.find((c) => c.key === 'diel')!.reason);
    expect(texts.some((t) => t.startsWith('gündüz')) && texts.some((t) => t.startsWith('alacakaranlık')) && texts.some((t) => t.startsWith('gece'))).toBe(true);
    expect(full[0]!.components.find((c) => c.key === 'lamba')!.source).toBe('uzaktan gözlem');
    expect(full[0]!.components.find((c) => c.key === 'su_degisim')!.reason).toMatch(/°C/);
    const gaps = scoreSeriesLevrek({ spot: { ...MOUTH, substrate: { eusm: null, conf: null }, lat: 40.43, lon: 29.0 }, points: mk({}), from, hours: 1 });
    const c = Object.fromEntries(gaps[0]!.components.map((x) => [x.key, x.reason]));
    expect([c.bulaniklik, c.dalga, c.su_degisim, c.basinc, c.taban]).toEqual(['veri yok', 'veri yok', 'veri yok', 'veri yok', 'bilinmiyor']);
    expect(c.dere).toMatch(/72 sa yağış/);
    const field = scoreSeriesLevrek({ spot: { ...PIER, lamp: true, substrate: { eusm: null, conf: null, field: ['kaya'] }, lat: 40.43, lon: 29.0 }, points: mk({}), from, hours: 1 });
    expect(field[0]!.components.find((x) => x.key === 'taban')!.reason).toBe('kaya');
    const hint = scoreSeriesLevrek({ spot: { ...PIER, lamp: false, substrate: { eusm: 'Rock', conf: 2, hint: 'cakil' }, lat: 40.43, lon: 29.0 }, points: mk({}), from, hours: 1 });
    expect(hint[0]!.components.find((x) => x.key === 'taban')!.reason).toBe('cakil');
    expect(hint[0]!.components.find((x) => x.key === 'lamba')!.source).toBe('saha');
    const eusm = scoreSeriesLevrek({ spot: { ...PIER, substrate: { eusm: 'Rock', conf: 2 }, lat: 40.43, lon: 29.0 }, points: mk({}), from, hours: 1 });
    expect(eusm[0]!.components.find((x) => x.key === 'taban')!.reason).toBe('Rock');
  });
  it('post-storm and cooling texts in a series', () => {
    const from = new Date('2027-01-20T18:00:00Z');
    const points = Array.from({ length: 80 }, (_, i) => ({
      ts: new Date(from.getTime() + (i - 72) * 3_600_000).toISOString(), windSpeed: 12, cloud: 70, precip: 0.3,
      waveH: i < 60 ? 1.8 : 0.6, sst: 13 - i * 0.03, pressure: 1010,
    }));
    const h = scoreSeriesLevrek({ spot: { ...ROCK, lat: 40.43, lon: 29.0 }, points, from, hours: 1 });
    const c = Object.fromEntries(h[0]!.components.map((x) => [x.key, x.reason]));
    expect(c.bulaniklik).toMatch(/fırtına ertesi yatışma/);
    expect(c.su_degisim).toMatch(/^−/);
  });
});
