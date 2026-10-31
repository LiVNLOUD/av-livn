// Hourly scoring job (GitHub Actions, score.yml). Reads spots + weather snapshots from D1 over the REST API,
// runs the same pure engine as the Worker would, and writes spot_scores with bound parameters (the stored
// JSON is larger than D1's 100 KB SQL-text limit, so it cannot be inlined into a .sql file).
//
// Bundle + run:  node_modules/.bin/esbuild scripts/score-job.ts --bundle --platform=node --format=esm --outfile=.score/job.mjs
//                node .score/job.mjs [--dry-run] [--pending] [--compare-desk out.json]
//   --pending       15-minute run: exit at once unless a field edit left a spot in pending_rescore; then a full v2 run
//   --compare-desk  write the current-hour v2 ranking with and without desk (masabasi) findings to out.json
// Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID (database id is read from workers/api/wrangler.toml).
import { readFileSync } from 'node:fs';
import { DELETE_STALE_SCORES_SQL, scoreRecords, UPSERT_SCORE_SQL } from '../workers/api/src/precompute';
import type { Snapshot } from '../workers/api/src/lib/openmeteo';
import { DELETE_STALE_V2_SQL, fieldRecords, oceanMap, pointsFromObservations, recomputeHours, scoreRecordsV2, UPSERT_HISTORY_SQL, UPSERT_V2_SQL, type ObservationRow, type FieldDepthRow, type FieldObsRow } from '../workers/api/src/precompute_v2';
import { ACTIVE, type SpotRow } from '../workers/api/src/lib/spots';

const dryRun = process.argv.includes('--dry-run');
const pendingOnly = process.argv.includes('--pending');
const compareOut = process.argv.includes('--compare-desk') ? process.argv[process.argv.indexOf('--compare-desk') + 1] : null;
const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token || !account) throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required');
const toml = readFileSync(new URL('../workers/api/wrangler.toml', import.meta.url), 'utf8');
const dbId = /database_id\s*=\s*"([^"]+)"/.exec(toml)?.[1];
if (!dbId) throw new Error('database_id not found in wrangler.toml');

async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${dbId}/query`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ sql, params }),
    });
    const body = (await res.json().catch(() => null)) as { success: boolean; errors?: unknown[]; result?: { results: T[] }[] } | null;
    if (res.ok && body?.success) return body.result?.[0]?.results ?? [];
    if (attempt >= 3) throw new Error(`D1 query failed (${res.status}): ${JSON.stringify(body?.errors ?? body)}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}

const t0 = performance.now();
const startedAt = new Date().toISOString();
if (pendingOnly) {
  const pending = await query<{ spot_id: string }>('SELECT spot_id FROM pending_rescore');
  if (pending.length === 0) {
    console.log('pending: nothing to rescore');
    process.exit(0);
  }
  console.log(`pending: ${pending.map((p) => p.spot_id).join(', ')}`);
}
const rows = await query<SpotRow>(`SELECT * FROM spots WHERE ${ACTIVE} ORDER BY id`);
const snapRows = await query<{ cell_id: string; fetched_at: string; json: string }>('SELECT cell_id, fetched_at, json FROM forecast_snapshots');
const snaps = new Map(snapRows.map((r) => [r.cell_id, { snap: JSON.parse(r.json) as Snapshot, fetched_at: r.fetched_at }]));
const now = new Date();
const t1 = performance.now();
const records = pendingOnly ? [] : scoreRecords(rows, snaps, now);
const t2 = performance.now();
const bytes = records.reduce((a, r) => a + r.detail_json.length + r.list_json.length, 0);
console.log(`v1: spots ${rows.length}, snapshots ${snaps.size}, records ${records.length}, ${(bytes / 1024).toFixed(0)} KiB JSON, compute ${(t2 - t1).toFixed(0)} ms`);
const obs = await query<FieldObsRow>('SELECT * FROM field_obs');
const depths = await query<FieldDepthRow>('SELECT * FROM field_depth');
const oSeries = await query<{ spot_id: string; fetched_at: string; json: string }>('SELECT * FROM ocean_series');
const oNormal = await query<{ spot_id: string; computed_at: string; json: string }>('SELECT * FROM ocean_normal');
const t3 = performance.now();
const v2 = scoreRecordsV2(rows, snaps, now, fieldRecords(obs, depths), undefined, oceanMap(oSeries, oNormal));
const t4 = performance.now();
const maxDetail = Math.max(...v2.map((r) => r.detail_json.length));
console.log(`v2: records ${v2.length}, field obs ${obs.length}, ocean series ${oSeries.length}, normals ${oNormal.length}, max detail ${(maxDetail / 1024).toFixed(0)} KiB, compute ${(t4 - t3).toFixed(0)} ms`);
const now0 = Math.floor(now.getTime() / 3_600_000);
for (const r of v2) {
  const e = (JSON.parse(r.list_json) as unknown[][])[now0 - r.start_hour];
  console.log(`  ${r.spot_id.padEnd(20)} total ${e?.[0]} band ${e?.[1]}–${e?.[2]} rank ${e?.[3]} · ${(e?.[6] as unknown[] | null)?.[2] ?? ''}`);
}

