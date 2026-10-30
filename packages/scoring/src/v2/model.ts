// v2 Habitat Suitability Index (docs/MODEL.md). Pure functions: no I/O, no clock.
// raw = HSI_s · HSI_d with HSI = weighted geometric mean of components in [0.05, 1]; the 0–100 score is the
// documented log-linear calibration of raw (calibrate.ts).
import type { Params } from './params';

export const FLOOR = 0.05;

export type Source = 'saha' | 'Copernicus' | 'EUSeaMap' | 'DTM-interpolasyon' | 'DTM-ölçüm' | 'yapı-uzunluğu-tahmini' | 'önsel' | 'OSM' | 'Open-Meteo' | 'astronomi';

export type StructureKind = 'pier' | 'breakwater' | 'groyne' | 'manual';
export type FieldStructure = 'iskele' | 'mendirek' | 'dogal_kaya';
export type FieldSubstrate = 'kum' | 'cakil' | 'kaya' | 'midyeli' | 'yosunlu' | 'camur';

export interface FieldDepth {
  distance_m: number;
  depth_m: number;
  /** plumb (kurşunla dikine), sink_cal (batma süresi, aynı merada dikine ölçümle kalibre), sink (kalibresiz). */
  quality?: 'plumb' | 'sink_cal' | 'sink';
}

/** Weight of field depths against the prior: plumb 0.95, calibrated sink time 0.9, uncalibrated sink time 0.7. */
export function fieldWeight(pairs: FieldDepth[]): number {
  if (pairs.some((d) => (d.quality ?? 'plumb') === 'plumb')) return 0.95;
  return pairs.some((d) => d.quality === 'sink_cal') ? 0.9 : 0.7;
}

/** Static description of a spot as the v2 model sees it. */
export interface SpotV2 {
  kind: StructureKind;
  /** Passenger/ferry pier (lamp prior 0.85, depth prior ≥ 5 m). */
  ferry: boolean;
  lengthM: number | null;
  /** DTM mean depth (m, positive down) in the 0–50 m and 50–150 m bands from the tip. */
  dtm: { d0_50: number | null; d50_150: number | null; interpolated: boolean };
  /** Field-measured (or sink-time converted) depth pairs along the cast; overrides the DTM. */
  fieldDepths?: FieldDepth[] | null;
  substrate: { eusm: string | null; conf: number | null; field?: FieldSubstrate[] | null; hint?: FieldSubstrate | null };
  fieldStructure?: FieldStructure | null;
  /** 16-direction fetch (km), 0°, 22.5°, … */
  fetchKm: number[] | null;
  /** true / false from the field; null = unknown (probability mixture). */
  lamp: boolean | null;
}

export interface Weather {
  sunAlt: number;
  moonAlt: number;
  moonFrac: number;
  cloud: number | null;
  windKmh: number | null;
  gustKmh: number | null;
  windDir: number | null;
  waveM: number | null;
  waveDir: number | null;
  rain48: number | null;
  sstD48: number | null;
  /** Deviation from the short-term normal (°C), null when no normal exists. */
  sstDev: number | null;
  pressD3: number | null;
  currentMs: number | null;
  doy: number;
}

export const clip = (x: number) => Math.min(1, Math.max(FLOOR, x));
export const sig = (x: number) => 1 / (1 + Math.exp(-x));

export function geo(parts: [number, number][]): number {
  let s = 0;
  let w = 0;
  for (const [c, wt] of parts) {
    s += wt * Math.log(clip(c));
    w += wt;
  }
  return Math.exp(s / w);
}

const SUBSTRATE_EUSM: Record<string, number> = { 'Fine mud': 0.7, 'Sandy mud': 0.75, 'Muddy sand': 0.8, Sand: 0.8, 'Coarse substrate': 0.9, Rock: 0.95 };
const SUBSTRATE_FIELD: Record<FieldSubstrate, number> = { camur: 0.7, kum: 0.8, cakil: 0.85, yosunlu: 0.9, kaya: 0.95, midyeli: 0.95 };
export const SUBSTRATE_PRIOR = 0.75;
const CONF_WEIGHT = [0.2, 0.4, 0.6, 0.8];
export const LAMP_PRIOR = { ferry: 0.85, pier: 0.5, breakwater: 0.3, groyne: 0.3, manual: 0.5 } as const;

export function lampPrior(s: SpotV2): number {
  return s.ferry ? LAMP_PRIOR.ferry : LAMP_PRIOR[s.kind];
}

export function depthPrior(s: SpotV2): number {
  const L = s.lengthM ?? 50;
  const d = s.kind === 'breakwater' ? 2 + 4 * (1 - Math.exp(-L / 400)) : 1 + 4 * (1 - Math.exp(-L / 250));
  return s.ferry ? Math.max(d, 5) : d;
}

