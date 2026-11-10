// H3: levrek (Dicentrarchus labrax) v1 — the istavrit HSI skeleton with species parameters (docs/species/levrek/
// MODEL.md, sources L1–L22 in docs/species/levrek/RESEARCH.md). Pure and deterministic like the istavrit engine.
// Differences: turbidity helps (moderate optimum) with a post-storm bonus, a surf-line wave optimum, a winter season
// peak, rain at river mouths; the pier's existing lighting has a MEDIUM effect (fish hunt bait fish on the
// light–shadow edge; C). md. 8/8: "light" is only the existing lighting, never a suggestion to bring one.
import { missingMask } from './data';
import { indexSeries, safetyGate } from '../engine';
import { getProfile } from '../profiles';
import type { HourlyPoint, SpeciesProfile } from '../types';
import { ambientLogLux, clip, exposure, geo, KIND_SOURCE, lampPrior, sig, staticTerms, type Source, type SpotV2, type StructureKind, type Weather } from './model';
import { DEFAULTS, rng, SIGMA, type Evidence, type ParamDef } from './params';
import { weatherAt, type ScoreV2Args, type V2Component, type V2Hour } from './score';

export const LEVREK_VERSION = 'levrek-v1.0';

export const LEVREK_PARAMS = {
  // static: structure type preference (C unless noted), substrate reuses the istavrit substrate term
  l_struct_rocky: { value: 0.85, unit: '-', evidence: 'C', ref: 'L1 (yön A)' },
  l_struct_river: { value: 0.85, unit: '-', evidence: 'C', ref: 'L5, L8, L13 (yön B)' },
  l_struct_breakwater: { value: 0.75, unit: '-', evidence: 'C', ref: '—' },
  l_struct_groyne: { value: 0.7, unit: '-', evidence: 'C', ref: '—' },
  l_struct_promenade: { value: 0.65, unit: '-', evidence: 'C', ref: 'H6' },
  l_struct_beach: { value: 0.6, unit: '-', evidence: 'C', ref: '—' },
  l_struct_pier: { value: 0.55, unit: '-', evidence: 'C', ref: '—' },
  l_struct_quay: { value: 0.5, unit: '-', evidence: 'C', ref: '—' },
  l_struct_harbour: { value: 0.45, unit: '-', evidence: 'C', ref: '—' },
  l_w_struct: { value: 0.7, unit: '-', evidence: 'C', ref: '' },
  l_w_substrate: { value: 0.3, unit: '-', evidence: 'C', ref: '' },
  // dynamic weights
  l_w_diel: { value: 0.25, unit: '-', evidence: 'C', ref: 'L20' },
  l_w_season: { value: 0.2, unit: '-', evidence: 'C', ref: '' },
  l_w_turb: { value: 0.2, unit: '-', evidence: 'C', ref: '' },
  l_w_wave: { value: 0.15, unit: '-', evidence: 'C', ref: '' },
  l_w_sst: { value: 0.1, unit: '-', evidence: 'C', ref: '' },
  l_w_river: { value: 0.05, unit: '-', evidence: 'C', ref: 'L13' },
  l_w_press: { value: 0.05, unit: '-', evidence: 'C', ref: '' },
  // diel: day floor, night plateau, twilight lift; lamp MEDIUM (C)
  l_day_floor: { value: 0.3, unit: '-', evidence: 'C', ref: 'L20' },
  l_night: { value: 0.7, unit: '-', evidence: 'C', ref: '' },
  l_lamp_gain: { value: 0.15, unit: '-', evidence: 'C', ref: 'balıkçı bilgisi (ışık–gölge sınırı)' },
  l_twilight_centre: { value: -3, unit: '°', evidence: 'C', ref: '', additive: true },
  l_twilight_width: { value: 4, unit: '°', evidence: 'C', ref: '' },
  l_twilight_gain: { value: 0.6, unit: '-', evidence: 'C', ref: '' },
  // season: winter (spawning) peak, autumn feeding, base for the resident part
  l_season_base: { value: 0.35, unit: '-', evidence: 'C', ref: 'L2, L4' },
  l_winter_doy: { value: 20, unit: 'gün', evidence: 'B', ref: 'L22, L2, L3, L5', additive: true, basis: 'literatur' },
  l_winter_w: { value: 45, unit: 'gün', evidence: 'B', ref: 'L22', basis: 'literatur' },
  l_winter_amp: { value: 0.6, unit: '-', evidence: 'C', ref: '' },
  l_autumn_doy: { value: 300, unit: 'gün', evidence: 'C', ref: '', additive: true },
  l_autumn_w: { value: 30, unit: 'gün', evidence: 'C', ref: '' },
  l_autumn_amp: { value: 0.35, unit: '-', evidence: 'C', ref: '' },
  // turbidity proxy T = 0.6·min(1, rain48/15) + 0.4·min(1, wave/1.5): moderate optimum, post-storm bonus
  l_turb_opt: { value: 0.45, unit: '-', evidence: 'C', ref: '' },
  l_turb_w: { value: 0.28, unit: '-', evidence: 'C', ref: '' },
  l_turb_floor: { value: 0.45, unit: '-', evidence: 'C', ref: '' },
  l_storm_m: { value: 1.0, unit: 'm', evidence: 'C', ref: '' },
  l_settle: { value: 0.7, unit: '-', evidence: 'C', ref: '' },
  l_post_storm: { value: 1.25, unit: '-', evidence: 'C', ref: '' },
  // surf line: wave height at the spot (× exposure) with an optimum
  l_wave_opt: { value: 0.6, unit: 'm', evidence: 'C', ref: '' },
  l_wave_w: { value: 0.5, unit: 'm', evidence: 'C', ref: '' },
  // temperature: 48 h drop and absolute floor
  l_sst_drop_tol: { value: 1.0, unit: '°C/48 sa', evidence: 'C', ref: '' },
  l_sst_drop_scale: { value: 1.5, unit: '°C/48 sa', evidence: 'C', ref: '' },
  l_sst_floor: { value: 9, unit: '°C', evidence: 'B', ref: 'L22', additive: true, basis: 'literatur' },
  l_river_mm: { value: 20, unit: 'mm/72 sa', evidence: 'C', ref: 'L13' },
} satisfies Record<string, ParamDef>;

