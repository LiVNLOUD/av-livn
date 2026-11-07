// P2/P5 (docs/MODEL.md §19): weather-forecast uncertainty from several Open-Meteo models, and regular grids for the
// map layers. Built hourly in GitHub Actions (scripts/weather-grids.ts) and stored in D1 meta; the Worker only
// serves the stored JSON (no computing there). Pure functions, tested.

/** Models compared for the spots' weather cells. ICON (DWD; its European nest covers the Marmara), ECMWF IFS,
 *  GFS (NOAA) and ARPEGE (Météo-France; its European domain covers Turkey). Open-Meteo has no Turkish model. */
export const SPREAD_MODELS = ['icon_seamless', 'ecmwf_ifs025', 'gfs_seamless', 'meteofrance_seamless'] as const;
export const SPREAD_VARS = ['wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m', 'precipitation', 'cloud_cover'] as const;

const r1 = (x: number) => Math.round(x * 10) / 10;
const nums = (xs: (number | null | undefined)[]) => xs.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));

/** min, max and population standard deviation of the models' values (null when fewer than 2 models answered). */
export function valueSpread(xs: (number | null | undefined)[]): [number, number, number] | null {
  const v = nums(xs);
  if (v.length < 2) return null;
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
  return [r1(Math.min(...v)), r1(Math.max(...v)), r1(sd)];
}

/** Largest angular distance (deg) of any model's wind direction from the circular mean; null under 2 models. */
export function dirSpread(dirs: (number | null | undefined)[]): number | null {
  const v = nums(dirs);
  if (v.length < 2) return null;
  const rad = v.map((d) => (d * Math.PI) / 180);
  const mean = Math.atan2(rad.reduce((a, b) => a + Math.sin(b), 0), rad.reduce((a, b) => a + Math.cos(b), 0));
  const diff = (a: number) => Math.abs(((((a - mean) * 180) / Math.PI + 540) % 360) - 180);
  return Math.round(Math.max(...rad.map(diff)));
}

export interface SpreadCell {
  id: string; lat: number; lon: number;
  /** per hour: wind [min, max, sd] km/h, gust [min, max, sd], direction spread (deg), rain [min, max, sd] mm, cloud [min, max, sd] % */
  w: ([number, number, number] | null)[]; g: ([number, number, number] | null)[]; d: (number | null)[];
  p: ([number, number, number] | null)[]; c: ([number, number, number] | null)[];
  /** wind speed per model and hour (km/h), for the detail under "Neden?" */
  m: Record<string, (number | null)[]>;
}
export interface SpreadDoc { from_hour: number; hours: number; models: string[]; built_at: string; cells: SpreadCell[] }

type Hourly = Record<string, (number | null)[] | string[]>;
/** One location of a multi-model Open-Meteo response → the cell's spread for `hours` hours from `fromHour`. */
export function cellSpread(id: string, lat: number, lon: number, hourly: Hourly, fromHour: number, hours: number, models: readonly string[] = SPREAD_MODELS): SpreadCell {
  const times = (hourly.time as string[]).map((t) => Math.floor(Date.parse(t.endsWith('Z') ? t : `${t}Z`) / 3_600_000));
  const at = (v: string, model: string, h: number) => {
    const i = times.indexOf(h);
    const arr = hourly[`${v}_${model}`] as (number | null)[] | undefined;
    return i < 0 || !arr ? null : arr[i] ?? null;
  };
  const cell: SpreadCell = { id, lat, lon, w: [], g: [], d: [], p: [], c: [], m: Object.fromEntries(models.map((m) => [m, []])) };
  for (let k = 0; k < hours; k++) {
    const h = fromHour + k;
    const per = (v: string) => models.map((m) => at(v, m, h));
    cell.w.push(valueSpread(per('wind_speed_10m')));
    cell.g.push(valueSpread(per('wind_gusts_10m')));
    cell.d.push(dirSpread(per('wind_direction_10m')));
    cell.p.push(valueSpread(per('precipitation')));
    cell.c.push(valueSpread(per('cloud_cover')));
    for (const m of models) { const x = at('wind_speed_10m', m, h); cell.m[m]!.push(x === null ? null : r1(x)); }
  }
  return cell;
}

/** Regular lon/lat lattice for the map layers. */
export interface Lattice { lat0: number; lon0: number; dlat: number; dlon: number; nlat: number; nlon: number }
export const LATTICE: Lattice = { lat0: 40.15, lon0: 28.4, dlat: 0.1, dlon: 0.1, nlat: 7, nlon: 12 };
export function latticePoints(l: Lattice = LATTICE): { lat: number; lon: number }[] {
  const out: { lat: number; lon: number }[] = [];
  for (let i = 0; i < l.nlat; i++) for (let j = 0; j < l.nlon; j++) out.push({ lat: Math.round((l.lat0 + i * l.dlat) * 1000) / 1000, lon: Math.round((l.lon0 + j * l.dlon) * 1000) / 1000 });
  return out;
}
export interface GridDoc extends Lattice { from_hour: number; hours: number; built_at: string; source: string; vars: Record<string, (number | null)[][]> }

/** Multi-location response (one entry per lattice point, row-major) → hour × point arrays, scaled to integers. */
export function buildGrid(locs: { hourly: Hourly }[], vars: Record<string, { key: string; scale: number }>, fromHour: number, hours: number, l: Lattice, source: string, now: Date): GridDoc {
  const out: GridDoc = { ...l, from_hour: fromHour, hours, built_at: now.toISOString(), source, vars: {} };
  for (const [name, { key, scale }] of Object.entries(vars)) {
    out.vars[name] = Array.from({ length: hours }, (_, k) => locs.map((loc) => {
      const times = (loc.hourly.time as string[]).map((t) => Math.floor(Date.parse(t.endsWith('Z') ? t : `${t}Z`) / 3_600_000));
      const i = times.indexOf(fromHour + k);
      const v = i < 0 ? null : ((loc.hourly[key] as (number | null)[] | undefined)?.[i] ?? null);
      return v === null ? null : Math.round(v * scale);
    }));
  }
  return out;
}
