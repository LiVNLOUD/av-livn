// Open-Meteo Forecast + Marine clients. Multi-location requests: one HTTP call per kind.
// Data: Open-Meteo.com (CC BY 4.0), DWD ICON among the models.

export const WX_VARS = ['pressure_msl', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m', 'temperature_2m', 'precipitation', 'cloud_cover'] as const;
export const SEA_VARS = ['wave_height', 'wave_direction', 'sea_surface_temperature', 'ocean_current_velocity', 'ocean_current_direction', 'sea_level_height_msl'] as const;

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
    past_days: kind === 'wx' ? '2' : '3', // wx: 48 h of past rain for the v2 turbidity proxy
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

export interface FetchStats {
  /** HTTP calls made, including retries. */
  calls: number;
  /** Status of every call, in order (0 = network error). */
  statuses: number[];
}

const RETRYABLE = new Set([0, 429, 500, 502, 503, 504]);
const sleepMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * One multi-location request per kind. 429/5xx/network errors are retried with exponential backoff
 * (base, 2·base, …; Retry-After honoured up to 30 s). On final failure the caller keeps the last good snapshots.
 */
export async function fetchSnapshots(
  kind: 'wx' | 'sea',
  cells: CellCoord[],
  fetcher: typeof fetch = fetch,
  opts: { retries?: number; baseMs?: number; sleep?: (ms: number) => Promise<void>; stats?: FetchStats } = {},
): Promise<Map<string, Snapshot>> {
  if (cells.length === 0) return new Map();
  const { retries = 3, baseMs = 2000, sleep = sleepMs, stats } = opts;
  let last = '';
  for (let attempt = 0; attempt <= retries; attempt++) {
    let status = 0;
    let res: Response | null = null;
    try {
      res = await fetcher(buildUrl(kind, cells), { headers: { 'user-agent': 'av-livn/0.1 (+https://av.livn.tr)' } });
      status = res.status;
    } catch (e) {
      last = String(e);
    }
    if (stats) {
      stats.calls++;
      stats.statuses.push(status);
    }
    if (res?.ok) return parseResponse(await res.json(), cells);
    if (res) last = `HTTP ${status}`;
    if (!RETRYABLE.has(status) || attempt === retries) break;
    const after = Number(res?.headers.get('retry-after'));
    await sleep(Number.isFinite(after) && after > 0 ? Math.min(after, 30) * 1000 : baseMs * 2 ** attempt);
  }
  throw new Error(`open-meteo ${kind} ${last}`);
}
