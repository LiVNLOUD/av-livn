// Hourly precomputation of scores + condition suitability per spot, so request handlers only read JSON.
import { conditionsAt, indexSeries, PROFILES, scoreSeries, type SpeciesProfile } from '@av-livn/scoring';
import type { Env } from './env';
import { mergeSnapshots } from './lib/series';
import { haversineKm, loadSnapshots, toSpotInput, type SpotRow } from './lib/spots';

export const HOURS = 75; // 72 h shown + slack until the next cron run
const HOUR = 3_600_000;

export function scorableProfiles(): SpeciesProfile[] {
  return Object.values(PROFILES).filter((p) => Object.keys(p.weights).length > 0);
}

export interface DetailHour {
  ts: string;
  total: number | null;
  raw: number | null;
  gated: boolean;
  warnings: string[];
  missing: string[];
  components: { key: string; weight: number; value: number | null; contribution: number | null; reason: string }[];
  multipliers: { key: string; value: number; phase: string; reason: string }[];
  conditions: { key: string; display: string | null; suitability: number | null; band: string }[];
}

export interface Detail {
  meta: {
    computed_at: string;
    weather_fetched_at: string | null;
    sea_fetched_at: string | null;
    sea_grid: { lat: number; lon: number; distance_km: number } | null;
    conditions: { key: string; label: string; target: string; affects: boolean }[];
  };
  hours: DetailHour[];
}

/** Pure: score one spot for HOURS hours from the hour containing `now`. */
export function computeSpot(
  row: SpotRow,
  wx: { snap: import('./lib/openmeteo').Snapshot; fetched_at: string } | undefined,
  sea: { snap: import('./lib/openmeteo').Snapshot; fetched_at: string } | undefined,
  profile: SpeciesProfile,
  now: Date,
): { startHour: number; list: [number | null, 0 | 1, string | null, number][]; detail: Detail } {
  const spot = toSpotInput(row);
  const points = mergeSnapshots(wx?.snap, sea?.snap);
  const index = indexSeries(points);
  const startHour = Math.floor(now.getTime() / HOUR);
  const scores = scoreSeries({ spot, from: now, hours: HOURS, profile, points });
  let condMeta: Detail['meta']['conditions'] = [];
  const hours: DetailHour[] = scores.map((s, i) => {
    const conds = conditionsAt({ spot, at: new Date((startHour + i) * HOUR), profile, index });
    if (i === 0) condMeta = conds.map((c) => ({ key: c.key, label: c.label, target: c.target, affects: c.affects }));
    return {
      ...s,
      conditions: conds.map((c) => ({ key: c.key, display: c.display, suitability: c.suitability === null ? null : Math.round(c.suitability * 1000) / 1000, band: c.band })),
    };
  });
  const seaGrid =
    sea?.snap.lat !== undefined && sea.snap.lon !== undefined
      ? { lat: sea.snap.lat, lon: sea.snap.lon, distance_km: Math.round(haversineKm(row.lat, row.lon, sea.snap.lat, sea.snap.lon) * 10) / 10 }
      : null;
  return {
    startHour,
    list: scores.map((s) => [s.total, s.gated ? 1 : 0, s.warnings[0] ?? null, s.missing.length]),
    detail: {
      meta: { computed_at: now.toISOString(), weather_fetched_at: wx?.fetched_at ?? null, sea_fetched_at: sea?.fetched_at ?? null, sea_grid: seaGrid, conditions: condMeta },
      hours,
    },
  };
}

function upsert(env: Env, r: SpotRow, profile: SpeciesProfile, now: Date, out: ReturnType<typeof computeSpot>): D1PreparedStatement {
  return env.DB.prepare(
    `INSERT INTO spot_scores (spot_id, species, computed_at, start_hour, list_json, detail_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(spot_id, species) DO UPDATE SET computed_at = excluded.computed_at, start_hour = excluded.start_hour, list_json = excluded.list_json, detail_json = excluded.detail_json`,
  ).bind(r.id, profile.id, now.toISOString(), out.startHour, JSON.stringify(out.list), JSON.stringify(out.detail));
}

async function scoreRows(env: Env, rows: SpotRow[], now: Date): Promise<void> {
  if (rows.length === 0) return;
  const snaps = await loadSnapshots(env.DB, rows.flatMap((r) => (r.sea_cell ? [r.wx_cell, r.sea_cell] : [r.wx_cell])));
  const stmts: D1PreparedStatement[] = [];
  for (const profile of scorableProfiles()) {
    for (const r of rows) {
      stmts.push(upsert(env, r, profile, now, computeSpot(r, snaps.get(r.wx_cell), r.sea_cell ? snaps.get(r.sea_cell) : undefined, profile, now)));
    }
  }
  await env.DB.batch(stmts);
}

/** Re-score a single spot right away (after an admin edit). */
export async function rescoreSpot(env: Env, row: SpotRow, now = new Date()): Promise<void> {
  await scoreRows(env, [row], now);
}

/**
 * Score spots of one group (spots sorted by id, index % groups === group). Splitting across cron
 * minutes keeps each invocation inside the free plan's CPU budget.
 */
export async function scoreGroup(env: Env, now: Date, group: number, groups: number): Promise<{ spots: number }> {
  const { results } = await env.DB.prepare("SELECT * FROM spots WHERE status != 'rejected' ORDER BY id").all<SpotRow>();
  const mine = results.filter((_, i) => i % groups === group);
  await scoreRows(env, mine, now);
  return { spots: mine.length };
}
