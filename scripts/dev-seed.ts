// Local-only: seed the *local* D1 (wrangler dev) with sample spots, Open-Meteo fixture snapshots shifted to the
// current hour, and precomputed scores (what score.yml does in production).
// Usage: esbuild scripts/dev-seed.ts --bundle --platform=node --format=esm --outfile=.score/dev-seed.mjs && node .score/dev-seed.mjs > /tmp/dev.sql
import { readFileSync } from 'node:fs';
import { assignCells, seedSql, type SpotFeature } from '../workers/api/src/lib/seed';
import { cellKey } from '../workers/api/src/lib/seed';
import { scoreRecords } from '../workers/api/src/precompute';
import type { SpotRow } from '../workers/api/src/lib/spots';

const root = new URL('..', import.meta.url).pathname.replace(/\.score\/$/, '');
const fc = JSON.parse(readFileSync(root + 'workers/api/test/fixtures/dev-spots.geojson', 'utf8'));
const fx = { wx: JSON.parse(readFileSync(root + 'workers/api/test/fixtures/om-forecast.json', 'utf8')), sea: JSON.parse(readFileSync(root + 'workers/api/test/fixtures/om-marine.json', 'utf8')) };
const now = new Date();
now.setUTCMinutes(0, 0, 0);
const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
const out = [seedSql(fc, now.toISOString())];
const snaps = new Map<string, { snap: any; fetched_at: string }>();
const { cells } = assignCells(fc.features);
cells.forEach((c, i) => {
  const src = fx[c.kind][i % fx[c.kind].length];
  const past = c.kind === 'wx' ? 1 : 3;
  const t0 = new Date(midnight - past * 86_400_000).toISOString().slice(0, 16) + 'Z';
  const v = Object.fromEntries(Object.entries(src.hourly).filter(([k]) => k !== 'time'));
  const snap = { t0, lat: src.latitude, lon: src.longitude, v };
  snaps.set(c.id, { snap, fetched_at: new Date().toISOString() });
  const json = JSON.stringify(snap).replaceAll("'", "''");
  out.push(`INSERT INTO forecast_snapshots (cell_id, fetched_at, json) VALUES ('${c.id}', '${new Date().toISOString()}', '${json}') ON CONFLICT(cell_id) DO UPDATE SET fetched_at = excluded.fetched_at, json = excluded.json;`);
});
const q = (x: string | number) => (typeof x === 'number' ? String(x) : `'${x.replaceAll("'", "''")}'`);
const rows: SpotRow[] = (fc.features as SpotFeature[]).map((f) => {
  const p = f.properties;
  const [lon, lat] = f.geometry.coordinates;
  return {
    id: p.id, name: p.name, kind: p.kind, lat, lon, probe_lat: p.probe_lat, probe_lon: p.probe_lon, probe_ok: null, shore_normal_deg: p.shore_normal_deg,
    length_m: null, depth_200m: p.depth_200m, slope: null, has_light: p.has_light === null ? null : p.has_light ? 1 : 0, status: p.status, place: p.place ?? null,
    notes: null, source: 'osm', wx_cell: cellKey('wx', lat, lon), sea_cell: p.probe_lat === null || p.probe_lon === null ? null : cellKey('sea', p.probe_lat, p.probe_lon),
    admin_edited_at: null, updated_at: now.toISOString(),
  };
});
for (const r of scoreRecords(rows, snaps, new Date())) {
  out.push(`INSERT OR REPLACE INTO spot_scores (spot_id, species, computed_at, start_hour, list_json, detail_json) VALUES (${[r.spot_id, r.species, r.computed_at, r.start_hour, r.list_json, r.detail_json].map(q).join(', ')});`);
}
process.stdout.write(out.join('\n') + '\n');
