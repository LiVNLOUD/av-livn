import { fetchSnapshots, type CellCoord, type FetchStats } from './lib/openmeteo';
import { valuesAt } from './lib/series';
import type { Env } from './env';

const OBS_COLS: Record<string, string> = {
  pressure_msl: 'pressure', wind_speed_10m: 'wind_speed', wind_direction_10m: 'wind_dir', wind_gusts_10m: 'wind_gust',
  temperature_2m: 'temp', precipitation: 'precip', cloud_cover: 'cloud', wave_height: 'wave_h', wave_direction: 'wave_dir',
  sea_surface_temperature: 'sst', ocean_current_velocity: 'cur_vel', ocean_current_direction: 'cur_dir', sea_level_height_msl: 'sea_level',
};

export interface RefreshResult {
  wx: number;
  sea: number;
  errors: string[];
  /** Open-Meteo HTTP calls this run (retries included) and their statuses. */
  calls: number;
  statuses: number[];
}

/** Hourly job: fetch Open-Meteo for every cell, overwrite snapshots, append this hour's observation. */
export async function refreshWeather(
  env: Env,
  now = new Date(),
  fetcher: typeof fetch = fetch,
  sleep?: (ms: number) => Promise<void>,
): Promise<RefreshResult> {
  const { results } = await env.DB.prepare('SELECT id, kind, lat, lon FROM cells ORDER BY id').all<CellCoord & { kind: 'wx' | 'sea' }>();
  const hour = new Date(now);
  hour.setUTCMinutes(0, 0, 0);
  const ts = hour.toISOString();
  const errors: string[] = [];
  const stmts: D1PreparedStatement[] = [];
  const counts = { wx: 0, sea: 0 };
  const stats: FetchStats = { calls: 0, statuses: [] };
  for (const kind of ['wx', 'sea'] as const) {
    const cells = results.filter((c) => c.kind === kind);
    let snaps;
    try {
      snaps = await fetchSnapshots(kind, cells, fetcher, { stats, sleep });
    } catch (e) {
      // Last good snapshots stay in D1 untouched; scoring keeps using them (fetched_at shows their age).
      errors.push(String(e));
      continue;
    }
    for (const [cellId, snap] of snaps) {
      counts[kind]++;
      stmts.push(
        env.DB.prepare('INSERT INTO forecast_snapshots (cell_id, fetched_at, json) VALUES (?1, ?2, ?3) ON CONFLICT(cell_id) DO UPDATE SET fetched_at = excluded.fetched_at, json = excluded.json')
          .bind(cellId, now.toISOString(), JSON.stringify(snap)),
      );
      const vals = valuesAt(snap, hour);
      if (!vals) continue;
      const cols = Object.keys(vals).filter((k) => OBS_COLS[k]);
      const set = cols.map((k) => `${OBS_COLS[k]} = excluded.${OBS_COLS[k]}`).join(', ');
      stmts.push(
        env.DB.prepare(
          `INSERT INTO observations (cell_id, ts, ${cols.map((k) => OBS_COLS[k]).join(', ')}) VALUES (?1, ?2, ${cols.map((_, i) => `?${i + 3}`).join(', ')}) ON CONFLICT(cell_id, ts) DO UPDATE SET ${set}`,
        ).bind(cellId, ts, ...cols.map((k) => vals[k] ?? null)),
      );
    }
  }
  const result = { ...counts, errors, calls: stats.calls, statuses: stats.statuses };
  stmts.push(
    env.DB.prepare("INSERT INTO meta (key, value) VALUES ('om_last_run', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(
      JSON.stringify({ at: now.toISOString(), ...result }),
    ),
  );
  await env.DB.batch(stmts);
  console.log(JSON.stringify({ event: 'open_meteo', calls: stats.calls, statuses: stats.statuses, wx: counts.wx, sea: counts.sea, errors: errors.length }));
  return result;
}

/** Cron schedule (must match wrangler.toml). Scoring runs hourly in GitHub Actions (score.yml), not here. */
export const CRON_FETCH = '7 * * * *';

export async function runCron(cron: string, env: Env, now = new Date()): Promise<unknown> {
  if (cron === CRON_FETCH) return refreshWeather(env, now);
  throw new Error(`unknown cron ${cron}`);
}
