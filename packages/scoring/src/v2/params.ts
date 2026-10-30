// v2 HSI parameters (docs/MODEL.md §5). Every value carries its unit, evidence level (docs/RESEARCH.md) and source.
// Monte Carlo draws scale each parameter by a log-normal factor whose sigma depends on the evidence level;
// angle/threshold parameters (additive: true) are shifted instead.

export type Evidence = 'A' | 'B' | 'C';

export interface ParamDef {
  value: number;
  unit: string;
  evidence: Evidence;
  ref: string;
  additive?: boolean;
}

export const SIGMA: Record<Evidence, number> = { A: 0.1, B: 0.25, C: 0.5 };

export const PARAMS = {
  // ambient light and diel arms
  night_theta: { value: 0, unit: 'log10 lux', evidence: 'C', ref: 'R3,R12', additive: true },
  night_slope: { value: 0.4, unit: 'log10 lux', evidence: 'C', ref: 'R3,R12' },
  lamp_lux: { value: 20, unit: 'lux', evidence: 'C', ref: 'R8,R12' },
  contrast_mid: { value: 1.5, unit: 'log10', evidence: 'C', ref: 'R8' },
  contrast_slope: { value: 0.5, unit: 'log10', evidence: 'C', ref: 'R8' },
  dark_base: { value: 0.1, unit: '-', evidence: 'C', ref: 'R3,R12' },
  moon_gain: { value: 0.15, unit: '-', evidence: 'C', ref: 'R12' },
  twilight_centre: { value: -3, unit: '°', evidence: 'C', ref: 'R7', additive: true },
  twilight_width: { value: 3.5, unit: '°', evidence: 'C', ref: 'R7' },
  twilight_gain: { value: 0.35, unit: '-', evidence: 'C', ref: 'R7' },
  bright_k: { value: 0.8, unit: '-', evidence: 'C', ref: 'R10' },
  // static habitat
  struct_pier: { value: 0.75, unit: '-', evidence: 'C', ref: '—' },
  struct_breakwater: { value: 0.85, unit: '-', evidence: 'C', ref: '—' },
  struct_rock: { value: 0.8, unit: '-', evidence: 'C', ref: '—' },
  struct_len_km: { value: 0.15, unit: 'km', evidence: 'C', ref: '—' },
  depth_mid: { value: 3.5, unit: 'm', evidence: 'C', ref: 'R10' },
  depth_slope: { value: 1.2, unit: 'm', evidence: 'C', ref: 'R10' },
  dtm_weight_interp: { value: 0.3, unit: '-', evidence: 'C', ref: 'DATA-AUDIT §1' },
  fetch_ref_km: { value: 3, unit: 'km', evidence: 'C', ref: '—' },
  // dynamic
  wind_ref_kmh: { value: 30, unit: 'km/sa', evidence: 'C', ref: '—' },
  wave_ref_m: { value: 1, unit: 'm', evidence: 'C', ref: '—' },
  turb_rain_mm: { value: 15, unit: 'mm/48 sa', evidence: 'C', ref: 'R11' },
  turb_wave_m: { value: 1.5, unit: 'm', evidence: 'C', ref: 'R11' },
  turb_max_loss: { value: 0.5, unit: '-', evidence: 'C', ref: 'R11' },
  sst_drop_tol: { value: 0.5, unit: '°C/48 sa', evidence: 'C', ref: '—' },
  sst_drop_scale: { value: 1.5, unit: '°C/48 sa', evidence: 'C', ref: '—' },
  sst_dev_scale: { value: 2, unit: '°C', evidence: 'C', ref: 'DATA-AUDIT §4' },
  press_rate: { value: 3, unit: 'hPa/3 sa', evidence: 'C', ref: '—' },
  press_loss: { value: 0.2, unit: '-', evidence: 'C', ref: '—' },
  season_base: { value: 0.3, unit: '-', evidence: 'C', ref: 'R3' },
  season_spawn_amp: { value: 0.45, unit: '-', evidence: 'C', ref: 'R1,R2' },
  season_spawn_doy: { value: 210, unit: 'gün', evidence: 'A', ref: 'R1,R2', additive: true },
  season_spawn_w: { value: 45, unit: 'gün', evidence: 'A', ref: 'R1,R2' },
  season_autumn_amp: { value: 0.7, unit: '-', evidence: 'C', ref: 'R3' },
  season_autumn_doy: { value: 285, unit: 'gün', evidence: 'A', ref: 'R3', additive: true },
  season_autumn_w: { value: 35, unit: 'gün', evidence: 'B', ref: 'R3' },
  // weights
  w_diel: { value: 0.4, unit: '-', evidence: 'C', ref: '' },
  w_season: { value: 0.2, unit: '-', evidence: 'C', ref: '' },
  w_wind: { value: 0.15, unit: '-', evidence: 'C', ref: '' },
  w_sst: { value: 0.08, unit: '-', evidence: 'C', ref: '' },
  w_sst_dev: { value: 0.03, unit: '-', evidence: 'C', ref: 'DATA-AUDIT §4' },
  w_turb: { value: 0.09, unit: '-', evidence: 'C', ref: '' },
  w_press: { value: 0.04, unit: '-', evidence: 'C', ref: '' },
  w_current: { value: 0.04, unit: '-', evidence: 'C', ref: '' },
  w_struct: { value: 0.75, unit: '-', evidence: 'C', ref: '' },
  w_substrate: { value: 0.25, unit: '-', evidence: 'C', ref: '' },
} satisfies Record<string, ParamDef>;

export type ParamKey = keyof typeof PARAMS;
export type Params = Record<ParamKey, number>;

export const DEFAULTS: Params = Object.fromEntries(Object.entries(PARAMS).map(([k, d]) => [k, d.value])) as Params;

/** Deterministic PRNG (mulberry32) with a Box–Muller normal. */
export function rng(seed: number): { uniform: () => number; normal: () => number } {
  let a = seed >>> 0;
  const uniform = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => Math.sqrt(-2 * Math.log(1 - uniform())) * Math.cos(2 * Math.PI * uniform());
  return { uniform, normal };
}

/** One Monte Carlo parameter draw: multiplicative log-normal (or additive for angles/thresholds) by evidence level. */
export function drawParams(normal: () => number): Params {
  const out = {} as Params;
  for (const [k, d] of Object.entries(PARAMS) as [ParamKey, ParamDef][]) {
    const s = SIGMA[d.evidence];
    out[k] = d.additive ? d.value + normal() * s * (d.unit === 'gün' ? 20 : 2) : d.value * Math.exp(normal() * s);
  }
  return out;
}
