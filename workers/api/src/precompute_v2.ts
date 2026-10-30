// v2 precomputation (docs/MODEL.md): hourly in GitHub Actions for all spots (Monte Carlo band, ranks), and
// for one spot right after a field entry (no band draws: the previous band offsets are reused, see rescoreSpot).
import {
  fieldDepths, MODEL_VERSION, PROFILES, ranks, scoreSeriesV2,
  type ConvertedDepth, type FieldStructure, type FieldSubstrate, type SinkCalibration, type SpotV2, type StructureKind, type V2Hour,
} from '@av-livn/scoring';
import type { HourlyPoint } from '@av-livn/scoring';
import type { Snapshot } from './lib/openmeteo';
import { mergeSnapshots } from './lib/series';
import { haversineKm, type SpotRow } from './lib/spots';

export const HOURS_V2 = 75;
export const DRAWS = 200;
const HOUR = 3_600_000;
const SAFETY = PROFILES.istavrit!;

export type Snap = { snap: Snapshot; fetched_at: string };

export interface FieldObsRow {
  id: string;
  spot_id: string;
  observed_at: string;
  substrate: string | null;
  snag: string | null;
  structure: string | null;
  has_light: number | null;
  light_color: string | null;
  access: string | null;
  note: string | null;
}
export interface FieldDepthRow {
  obs_id: string;
  distance_m: number;
  method: 'plumb' | 'sink';
  depth_m: number | null;
  sink_s: number | null;
  jig_g: number | null;
}

/** Field knowledge of one spot: latest non-null value per field over all observations, all depth pairs. */
export interface FieldRecord {
  latestAt: string;
  substrate: FieldSubstrate[] | null;
  snag: string | null;
  structure: FieldStructure | null;
  lightColor: string | null;
  depths: ConvertedDepth[];
  calibration: SinkCalibration | null;
  lastDepthAt: string | null;
}

export function fieldRecords(obs: FieldObsRow[], depths: FieldDepthRow[]): Map<string, FieldRecord> {
  const out = new Map<string, FieldRecord>();
  const bySpot = new Map<string, FieldObsRow[]>();
  for (const o of obs) bySpot.set(o.spot_id, [...(bySpot.get(o.spot_id) ?? []), o]);
  for (const [spot, list] of bySpot) {
    const sorted = [...list].sort((a, b) => a.observed_at.localeCompare(b.observed_at));
    const latest = <K extends keyof FieldObsRow>(k: K) => [...sorted].reverse().find((o) => o[k] !== null)?.[k] ?? null;
    const ids = new Set(sorted.map((o) => o.id));
    const ds = depths.filter((d) => ids.has(d.obs_id));
    const plumbs = ds.filter((d) => d.method === 'plumb' && d.depth_m !== null).map((d) => ({ distance_m: d.distance_m, depth_m: d.depth_m! }));
    const sinks = ds.filter((d) => d.method === 'sink' && d.sink_s !== null && d.jig_g !== null).map((d) => ({ distance_m: d.distance_m, sink_s: d.sink_s!, jig_g: d.jig_g! }));
    const conv = fieldDepths(sinks, plumbs);
    const depthObs = sorted.filter((o) => ds.some((d) => d.obs_id === o.id));
    const sub = latest('substrate');
    out.set(spot, {
      latestAt: sorted[sorted.length - 1]!.observed_at,
      substrate: sub ? (JSON.parse(sub) as FieldSubstrate[]) : null,
      snag: latest('snag'),
      structure: latest('structure') as FieldStructure | null,
      lightColor: latest('light_color'),
      depths: conv.depths,
      calibration: conv.calibration,
      lastDepthAt: depthObs.length ? depthObs[depthObs.length - 1]!.observed_at : null,
    });
  }
  return out;
}

const SNAG: Record<string, FieldSubstrate | null> = { yosun: 'yosunlu', midye: 'midyeli', camur: 'camur', hicbiri: null };

