// Open-Meteo Forecast + Marine clients. Multi-location requests: one HTTP call per kind.
// Data: Open-Meteo.com (CC BY 4.0), DWD ICON among the models.

export const WX_VARS = ['pressure_msl', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'temperature_2m', 'precipitation', 'cloud_cover'] as const;
export const SEA_VARS = ['wave_height', 'sea_surface_temperature', 'ocean_current_velocity', 'ocean_current_direction', 'sea_level_height_msl'] as const;

/** Columnar hourly series for one cell. `t0` is the first hour (ISO, UTC). */
export interface Snapshot {
  t0: string;
  /** Grid point Open-Meteo actually used (marine snaps to the nearest sea cell, can be km away). */
  lat?: number;
  lon?: number;
  v: Record<string, (number | null)[]>;
}

interface OmLocation {
  latitude?: number;
  longitude?: number;
  hourly?: { time: string[] } & Record<string, (number | null)[] | string[]>;
}

export interface CellCoord {
  id: string;
  lat: number;
  lon: number;
}

export function buildUrl(kind: 'wx' | 'sea', cells: CellCoord[]): string {
  const base = kind === 'wx' ? 'https://api.open-meteo.com/v1/forecast' : 'https://marine-api.open-meteo.com/v1/marine';
  const params = new URLSearchParams({
    latitude: cells.map((c) => c.lat).join(','),
    longitude: cells.map((c) => c.lon).join(','),
    hourly: (kind === 'wx' ? WX_VARS : SEA_VARS).join(','),
    past_days: kind === 'wx' ? '1' : '3',
    forecast_days: '4',
    timezone: 'GMT',
    wind_speed_unit: 'kmh',
  });
  if (kind === 'sea') params.delete('wind_speed_unit');
  return `${base}?${params}`;
}

/** Parse a (multi-location) Open-Meteo response into per-cell snapshots, in request order. */
export function parseResponse(body: unknown, cells: CellCoord[]): Map<string, Snapshot> {
  const locs = (Array.isArray(body) ? body : [body]) as OmLocation[];
  if (locs.length !== cells.length) throw new Error(`open-meteo returned ${locs.length} locations for ${cells.length} cells`);
  const out = new Map<string, Snapshot>();
  locs.forEach((loc, i) => {
    const h = loc.hourly;
    if (!h || h.time.length === 0) return;
    const v: Record<string, (number | null)[]> = {};
    for (const [k, arr] of Object.entries(h)) if (k !== 'time') v[k] = arr as (number | null)[];
    out.set(cells[i]!.id, { t0: `${h.time[0]}Z`, lat: loc.latitude, lon: loc.longitude, v });
  });
  return out;
}

export async function fetchSnapshots(kind: 'wx' | 'sea', cells: CellCoord[], fetcher: typeof fetch = fetch): Promise<Map<string, Snapshot>> {
  if (cells.length === 0) return new Map();
  const res = await fetcher(buildUrl(kind, cells), { headers: { 'user-agent': 'av-livn/0.1 (+https://av.livn.tr)' } });
  if (!res.ok) throw new Error(`open-meteo ${kind} HTTP ${res.status}`);
  return parseResponse(await res.json(), cells);
}
