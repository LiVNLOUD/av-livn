// Hourly scoring job (GitHub Actions, score.yml). Reads spots + weather snapshots from D1 over the REST API,
// runs the same pure engine as the Worker would, and writes spot_scores with bound parameters (the stored
// JSON is larger than D1's 100 KB SQL-text limit, so it cannot be inlined into a .sql file).
//
// Bundle + run:  node_modules/.bin/esbuild scripts/score-job.ts --bundle --platform=node --format=esm --external:web-push --outfile=.score/job.mjs
//                node .score/job.mjs [--dry-run] [--pending] [--compare-desk out.json]
//   --pending       15-minute run: exit at once unless a field edit left a spot in pending_rescore; then a full v2 run
//   --compare-desk  write the current-hour v2 ranking with and without desk (masabasi) findings to out.json
// Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID (database id is read from workers/api/wrangler.toml).
import { readFileSync } from 'node:fs';
import { DELETE_STALE_SCORES_SQL, scoreRecords, UPSERT_SCORE_SQL } from '../workers/api/src/precompute';
import type { Snapshot } from '../workers/api/src/lib/openmeteo';
import { CLEAR_PRE_SQL, FETCHED_SQL, fetchedAt, HOURS_SQL, LIST_SQL, preBodies, WINDOWS_SQL, type HoursRow, type ListRow, type WindowsRow } from '../workers/api/src/lib/views';
import { FULL_RUN_MIN, needsFullRun } from '../workers/api/src/lib/staleness';
import { SPECIES, DELETE_STALE_V2_SQL, fieldRecords, oceanMap, pointsFromObservations, recomputeHours, scoreRecordsV2, UPSERT_HISTORY_SQL, UPSERT_V2_SQL, type ObservationRow, type FieldDepthRow, type FieldObsRow } from '../workers/api/src/precompute_v2';
import { ACTIVE, type SpotRow } from '../workers/api/src/lib/spots';
import type { ListEntryV2 } from '../workers/api/src/precompute_v2';
import { runNotify } from './notify-send';
import { forbiddenUpdates, parseArea, type SpotPos } from '../workers/api/src/lib/forbidden';