function bandMean(profile: (number | null)[] | null, a: number, b: number): number | null {
  const v = (profile ?? []).slice(a, b).filter((x): x is number => x !== null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
}

/** Spot row (+ field record) → v2 model input. */
export function spotV2(row: SpotRow, field?: FieldRecord): SpotV2 & { lat: number; lon: number } {
  const profile = row.profile_json ? (JSON.parse(row.profile_json) as (number | null)[]) : null;
  return {
    lat: row.lat,
    lon: row.lon,
    kind: (['pier', 'breakwater', 'groyne'].includes(row.kind) ? row.kind : 'manual') as StructureKind,
    ferry: row.access === 'kisitli_feribot',
    lengthM: row.length_m,
    // profile: 25 m steps from the tip; DTM cells near shore are all interpolated (docs/DATA-AUDIT.md §1).
    dtm: { d0_50: bandMean(profile, 0, 3), d50_150: bandMean(profile, 2, 7), interpolated: true },
    fieldDepths: field?.depths.length ? field.depths : null,
    substrate: { eusm: row.substrate ?? null, conf: row.substrate_conf ?? null, field: field?.substrate ?? null, hint: field?.snag ? SNAG[field.snag]! : null },
    fieldStructure: field?.structure ?? null,
    fetchKm: row.fetch_json ? (JSON.parse(row.fetch_json) as number[]) : null,
    lamp: row.has_light === null ? null : row.has_light === 1,
  };
}

export interface OceanSeries {
  t0: string;
  cell: { lat: number; lon: number; distance_km: number };
  sst: (number | null)[];
  cur: (number | null)[] | null;
}
export interface OceanNormal {
  from: string;
  to: string;
  years: number;
  cell: { lat: number; lon: number; distance_km: number };
  normal: (number | null)[];
}
export interface Ocean {
  series?: { fetched_at: string; data: OceanSeries };
  normal?: { computed_at: string; data: OceanNormal };
}

/**
 * Overlay Copernicus on the Open-Meteo points: water temperature (1–20 m) and current (1–5 m) where the model
 * has a value, marked sstSource 'copernicus'; the short normal for each point's day of year.
 */
export function applyOcean(points: HourlyPoint[], ocean: Ocean | undefined): HourlyPoint[] {
  if (!ocean?.series && !ocean?.normal) return points;
  const byTs = new Map(points.map((p) => [Date.parse(p.ts), { ...p }]));
  const s = ocean.series?.data;
  if (s) {
    const t0 = Date.parse(s.t0);
    s.sst.forEach((v, i) => {
      if (v === null) return;
      const t = t0 + i * HOUR;
      const p = byTs.get(t) ?? { ts: new Date(t).toISOString() };
      p.sst = v;
      p.sstSource = 'copernicus';
      const c = s.cur?.[i];
      if (c !== undefined && c !== null) p.curVel = c;
      byTs.set(t, p);
    });
  }
  const n = ocean.normal?.data.normal;
  if (n) {
    for (const [t, p] of byTs) {
      const d = new Date(t);
      const doy = Math.floor((t - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000);
      p.sstNormal = n[doy] ?? null;
    }
  }
  return [...byTs.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
}

/** Compact v2 detail: component metadata once, per-hour arrays. */
export interface PackedV2 {
  v: 2;
  meta: {
    model_version: string;
    computed_at: string;
    weather_fetched_at: string | null;
    sea_fetched_at: string | null;
    sea_grid: { lat: number; lon: number; distance_km: number } | null;
    field_at: string | null;
    depth_field_at: string | null;
    sink_calibration: SinkCalibration | null;
    ocean: { fetched_at: string; cell: OceanSeries['cell'] } | null;
    ocean_normal: { years: number; from: string; to: string } | null;
    comps: [string, string, string, number | null, string, string][];
  };
  /** [ts, total, raw, p10, p90, gated, warnings, wNight, lampP, values[], reasons[]] */
  h: [string, number | null, number | null, number | null, number | null, 0 | 1, string[], number, number | null, (number | null)[], string[]][];
}

const r3 = (x: number | null) => (x === null ? null : Math.round(x * 1000) / 1000);

export function packV2(hours: V2Hour[], meta: Omit<PackedV2['meta'], 'comps' | 'model_version'>): PackedV2 {
  const first = hours[0]!;
  return {
    v: 2,
    meta: { model_version: MODEL_VERSION, ...meta, comps: first.components.map((c) => [c.key, c.label, c.group, c.weight, c.source, c.evidence]) },
    h: hours.map((h) => [h.ts, h.total, h.raw, h.p10, h.p90, h.gated ? 1 : 0, h.warnings, h.wNight, h.lampP, h.components.map((c) => r3(c.value)), h.components.map((c) => c.reason)]),
  };
}

export function computeSpotV2(row: SpotRow, wx: Snap | undefined, sea: Snap | undefined, now: Date, field?: FieldRecord, draws = DRAWS, ocean?: Ocean) {
  const spot = spotV2(row, field);
  const points = applyOcean(mergeSnapshots(wx?.snap, sea?.snap), ocean);
  const startHour = Math.floor(now.getTime() / HOUR);
  const hours = scoreSeriesV2({ spot, points, from: now, hours: HOURS_V2, profile: SAFETY, draws });
  const seaGrid =
    sea?.snap.lat !== undefined && sea.snap.lon !== undefined
      ? { lat: sea.snap.lat, lon: sea.snap.lon, distance_km: Math.round(haversineKm(row.lat, row.lon, sea.snap.lat, sea.snap.lon) * 10) / 10 }
      : null;
  const packed = packV2(hours, {
    computed_at: now.toISOString(),
    weather_fetched_at: wx?.fetched_at ?? null,
    sea_fetched_at: sea?.fetched_at ?? null,
    sea_grid: seaGrid,
    field_at: field?.latestAt ?? null,
    depth_field_at: field?.lastDepthAt ?? null,
    sink_calibration: field?.calibration ?? null,
    ocean: ocean?.series ? { fetched_at: ocean.series.fetched_at, cell: ocean.series.data.cell } : null,
    ocean_normal: ocean?.normal ? { years: ocean.normal.data.years, from: ocean.normal.data.from, to: ocean.normal.data.to } : null,
  });
  return { startHour, hours, packed };
}

export interface ScoreRecordV2 {
  spot_id: string;
  model_version: string;
  computed_at: string;
  start_hour: number;
  list_json: string;
  detail_json: string;
}

/** [total, p10, p90, rank, gated, first warning] */
export type ListEntryV2 = [number | null, number | null, number | null, number, 0 | 1, string | null];

/** All spots, ranks per hour across spots. */
export function scoreRecordsV2(
  rows: SpotRow[],
  snaps: Map<string, Snap>,
  now: Date,
  fields: Map<string, FieldRecord>,
  draws = DRAWS,
  oceans: Map<string, Ocean> = new Map(),
): ScoreRecordV2[] {
  const res = rows.map((r) => computeSpotV2(r, snaps.get(r.wx_cell), r.sea_cell ? snaps.get(r.sea_cell) : undefined, now, fields.get(r.id), draws, oceans.get(r.id)));
  const rankAt = Array.from({ length: HOURS_V2 }, (_, i) => ranks(res.map((x) => x.hours[i]!.total)));
  return rows.map((r, k) => ({
    spot_id: r.id,
    model_version: MODEL_VERSION,
    computed_at: now.toISOString(),
    start_hour: res[k]!.startHour,
    list_json: JSON.stringify(res[k]!.hours.map((h, i): ListEntryV2 => [h.total, h.p10, h.p90, rankAt[i]![k]!, h.gated ? 1 : 0, h.warnings[0] ?? null])),
    detail_json: JSON.stringify(res[k]!.packed),
  }));
}

/**
 * Single-spot rescore after a field entry (Worker, no Monte Carlo): new expected score; the previous run's
 * band offsets (p10 − total, p90 − total) are reused per hour and ranks are recomputed against the other
 * spots' stored totals. Marked partial until the next hourly run replaces it.
 */
export function rescoreSpot(
  row: SpotRow,
  wx: Snap | undefined,
  sea: Snap | undefined,
  now: Date,
  field: FieldRecord | undefined,
  prev: { start_hour: number; list: ListEntryV2[] } | null,
  others: { start_hour: number; list: ListEntryV2[] }[],
  ocean?: Ocean,
): ScoreRecordV2 {
  const r = computeSpotV2(row, wx, sea, now, field, 0, ocean);
  const list = r.hours.map((h, i): ListEntryV2 => {
    const hour = r.startHour + i;
    const old = prev?.list[hour - prev.start_hour];
    const lo = h.total === null || !old || old[0] === null || old[1] === null ? null : Math.max(0, h.total + old[1] - old[0]);
    const hi = h.total === null || !old || old[0] === null || old[2] === null ? null : Math.min(100, h.total + old[2] - old[0]);
    const totals = [h.total, ...others.map((o) => o.list[hour - o.start_hour]?.[0] ?? null)];
    return [h.total, lo, hi, ranks(totals)[0]!, h.gated ? 1 : 0, h.warnings[0] ?? null];
  });
  r.packed.h.forEach((x, i) => {
    x[3] = list[i]![1];
    x[4] = list[i]![2];
  });
  return {
    spot_id: row.id,
    model_version: MODEL_VERSION,
    computed_at: now.toISOString(),
    start_hour: r.startHour,
    list_json: JSON.stringify(list),
    detail_json: JSON.stringify(r.packed),
  };
}

export const UPSERT_V2_SQL = `INSERT INTO spot_scores_v2 (spot_id, model_version, computed_at, start_hour, list_json, detail_json, partial) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
ON CONFLICT(spot_id) DO UPDATE SET model_version = excluded.model_version, computed_at = excluded.computed_at, start_hour = excluded.start_hour,
list_json = excluded.list_json, detail_json = excluded.detail_json, partial = excluded.partial`;

export const DELETE_STALE_V2_SQL = `DELETE FROM spot_scores_v2 WHERE spot_id NOT IN (SELECT id FROM spots WHERE status != 'rejected')`;

/** D1 rows of ocean_series / ocean_normal → per-spot Ocean. */
export function oceanMap(series: { spot_id: string; fetched_at: string; json: string }[], normals: { spot_id: string; computed_at: string; json: string }[]): Map<string, Ocean> {
  const out = new Map<string, Ocean>();
  for (const r of series) out.set(r.spot_id, { ...out.get(r.spot_id), series: { fetched_at: r.fetched_at, data: JSON.parse(r.json) as OceanSeries } });
  for (const r of normals) out.set(r.spot_id, { ...out.get(r.spot_id), normal: { computed_at: r.computed_at, data: JSON.parse(r.json) as OceanNormal } });
  return out;
}