export type LevrekKey = keyof typeof LEVREK_PARAMS;
export type LevrekParams = Record<LevrekKey, number>;
export const LEVREK_DEFAULTS = Object.fromEntries(Object.entries(LEVREK_PARAMS).map(([k, d]) => [k, d.value])) as LevrekParams;

/** One Monte Carlo draw of the levrek parameters (σ by evidence level, as for istavrit). */
export function drawLevrek(normal: () => number): LevrekParams {
  const out = {} as LevrekParams;
  for (const [k, d] of Object.entries(LEVREK_PARAMS) as [LevrekKey, ParamDef][]) {
    const s = SIGMA[d.evidence];
    out[k] = d.additive ? d.value + normal() * s * (d.unit === 'gün' ? 20 : 2) : d.value * Math.exp(normal() * s);
  }
  return out;
}

const STRUCT_KEY: Record<StructureKind, LevrekKey> = {
  rocky: 'l_struct_rocky', river_mouth: 'l_struct_river', breakwater: 'l_struct_breakwater', groyne: 'l_struct_groyne', promenade: 'l_struct_promenade',
  beach: 'l_struct_beach', pier: 'l_struct_pier', quay: 'l_struct_quay', harbour: 'l_struct_harbour', manual: 'l_struct_pier',
};

const G = (x: number, c: number, w: number) => Math.exp(-0.5 * ((x - c) / w) ** 2);
const circ = (doy: number, c: number, w: number) => {
  const d = Math.min(Math.abs(doy - c), 365 - Math.abs(doy - c));
  return Math.exp(-0.5 * (d / w) ** 2);
};

export interface LevrekTerms {
  struct: number;
  substrate: number;
  diel: number;
  season: number;
  turb: number | null;
  wave: number | null;
  sst: number | null;
  river: number;
  press: number | null;
  wNight: number;
  postStorm: boolean;
  hsiS: number;
  hsiD: number;
}

export type LevrekOverrides = Partial<Pick<LevrekTerms, 'struct' | 'substrate'>>;

