import { describe, expect, it } from 'vitest';
import { dayOfYear, indexSeries, ranks, scoreSeriesV2, skyAt, weatherAt, type HourlyPoint, type SpotV2 } from '../../src';
import { BASE } from './fixtures';

const SAFETY = { safety: { gust_kmh_max: 40, wave_m_max: 1.2, cap: 30 } };
const FROM = new Date('2026-10-30T12:00:00Z');
const SPOT = { ...BASE, lat: 40.4857, lon: 28.8773 };

function series(n: number, f: (i: number) => Partial<HourlyPoint> = () => ({})): HourlyPoint[] {
  return Array.from({ length: n }, (_, i) => ({
    ts: new Date(FROM.getTime() + (i - 60) * 3_600_000).toISOString(),
    windSpeed: 8, windGust: 12, windDir: 30, cloud: 40, precip: i === 30 ? 6 : 0, pressure: 1015 + i * 0.05,
    waveH: 0.2, waveDir: 40, sst: 17 + i * 0.01, curVel: 0.1, ...f(i),
  }));
}

describe('scoreSeriesV2', () => {
  it('scores hours with a Monte Carlo band, sources and evidence for every component', () => {
    const out = scoreSeriesV2({ spot: SPOT, points: series(140), from: FROM, hours: 24, profile: SAFETY, draws: 60 });
    expect(out).toHaveLength(24);
    const h = out[0]!;
    expect(h.ts).toBe('2026-10-30T12:00Z');
    expect(h.total).not.toBeNull();
    expect(h.p10!).toBeLessThanOrEqual(h.total! + 1e-9);
    expect(h.p90!).toBeGreaterThanOrEqual(h.total! - 1e-9);
    expect(h.lampP).toBe(0.5);
    const keys = h.components.map((c) => c.key);
    expect(keys).toEqual(['yapi', 'taban', 'derinlik', 'lamba', 'diel', 'mevsim', 'ruzgar_dalga', 'su_degisim', 'su_sapma', 'bulaniklik', 'basinc', 'akinti']);
    expect(h.components.find((c) => c.key === 'derinlik')!.source).toBe('yapı-uzunluğu-tahmini');
    expect(h.components.find((c) => c.key === 'taban')!.source).toBe('EUSeaMap');
    expect(h.components.find((c) => c.key === 'su_degisim')!.source).toBe('Open-Meteo');
    expect(h.components.find((c) => c.key === 'su_sapma')!.reason).toBe('normal yok');
    expect(h.components.find((c) => c.key === 'mevsim')!.evidence).toBe('A/C');
    // day and night hours both appear; night arm weight follows the sun
    expect(Math.min(...out.map((o) => o.wNight))).toBeLessThan(0.05);
    expect(Math.max(...out.map((o) => o.wNight))).toBeGreaterThan(0.95);
    const reasons = out.flatMap((o) => o.components.filter((c) => c.key === 'diel').map((c) => c.reason.split(',')[0]));
    expect(new Set(reasons)).toEqual(new Set(['gündüz', 'alacakaranlık', 'gece']));
    // deterministic
    expect(scoreSeriesV2({ spot: SPOT, points: series(140), from: FROM, hours: 2, profile: SAFETY, draws: 20, seed: 5 })).toEqual(
      scoreSeriesV2({ spot: SPOT, points: series(140), from: FROM, hours: 2, profile: SAFETY, draws: 20, seed: 5 }),
    );
  });

  it('unknown lamp widens the band relative to a known lamp', () => {
    const night = new Date('2026-10-30T17:00:00Z'); // dark, moon below the horizon: the two lamp scenarios differ most
    const w = (lamp: boolean | null) => {
      const [h] = scoreSeriesV2({ spot: { ...SPOT, lamp }, points: series(160), from: night, hours: 1, profile: SAFETY, draws: 200 });
      return h!.p90! - h!.p10!;
    };
    expect(w(null)).toBeGreaterThan(w(true));
    expect(w(null)).toBeGreaterThan(w(false));
  });

  it('caps gated hours and the band; no band without draws', () => {
    const [h] = scoreSeriesV2({ spot: { ...SPOT, lamp: true }, points: series(140, () => ({ windGust: 60, waveH: 2 })), from: FROM, hours: 1, profile: SAFETY, draws: 10 });
    expect(h!.gated).toBe(true);
    expect(h!.total!).toBeLessThanOrEqual(30);
    expect(h!.p90!).toBeLessThanOrEqual(30);
    expect(h!.warnings.length).toBe(2);
    const [n] = scoreSeriesV2({ spot: SPOT, points: series(140), from: FROM, hours: 1, profile: SAFETY });
    expect([n!.p10, n!.p90]).toEqual([null, null]);
  });

  it('reports missing data, Copernicus source, normals and field sources', () => {
    const spot: SpotV2 & { lat: number; lon: number } = {
      ...SPOT, lamp: false, lengthM: null, fieldStructure: 'mendirek', fieldDepths: [{ distance_m: 30, depth_m: 5 }],
      substrate: { eusm: null, conf: null, hint: 'yosunlu' },
    };
    const pts = series(140, (i) => ({ sstSource: 'copernicus', sstNormal: 18, sst: i > 100 ? 14 : 19 }));
    const [h] = scoreSeriesV2({ spot, points: pts, from: new Date(FROM.getTime() + 50 * 3_600_000), hours: 1, profile: SAFETY });
    const c = Object.fromEntries(h!.components.map((x) => [x.key, x]));
    expect(c.su_degisim!.source).toBe('Copernicus');
    expect(c.su_degisim!.reason).toBe('−5.0 °C');
    expect(c.su_sapma!.reason).toBe('−4.0 °C (5 yıllık kısa normal)');
    expect(c.derinlik!.source).toBe('saha');
    expect(c.derinlik!.reason).not.toContain('tahmini');
    expect(c.yapi!.reason).toBe('mendirek, 50 m');
    expect(c.taban!.reason).toBe('yosunlu');
    expect(c.lamba!.reason).toBe('lamba yok');
    expect(c.lamba!.source).toBe('saha');
    const warm = series(140, (i) => ({ sstNormal: 15, sst: 16 + i * 0.02 }));
    const [w] = scoreSeriesV2({ spot: { ...spot, lamp: true, substrate: { eusm: null, conf: null, field: ['kaya'] } }, points: warm, from: FROM, hours: 1, profile: SAFETY });
    const cw = Object.fromEntries(w!.components.map((x) => [x.key, x]));
    expect(cw.su_degisim!.reason.startsWith('+')).toBe(true);
    expect(cw.su_sapma!.reason.startsWith('+')).toBe(true);
    expect(cw.lamba!.reason).toBe('lamba var');
    expect(cw.taban!.reason).toBe('kaya');

    const sparse = [{ ts: FROM.toISOString(), cloud: 50 }];
    const [m] = scoreSeriesV2({ spot: { ...SPOT, substrate: { eusm: null, conf: null } }, points: sparse, from: FROM, hours: 1, profile: SAFETY });
    const cm = Object.fromEntries(m!.components.map((x) => [x.key, x]));
    for (const k of ['ruzgar_dalga', 'su_degisim', 'bulaniklik', 'basinc', 'akinti']) expect(cm[k]!.reason).toBe('veri yok');
    expect(cm.ruzgar_dalga!.value).toBeNull();
    expect(cm.taban!.reason).toBe('bilinmiyor');
    expect(m!.total).not.toBeNull();
    const [e] = scoreSeriesV2({ spot: SPOT, points: [], from: FROM, hours: 1, profile: SAFETY, draws: 3 });
    expect([e!.total, e!.raw, e!.p10, e!.p90]).toEqual([null, null, null, null]);
    const wave = series(140, () => ({ waveH: null }));
    const [x] = scoreSeriesV2({ spot: SPOT, points: wave, from: FROM, hours: 1, profile: SAFETY });
    expect(x!.components.find((q) => q.key === 'ruzgar_dalga')!.reason).toBe('8 km/sa, dalga – m');
  });

  it('weatherAt needs ≥ 24 h of rain history and scales a partial window to 48 h', () => {
    const idx = indexSeries(series(140).filter((_, i) => i % 2 === 0));
    const w = weatherAt(idx, new Date(FROM.getTime()), 40.4, 28.9);
    expect(w.rain48).not.toBeNull();
    const thin = indexSeries(series(140).filter((_, i) => i % 3 === 0));
    expect(weatherAt(thin, FROM, 40.4, 28.9).rain48).toBeNull();
  });
});

describe('ranks and astronomy helpers', () => {
  it('ranks best first, shares ties, nulls last', () => {
    expect(ranks([50, 70, null, 70, 10])).toEqual([3, 1, 5, 1, 4]);
  });

  it('sun/moon at a known time and cache turnover', () => {
    const s = skyAt(new Date('2026-06-21T10:00:00Z'), 40.4, 28.9);
    expect(s.sunAlt).toBeGreaterThan(70);
    for (let i = 0; i < 8300; i++) skyAt(new Date(Date.UTC(2026, 0, 1) + i * 60_000), 40.4, 28.9);
    expect(skyAt(new Date('2026-06-21T10:00:00Z'), 40.4, 28.9)).toEqual(s);
    expect(dayOfYear(new Date('2026-01-01T05:00:00Z'))).toBe(1);
    expect(dayOfYear(new Date('2026-12-31T23:00:00Z'))).toBe(365);
  });
});
