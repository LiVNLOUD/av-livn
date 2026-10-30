// Score scale (docs/MODEL.md §6a). raw = HSI_s·HSI_d is a product of geometric means, so it lives on a log
// scale; the 0–100 score is a log-linear map anchored on two documented reference scenarios:
//   score = clip( 8 + 84 · (ln raw − ln r_worst) / (ln r_ideal − ln r_worst), 0, 100 )
// r_ideal → 92 and r_worst → 8. Weights are untouched; the map is monotone, so every ordering (and the
// direction tests) is preserved. Anchors are computed from the default parameters, not fitted.
import { rawScore, type SpotV2, type Weather } from './model';
import { DEFAULTS } from './params';

const OPEN = Array.from({ length: 16 }, () => 50);

/** Ideal: long breakwater on rock, measured 8 m at the cast, lamp, sheltered, moonless clear night in mid-October, calm, stable. */
export const IDEAL_SPOT: SpotV2 = {
  kind: 'breakwater', ferry: false, lengthM: 600, dtm: { d0_50: null, d50_150: null, interpolated: true },
  fieldDepths: [{ distance_m: 10, depth_m: 7 }, { distance_m: 60, depth_m: 9 }, { distance_m: 150, depth_m: 12 }],
  substrate: { eusm: null, conf: null, field: ['kaya', 'midyeli'] }, fieldStructure: 'mendirek',
  fetchKm: Array.from({ length: 16 }, () => 0.5), lamp: true,
};
export const IDEAL_WEATHER: Weather = {
  sunAlt: -40, moonAlt: -20, moonFrac: 0.1, cloud: 10, windKmh: 6, gustKmh: 10, windDir: 0, waveM: 0.1, waveDir: 0,
  rain48: 0, sstD48: 0.2, sstDev: 0, pressD3: 0.2, currentMs: 0.15, doy: 285,
};
/** Worst: 15 m pier over mud, 0.5 m deep, no lamp, fully exposed, bright midday in February, onshore gale, rain, cold snap. */
export const WORST_SPOT: SpotV2 = {
  kind: 'pier', ferry: false, lengthM: 15, dtm: { d0_50: null, d50_150: null, interpolated: true },
  fieldDepths: [{ distance_m: 5, depth_m: 0.3 }, { distance_m: 100, depth_m: 0.8 }],
  substrate: { eusm: null, conf: null, field: ['camur'] }, fieldStructure: 'iskele', fetchKm: OPEN, lamp: false,
};
export const WORST_WEATHER: Weather = {
  sunAlt: 45, moonAlt: -30, moonFrac: 0, cloud: 0, windKmh: 45, gustKmh: 65, windDir: 0, waveM: 2, waveDir: 0,
  rain48: 40, sstD48: -3, sstDev: -5, pressD3: -7, currentMs: 0, doy: 40,
};

export const SCALE = { ideal: 92, worst: 8 } as const;
export const R_IDEAL = rawScore(IDEAL_SPOT, IDEAL_WEATHER, DEFAULTS).raw;
export const R_WORST = rawScore(WORST_SPOT, WORST_WEATHER, DEFAULTS).raw;

export function calibrate(raw: number): number {
  const t = (Math.log(raw) - Math.log(R_WORST)) / (Math.log(R_IDEAL) - Math.log(R_WORST));
  return Math.round(Math.min(100, Math.max(0, SCALE.worst + (SCALE.ideal - SCALE.worst) * t)) * 10) / 10;
}