const dryRun = process.argv.includes('--dry-run');
let pendingOnly = process.argv.includes('--pending');
const compareOut = process.argv.includes('--compare-desk') ? process.argv[process.argv.indexOf('--compare-desk') + 1] : null;
// I3: ferry lamp prior sensitivity (dry run): same weather, LAMP_PRIOR.ferry 0.85 vs 0.5 at every night hour
// I4: istavrit top 10 now and at the next 21:00 local (before/after a model change, same data)
const topOut = process.argv.includes('--top10') ? process.argv[process.argv.indexOf('--top10') + 1] : null;
const lampOut = process.argv.includes('--lamp-sensitivity') ? process.argv[process.argv.indexOf('--lamp-sensitivity') + 1] : null;
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
  // K0: GitHub skipped hourly runs; a --pending run does the full work when the newest score is too old
  const last = (await query<{ at: string | null }>('SELECT max(computed_at) AS at FROM spot_scores_v2'))[0]?.at ?? null;
  if (needsFullRun(last, new Date())) {
    console.log(`pending: newest score ${last} is older than ${FULL_RUN_MIN} min → full run`);
    pendingOnly = false;
  }
}
if (pendingOnly) {
  const pending = await query<{ spot_id: string }>('SELECT spot_id FROM pending_rescore');
  if (pending.length === 0) {
    console.log('pending: nothing to rescore');
    // A test notification requested in /ayarlar/ goes out within 15 minutes.
    if (!dryRun) await runNotify(query, { spots: [], nowHour: Math.floor(Date.now() / 3_600_000), testOnly: true });
    process.exit(0);
  }
  console.log(`pending: ${pending.map((p) => p.spot_id).join(', ')}`);
}
// F1: owner-drawn forbidden areas hide the spots inside them (and release those no longer covered).
if (!dryRun) {
  const areas = (await query<{ id: string; name: string; geojson: string }>('SELECT id, name, geojson FROM forbidden_area')).map(parseArea);
  const u = forbiddenUpdates(areas, await query<SpotPos>('SELECT id, lat, lon, hidden_reason FROM spots'));
  for (const id of u.hide) await query("UPDATE spots SET hidden_reason = 'forbidden' WHERE id = ?1", [id]);
  for (const id of u.unhide) await query('UPDATE spots SET hidden_reason = NULL WHERE id = ?1', [id]);
  if (u.hide.length || u.unhide.length) console.log(`forbidden areas: hid ${u.hide.length}, released ${u.unhide.length}`);
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
// H3: levrek on the same inputs (same Monte Carlo draws count)
const lv = scoreRecordsV2(rows, snaps, now, fieldRecords(obs, depths), undefined, oceanMap(oSeries, oNormal), 'levrek');
const bySpecies = { istavrit: v2, levrek: lv } as const;
const t4 = performance.now();
const maxDetail = Math.max(...v2.map((r) => r.detail_json.length));
console.log(`v2: records ${v2.length}, field obs ${obs.length}, ocean series ${oSeries.length}, normals ${oNormal.length}, max detail ${(maxDetail / 1024).toFixed(0)} KiB, compute ${(t4 - t3).toFixed(0)} ms`);
const now0 = Math.floor(now.getTime() / 3_600_000);
for (const r of v2) {
  const e = (JSON.parse(r.list_json) as unknown[][])[now0 - r.start_hour];
  console.log(`  ${r.spot_id.padEnd(20)} total ${e?.[0]} band ${e?.[1]}–${e?.[2]} rank ${e?.[3]} · ${(e?.[6] as unknown[] | null)?.[2] ?? ''}`);
}

if (topOut) {
  const n21 = now0 + ((18 - (now0 % 24) + 24) % 24);
  const at = (h: number) => v2.map((r) => [rows.find((x) => x.id === r.spot_id)!.name, (JSON.parse(r.list_json) as (number | null)[][])[h - r.start_hour]?.[0] ?? null] as const)
    .filter((x) => x[1] !== null).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 10);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(topOut, JSON.stringify({ now: new Date(now0 * 3_600_000).toISOString(), night: new Date(n21 * 3_600_000).toISOString(), top_now: at(now0), top_night: at(n21) }, null, 1) + '\n');
  console.log(`top10 → ${topOut}`);
}

