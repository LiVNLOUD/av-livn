// Memoised suncalc lookups. Results are deterministic functions of (time, place), so caching keeps the
// engine pure while avoiding ~20 µs of trigonometry per call when scoring many spots × hours.
import { getMoonIllumination, getMoonPosition, getTimes } from 'suncalc';
import { localParts, TZ_OFFSET_MIN } from './util';

const MAX = 4096;
const sunCache = new Map<string, { sunrise: Date; sunset: Date }>();
const moonCache = new Map<string, { fraction: number; up: boolean }>();

function remember<V>(cache: Map<string, V>, key: string, make: () => V): V {
  let v = cache.get(key);
  if (v === undefined) {
    if (cache.size >= MAX) cache.clear();
    v = make();
    cache.set(key, v);
  }
  return v;
}

/** Sunrise/sunset of the local civil day containing `at` (≈1 s accuracy within 0.001°). */
export function sunTimes(at: Date, lat: number, lon: number): { sunrise: Date; sunset: Date } {
  const d = localParts(at);
  return remember(sunCache, `${lat.toFixed(3)},${lon.toFixed(3)},${d.year}-${d.month}-${d.day}`, () => {
    const t = getTimes(at, lat, lon, 0, TZ_OFFSET_MIN);
    return { sunrise: t.sunrise!, sunset: t.sunset! };
  });
}

/**
 * Moon illumination and whether it is above the horizon, per UTC hour on a 0.25° grid: across the
 * whole region the moon's altitude differs by well under a degree, which only shifts rise/set by minutes.
 */
export function moonState(at: Date, lat: number, lon: number): { fraction: number; up: boolean } {
  const h = Math.floor(at.getTime() / 3_600_000);
  return remember(moonCache, `${h},${Math.round(lat * 4)},${Math.round(lon * 4)}`, () => {
    const mid = new Date(h * 3_600_000);
    return { fraction: getMoonIllumination(mid).fraction, up: getMoonPosition(mid, lat, lon).altitude > 0 };
  });
}
