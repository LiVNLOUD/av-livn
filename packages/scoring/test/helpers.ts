import type { HourlyPoint, SpeciesProfile, SpotInput } from '../src/types';
import { PROFILES } from '../src/profiles';

export const ISTAVRIT = PROFILES.istavrit as SpeciesProfile;
export const MUDANYA: SpotInput = { lat: 40.376, lon: 28.883, shoreNormalDeg: 0, hasLight: true };

/** Build `n` hourly points ending at `end` (inclusive), each produced by `f(hoursBeforeEnd)`. */
export function hours(end: Date, n: number, f: (back: number) => Partial<HourlyPoint>): HourlyPoint[] {
  return Array.from({ length: n }, (_, i) => {
    const back = n - 1 - i;
    return { ts: new Date(end.getTime() - back * 3_600_000).toISOString(), ...f(back) };
  });
}
