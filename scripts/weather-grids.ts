// P2/P5: hourly in GitHub Actions (score.yml, before scoring). Builds from Open-Meteo:
//   - model_spread: 4 weather models at every spot weather cell → wind/gust/direction/rain/cloud spread per hour
//   - grid_wx: wind speed + direction, precipitation, cloud cover on a 0.1° lattice (map layers)
//   - grid_sea: wave height and sea-surface temperature on the same lattice
// and stores them in D1 meta; the Worker serves them as stored JSON (GET /api/grid/:name). Currents come from the
// Copernicus Marmara 500 m job (ocean.yml → grid_cur). Skips when the stored grids are under 50 min old unless --force.
// Usage: node .score/grids.mjs [--force] [--dry-run]
import { readFileSync } from 'node:fs';
import { buildGrid, cellSpread, LATTICE, latticePoints, SPREAD_MODELS, SPREAD_VARS, type SpreadDoc } from '../workers/api/src/lib/spread';

const force = process.argv.includes('--force');
const dry = process.argv.includes('--dry-run');
const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token || !account) throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required');
const dbId = /database_id\s*=\s*"([^"]+)"/.exec(readFileSync(new URL('../workers/api/wrangler.toml', import.meta.url), 'utf8'))?.[1];
if (!dbId) throw new Error('database_id not found in wrangler.toml');
const UA = { headers: { 'user-agent': 'av-livn/0.1 (+https://av.livn.tr)' } };
const HOURS = 72;

async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${dbId}/query`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ sql, params }),
    });
    const body = (await res.json().catch(() => null)) as { success: boolean; errors?: unknown[]; result?: { results: T[] }[] } | null;
    if (res.ok && body?.success) return body.result?.[0]?.results ?? [];
    if (attempt >= 3) throw new Error(`D1 query failed (${res.status}): ${JSON.stringify(body?.errors ?? body)}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}
async function om<T>(url: string): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(url, UA);
    if (r.ok) return (await r.json()) as T;
    if (attempt >= 3 || ![429, 500, 502, 503, 504].includes(r.status)) throw new Error(`open-meteo ${r.status}: ${(await r.text()).slice(0, 200)}`);
    await new Promise((res) => setTimeout(res, 4000 * attempt));
  }
}
const put = (k: string, v: unknown) => (dry ? Promise.resolve(console.log(`dry: ${k} ${JSON.stringify(v).length} bytes`)) : query('INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [k, JSON.stringify(v)]));

const now = new Date();
const fromHour = Math.floor(now.getTime() / 3_600_000);
if (!force) {
  const last = (await query<{ value: string }>("SELECT value FROM meta WHERE key = 'grid_wx'"))[0]?.value;
  const built = last ? Date.parse((JSON.parse(last) as { built_at?: string }).built_at ?? '') : NaN;
  if (Number.isFinite(built) && (now.getTime() - built) / 60_000 < 50) {
    console.log(`grids: built ${Math.round((now.getTime() - built) / 60_000)} min ago, nothing to do`);
    process.exit(0);
  }
}
const list = (xs: number[]) => xs.join(',');
type Loc = { hourly: Record<string, (number | null)[] | string[]> };
const asList = <T>(x: T | T[]) => (Array.isArray(x) ? x : [x]);

// 1) model spread at the spots' weather cells (one multi-location, multi-model request)
const cells = await query<{ id: string; lat: number; lon: number }>("SELECT id, lat, lon FROM cells WHERE kind = 'wx' ORDER BY id");
const q = new URLSearchParams({ latitude: list(cells.map((c) => c.lat)), longitude: list(cells.map((c) => c.lon)), hourly: SPREAD_VARS.join(','), models: SPREAD_MODELS.join(','), forecast_days: '4', timezone: 'GMT', wind_speed_unit: 'kmh' });
const sp = asList(await om<Loc | Loc[]>(`https://api.open-meteo.com/v1/forecast?${q}`));
const spread: SpreadDoc = { from_hour: fromHour, hours: HOURS, models: [...SPREAD_MODELS], built_at: now.toISOString(), cells: cells.map((c, i) => cellSpread(c.id, c.lat, c.lon, sp[i]!.hourly, fromHour, HOURS)) };
const answered = SPREAD_MODELS.filter((m) => spread.cells.some((c) => c.m[m]!.some((x) => x !== null)));
console.log(`spread: ${cells.length} cells, models with data: ${answered.join(', ')}`);
await put('model_spread', spread);

// 2) weather grid for the map layers
const pts = latticePoints();
const gq = (extra: Record<string, string>) => new URLSearchParams({ latitude: list(pts.map((p) => p.lat)), longitude: list(pts.map((p) => p.lon)), forecast_days: '4', timezone: 'GMT', ...extra });
const wx = asList(await om<Loc | Loc[]>(`https://api.open-meteo.com/v1/forecast?${gq({ hourly: 'wind_speed_10m,wind_direction_10m,precipitation,cloud_cover', wind_speed_unit: 'kmh' })}`));
await put('grid_wx', buildGrid(wx, { ws: { key: 'wind_speed_10m', scale: 1 }, wd: { key: 'wind_direction_10m', scale: 1 }, pr: { key: 'precipitation', scale: 10 }, cc: { key: 'cloud_cover', scale: 1 } }, fromHour, HOURS, LATTICE, 'Open-Meteo (best_match), tahmin', now));
console.log(`grid_wx: ${wx.length} points`);

// 3) sea grid (waves, sea-surface temperature); land points come back empty
const sea = asList(await om<Loc | Loc[]>(`https://marine-api.open-meteo.com/v1/marine?${gq({ hourly: 'wave_height,sea_surface_temperature' })}`));
await put('grid_sea', buildGrid(sea, { wh: { key: 'wave_height', scale: 100 }, sst: { key: 'sea_surface_temperature', scale: 10 } }, fromHour, HOURS, LATTICE, 'Open-Meteo Marine, tahmin', now));
console.log(`grid_sea: ${sea.length} points`);
