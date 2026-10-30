import type { HourlyPoint } from '@av-livn/scoring';
import type { Snapshot } from './openmeteo';

const H = 3_600_000;

/** Map Open-Meteo variable names to HourlyPoint fields (current: km/h → m/s). */
const MAP: Record<string, [keyof HourlyPoint, (x: number) => number]> = {
  pressure_msl: ['pressure', (x) => x],
  wind_speed_10m: ['windSpeed', (x) => x],
  wind_direction_10m: ['windDir', (x) => x],
  wind_gusts_10m: ['windGust', (x) => x],
  temperature_2m: ['temp', (x) => x],
  precipitation: ['precip', (x) => x],
  cloud_cover: ['cloud', (x) => x],
  wave_height: ['waveH', (x) => x],
  sea_surface_temperature: ['sst', (x) => x],
  ocean_current_velocity: ['curVel', (x) => x / 3.6],
  ocean_current_direction: ['curDir', (x) => x],
  sea_level_height_msl: ['seaLevel', (x) => x],
};

/** Merge weather + sea snapshots into hourly points keyed by UTC hour. */
export function mergeSnapshots(...snaps: (Snapshot | null | undefined)[]): HourlyPoint[] {
  const byTs = new Map<number, HourlyPoint>();
  for (const s of snaps) {
    if (!s) continue;
    const t0 = Date.parse(s.t0);
    for (const [name, arr] of Object.entries(s.v)) {
      const m = MAP[name];
      if (!m) continue;
      arr.forEach((x, i) => {
        if (x === null || x === undefined) return;
        const t = t0 + i * H;
        let p = byTs.get(t);
        if (!p) byTs.set(t, (p = { ts: new Date(t).toISOString() }));
        (p as unknown as Record<string, number>)[m[0]] = m[1](x);
      });
    }
  }
  return [...byTs.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
}

/** Value of every snapshot variable at a given hour (for the observations history). */
export function valuesAt(s: Snapshot, at: Date): Record<string, number | null> | null {
  const i = Math.round((at.getTime() - Date.parse(s.t0)) / H);
  const out: Record<string, number | null> = {};
  let any = false;
  for (const [k, arr] of Object.entries(s.v)) {
    const x = i >= 0 && i < arr.length ? (arr[i] ?? null) : null;
    out[k] = x;
    if (x !== null) any = true;
  }
  return any ? out : null;
}