if (compareOut) {
  // Same weather, same hour: field table without and with desk findings (rejected ones never count).
  const withoutDesk = scoreRecordsV2(rows, snaps, now, fieldRecords(obs.filter((o) => (o.source_kind ?? 'saha') !== 'masabasi'), depths), undefined, oceanMap(oSeries, oNormal));
  // Current hour and the next 21:00 Europe/Istanbul (18 UTC): lamp findings only act at night.
  const night = now0 + ((18 - (now0 % 24) + 24) % 24);
  const at = (recs: typeof v2, h: number) => Object.fromEntries(recs.map((r) => [r.spot_id, (JSON.parse(r.list_json) as unknown[][])[h - r.start_hour]]));
  const hours = [now0, night].map((h) => {
    const before = at(withoutDesk, h);
    const after = at(v2, h);
    return { hour: new Date(h * 3_600_000).toISOString(), spots: rows.map((r) => ({ spot_id: r.id, name: r.name, before: before[r.id], after: after[r.id] })) };
  });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(compareOut, JSON.stringify({ hour: hours[0]!.hour, spots: hours[0]!.spots, night: hours[1] }, null, 1) + '\n');
  console.log(`compare-desk → ${compareOut}`);
}

if (dryRun) {
  console.log('dry run: nothing written');
} else {
  for (const r of records) await query(UPSERT_SCORE_SQL, [r.spot_id, r.species, r.computed_at, r.start_hour, r.list_json, r.detail_json]);
  await query(DELETE_STALE_SCORES_SQL);
  for (const r of v2) {
    await query(UPSERT_V2_SQL, [r.spot_id, r.model_version, r.computed_at, r.start_hour, r.list_json, r.detail_json, 0]);
    await query(UPSERT_HISTORY_SQL, [r.spot_id, r.start_hour, r.history_json]);
  }
  await query(DELETE_STALE_V2_SQL);
  // Catch-log sessions whose hours predate the history table: fill them from the hourly observations.
  const partial = await query<{ id: string; spot_id: string; model_json: string }>("SELECT id, spot_id, model_json FROM catch_session WHERE freeze_status = 'partial'");
  const fields = fieldRecords(obs, depths);
  for (const ses of partial) {
    const row = rows.find((r) => r.id === ses.spot_id);
    const model = JSON.parse(ses.model_json) as { hours: { hour: number }[]; missing: number[] };
    if (!row || !model.missing.length) continue;
    const from = new Date((model.missing[0]! - 50) * 3_600_000).toISOString();
    const to = new Date((model.missing[model.missing.length - 1]! + 1) * 3_600_000).toISOString();
    const q = 'SELECT * FROM observations WHERE cell_id = ?1 AND ts >= ?2 AND ts < ?3 ORDER BY ts';
    const wx = await query<ObservationRow>(q, [row.wx_cell, from, to]);
    const sea = row.sea_cell ? await query<ObservationRow>(q, [row.sea_cell, from, to]) : [];
    const filled = recomputeHours(row, fields.get(row.id), pointsFromObservations(wx, sea), model.missing);
    const hours = [...model.hours, ...filled.filter((h) => h.total !== null)].sort((a, b) => a.hour - b.hour);
    const missing = filled.filter((h) => h.total === null).map((h) => h.hour);
    await query("UPDATE catch_session SET model_json = ?1, freeze_status = ?2 WHERE id = ?3", [
      JSON.stringify({ ...model, hours, missing, recomputed_at: new Date().toISOString() }), missing.length ? 'partial' : 'complete', ses.id,
    ]);
    console.log(`catch ${ses.id}: recomputed ${filled.length - missing.length} hours from observations, ${missing.length} without data`);
  }
  // Edits made while this run computed stay pending for the next 15-minute run.
  await query('DELETE FROM pending_rescore WHERE since <= ?1', [startedAt]);
  console.log(`wrote ${records.length} rows in ${(performance.now() - t2).toFixed(0)} ms (total ${(performance.now() - t0).toFixed(0)} ms)`);
}