/** Terms for one lamp scenario. Mean fetch exposure (onshore wave direction when known). */
export function levrekTerms(s: SpotV2, w: Weather, p: LevrekParams, lamp: boolean, ov?: LevrekOverrides): LevrekTerms {
  const fs = s.fieldStructure;
  const kind: StructureKind = fs === 'mendirek' ? 'breakwater' : fs === 'dogal_kaya' ? 'rocky' : s.kind;
  const struct = ov?.struct ?? p[STRUCT_KEY[kind]];
  const substrate = ov?.substrate ?? staticTerms(s, DEFAULTS).substrate;
  const hsiS = geo([
    [struct, p.l_w_struct],
    [substrate, p.l_w_substrate],
  ]);

  const logE = ambientLogLux(w.sunAlt, w.moonAlt, w.moonFrac, w.cloud);
  const wNight = sig(-(logE - DEFAULTS.night_theta) / DEFAULTS.night_slope);
  const night = Math.min(1, p.l_night + (lamp ? p.l_lamp_gain : 0));
  const mix = wNight * night + (1 - wNight) * p.l_day_floor;
  const diel = clip(mix + p.l_twilight_gain * G(w.sunAlt, p.l_twilight_centre, p.l_twilight_width) * (1 - mix));

  const season = clip(p.l_season_base + p.l_winter_amp * circ(w.doy, p.l_winter_doy, p.l_winter_w) + p.l_autumn_amp * circ(w.doy, p.l_autumn_doy, p.l_autumn_w));

  const exp = exposure(s.fetchKm, w.waveDir ?? w.windDir ?? 0, DEFAULTS);
  let turb: number | null = null;
  let postStorm = false;
  if (w.rain48 !== null || w.waveM !== null) {
    const T = 0.6 * Math.min(1, (w.rain48 ?? 0) / 15) + 0.4 * Math.min(1, (w.waveM ?? 0) / 1.5);
    turb = clip(p.l_turb_floor + (1 - p.l_turb_floor) * G(T, p.l_turb_opt, p.l_turb_w));
    const wmax = w.waveMax48 ?? null;
    if (wmax !== null && w.waveM !== null && wmax >= p.l_storm_m && w.waveM <= p.l_settle * wmax) {
      postStorm = true;
      turb = clip(turb * p.l_post_storm);
    }
  }
  const wave = w.waveM === null ? null : clip(0.35 + 0.65 * G(w.waveM * exp * 2, p.l_wave_opt, p.l_wave_w));
  let sst: number | null = null;
  if (w.sstD48 !== null) {
    const drop = Math.max(0, -w.sstD48);
    sst = clip(1 - 0.6 * sig(((drop - p.l_sst_drop_tol) * 3) / p.l_sst_drop_scale));
  }
  const river = kind === 'river_mouth' ? clip(0.5 + 0.5 * Math.min(1, (w.rain72 ?? 0) / p.l_river_mm)) : 0.6;
  const press = w.pressD3 === null ? null : clip(1 - DEFAULTS.press_loss * sig(Math.abs(w.pressD3) - DEFAULTS.press_rate));

  const parts: [number, number][] = [
    [diel, p.l_w_diel],
    [season, p.l_w_season],
    [river, p.l_w_river],
  ];
  for (const [c, wt] of [
    [turb, p.l_w_turb],
    [wave, p.l_w_wave],
    [sst, p.l_w_sst],
    [press, p.l_w_press],
  ] as [number | null, number][])
    if (c !== null) parts.push([c, wt]);
  return { struct, substrate, diel, season, turb, wave, sst, river, press, wNight, postStorm, hsiS, hsiD: geo(parts) };
}

/** SST floor (< 9 °C) as a multiplier on the raw score (L22: spawning above 9 °C). */
const coldFactor = (sst: number | null | undefined, p: LevrekParams) => (sst !== null && sst !== undefined && sst < p.l_sst_floor ? 0.85 : 1);

export interface LevrekRaw {
  raw: number;
  terms: LevrekTerms[];
  lampP: number | null;
}

/** Expected raw HSI; unknown lamp → probability mixture, as for istavrit. */
export function rawLevrek(s: SpotV2, w: Weather & { sst?: number | null }, p: LevrekParams, lampDraw?: boolean, ov?: LevrekOverrides): LevrekRaw {
  const lamp = s.lamp ?? lampDraw;
  const cf = coldFactor(w.sst, p);
  if (lamp !== undefined) {
    const t = levrekTerms(s, w, p, lamp, ov);
    return { raw: t.hsiS * t.hsiD * cf, terms: [t], lampP: null };
  }
  const q = lampPrior(s);
  const yes = levrekTerms(s, w, p, true, ov);
  const no = levrekTerms(s, w, p, false, ov);
  return { raw: yes.hsiS * (q * yes.hsiD + (1 - q) * no.hsiD) * cf, terms: [yes, no], lampP: q };
}

