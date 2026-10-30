// Pure: spots GeoJSON → idempotent D1 SQL (no imports so Node can run it with type stripping).

export interface SpotFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    id: string;
    name: string;
    kind: string;
    shore_normal_deg: number | null;
    probe_lat: number | null;
    probe_lon: number | null;
    probe_ok: boolean | null;
    length_m?: number | null;
    depth_200m: number | null;
    slope_pct?: number | null;
    max_depth_100m?: number | null;
    profile?: (number | null)[] | null;
    probe_source?: string | null;
    normal_source?: string | null;
    osm_normal_deg?: number | null;
    has_light: boolean | null;
    status: string;
    place?: string | null;
    alt_lat?: number | null;
    alt_lon?: number | null;
    tip_source?: string | null;
    fetch_km?: number[] | null;
    substrate?: string | null;
    substrate_biozone?: string | null;
    substrate_dist_m?: number | null;
    substrate_conf?: number | null;
  };
}

export const CELL_DEG = 0.05;

export function cellKey(kind: 'wx' | 'sea', lat: number, lon: number): string {
  return `${kind}:${Math.round(lat / CELL_DEG)}:${Math.round(lon / CELL_DEG)}`;
}

function sql(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error(`non-finite number in seed: ${v}`);
    return String(v);
  }
  return `'${v.replaceAll("'", "''")}'`;
}

export interface Cell {
  id: string;
  kind: 'wx' | 'sea';
  lat: number;
  lon: number;
}

/** Group spots into weather cells (bucket centre) and sea cells (first probe in bucket, by spot id). */
export function assignCells(features: SpotFeature[]): { cells: Cell[]; bySpot: Map<string, { wx: string; sea: string | null }> } {
  const cells = new Map<string, Cell>();
  const bySpot = new Map<string, { wx: string; sea: string | null }>();
  for (const f of [...features].sort((a, b) => a.properties.id.localeCompare(b.properties.id))) {
    const [lon, lat] = f.geometry.coordinates;
    const wx = cellKey('wx', lat, lon);
    if (!cells.has(wx)) {
      const [, i, j] = wx.split(':').map(Number) as [number, number, number];
      cells.set(wx, { id: wx, kind: 'wx', lat: +(i * CELL_DEG).toFixed(4), lon: +(j * CELL_DEG).toFixed(4) });
    }
    const { probe_lat, probe_lon } = f.properties;
    let sea: string | null = null;
    if (probe_lat !== null && probe_lon !== null) {
      sea = cellKey('sea', probe_lat, probe_lon);
      if (!cells.has(sea)) cells.set(sea, { id: sea, kind: 'sea', lat: probe_lat, lon: probe_lon });
    }
    bySpot.set(f.properties.id, { wx, sea });
  }
  return { cells: [...cells.values()], bySpot };
}

const FIELD_FROM_ADMIN = ['name', 'has_light', 'status', 'notes'] as const;

/** Build idempotent SQL. Admin-edited spots keep their field-verified name/has_light/status/notes. */
export function seedSql(fc: { features: SpotFeature[] }, now: string): string {
  const { cells, bySpot } = assignCells(fc.features);
  const out: string[] = [];
  for (const c of cells) {
    out.push(`INSERT INTO cells (id, kind, lat, lon) VALUES (${sql(c.id)}, ${sql(c.kind)}, ${sql(c.lat)}, ${sql(c.lon)}) ON CONFLICT(id) DO UPDATE SET lat = excluded.lat, lon = excluded.lon;`);
  }
  const cols = [
    'id', 'name', 'kind', 'lat', 'lon', 'probe_lat', 'probe_lon', 'probe_ok', 'shore_normal_deg', 'length_m', 'depth_200m', 'slope_pct',
    'max_depth_100m', 'profile_json', 'probe_source', 'normal_source', 'osm_normal_deg', 'has_light', 'status', 'place', 'source', 'wx_cell', 'sea_cell', 'updated_at',
    'alt_lat', 'alt_lon', 'tip_source', 'fetch_json', 'substrate', 'substrate_biozone', 'substrate_dist_m', 'substrate_conf',
  ];
  const geoCols = cols.filter((c) => c !== 'id' && !(FIELD_FROM_ADMIN as readonly string[]).includes(c));
  for (const f of fc.features) {
    const p = f.properties;
    const [lon, lat] = f.geometry.coordinates;
    const cell = bySpot.get(p.id)!;
    const vals = [
      p.id, p.name, p.kind, lat, lon, p.probe_lat, p.probe_lon, p.probe_ok, p.shore_normal_deg, p.length_m, p.depth_200m, p.slope_pct,
      p.max_depth_100m, p.profile ? JSON.stringify(p.profile) : null, p.probe_source, p.normal_source, p.osm_normal_deg, p.has_light, p.status, p.place, 'osm', cell.wx, cell.sea, now,
      p.alt_lat, p.alt_lon, p.tip_source, p.fetch_km ? JSON.stringify(p.fetch_km) : null, p.substrate, p.substrate_biozone, p.substrate_dist_m, p.substrate_conf,
    ];
    const set = [
      ...geoCols.map((c) => `${c} = excluded.${c}`),
      ...FIELD_FROM_ADMIN.filter((c) => c !== 'notes').map((c) => `${c} = CASE WHEN spots.admin_edited_at IS NULL THEN excluded.${c} ELSE spots.${c} END`),
    ];
    out.push(`INSERT INTO spots (${cols.join(', ')}) VALUES (${vals.map(sql).join(', ')}) ON CONFLICT(id) DO UPDATE SET ${set.join(', ')};`);
  }
  const ids = fc.features.map((f) => sql(f.properties.id)).join(', ') || "''";
  out.push(`DELETE FROM spots WHERE source = 'osm' AND admin_edited_at IS NULL AND id NOT IN (${ids});`);
  out.push(`DELETE FROM cells WHERE id NOT IN (SELECT wx_cell FROM spots UNION SELECT sea_cell FROM spots WHERE sea_cell IS NOT NULL);`);
  out.push(`DELETE FROM forecast_snapshots WHERE cell_id NOT IN (SELECT id FROM cells);`);
  return out.join('\n') + '\n';
}
