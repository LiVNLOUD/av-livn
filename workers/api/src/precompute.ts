// Hourly precomputation of scores + condition suitability per spot, so request handlers only read JSON.
import { conditionsAt, indexSeries, packDetail, PROFILES, scoreSeries, type Detail, type DetailHour, type SpeciesProfile } from '@av-livn/scoring';
export { packDetail, unpackDetail, type Detail, type PackedDetail } from '@av-livn/scoring';
import { mergeSnapshots } from './lib/series';
import { haversineKm, toSpotInput, type SpotRow } from './lib/spots';

export const HOURS = 75; // 72 h shown + slack until the next hourly scoring run
const HOUR = 3_600_000;

export function scorableProfiles(): SpeciesProfile[] {
  return Object.values(PROFILES).filter((p) => Object.keys(p.weights).length > 0);
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

export interface ScoreRecord {
  spot_id: string;
  species: string;
  computed_at: string;
  start_hour: number;
  list_json: string;
  detail_json: string;
}

type SnapMap = Map<string, { snap: import('./lib/openmeteo').Snapshot; fetched_at: string }>;

/**
 * Pure: score every spot for every scorable species. Runs hourly in GitHub Actions (scripts/score-job.ts):
 * measured in a Worker cron it took ~99 ms CPU for five spots on a cold isolate, far above the free plan's
 * 10 ms, so the Worker only fetches weather and serves the stored results.
 */
export function scoreRecords(rows: SpotRow[], snaps: SnapMap, now: Date): ScoreRecord[] {
  const out: ScoreRecord[] = [];
  for (const profile of scorableProfiles()) {
    for (const r of rows) {
      const res = computeSpot(r, snaps.get(r.wx_cell), r.sea_cell ? snaps.get(r.sea_cell) : undefined, profile, now);
      out.push({
        spot_id: r.id,
        species: profile.id,
        computed_at: now.toISOString(),
        start_hour: res.startHour,
        list_json: JSON.stringify(res.list),
        detail_json: JSON.stringify(packDetail(res.detail)),
      });
    }
  }
  return out;
}

export const UPSERT_SCORE_SQL = `INSERT INTO spot_scores (spot_id, species, computed_at, start_hour, list_json, detail_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
ON CONFLICT(spot_id, species) DO UPDATE SET computed_at = excluded.computed_at, start_hour = excluded.start_hour, list_json = excluded.list_json, detail_json = excluded.detail_json`;

export const DELETE_STALE_SCORES_SQL = `DELETE FROM spot_scores WHERE spot_id NOT IN (SELECT id FROM spots WHERE status NOT IN ('rejected', 'proposed'))`;
