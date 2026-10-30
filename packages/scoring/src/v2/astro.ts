// Sun/moon altitude and moon illumination per UTC hour on a 0.05° grid (memoised suncalc).
import { getMoonIllumination, getMoonPosition, getPosition } from 'suncalc';

const cache = new Map<string, { sunAlt: number; moonAlt: number; moonFrac: number }>();

export function skyAt(at: Date, lat: number, lon: number): { sunAlt: number; moonAlt: number; moonFrac: number } {
  const key = `${Math.floor(at.getTime() / 60_000)},${Math.round(lat * 20)},${Math.round(lon * 20)}`;
  let v = cache.get(key);
  if (!v) {
    if (cache.size >= 8192) cache.clear();
    v = {
      sunAlt: getPosition(at, lat, lon).altitude, // suncalc 2.x: degrees
      moonAlt: getMoonPosition(at, lat, lon).altitude,
      moonFrac: getMoonIllumination(at).fraction,
    };
    cache.set(key, v);
  }
  return v;
}

/** Day of year (1–366) of the UTC date. */
export function dayOfYear(at: Date): number {
  return Math.floor((at.getTime() - Date.UTC(at.getUTCFullYear(), 0, 1)) / 86_400_000) + 1;
}