if (lampOut) {
  const { LAMP_PRIOR } = await import('@av-livn/scoring');
  const base = scoreRecordsV2(rows, snaps, now, fieldRecords(obs, depths), 0, oceanMap(oSeries, oNormal));
  const was = LAMP_PRIOR.ferry;
  (LAMP_PRIOR as Record<string, number>).ferry = 0.5;
  const alt = scoreRecordsV2(rows, snaps, now, fieldRecords(obs, depths), 0, oceanMap(oSeries, oNormal));
  (LAMP_PRIOR as Record<string, number>).ferry = was;
  const lists = (recs: typeof v2) => new Map(recs.map((r) => [r.spot_id, { start: r.start_hour, list: JSON.parse(r.list_json) as (number | null)[][] }]));
  const A = lists(base), B = lists(alt);
  const ferry = rows.filter((r) => r.kind === 'ferry' || r.access === 'kisitli_feribot').map((r) => r.id);
  // night hours: 18–05 UTC+3 local over the next 72 h
  const nights = Array.from({ length: 72 }, (_, i) => now0 + i).filter((h) => { const l = (h + 3) % 24; return l >= 19 || l <= 4; });
  const at = (m: typeof A, id: string, h: number) => { const x = m.get(id)!; return x.list[h - x.start]; };
  const perSpot = ferry.map((id) => {
    const d = nights.map((h) => [at(A, id, h)?.[0], at(B, id, h)?.[0], at(A, id, h)?.[3], at(B, id, h)?.[3]] as (number | null)[]).filter((x) => x[0] != null && x[1] != null);
    const mean = (k: number) => d.reduce((a, x) => a + (x[k] as number), 0) / Math.max(1, d.length);
    return { id, name: rows.find((r) => r.id === id)!.name, nightHours: d.length, meanScore085: +mean(0).toFixed(1), meanScore050: +mean(1).toFixed(1), meanRank085: +mean(2).toFixed(1), meanRank050: +mean(3).toFixed(1), firstPlaceHours085: d.filter((x) => x[2] === 1).length, firstPlaceHours050: d.filter((x) => x[3] === 1).length };
  });
  // top 10 at the next 21:00 local
  const n21 = now0 + ((18 - (now0 % 24) + 24) % 24);
  const top = (m: typeof A) => rows.map((r) => [r.name, at(m, r.id, n21)?.[0] ?? null] as const).filter((x) => x[1] !== null).sort((a, b) => (b[1] as number) - (a[1] as number)).slice(0, 10);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(lampOut, JSON.stringify({ at: new Date(n21 * 3_600_000).toISOString(), ferryPrior: [was, 0.5], perSpot, top10_085: top(A), top10_050: top(B) }, null, 1) + '\n');
  console.log(`lamp-sensitivity → ${lampOut}`);
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
  for (const r of [...v2, ...lv]) {
    await query(UPSERT_V2_SQL, [r.spot_id, r.model_version, r.computed_at, r.start_hour, r.list_json, r.detail_json, 0, r.species]);
    await query(UPSERT_HISTORY_SQL, [r.spot_id, r.start_hour, r.history_json, r.species]);
  }
  await query(DELETE_STALE_V2_SQL);
  // Phase F CPU: default /api/spots, /api/hours, /api/windows bodies for this and the next five hours (GitHub
  // schedules can be late or skipped; past the last stored hour the Worker builds the bodies live, which costs CPU).
  {
    const h0 = Math.floor(Date.now() / 3_600_000);
    const fet = await query(FETCHED_SQL);
    const bodies: [string, string][] = [];
    for (const species of SPECIES) {
      const [list, hrs, win] = await Promise.all([query<ListRow>(LIST_SQL, [species]), query<HoursRow>(HOURS_SQL, [species]), query<WindowsRow>(WINDOWS_SQL, [species])]);
      bodies.push(...preBodies(list, hrs, win, fetchedAt(fet), Array.from({ length: 6 }, (_, k) => h0 + k), species));
    }
    await query(CLEAR_PRE_SQL);
    for (const [k, v] of bodies) await query('INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [k, v]);
    console.log(`public bodies: ${bodies.length} (${Math.round(bodies.reduce((a, [, v]) => a + v.length, 0) / 1024)} KB)`);
  }
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
  // D9: daily summary / opportunity / safety on the hourly run, test requests on every run.
  const names = new Map(rows.map((r) => [r.id, r.name]));
  const access = new Map(rows.map((r) => [r.id, r.access]));
  const province = new Map(rows.map((r) => [r.id, r.province ?? null]));
  const marina = new Map(rows.map((r) => [r.id, r.private_marina === 1]));
  const spotsHours = (sp: keyof typeof bySpecies) => bySpecies[sp].map((r) => ({ id: r.spot_id, name: names.get(r.spot_id) ?? r.spot_id, access: access.get(r.spot_id) ?? null, province: province.get(r.spot_id) ?? null, private_marina: marina.get(r.spot_id) ?? false, start_hour: r.start_hour, list: JSON.parse(r.list_json) as ListEntryV2[] }));
  await runNotify(query, { spots: spotsHours('istavrit'), bySpecies: { istavrit: spotsHours('istavrit'), levrek: spotsHours('levrek') }, nowHour: Math.floor(Date.now() / 3_600_000), testOnly: pendingOnly }).catch((e) => console.log(`notify failed: ${(e as Error).message}`));
}
