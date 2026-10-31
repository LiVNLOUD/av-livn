// v2 hourly scoring of one spot: expected score, Monte Carlo 10–90 % band, per-component value + source +
// evidence, safety gate (cap, separate from the HSI). Pure; deterministic for a given seed.
import { indexSeries, safetyGate, view } from '../engine';
import type { HourlyPoint, SpeciesProfile } from '../types';
import { isNum } from '../util';
import { dayOfYear, skyAt } from './astro';
import { calibrate } from './calibrate';
import { KIND_SOURCE, lampPrior, rawScore, type DynamicTerms, type Source, type SpotV2, type Weather } from './model';
import { DEFAULTS, drawParams, rng, type Evidence } from './params';

export const MODEL_VERSION = 'v2.0';

export interface V2Component {
  key: string;
  label: string;
  group: 'statik' | 'dinamik';
  /** Weight inside HSI_s or HSI_d; null for terms used inside another term (depth → day arm, lamp → night arm). */
  weight: number | null;
  value: number | null;
  source: Source;
  evidence: Evidence | 'A/C';
  reason: string;
}

export interface V2Hour {
  ts: string;
  total: number | null;
  raw: number | null;
  p10: number | null;
  p90: number | null;
  gated: boolean;
  warnings: string[];
  /** Probability used for an unknown lamp (null when the lamp state is known). */
  lampP: number | null;
  /** Weight of the night arm (0 day … 1 night). */
  wNight: number;
  components: V2Component[];
}

const HOUR = 3_600_000;

/** Weather inputs of the v2 model at hour `at`, read from the hourly series (null where data is missing). */
export function weatherAt(points: ReturnType<typeof indexSeries>, at: Date, lat: number, lon: number): Weather {
  const v = view(points, at);
  const n = v.now;
  const num = (x: number | null | undefined) => (isNum(x) ? x : null);
  let rain = 0;
  let rainN = 0;
  for (let h = -47; h <= 0; h++) {
    const r = v.offset(h)?.precip;
    if (isNum(r)) {
      rain += r;
      rainN++;
    }
  }
  const sst = num(n?.sst);
  const sst48 = num(v.offset(-48)?.sst);
  const p = num(n?.pressure);
  const p3 = num(v.offset(-3)?.pressure);
  const normal = num(n?.sstNormal);
  return {
    ...skyAt(at, lat, lon),
    cloud: num(n?.cloud),
    windKmh: num(n?.windSpeed),
    gustKmh: num(n?.windGust),
    windDir: num(n?.windDir),
    waveM: num(n?.waveH),
    waveDir: num(n?.waveDir),
    rain48: rainN >= 24 ? (rain * 48) / rainN : null,
    sstD48: sst !== null && sst48 !== null ? sst - sst48 : null,
    sstDev: sst !== null && normal !== null ? sst - normal : null,
    pressD3: p !== null && p3 !== null ? p - p3 : null,
    currentMs: num(n?.curVel),
    doy: dayOfYear(at),
  };
}

const f2 = (x: number) => x.toFixed(2);

function mixed(dyn: DynamicTerms[], q: number | null, key: keyof DynamicTerms): number | null {
  const a = dyn[0]![key] as number | null;
  if (dyn.length === 1 || a === null) return a;
  return q! * a + (1 - q!) * (dyn[1]![key] as number);
}

