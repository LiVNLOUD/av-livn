// Local-only: seed the *local* D1 (wrangler dev) with sample spots and Open-Meteo fixture snapshots
// shifted to the current hour. Usage: node scripts/dev-seed.mjs > /tmp/dev.sql
import { readFileSync } from 'node:fs';
import { assignCells, seedSql } from '../workers/api/src/lib/seed.ts';

const root = new URL('..', import.meta.url).pathname;
const fc = JSON.parse(readFileSync(root + 'workers/api/test/fixtures/dev-spots.geojson', 'utf8'));
const fx = { wx: JSON.parse(readFileSync(root + 'workers/api/test/fixtures/om-forecast.json', 'utf8')), sea: JSON.parse(readFileSync(root + 'workers/api/test/fixtures/om-marine.json', 'utf8')) };
const now = new Date();
now.setUTCMinutes(0, 0, 0);
const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
const out = [seedSql(fc, now.toISOString())];
const { cells } = assignCells(fc.features);
cells.forEach((c, i) => {
  const src = fx[c.kind][i % fx[c.kind].length];
  const past = c.kind === 'wx' ? 1 : 3;
  const t0 = new Date(midnight - past * 86_400_000).toISOString().slice(0, 16) + 'Z';
  const v = Object.fromEntries(Object.entries(src.hourly).filter(([k]) => k !== 'time'));
  const json = JSON.stringify({ t0, lat: src.latitude, lon: src.longitude, v }).replaceAll("'", "''");
  out.push(`INSERT INTO forecast_snapshots (cell_id, fetched_at, json) VALUES ('${c.id}', '${new Date().toISOString()}', '${json}') ON CONFLICT(cell_id) DO UPDATE SET fetched_at = excluded.fetched_at, json = excluded.json;`);
});
process.stdout.write(out.join('\n') + '\n');