// Scale anchors (as istavrit, docs/MODEL.md §6a): ideal → 92, worst → 8.
const OPEN = Array.from({ length: 16 }, () => 3);
export const LEVREK_IDEAL_SPOT: SpotV2 = {
  kind: 'rocky', ferry: false, lengthM: null, dtm: { d0_50: null, d50_150: null, interpolated: true }, fieldDepths: null,
  substrate: { eusm: null, conf: null, field: ['kaya'] }, fieldStructure: null, fetchKm: OPEN, lamp: true,
};
export const LEVREK_IDEAL_WEATHER: Weather = {
  sunAlt: -3, moonAlt: -20, moonFrac: 0.1, cloud: 60, windKmh: 15, gustKmh: 22, windDir: 0, waveM: 0.6, waveDir: 0,
  rain48: 7, sstD48: -0.2, sstDev: 0, pressD3: 0.2, currentMs: 0.1, doy: 20, waveMax48: 1.6, rain72: 10,
};
export const LEVREK_WORST_SPOT: SpotV2 = {
  kind: 'harbour', ferry: false, lengthM: null, dtm: { d0_50: null, d50_150: null, interpolated: true }, fieldDepths: null,
  substrate: { eusm: null, conf: null, field: ['camur'] }, fieldStructure: null, fetchKm: Array.from({ length: 16 }, () => 0.2), lamp: false,
};
export const LEVREK_WORST_WEATHER: Weather = {
  sunAlt: 50, moonAlt: -30, moonFrac: 0, cloud: 0, windKmh: 2, gustKmh: 4, windDir: 0, waveM: 0, waveDir: 0,
  rain48: 0, sstD48: -4, sstDev: -4, pressD3: -7, currentMs: 0, doy: 200, waveMax48: 0, rain72: 0,
};
export const L_R_IDEAL = rawLevrek(LEVREK_IDEAL_SPOT, LEVREK_IDEAL_WEATHER, LEVREK_DEFAULTS).raw;
export const L_R_WORST = rawLevrek(LEVREK_WORST_SPOT, LEVREK_WORST_WEATHER, LEVREK_DEFAULTS).raw;

export function calibrateLevrek(raw: number): number {
  const t = (Math.log(raw) - Math.log(L_R_WORST)) / (Math.log(L_R_IDEAL) - Math.log(L_R_WORST));
  return Math.round(Math.min(100, Math.max(0, 8 + 84 * t)) * 10) / 10;
}

const f2 = (x: number) => x.toFixed(2);
const mix = (r: LevrekRaw, k: keyof LevrekTerms): number | null => {
  const a = r.terms[0]![k] as number | null;
  if (r.terms.length === 1 || a === null) return a;
  return r.lampP! * a + (1 - r.lampP!) * (r.terms[1]![k] as number);
};
const ev = (k: LevrekKey) => LEVREK_PARAMS[k].evidence as Evidence;

