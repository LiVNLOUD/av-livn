// Depth from jighead sink time (docs/MODEL.md §9a). Field users without a plumb line count seconds from splash
// until the line goes slack. Prior sink speed v₀(g) = 0.25 · g^0.5 m/s (jighead + small soft lure; evidence C,
// fisher rule of thumb, ±40 %). When the same spot has plumb (kurşunla dikine) depths within PAIR_M of a sink
// measurement, the ratio plumb/(v₀·t) calibrates a spot factor k (median over pairs) and the converted depths
// carry the spread of k plus 10 % timing error.

export interface SinkObs {
  distance_m: number;
  sink_s: number;
  jig_g: number;
}
export interface PlumbObs {
  distance_m: number;
  depth_m: number;
}
export interface ConvertedDepth {
  distance_m: number;
  depth_m: number;
  sd_m: number;
  quality: 'plumb' | 'sink_cal' | 'sink';
}

export const PAIR_M = 15;
export const PRIOR_REL_SD = 0.4;
const TIMING_REL_SD = 0.1;

export const sinkSpeed = (g: number) => 0.25 * Math.sqrt(g);

export interface SinkCalibration {
  k: number;
  relSd: number;
  pairs: number;
}

/** Spot factor k = median(plumb depth / (v₀(g) · t)) over sink/plumb pairs within PAIR_M; null without pairs. */
export function calibrateSink(sinks: SinkObs[], plumbs: PlumbObs[]): SinkCalibration | null {
  const ratios: number[] = [];
  for (const s of sinks) {
    const near = plumbs.filter((p) => Math.abs(p.distance_m - s.distance_m) <= PAIR_M);
    if (near.length === 0 || s.sink_s <= 0) continue;
    const depth = near.reduce((a, p) => a + p.depth_m, 0) / near.length;
    ratios.push(depth / (sinkSpeed(s.jig_g) * s.sink_s));
  }
  if (ratios.length === 0) return null;
  ratios.sort((a, b) => a - b);
  const mid = ratios.length / 2;
  const k = ratios.length % 2 ? ratios[Math.floor(mid)]! : (ratios[mid - 1]! + ratios[mid]!) / 2;
  const sd = ratios.length > 1 ? Math.sqrt(ratios.reduce((a, r) => a + (r - k) ** 2, 0) / (ratios.length - 1)) / k : 0.15;
  return { k, relSd: Math.sqrt(sd ** 2 + TIMING_REL_SD ** 2), pairs: ratios.length };
}

/** All field depths of a spot as distance–depth pairs with uncertainty: plumb as measured, sink times converted. */
export function fieldDepths(sinks: SinkObs[], plumbs: PlumbObs[]): { depths: ConvertedDepth[]; calibration: SinkCalibration | null } {
  const cal = calibrateSink(sinks, plumbs);
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const depths: ConvertedDepth[] = [
    ...plumbs.map((p) => ({ distance_m: p.distance_m, depth_m: r1(p.depth_m), sd_m: r1(Math.max(0.1, 0.05 * p.depth_m)), quality: 'plumb' as const })),
    ...sinks
      .filter((s) => s.sink_s > 0 && s.jig_g > 0)
      .map((s) => {
        const d = (cal?.k ?? 1) * sinkSpeed(s.jig_g) * s.sink_s;
        return { distance_m: s.distance_m, depth_m: r1(d), sd_m: r1(d * (cal ? cal.relSd : PRIOR_REL_SD)), quality: cal ? ('sink_cal' as const) : ('sink' as const) };
      }),
  ];
  return { depths: depths.sort((a, b) => a.distance_m - b.distance_m), calibration: cal };
}
