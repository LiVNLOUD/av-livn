// v2 precomputation (docs/MODEL.md): hourly in GitHub Actions for all spots (Monte Carlo band, ranks), and
// for one spot right after a field entry (no band draws: the previous band offsets are reused, see rescoreSpot).
import {
  DEFAULTS, explain, fieldDepths, indexSeries, lampPrior, MODEL_VERSION, PROFILES, ranks, scoreSeriesV2, weatherAt,
  type ConvertedDepth, type DriverKey, type FieldKind, type Weather, type FieldStructure, type FieldSubstrate, type SinkCalibration, type SpotV2, type StructureKind, type V2Hour,
} from '@av-livn/scoring';
import type { HourlyPoint } from '@av-livn/scoring';
import type { Snapshot } from './lib/openmeteo';
import { mergeSnapshots } from './lib/series';
import { ACTIVE, haversineKm, type SpotRow } from './lib/spots';

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
  /** saha > uzaktan > masabasi (migration 0008; absent in older rows = saha). */
  source_kind?: FieldKind;
  status?: 'onaysiz' | 'onayli' | 'reddedildi';
  light_prob?: number | null;
  evidence_json?: string | null;
}
export interface FieldDepthRow {
  obs_id: string;
  distance_m: number;
  method: 'plumb' | 'sink';
  depth_m: number | null;
  sink_s: number | null;
  jig_g: number | null;
}

/** Field knowledge of one spot: per attribute the highest-priority source (saha > uzaktan > masabasi), latest within it. */
export interface FieldRecord {
  latestAt: string;
  substrate: FieldSubstrate[] | null;
  substrateKind: FieldKind | null;
  /** Trust of the field substrate classes (saha 0.9, uzaktan 0.7, masabasi 0.35 low / 0.5 medium). */
  substrateWeight: number;
  snag: string | null;
  structure: FieldStructure | null;
  structureKind: FieldKind | null;
  lightColor: string | null;
  /** Lamp from the field table: known state (saha) or probability (uzaktan/masabasi). */
  lamp: { state: boolean | null; p: number | null; kind: FieldKind } | null;
  depths: ConvertedDepth[];
  depthKind: FieldKind | null;
  calibration: SinkCalibration | null;
  lastDepthAt: string | null;
}

const RANK: Record<FieldKind, number> = { saha: 0, uzaktan: 1, masabasi: 2 };
const kindOf = (o: FieldObsRow): FieldKind => o.source_kind ?? 'saha';

function deskWeight(o: FieldObsRow): number {
  const conf = o.evidence_json ? (JSON.parse(o.evidence_json) as { confidence?: string }).confidence : undefined;
  return conf === 'orta' ? 0.5 : 0.35;
}

