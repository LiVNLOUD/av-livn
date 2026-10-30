import { env } from 'cloudflare:workers';
import forecast from './fixtures/om-forecast.json';
import marine from './fixtures/om-marine.json';
import { seedSql, type SpotFeature } from '../src/lib/seed';

export const SPOTS: SpotFeature[] = [
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [28.883, 40.376] },
    properties: {
      id: 'osm-way-1', name: 'Mudanya İskelesi', kind: 'pier', shore_normal_deg: 0, probe_lat: 40.383, probe_lon: 28.883,
      probe_ok: true, length_m: 120, depth_200m: 8.5, slope_pct: 3.1, max_depth_100m: 5.2, profile: [1, 2.5, 4, 5.5, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.4, 11, 11.5, 12, 12.5, 13, 13.4, 14, 14.5], probe_source: 'dtm', normal_source: 'dtm', osm_normal_deg: 52, has_light: null, status: 'candidate', place: 'Mudanya',
      alt_lat: 40.375, alt_lon: 28.883, tip_source: 'land', fetch_km: [12, 12, 8, 3, 1, 0, 0, 0, 0, 0, 0, 0, 1, 3, 8, 12], substrate: 'Sandy mud', substrate_biozone: 'Infralittoral', substrate_dist_m: 0, substrate_conf: 2,
    },
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [29.03, 40.36] },
    properties: {
      id: 'osm-way-2', name: "Kumla'nın Mendireği", kind: 'breakwater', shore_normal_deg: 200, probe_lat: 40.353, probe_lon: 29.027,
      probe_ok: false, length_m: 80, depth_200m: null, slope_pct: null, has_light: null, status: 'candidate', place: 'Kumla',
    },
  },
  {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [28.95, 40.42] },
    properties: {
      id: 'osm-way-3', name: 'Probsuz', kind: 'groyne', shore_normal_deg: null, probe_lat: null, probe_lon: null,
      probe_ok: null, length_m: 30, depth_200m: null, slope_pct: null, has_light: null, status: 'candidate', place: null,
    },
  },
];

export async function runSql(sql: string): Promise<void> {
  const lines = sql.split('\n').filter((l) => l.trim());
  await env.DB.batch(lines.map((l) => env.DB.prepare(l)));
}

export async function resetAndSeed(features = SPOTS): Promise<void> {
  await env.DB.batch(['DELETE FROM spots', 'DELETE FROM cells', 'DELETE FROM forecast_snapshots', 'DELETE FROM observations'].map((q) => env.DB.prepare(q)));
  await runSql(seedSql({ features }, '2026-10-30T00:00:00.000Z'));
}

type Loc = { latitude: number; longitude: number; hourly: { time: string[] } & Record<string, unknown> };

/** Real Open-Meteo responses with timestamps shifted so hour 0 is `start`. One location per requested coordinate. */
export function shifted(kind: 'wx' | 'sea', start: Date, n: number): Loc[] {
  const src = (kind === 'wx' ? forecast : marine) as unknown as Loc[];
  return Array.from({ length: n }, (_, i) => {
    const loc = structuredClone(src[i % src.length]!);
    loc.hourly.time = loc.hourly.time.map((_t, h) => new Date(start.getTime() + h * 3_600_000).toISOString().slice(0, 16));
    return loc;
  });
}

/** fetch() stub answering Open-Meteo forecast/marine URLs with shifted fixtures. */
export function omFetch(now: Date, calls: string[] = []): typeof fetch {
  const hour = new Date(now);
  hour.setUTCMinutes(0, 0, 0);
  return (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    calls.push(url.toString());
    const n = url.searchParams.get('latitude')!.split(',').length;
    const kind = url.hostname.startsWith('marine') ? 'sea' : 'wx';
    const past = Number(url.searchParams.get('past_days'));
    const start = new Date(hour.getTime() - past * 24 * 3_600_000 - hour.getUTCHours() * 3_600_000);
    return Response.json(n === 1 ? shifted(kind, start, 1)[0] : shifted(kind, start, n));
  }) as typeof fetch;
}

/** Same writes as the hourly GitHub Actions scoring job (scripts/score-job.ts), via the D1 binding. */
export async function writeScores(now = new Date()): Promise<number> {
  const { scoreRecords, UPSERT_SCORE_SQL, DELETE_STALE_SCORES_SQL } = await import('../src/precompute');
  const { loadSnapshots } = await import('../src/lib/spots');
  const { results } = await env.DB.prepare("SELECT * FROM spots WHERE status != 'rejected' ORDER BY id").all();
  const rows = results as unknown as import('../src/lib/spots').SpotRow[];
  const snaps = await loadSnapshots(env.DB, rows.flatMap((r) => (r.sea_cell ? [r.wx_cell, r.sea_cell] : [r.wx_cell])));
  const recs = scoreRecords(rows, snaps, now);
  await env.DB.batch([
    ...recs.map((r) => env.DB.prepare(UPSERT_SCORE_SQL).bind(r.spot_id, r.species, r.computed_at, r.start_hour, r.list_json, r.detail_json)),
    env.DB.prepare(DELETE_STALE_SCORES_SQL),
  ]);
  return recs.length;
}
