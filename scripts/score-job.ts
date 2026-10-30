// Hourly scoring job (GitHub Actions, score.yml). Reads spots + weather snapshots from D1 over the REST API,
// runs the same pure engine as the Worker would, and writes spot_scores with bound parameters (the stored
// JSON is larger than D1's 100 KB SQL-text limit, so it cannot be inlined into a .sql file).
//
// Bundle + run:  node_modules/.bin/esbuild scripts/score-job.ts --bundle --platform=node --format=esm --outfile=.score/job.mjs
//                node .score/job.mjs [--dry-run]
// Env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID (database id is read from workers/api/wrangler.toml).
import { readFileSync } from 'node:fs';
import { DELETE_STALE_SCORES_SQL, scoreRecords, UPSERT_SCORE_SQL } from '../workers/api/src/precompute';
import type { Snapshot } from '../workers/api/src/lib/openmeteo';
import type { SpotRow } from '../workers/api/src/lib/spots';

const dryRun = process.argv.includes('--dry-run');
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
const rows = await query<SpotRow>("SELECT * FROM spots WHERE status != 'rejected' ORDER BY id");
const snapRows = await query<{ cell_id: string; fetched_at: string; json: string }>('SELECT cell_id, fetched_at, json FROM forecast_snapshots');
const snaps = new Map(snapRows.map((r) => [r.cell_id, { snap: JSON.parse(r.json) as Snapshot, fetched_at: r.fetched_at }]));
const now = new Date();
const t1 = performance.now();
const records = scoreRecords(rows, snaps, now);
const t2 = performance.now();
const bytes = records.reduce((a, r) => a + r.detail_json.length + r.list_json.length, 0);
console.log(`spots ${rows.length}, snapshots ${snaps.size}, records ${records.length}, ${(bytes / 1024).toFixed(0)} KiB JSON, compute ${(t2 - t1).toFixed(0)} ms`);

if (dryRun) {
  console.log('dry run: nothing written');
} else {
  for (const r of records) await query(UPSERT_SCORE_SQL, [r.spot_id, r.species, r.computed_at, r.start_hour, r.list_json, r.detail_json]);
  await query(DELETE_STALE_SCORES_SQL);
  console.log(`wrote ${records.length} rows in ${(performance.now() - t2).toFixed(0)} ms (total ${(performance.now() - t0).toFixed(0)} ms)`);
}