export function fieldRecords(obs: FieldObsRow[], depths: FieldDepthRow[]): Map<string, FieldRecord> {
  const out = new Map<string, FieldRecord>();
  const bySpot = new Map<string, FieldObsRow[]>();
  for (const o of obs) if (o.status !== 'reddedildi') bySpot.set(o.spot_id, [...(bySpot.get(o.spot_id) ?? []), o]);
  for (const [spot, list] of bySpot) {
    // Best source first, then newest: the first row carrying a value wins.
    const ordered = [...list].sort((a, b) => RANK[kindOf(a)] - RANK[kindOf(b)] || b.observed_at.localeCompare(a.observed_at));
    const pick = <K extends keyof FieldObsRow>(k: K) => ordered.find((o) => o[k] !== null && o[k] !== undefined) ?? null;
    const subRow = pick('substrate');
    const structRow = pick('structure');
    const lampRow = ordered.find((o) => o.has_light !== null || (o.light_prob !== null && o.light_prob !== undefined)) ?? null;
    let lamp: FieldRecord['lamp'] = null;
    if (lampRow) {
      const k = kindOf(lampRow);
      if (k === 'saha') lamp = { state: lampRow.has_light === null ? null : lampRow.has_light === 1, p: null, kind: k };
      else lamp = { state: null, p: lampRow.light_prob ?? (lampRow.has_light === 1 ? (k === 'uzaktan' ? 0.97 : 0.95) : k === 'uzaktan' ? 0.03 : 0.05), kind: k };
      if (k === 'saha' && lamp.state === null) lamp = null;
    }
    // Depths: only the best source that has any (sources are not mixed).
    const withDepth = ordered.filter((o) => depths.some((d) => d.obs_id === o.id));
    const depthKind = withDepth.length ? kindOf(withDepth[0]!) : null;
    const ids = new Set(withDepth.filter((o) => kindOf(o) === depthKind).map((o) => o.id));
    const ds = depths.filter((d) => ids.has(d.obs_id));
    let conv: { depths: ConvertedDepth[]; calibration: SinkCalibration | null } = { depths: [], calibration: null };
    if (depthKind === 'saha') {
      const plumbs = ds.filter((d) => d.method === 'plumb' && d.depth_m !== null).map((d) => ({ distance_m: d.distance_m, depth_m: d.depth_m! }));
      const sinks = ds.filter((d) => d.method === 'sink' && d.sink_s !== null && d.jig_g !== null).map((d) => ({ distance_m: d.distance_m, sink_s: d.sink_s!, jig_g: d.jig_g! }));
      conv = fieldDepths(sinks, plumbs);
    } else if (depthKind) {
      const q = depthKind === 'uzaktan' ? 'remote' : 'desk';
      conv.depths = ds
        .filter((d) => d.depth_m !== null)
        .map((d): ConvertedDepth => ({ distance_m: d.distance_m, depth_m: d.depth_m!, sd_m: Math.round(d.depth_m! * 0.3 * 10) / 10, quality: q }))
        .sort((a, b) => a.distance_m - b.distance_m);
    }
    const subKind = subRow ? kindOf(subRow) : null;
    const byTime = [...list].sort((a, b) => a.observed_at.localeCompare(b.observed_at));
    out.set(spot, {
      latestAt: byTime[byTime.length - 1]!.observed_at,
      substrate: subRow ? (JSON.parse(subRow.substrate!) as FieldSubstrate[]) : null,
      substrateKind: subKind,
      substrateWeight: subKind === 'saha' ? 0.9 : subKind === 'uzaktan' ? 0.7 : subRow ? deskWeight(subRow) : 0.9,
      snag: pick('snag')?.snag ?? null,
      structure: (structRow?.structure ?? null) as FieldStructure | null,
      structureKind: structRow ? kindOf(structRow) : null,
      lightColor: pick('light_color')?.light_color ?? null,
      lamp,
      depths: conv.depths,
      depthKind,
      calibration: conv.calibration,
      lastDepthAt: withDepth.length ? withDepth[0]!.observed_at : null,
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
    fieldDepthKind: field?.depthKind ?? undefined,
    substrate: {
      eusm: row.substrate ?? null,
      conf: row.substrate_conf ?? null,
      field: field?.substrate ?? null,
      fieldKind: field?.substrateKind ?? undefined,
      fieldWeight: field?.substrate ? field.substrateWeight : undefined,
      hint: field?.snag ? SNAG[field.snag]! : null,
    },
    fieldStructure: field?.structure ?? null,
    fieldStructureKind: field?.structureKind ?? undefined,
    fetchKm: row.fetch_json ? (JSON.parse(row.fetch_json) as number[]) : null,
    // A known lamp (saha form or admin) wins; otherwise a remote/desk probability; otherwise the prior.
    lamp: row.has_light === null ? null : row.has_light === 1,
    lampP: row.has_light === null && field?.lamp && field.lamp.kind !== 'saha' ? field.lamp.p : null,
    lampSource: row.has_light !== null ? (field?.lamp?.kind === 'saha' ? 'saha' : null) : field?.lamp && field.lamp.kind !== 'saha' ? field.lamp.kind : null,
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

/** Sources whose values come from the private field table (redacted in the public detail). */
export const PRIVATE_SOURCES = new Set(['saha', 'uzaktan gözlem']);
export const REDACTED = 'saha bilgisi (yalnız yönetici görür)';

/**
 * Public detail: components fed by the private field table keep their key, weight and source but not their
 * value or reason (the value would reveal e.g. the measured depth or the lamp state).
 */
export function packV2(hours: V2Hour[], meta: Omit<PackedV2['meta'], 'comps' | 'model_version'>): PackedV2 {
  const first = hours[0]!;
  const hide = first.components.map((c) => PRIVATE_SOURCES.has(c.source));
  return {
    v: 2,
    meta: { model_version: MODEL_VERSION, ...meta, comps: first.components.map((c) => [c.key, c.label, c.group, c.weight, c.source, c.evidence]) },
    h: hours.map((h) => [
      h.ts, h.total, h.raw, h.p10, h.p90, h.gated ? 1 : 0, h.warnings, h.wNight, hide[first.components.findIndex((c) => c.key === 'lamba')] ? null : h.lampP,
      h.components.map((c, i) => (hide[i] ? null : r3(c.value))), h.components.map((c, i) => (hide[i] ? REDACTED : c.reason)),
    ]),
  };
}

export function computeSpotV2(row: SpotRow, wx: Snap | undefined, sea: Snap | undefined, now: Date, field?: FieldRecord, draws = DRAWS, ocean?: Ocean) {
  const spot = spotV2(row, field);
  const points = applyOcean(mergeSnapshots(wx?.snap, sea?.snap), ocean);
  const startHour = Math.floor(now.getTime() / HOUR);
  const hours = scoreSeriesV2({ spot, points, from: now, hours: HOURS_V2, profile: SAFETY, draws });
  const index = indexSeries(points);
  const weather = hours.map((_, i) => weatherAt(index, new Date((startHour + i) * HOUR), row.lat, row.lon));
  const seaGrid =
    sea?.snap.lat !== undefined && sea.snap.lon !== undefined
      ? { lat: sea.snap.lat, lon: sea.snap.lon, distance_km: Math.round(haversineKm(row.lat, row.lon, sea.snap.lat, sea.snap.lon) * 10) / 10 }
      : null;
  const packed = packV2(hours, {
    computed_at: now.toISOString(),
    weather_fetched_at: wx?.fetched_at ?? null,
    sea_fetched_at: sea?.fetched_at ?? null,
    sea_grid: seaGrid,
    // Dates of visits and the sink calibration are private (admin field endpoint).
    field_at: null,
    depth_field_at: null,
    sink_calibration: null,
    ocean: ocean?.series ? { fetched_at: ocean.series.fetched_at, cell: ocean.series.data.cell } : null,
    ocean_normal: ocean?.normal ? { years: ocean.normal.data.years, from: ocean.normal.data.from, to: ocean.normal.data.to } : null,
  });
  return { startHour, hours, packed, spot, weather };
}

export interface ScoreRecordV2 {
  spot_id: string;
  model_version: string;
  computed_at: string;
  start_hour: number;
  list_json: string;
  detail_json: string;
  /** Frozen model output of the first (current) hour for spot_scores_v2_history. */
  history_json?: string;
}

/** Main reason of the rank at an hour: driver, score delta vs. the other spots, Turkish one-liner. */
export type ReasonEntry = [DriverKey, number, string];
/** [total, p10, p90, rank, gated, first warning, main reason] — p10/p90 null while the band is being recomputed. */
export type ListEntryV2 = [number | null, number | null, number | null, number, 0 | 1, string | null, ReasonEntry | null];

const KIND_TR: Record<string, string> = { pier: 'iskele', breakwater: 'mendirek', groyne: 'mahmuz', manual: 'yapı' };
const COMPASS_TR = ['kuzey', 'kuzeydoğu', 'doğu', 'güneydoğu', 'güney', 'güneybatı', 'batı', 'kuzeybatı'];
const n1 = (x: number) => (Math.round(x * 10) / 10).toString().replace('.', ',');

/** One honest line: the driver, its value and where that value comes from. */
export function reasonText(key: DriverKey, delta: number, spot: SpotV2, h: V2Hour, w: Weather): string {
  const c = (k: string) => h.components.find((x) => x.key === k)!;
  const lead = delta >= 0 ? 'Öne çıkaran' : 'Geri bırakan';
  let body: string;
  switch (key) {
    case 'lamba':
      body =
        spot.lamp !== null && spot.lampSource !== null && spot.lampSource !== undefined
          ? `lamba — ${spot.lampSource === 'saha' ? 'saha' : 'uzaktan gözlem'} bilgisi (değer gizli)`
          : spot.lamp !== null
          ? `lamba ${spot.lamp ? 'var' : 'yok'} — ${c('lamba').source}`
          : `lamba olasılığı ${n1(lampPrior(spot))} — ${spot.lampSource === 'masabasi' ? 'masa başı veri (onay bekliyor)' : spot.lampSource === 'uzaktan' ? 'uzaktan gözlem' : 'varsayım (C), saha verisi yok'}`;
      break;
    case 'yapi':
      body = PRIVATE_SOURCES.has(c('yapi').source)
        ? `yapı — ${c('yapi').source} bilgisi (değer gizli)`
        : `${KIND_TR[spot.kind]} ${Math.round(spot.lengthM ?? 50)} m — ${c('yapi').source}, kanıt C`;
      break;
    case 'derinlik': {
      const src = c('derinlik').source;
      body = PRIVATE_SOURCES.has(src)
        ? `derinlik — ${src === 'saha' ? 'saha ölçümü' : src} var (değer gizli)`
        : `atış mesafesinde ~${c('derinlik').reason.split(' m')[0]} m — ${src === 'yapı-uzunluğu-tahmini' ? 'yapı uzunluğundan tahmin (C), saha ölçümü yok' : src}`;
      break;
    }
    case 'taban':
      body = PRIVATE_SOURCES.has(c('taban').source) ? `dip — ${c('taban').source} bilgisi (değer gizli)` : `dip ${c('taban').reason} — ${c('taban').source}`;
      break;
    default: {
      const dir = w.windDir === null ? null : COMPASS_TR[Math.round(w.windDir / 45) % 8];
      body = `${dir ? `${dir} rüzgarına ` : 'rüzgara '}${delta >= 0 ? 'korunaklı' : 'açık'}${w.windKmh === null ? '' : ` (${Math.round(w.windKmh)} km/sa)`} — kıyı OSM, rüzgar Open-Meteo`;
    }
  }
  return `${lead}: ${body}`;
}

/** Main reason per spot for every hour (term ablation across spots, explain.ts). */
export function reasonsFor(res: { hours: V2Hour[]; spot: SpotV2; weather: Weather[] }[]): (ReasonEntry | null)[][] {
  const out: (ReasonEntry | null)[][] = res.map(() => []);
  for (let i = 0; i < HOURS_V2; i++) {
    const r = explain(res.map((x) => x.spot), res.map((x) => x.weather[i]!), DEFAULTS);
    r.forEach((e, k) => out[k]!.push(e && res[k]!.hours[i]!.total !== null ? [e.key, e.delta, reasonText(e.key, e.delta, res[k]!.spot, res[k]!.hours[i]!, res[k]!.weather[i]!)] : null));
  }
  return out;
}

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
  const reasons = reasonsFor(res);
  return rows.map((r, k) => {
    const list = res[k]!.hours.map((h, i): ListEntryV2 => [h.total, h.p10, h.p90, rankAt[i]![k]!, h.gated ? 1 : 0, h.warnings[0] ?? null, reasons[k]![i]!]);
    const h0 = res[k]!.hours[0]!;
    return {
      spot_id: r.id,
      model_version: MODEL_VERSION,
      computed_at: now.toISOString(),
      start_hour: res[k]!.startHour,
      list_json: JSON.stringify(list),
      detail_json: JSON.stringify(res[k]!.packed),
      history_json: JSON.stringify({
        model_version: MODEL_VERSION,
        total: h0.total,
        p10: h0.p10,
        p90: h0.p90,
        rank: list[0]![3],
        reason: list[0]![6],
        lampP: h0.lampP,
        components: h0.components.map((c) => [c.key, c.value === null ? null : Math.round(c.value * 1000) / 1000, c.source, c.reason]),
        inputs: res[k]!.weather[0],
      }),
    };
  });
}

/**
 * Single-spot point rescore after a field edit (Worker, no Monte Carlo): new expected score, band null
 * ("güncelleniyor") until score.yml's 15-minute pending run recomputes it; ranks against the other spots'
 * stored totals; the previous main reason is kept (it needs every spot's inputs).
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
    const totals = [h.total, ...others.map((o) => o.list[hour - o.start_hour]?.[0] ?? null)];
    return [h.total, null, null, ranks(totals)[0]!, h.gated ? 1 : 0, h.warnings[0] ?? null, old?.[6] ?? null];
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

export const DELETE_STALE_V2_SQL = `DELETE FROM spot_scores_v2 WHERE spot_id NOT IN (SELECT id FROM spots WHERE ${ACTIVE})`;

/** D1 rows of ocean_series / ocean_normal → per-spot Ocean. */
export function oceanMap(series: { spot_id: string; fetched_at: string; json: string }[], normals: { spot_id: string; computed_at: string; json: string }[]): Map<string, Ocean> {
  const out = new Map<string, Ocean>();
  for (const r of series) out.set(r.spot_id, { ...out.get(r.spot_id), series: { fetched_at: r.fetched_at, data: JSON.parse(r.json) as OceanSeries } });
  for (const r of normals) out.set(r.spot_id, { ...out.get(r.spot_id), normal: { computed_at: r.computed_at, data: JSON.parse(r.json) as OceanNormal } });
  return out;
}

export const UPSERT_HISTORY_SQL = `INSERT INTO spot_scores_v2_history (spot_id, hour, json) VALUES (?1, ?2, ?3)
ON CONFLICT(spot_id, hour) DO UPDATE SET json = excluded.json`;