/** Mean of the linearly interpolated field profile over [a, b] m (held flat beyond the measured range). */
export function fieldBand(pairs: FieldDepth[], a: number, b: number): number {
  const pts = [...pairs].sort((x, y) => x.distance_m - y.distance_m);
  const at = (x: number) => {
    if (x <= pts[0]!.distance_m) return pts[0]!.depth_m;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1]!;
      const q = pts[i]!;
      if (x <= q.distance_m) return p.depth_m + ((q.depth_m - p.depth_m) * (x - p.distance_m)) / (q.distance_m - p.distance_m);
    }
    return pts[pts.length - 1]!.depth_m;
  };
  let sum = 0;
  for (let i = 0; i <= 10; i++) sum += at(a + ((b - a) * i) / 10);
  return sum / 11;
}

export interface StaticTerms {
  struct: number;
  substrate: number;
  depth: number;
  depthM: number;
  hsiS: number;
  sources: { struct: Source; substrate: Source; depth: Source };
}

export function staticTerms(s: SpotV2, p: Params): StaticTerms {
  const fs = s.fieldStructure;
  const base = fs === 'mendirek' || (!fs && s.kind === 'breakwater') ? p.struct_breakwater : fs === 'dogal_kaya' ? p.struct_rock : p.struct_pier;
  const L = s.lengthM ?? 50;
  const struct = base * (0.4 + 0.6 * (1 - Math.exp(-L / 1000 / p.struct_len_km)));

  let depthM: number;
  let depthSrc: Source;
  if (s.fieldDepths && s.fieldDepths.length > 0) {
    // Field pairs dominate; the prior share keeps a single bad entry from saturating the term.
    const prior = depthPrior(s);
    const fw = fieldWeight(s.fieldDepths);
    depthM = fw * (0.4 * fieldBand(s.fieldDepths, 0, 50) + 0.6 * fieldBand(s.fieldDepths, 50, 150)) + (1 - fw) * prior;
    depthSrc = 'saha';
  } else {
    const prior = depthPrior(s);
    const w = s.dtm.interpolated ? p.dtm_weight_interp : 0.9;
    const est = (d: number | null) => (d === null || Number.isNaN(d) ? prior : w * d + (1 - w) * prior);
    depthM = 0.4 * est(s.dtm.d0_50) + 0.6 * est(s.dtm.d50_150);
    const hasDtm = s.dtm.d0_50 !== null || s.dtm.d50_150 !== null;
    depthSrc = !hasDtm || s.dtm.interpolated ? 'yapı-uzunluğu-tahmini' : 'DTM-ölçüm';
  }
  const depth = FLOOR + (1 - FLOOR) * sig((depthM - p.depth_mid) / p.depth_slope);

  let substrate: number;
  let subSrc: Source;
  if (s.substrate.field && s.substrate.field.length > 0) {
    substrate = 0.9 * Math.max(...s.substrate.field.map((k) => SUBSTRATE_FIELD[k])) + 0.1 * SUBSTRATE_PRIOR;
    subSrc = 'saha';
  } else if (s.substrate.hint) {
    substrate = 0.4 * SUBSTRATE_FIELD[s.substrate.hint] + 0.6 * SUBSTRATE_PRIOR;
    subSrc = 'saha';
  } else if (s.substrate.eusm) {
    const cw = CONF_WEIGHT[Math.min(3, Math.max(0, s.substrate.conf ?? 0))]!;
    substrate = cw * (SUBSTRATE_EUSM[s.substrate.eusm] ?? SUBSTRATE_PRIOR) + (1 - cw) * SUBSTRATE_PRIOR;
    subSrc = 'EUSeaMap';
  } else {
    substrate = SUBSTRATE_PRIOR;
    subSrc = 'önsel';
  }
  return {
    struct,
    substrate,
    depth,
    depthM,
    hsiS: geo([
      [struct, p.w_struct],
      [substrate, p.w_substrate],
    ]),
    sources: { struct: fs ? 'saha' : 'OSM', substrate: subSrc, depth: depthSrc },
  };
}

/** log10 illuminance at the surface: daylight ∝ sin(altitude), smooth twilight, moon, starlight; cloud per Kasten & Czeplak. */
export function ambientLogLux(sunAlt: number, moonAlt: number, moonFrac: number, cloudPct: number | null): number {
  const twilight = 10 ** (-3 + 6.3 * sig((sunAlt + 3) / 2.2));
  const sun = Math.max(1.3e5 * Math.sin((Math.min(90, Math.max(0, sunAlt)) * Math.PI) / 180), twilight);
  const moon = 0.25 * moonFrac * Math.max(0, Math.sin((moonAlt * Math.PI) / 180));
  const att = 1 - 0.75 * (Math.min(100, Math.max(0, cloudPct ?? 0)) / 100) ** 3.4;
  return Math.log10((sun + moon) * att + 1e-3);
}

function circGauss(doy: number, c: number, w: number): number {
  const d = Math.abs(doy - c) % 365;
  const m = Math.min(d, 365 - d);
  return Math.exp(-0.5 * (m / w) ** 2);
}

export function season(doy: number, p: Params): number {
  return clip(p.season_base + p.season_spawn_amp * circGauss(doy, p.season_spawn_doy, p.season_spawn_w) + p.season_autumn_amp * circGauss(doy, p.season_autumn_doy, p.season_autumn_w));
}

