// Staleness threshold (docs/MODEL.md §18): besides the fetch time, the age of the forecast itself — the
// initialisation time of the model run behind the data. Open-Meteo's forecast/marine responses do not carry it;
// its per-model metadata does (`/data/<model>/static/meta.json`: last_run_initialisation_time,
// last_run_availability_time, update_interval_seconds). We request `best_match`, so which model that is for Bursa
// is checked once (on request or weekly) by comparing best_match values with each candidate model's values for
// one cell. Until a candidate matches exactly, the model age counts as unknown and only the fetch rule applies.
import type { Env } from '../env';

export type Kind = 'wx' | 'sea';
export const MODEL_CANDIDATES: Record<Kind, string[]> = {
  wx: ['dwd_icon_eu', 'dwd_icon', 'ecmwf_ifs025', 'ncep_gfs013'],
  sea: ['meteofrance_wave', 'dwd_ewam', 'ecmwf_wam025', 'dwd_gwam'],
};
const HOST: Record<Kind, string> = { wx: 'https://api.open-meteo.com', sea: 'https://marine-api.open-meteo.com' };
const PATH: Record<Kind, string> = { wx: '/v1/forecast', sea: '/v1/marine' };
/** Variables compared when identifying the model (the ones the safety gate and the score lean on most). */
const CHECK_VARS: Record<Kind, string[]> = { wx: ['wind_speed_10m', 'wind_gusts_10m', 'temperature_2m'], sea: ['wave_height'] };
const UA = { headers: { 'user-agent': 'av-livn/0.1 (+https://av.livn.tr)' } };

export interface ModelRun { model: string; init: string; available: string | null; interval_s: number }
export interface WeatherRuns { wx: ModelRun | null; sea: ModelRun | null; fetch: { at: string; ok: boolean; errors: number } }

export const metaUrl = (kind: Kind, model: string) => `${HOST[kind]}/data/${model}/static/meta.json`;

/** meta.json → run info; anything missing or malformed → null (unknown, never guessed). */
export function parseRunMeta(model: string, j: unknown): ModelRun | null {
  const o = j as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') return null;
  const init = o.last_run_initialisation_time, avail = o.last_run_availability_time, iv = o.update_interval_seconds;
  if (typeof init !== 'number' || !Number.isFinite(init) || typeof iv !== 'number' || iv <= 0) return null;
  return { model, init: new Date(init * 1000).toISOString(), available: typeof avail === 'number' ? new Date(avail * 1000).toISOString() : null, interval_s: iv };
}

/** The candidate whose series equals best_match on every compared value (≥ 24 non-null), else null. */
export function matchModel(best: Record<string, (number | null)[]>, cands: [string, Record<string, (number | null)[]>][]): string | null {
  for (const [model, h] of cands) {
    let n = 0, same = true;
    for (const k of Object.keys(best)) {
      const a = best[k]!, b = h[k];
      if (!b) { same = false; break; }
      for (let i = 0; i < a.length; i++) {
        if (a[i] == null || b[i] == null) continue;
        if (Math.abs(a[i]! - b[i]!) > 1e-9) { same = false; break; }
        n++;
      }
      if (!same) break;
    }
    if (same && n >= 24) return model;
  }
  return null;
}

async function series(kind: Kind, cell: { lat: number; lon: number }, model: string, fetcher: typeof fetch): Promise<Record<string, (number | null)[]> | null> {
  const q = new URLSearchParams({ latitude: String(cell.lat), longitude: String(cell.lon), hourly: CHECK_VARS[kind].join(','), forecast_days: '2', timezone: 'GMT', models: model });
  if (kind === 'wx') q.set('wind_speed_unit', 'kmh');
  const r = await fetcher(`${HOST[kind]}${PATH[kind]}?${q}`, UA).catch(() => null);
  if (!r?.ok) return null;
  const j = (await r.json().catch(() => null)) as { hourly?: Record<string, (number | null)[]> } | null;
  if (!j?.hourly) return null;
  return Object.fromEntries(CHECK_VARS[kind].map((k) => [k, j.hourly![k] ?? []]));
}

/** Which model best_match is for this cell (null = none of the candidates matched or a request failed). */
export async function identifyModel(kind: Kind, cell: { lat: number; lon: number }, fetcher: typeof fetch = fetch): Promise<string | null> {
  const best = await series(kind, cell, 'best_match', fetcher);
  if (!best) return null;
  const cands: [string, Record<string, (number | null)[]>][] = [];
  for (const m of MODEL_CANDIDATES[kind]) {
    const s = await series(kind, cell, m, fetcher);
    if (s) cands.push([m, s]);
    const hit = matchModel(best, cands.slice(-1));
    if (hit) return hit;
  }
  return null;
}

const getMeta = async (env: Env, k: string) => (await env.DB.prepare('SELECT value FROM meta WHERE key = ?1').bind(k).first<{ value: string }>())?.value ?? null;
const setMeta = (env: Env, k: string, v: string) => env.DB.prepare('INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, v).run();
const IDENTITY_MAX_AGE_MS = 7 * 24 * 3_600_000;

/**
 * Hourly from the cron, after the weather fetch: identify the models when asked (meta.model_check =
 * "requested") or weekly, read their run metadata and store meta.weather_runs for the score job's bodies.
 */
export async function recordWeatherRuns(env: Env, now: Date, fetchOk: boolean, errors: number, fetcher: typeof fetch = fetch): Promise<WeatherRuns> {
  type Ident = { wx: string | null; sea: string | null; checked_at: string };
  let ident: Ident | null = null;
  try { ident = JSON.parse((await getMeta(env, 'model_identity')) ?? 'null'); } catch { ident = null; }
  const asked = (await getMeta(env, 'model_check')) === 'requested';
  if (asked || !ident || now.getTime() - Date.parse(ident.checked_at) > IDENTITY_MAX_AGE_MS) {
    const cells = (await env.DB.prepare('SELECT kind, lat, lon FROM cells ORDER BY id').all<{ kind: Kind; lat: number; lon: number }>()).results;
    const one = (k: Kind) => cells.find((c) => c.kind === k);
    const wxCell = one('wx'), seaCell = one('sea');
    ident = {
      wx: wxCell ? await identifyModel('wx', wxCell, fetcher) : null,
      sea: seaCell ? await identifyModel('sea', seaCell, fetcher) : null,
      checked_at: now.toISOString(),
    };
    await setMeta(env, 'model_identity', JSON.stringify(ident));
    if (asked) await setMeta(env, 'model_check', JSON.stringify({ done: now.toISOString(), ...ident }));
  }
  const run = async (kind: Kind, model: string | null) => {
    if (!model) return null;
    const r = await fetcher(metaUrl(kind, model), UA).catch(() => null);
    return r?.ok ? parseRunMeta(model, await r.json().catch(() => null)) : null;
  };
  const out: WeatherRuns = { wx: await run('wx', ident.wx), sea: await run('sea', ident.sea), fetch: { at: now.toISOString(), ok: fetchOk, errors } };
  await setMeta(env, 'weather_runs', JSON.stringify(out));
  return out;
}