function components(s: SpotV2, r: LevrekRaw, w: Weather): V2Component[] {
  const t = r.terms[0]!;
  const lampSrc: Source = s.lampSource ? KIND_SOURCE[s.lampSource] : s.lamp === null ? 'önsel' : 'saha';
  const lampTxt = s.lamp === true ? 'iskele aydınlatması var' : s.lamp === false ? 'iskele aydınlatması yok' : s.lampSource ? `iskele ışığı görüldü, gece çalıştığı doğrulanmadı (varsayım önseli ${f2(r.lampP!)})` : `iskele aydınlatması bilinmiyor (varsayım önseli ${f2(r.lampP!)})`;
  const light = w.sunAlt > 0 ? 'gündüz' : w.sunAlt >= -12 ? 'alacakaranlık' : 'gece';
  const st = staticTerms(s, DEFAULTS);
  return [
    { key: 'yapi', label: 'Yapı / kıyı tipi', group: 'statik', weight: LEVREK_DEFAULTS.l_w_struct, value: t.struct, source: st.sources.struct, evidence: 'C', reason: `${s.fieldStructure ?? s.kind}: levrek tip tercihi (C)` },
    { key: 'taban', label: 'Taban', group: 'statik', weight: LEVREK_DEFAULTS.l_w_substrate, value: t.substrate, source: st.sources.substrate, evidence: 'C', reason: s.substrate.field?.join(', ') ?? s.substrate.hint ?? s.substrate.eusm ?? 'bilinmiyor' },
    { key: 'lamba', label: 'İskele aydınlatması', group: 'statik', weight: null, value: s.lamp === null ? r.lampP : s.lamp ? 1 : 0, source: lampSrc, evidence: 'C', reason: `${lampTxt}; levrekte orta etki (ışık–gölge sınırında yem balığı)` },
    { key: 'diel', label: 'Gece/gündüz ışığı', group: 'dinamik', weight: LEVREK_DEFAULTS.l_w_diel, value: mix(r, 'diel'), source: 'astronomi', evidence: 'C', reason: `${light}, gece ağırlığı ${f2(t.wNight)}` },
    { key: 'mevsim', label: 'Mevsim (kış tepesi)', group: 'dinamik', weight: LEVREK_DEFAULTS.l_w_season, value: t.season, source: 'önsel', evidence: ev('l_winter_doy'), reason: `yılın ${w.doy}. günü` },
    { key: 'bulaniklik', label: 'Bulanıklık (orta en iyi)', group: 'dinamik', weight: LEVREK_DEFAULTS.l_w_turb, value: t.turb, source: 'Open-Meteo', evidence: 'C', reason: w.rain48 === null ? 'veri yok' : `48 sa yağış ${w.rain48.toFixed(1)} mm${t.postStorm ? ', fırtına ertesi yatışma' : ''}` },
    { key: 'dalga', label: 'Dalga (sörf hattı)', group: 'dinamik', weight: LEVREK_DEFAULTS.l_w_wave, value: t.wave, source: 'Open-Meteo', evidence: 'C', reason: w.waveM === null ? 'veri yok' : `dalga ${w.waveM.toFixed(1)} m` },
    { key: 'su_degisim', label: 'Su sıcaklığı düşüşü (48 sa)', group: 'dinamik', weight: LEVREK_DEFAULTS.l_w_sst, value: t.sst, source: 'Copernicus', evidence: 'C', reason: w.sstD48 === null ? 'veri yok' : `${w.sstD48 >= 0 ? '+' : '−'}${Math.abs(w.sstD48).toFixed(1)} °C` },
    { key: 'dere', label: 'Dere ağzı ve yağış (72 sa)', group: 'dinamik', weight: LEVREK_DEFAULTS.l_w_river, value: t.river, source: 'Open-Meteo', evidence: 'C', reason: s.kind === 'river_mouth' ? `72 sa yağış ${(w.rain72 ?? 0).toFixed(0)} mm` : 'dere ağzı değil' },
    { key: 'basinc', label: 'Basınç değişimi', group: 'dinamik', weight: LEVREK_DEFAULTS.l_w_press, value: t.press, source: 'Open-Meteo', evidence: 'C', reason: w.pressD3 === null ? 'veri yok' : `${w.pressD3.toFixed(1)} hPa / 3 sa` },
  ];
}

const HOUR = 3_600_000;
const LEVREK_PROFILE = getProfile('levrek')! as SpeciesProfile; // data/species/levrek.yaml (safety: gust 40 km/sa, wave 1.2 m)

