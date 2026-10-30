import type { SpotInput } from '@av-livn/scoring';
import type { Snapshot } from './openmeteo';

export interface SpotRow {
  id: string;
  name: string;
  kind: string;
  lat: number;
  lon: number;
  probe_lat: number | null;
  probe_lon: number | null;
  probe_ok: number | null;
  shore_normal_deg: number | null;
  length_m: number | null;
  depth_200m: number | null;
  slope: number | null;
  slope_pct?: number | null;
  max_depth_100m?: number | null;
  profile_json?: string | null;
  probe_source?: string | null;
  normal_source?: string | null;
  osm_normal_deg?: number | null;
  alt_lat?: number | null;
  alt_lon?: number | null;
  tip_source?: string | null;
  fetch_json?: string | null;
  substrate?: string | null;
  substrate_biozone?: string | null;
  substrate_dist_m?: number | null;
  substrate_conf?: number | null;
  access?: string | null;
  has_light: number | null;
  status: string;
  place: string | null;
  notes: string | null;
  source: string;
  wx_cell: string;
  sea_cell: string | null;
  admin_edited_at: string | null;
  updated_at: string;
}

export const STATUSES = ['candidate', 'verified', 'rejected'] as const;

export function toSpotInput(r: SpotRow): SpotInput {
  return { lat: r.lat, lon: r.lon, shoreNormalDeg: r.shore_normal_deg, hasLight: r.has_light === null ? null : r.has_light === 1 };
}

export function publicSpot(r: SpotRow) {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    status: r.status,
    place: r.place,
    lat: r.lat,
    lon: r.lon,
    probe: r.probe_lat === null || r.probe_lon === null ? null : { lat: r.probe_lat, lon: r.probe_lon },
    /** Former (coastline-based) point when the spot was moved to the structure tip. */
    alt: r.alt_lat == null || r.alt_lon == null ? null : { lat: r.alt_lat, lon: r.alt_lon },
    shore_normal_deg: r.shore_normal_deg,
    length_m: r.length_m,
    depth_200m: r.depth_200m,
    slope_pct: r.slope_pct ?? null,
    max_depth_100m: r.max_depth_100m ?? null,
    probe_source: r.probe_source ?? null,
    normal_source: r.normal_source ?? null,
    has_light: r.has_light === null ? null : r.has_light === 1,
    access: r.access ?? null,
    notes: r.notes,
    source: r.source,
  };
}

export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export async function loadSnapshots(db: D1Database, ids: string[]): Promise<Map<string, { snap: Snapshot; fetched_at: string }>> {
  const out = new Map<string, { snap: Snapshot; fetched_at: string }>();
  const uniq = [...new Set(ids)];
  if (uniq.length === 0) return out;
  const { results } = await db
    .prepare(`SELECT cell_id, fetched_at, json FROM forecast_snapshots WHERE cell_id IN (${uniq.map((_, i) => `?${i + 1}`).join(',')})`)
    .bind(...uniq)
    .all<{ cell_id: string; fetched_at: string; json: string }>();
  for (const r of results) out.set(r.cell_id, { snap: JSON.parse(r.json) as Snapshot, fetched_at: r.fetched_at });
  return out;
}

/** Spot with its 0–500 m depth profile (detail endpoint only; the list stays small). */
export function publicSpotDetail(r: SpotRow) {
  return {
    ...publicSpot(r),
    profile: r.profile_json ? (JSON.parse(r.profile_json) as (number | null)[]) : null,
    fetch_km: r.fetch_json ? (JSON.parse(r.fetch_json) as number[]) : null,
    substrate: r.substrate == null ? null : { class: r.substrate, biozone: r.substrate_biozone ?? null, distance_m: r.substrate_dist_m ?? null, confidence: r.substrate_conf ?? null },
  };
}