/** Exposure fraction F/(F + F₀) for wind/wave coming FROM `dirFrom`; no rose → 0.5 (unknown). */
export function exposure(fetchKm: number[] | null, dirFrom: number, p: Params): number {
  if (!fetchKm || fetchKm.length !== 16) return 0.5;
  const f = fetchKm[((Math.round(dirFrom / 22.5) % 16) + 16) % 16]!;
  return f / (f + p.fetch_ref_km);
}

export interface DynamicTerms {
  diel: number;
  season: number;
  wind: number | null;
  turb: number | null;
  sst: number | null;
  sstDev: number | null;
  press: number | null;
  current: number | null;
  wNight: number;
  logE: number;
  hsiD: number;
}

export function dynamicTerms(s: SpotV2, st: StaticTerms, w: Weather, p: Params, lamp: boolean): DynamicTerms {
  const logE = ambientLogLux(w.sunAlt, w.moonAlt, w.moonFrac, w.cloud);
  const wNight = sig(-(logE - p.night_theta) / p.night_slope);
  const armN = lamp
    ? p.dark_base + (1 - p.dark_base) * sig((Math.log10(p.lamp_lux) - logE - p.contrast_mid) / p.contrast_slope)
    : p.dark_base + p.moon_gain * Math.min(1, Math.max(0, (logE + 3) / 3));
  // Day arm: depth reachability, sharpened under bright light (sun high, clear sky) where fish sit deeper.
  const bright = Math.min(1, Math.max(0, (logE - 3) / 2.2));
  const armD = st.depth ** (1 + p.bright_k * bright);
  const mix = wNight * armN + (1 - wNight) * armD;
  const tw = Math.exp(-0.5 * ((w.sunAlt - p.twilight_centre) / p.twilight_width) ** 2);
  const diel = clip(mix + p.twilight_gain * tw * (1 - mix));

  let wind: number | null = null;
  let hs = 0;
  if (w.waveM !== null) hs = w.waveM * exposure(s.fetchKm, w.waveDir ?? w.windDir ?? 0, p);
  if (w.windKmh !== null) {
    const u = Math.max(w.windKmh, 0.7 * (w.gustKmh ?? 0));
    const x = (u / p.wind_ref_kmh) ** 2 * exposure(s.fetchKm, w.windDir ?? 0, p) + (hs / p.wave_ref_m) ** 2;
    wind = clip(1 / (1 + x * x));
  }
  const turb = w.rain48 === null && w.waveM === null ? null : clip(1 - p.turb_max_loss * (1 - Math.exp(-((w.rain48 ?? 0) / p.turb_rain_mm + hs / p.turb_wave_m))));
  const sst = w.sstD48 === null ? null : clip(Math.exp(-0.5 * (Math.min(0, w.sstD48 + p.sst_drop_tol) / p.sst_drop_scale) ** 2));
  const sstDev = w.sstDev === null ? null : clip(Math.exp(-0.5 * (w.sstDev / p.sst_dev_scale) ** 2));
  const press = w.pressD3 === null ? null : clip(1 - p.press_loss * sig(Math.abs(w.pressD3) - p.press_rate));
  const current = w.currentMs === null ? null : clip(0.7 + 0.3 * sig((w.currentMs - 0.05) / 0.03));
  const seas = season(w.doy, p);
  const parts: [number, number][] = [
    [diel, p.w_diel],
    [seas, p.w_season],
  ];
  for (const [c, wt] of [
    [wind, p.w_wind],
    [sst, p.w_sst],
    [sstDev, p.w_sst_dev],
    [turb, p.w_turb],
    [press, p.w_press],
    [current, p.w_current],
  ] as [number | null, number][])
    if (c !== null) parts.push([c, wt]);
  return { diel, season: seas, wind, turb, sst, sstDev, press, current, wNight, logE, hsiD: geo(parts) };
}

export interface RawResult {
  /** Expected raw HSI product in (0, 1]; unknown lamp → probability-weighted mixture. */
  raw: number;
  st: StaticTerms;
  /** Terms of the lamp scenario(s): [yes] or [no] for a known lamp, [yes, no] for unknown. */
  dyn: DynamicTerms[];
  lampP: number | null;
}

/** Expected raw HSI. A fixed `lampDraw` selects one lamp scenario (Monte Carlo); otherwise unknown → mixture. */
export function rawScore(s: SpotV2, w: Weather, p: Params, lampDraw?: boolean): RawResult {
  const st = staticTerms(s, p);
  const lamp = s.lamp ?? lampDraw;
  if (lamp !== undefined) {
    const d = dynamicTerms(s, st, w, p, lamp);
    return { raw: st.hsiS * d.hsiD, st, dyn: [d], lampP: null };
  }
  const q = lampPrior(s);
  const yes = dynamicTerms(s, st, w, p, true);
  const no = dynamicTerms(s, st, w, p, false);
  return { raw: st.hsiS * (q * yes.hsiD + (1 - q) * no.hsiD), st, dyn: [yes, no], lampP: q };
}