/** Hourly levrek scores with the Monte Carlo band (same shape as scoreSeriesV2, so packing and the API are shared). */
export function scoreSeriesLevrek(a: Omit<ScoreV2Args, 'profile'> & { profile?: Pick<SpeciesProfile, 'safety'> }): V2Hour[] {
  const profile = (a.profile ?? LEVREK_PROFILE) as SpeciesProfile;
  const index = indexSeries(a.points);
  const start = Math.floor(a.from.getTime() / HOUR) * HOUR;
  const times = Array.from({ length: a.hours }, (_, i) => new Date(start + i * HOUR));
  const weather = times.map((t) => {
    const w = weatherAt(index, t, a.spot.lat, a.spot.lon);
    return { ...w, sst: index.get(Math.floor(t.getTime() / HOUR))?.sst ?? null };
  });
  const draws = a.draws ?? 0;
  const samples: number[][] = times.map(() => []);
  if (draws > 0) {
    const r = rng(a.seed ?? 11);
    const q = a.spot.lamp === null ? lampPrior(a.spot) : null;
    for (let k = 0; k < draws; k++) {
      const p = drawLevrek(r.normal);
      // I6: always draw the lamp uniform so draw k uses the same parameters at every spot (paired draws → rank stability)
      const u = r.uniform();
      const lamp = q === null ? undefined : u < q;
      weather.forEach((w, i) => samples[i]!.push(calibrateLevrek(rawLevrek(a.spot, w, p, lamp).raw)));
    }
  }
  return times.map((t, i) => {
    const w = weather[i]!;
    const res = rawLevrek(a.spot, w, LEVREK_DEFAULTS);
    const warnings = safetyGate(index.get(Math.floor(t.getTime() / HOUR)), profile);
    const gated = warnings.length > 0;
    const cap = (x: number) => (gated ? Math.min(x, profile.safety.cap) : x);
    let p10: number | null = null;
    let p90: number | null = null;
    if (draws > 0) {
      const s = [...samples[i]!].sort((x, y) => x - y);
      p10 = cap(s[Math.floor(0.1 * (s.length - 1))]!);
      p90 = cap(s[Math.ceil(0.9 * (s.length - 1))]!);
    }
    const noWeather = w.windKmh === null && w.cloud === null;
    return {
      ts: t.toISOString().slice(0, 13) + ':00Z',
      total: noWeather ? null : cap(calibrateLevrek(res.raw)),
      raw: noWeather ? null : Math.round(res.raw * 1e4) / 1e4,
      p10: noWeather ? null : p10,
      p90: noWeather ? null : p90,
      gated,
      warnings,
      missing: missingMask(w),
      lampP: res.lampP,
      wNight: Math.round(res.terms[0]!.wNight * 1000) / 1000,
      components: components(a.spot, res, w),
      ...(a.keepSamples && draws > 0 ? { samples: samples[i]!.map(cap) } : {}),
    };
  });
}

export type LevrekDriver = 'lamba' | 'yapi' | 'taban' | 'maruziyet';
const DRIVERS_L: LevrekDriver[] = ['yapi', 'taban', 'lamba', 'maruziyet'];

/** Main reason per spot at one hour (ablation against the other spots, as explain() for istavrit). */
export function explainLevrek(spots: SpotV2[], weather: Weather[]): ({ key: LevrekDriver; delta: number } | null)[] {
  if (spots.length < 2) return spots.map(() => null);
  const p = LEVREK_DEFAULTS;
  const terms = spots.map((s, i) => levrekTerms(s, weather[i]!, p, false));
  const score = (s: SpotV2, w: Weather, ov?: LevrekOverrides) => calibrateLevrek(rawLevrek(s, w, p, undefined, ov).raw);
  const swap: Record<LevrekDriver, (i: number, j: number) => number> = {
    lamba: (i, j) => {
      const f = spots[j]!;
      return score({ ...spots[i]!, lamp: null, lampP: f.lamp === null ? lampPrior(f) : f.lamp ? 1 : 0 }, weather[i]!);
    },
    yapi: (i, j) => score(spots[i]!, weather[i]!, { struct: terms[j]!.struct }),
    taban: (i, j) => score(spots[i]!, weather[i]!, { substrate: terms[j]!.substrate }),
    maruziyet: (i, j) => score({ ...spots[i]!, fetchKm: spots[j]!.fetchKm }, weather[i]!),
  };
  return spots.map((s, i) => {
    const base = score(s, weather[i]!);
    let best: { key: LevrekDriver; delta: number } | null = null;
    for (const key of DRIVERS_L) {
      let sum = 0;
      for (let j = 0; j < spots.length; j++) if (j !== i) sum += swap[key](i, j);
      const delta = Math.round((base - sum / (spots.length - 1)) * 10) / 10;
      if (!best || Math.abs(delta) > Math.abs(best.delta)) best = { key, delta };
    }
    return best;
  });
}

/** Points-free helper for tests and docs: score one hour from a Weather. */
export function levrekAt(s: SpotV2, w: Weather & { sst?: number | null }): number {
  return calibrateLevrek(rawLevrek(s, w, LEVREK_DEFAULTS).raw);
}

export type { HourlyPoint };