function components(s: SpotV2, r: ReturnType<typeof rawScore>, w: Weather, sstSource: Source): V2Component[] {
  const { st, dyn, lampP } = r;
  const d0 = dyn[0]!;
  const lampTxt =
    s.lamp === true ? 'lamba var' : s.lamp === false ? 'lamba yok' : s.lampSource ? `lamba olasılığı ${f2(lampP!)}` : `lamba bilinmiyor (olasılık ${f2(lampP!)})`;
  const lampSrc: Source = s.lampSource ? KIND_SOURCE[s.lampSource] : s.lamp === null ? 'önsel' : 'saha';
  const lightTxt = w.sunAlt > 0 ? 'gündüz' : w.sunAlt >= -12 ? 'alacakaranlık' : 'gece';
  const fieldDepth = st.sources.depth === 'saha';
  return [
    { key: 'yapi', label: 'Yapı', group: 'statik', weight: DEFAULTS.w_struct, value: st.struct, source: st.sources.struct, evidence: 'C', reason: `${s.fieldStructure ?? s.kind}, ${Math.round(s.lengthM ?? 50)} m` },
    { key: 'taban', label: 'Taban', group: 'statik', weight: DEFAULTS.w_substrate, value: st.substrate, source: st.sources.substrate, evidence: 'C', reason: s.substrate.field?.join(', ') ?? s.substrate.hint ?? s.substrate.eusm ?? 'bilinmiyor' },
    { key: 'derinlik', label: 'Derinlik (atış mesafesi)', group: 'statik', weight: null, value: st.depth, source: st.sources.depth, evidence: 'C', reason: `${st.depthM.toFixed(1)} m${fieldDepth ? '' : ' (tahmini)'}; gündüz kolunu belirler` },
    { key: 'lamba', label: 'Lamba', group: 'statik', weight: null, value: s.lamp === null ? lampP : s.lamp ? 1 : 0, source: lampSrc, evidence: 'C', reason: lampTxt },
    { key: 'diel', label: 'Gece/gündüz ışığı', group: 'dinamik', weight: DEFAULTS.w_diel, value: mixed(dyn, lampP, 'diel'), source: 'astronomi', evidence: 'C', reason: `${lightTxt}, gece ağırlığı ${f2(d0.wNight)}, bulut ${w.cloud ?? '–'} %` },
    { key: 'mevsim', label: 'Mevsim', group: 'dinamik', weight: DEFAULTS.w_season, value: d0.season, source: 'önsel', evidence: 'A/C', reason: `yılın ${w.doy}. günü` },
    { key: 'ruzgar_dalga', label: 'Rüzgar × maruziyet', group: 'dinamik', weight: DEFAULTS.w_wind, value: d0.wind, source: 'Open-Meteo', evidence: 'C', reason: w.windKmh === null ? 'veri yok' : `${Math.round(w.windKmh)} km/sa, dalga ${w.waveM?.toFixed(1) ?? '–'} m` },
    { key: 'su_degisim', label: 'Su sıcaklığı değişimi (48 sa)', group: 'dinamik', weight: DEFAULTS.w_sst, value: d0.sst, source: sstSource, evidence: 'C', reason: w.sstD48 === null ? 'veri yok' : `${w.sstD48 >= 0 ? '+' : '−'}${Math.abs(w.sstD48).toFixed(1)} °C` },
    { key: 'su_sapma', label: 'Su sıcaklığı, kısa normalden sapma', group: 'dinamik', weight: DEFAULTS.w_sst_dev, value: d0.sstDev, source: 'Copernicus', evidence: 'C', reason: w.sstDev === null ? 'normal yok' : `${w.sstDev >= 0 ? '+' : '−'}${Math.abs(w.sstDev).toFixed(1)} °C (5 yıllık kısa normal)` },
    { key: 'bulaniklik', label: 'Bulanıklık (yağış + dalga)', group: 'dinamik', weight: DEFAULTS.w_turb, value: d0.turb, source: 'Open-Meteo', evidence: 'C', reason: w.rain48 === null ? 'veri yok' : `48 sa yağış ${w.rain48.toFixed(1)} mm` },
    { key: 'basinc', label: 'Basınç değişimi', group: 'dinamik', weight: DEFAULTS.w_press, value: d0.press, source: 'Open-Meteo', evidence: 'C', reason: w.pressD3 === null ? 'veri yok' : `${w.pressD3.toFixed(1)} hPa / 3 sa` },
    { key: 'akinti', label: 'Akıntı', group: 'dinamik', weight: DEFAULTS.w_current, value: d0.current, source: sstSource, evidence: 'C', reason: w.currentMs === null ? 'veri yok' : `${w.currentMs.toFixed(2)} m/s` },
  ];
}

export interface ScoreV2Args {
  spot: SpotV2 & { lat: number; lon: number };
  points: HourlyPoint[];
  from: Date;
  hours: number;
  profile: Pick<SpeciesProfile, 'safety'>;
  /** Monte Carlo draws for the band (0 = no band). */
  draws?: number;
  seed?: number;
}

export function scoreSeriesV2(a: ScoreV2Args): V2Hour[] {
  const index = indexSeries(a.points);
  const start = Math.floor(a.from.getTime() / HOUR) * HOUR;
  const times = Array.from({ length: a.hours }, (_, i) => new Date(start + i * HOUR));
  const weather = times.map((t) => weatherAt(index, t, a.spot.lat, a.spot.lon));
  const sstSource: Source = a.points.some((p) => p.sstSource === 'copernicus') ? 'Copernicus' : 'Open-Meteo';

  const draws = a.draws ?? 0;
  const samples: number[][] = times.map(() => []);
  if (draws > 0) {
    const r = rng(a.seed ?? 7);
    const q = a.spot.lamp === null ? lampPrior(a.spot) : null;
    for (let k = 0; k < draws; k++) {
      const p = drawParams(r.normal);
      const lamp = q === null ? undefined : r.uniform() < q;
      weather.forEach((w, i) => samples[i]!.push(calibrate(rawScore(a.spot, w, p, lamp).raw)));
    }
  }
  return times.map((t, i) => {
    const w = weather[i]!;
    const res = rawScore(a.spot, w, DEFAULTS);
    const warnings = safetyGate(index.get(Math.floor(t.getTime() / HOUR)), a.profile as SpeciesProfile);
    const gated = warnings.length > 0;
    const cap = (x: number) => (gated ? Math.min(x, a.profile.safety.cap) : x);
    let p10: number | null = null;
    let p90: number | null = null;
    if (draws > 0) {
      const s = samples[i]!.sort((x, y) => x - y);
      p10 = cap(s[Math.floor(0.1 * (s.length - 1))]!);
      p90 = cap(s[Math.ceil(0.9 * (s.length - 1))]!);
    }
    const noWeather = w.windKmh === null && w.cloud === null;
    return {
      ts: t.toISOString().slice(0, 13) + ':00Z',
      total: noWeather ? null : cap(calibrate(res.raw)),
      raw: noWeather ? null : Math.round(res.raw * 1e4) / 1e4,
      p10: noWeather ? null : p10,
      p90: noWeather ? null : p90,
      gated,
      warnings,
      lampP: res.lampP,
      wNight: Math.round(res.dyn[0]!.wNight * 1000) / 1000,
      components: components(a.spot, res, w, sstSource),
    };
  });
}

/** Rank (1 = best) of each spot's total at one hour; nulls rank last. Ties share the better rank. */
export function ranks(totals: (number | null)[]): number[] {
  return totals.map((t) => (t === null ? totals.length : 1 + totals.filter((u) => u !== null && u > t).length));
}
