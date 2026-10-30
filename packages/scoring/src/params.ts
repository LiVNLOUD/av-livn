import type { NightMultiplierConfig, SpeciesParams, SpeciesProfile } from './types';

export const DEFAULT_PARAMS: SpeciesParams = {
  wave_soft_limit_m: 0.6,
  sst_ideal_c: [14, 20],
  sst_trend_ok_c: 0.5,
  sst_trend_zero_c: 2,
  current_ideal_ms: [0.05, 0.25],
  current_max_ms: 0.6,
  wind: { onshore_start_kmh: 10, onshore_span_kmh: 25, offshore_ok_kmh: 20, offshore_span_kmh: 20 },
  pressure: { ok: [-0.5, 0.3], rise_zero: 1.5, fall_floor_at: -2, fall_floor: 0.3 },
  gust_ok_kmh: 25,
};

export const DEFAULT_NIGHT: NightMultiplierConfig = {
  full: 1,
  twilight: 0.7,
  day: 0.25,
  no_light_factor: 0.75,
  dusk_before_min: 30,
  dusk_after_min: 45,
  dawn_before_min: 60,
  dawn_after_min: 15,
};

const paramsMemo = new WeakMap<SpeciesProfile, SpeciesParams>();
const nightMemo = new WeakMap<SpeciesProfile, NightMultiplierConfig>();

/** Profile params merged over defaults (nested objects merged one level deep). Memoised per profile object. */
export function paramsOf(profile: SpeciesProfile): SpeciesParams {
  let r = paramsMemo.get(profile);
  if (!r) {
    const p = profile.params;
    r = { ...DEFAULT_PARAMS, ...p, wind: { ...DEFAULT_PARAMS.wind, ...p.wind }, pressure: { ...DEFAULT_PARAMS.pressure, ...p.pressure } };
    paramsMemo.set(profile, r);
  }
  return r;
}

export function nightOf(profile: SpeciesProfile): NightMultiplierConfig {
  let r = nightMemo.get(profile);
  if (!r) {
    r = { ...DEFAULT_NIGHT, ...profile.night_multiplier };
    nightMemo.set(profile, r);
  }
  return r;
}
