// E8 watchdog (watchdog.yml hourly, and score.yml on failure): alert the owner when scoring failed or the
// newest score is older than 2 h. Prints the outcome only (no endpoints, tokens or keys).
//   node .score/watchdog.mjs [--failed]
import { readFileSync } from 'node:fs';
import { runWatchdog } from './notify-send';

const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token || !account) throw new Error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required');
const dbId = /database_id\s*=\s*"([^"]+)"/.exec(readFileSync(new URL('../workers/api/wrangler.toml', import.meta.url), 'utf8'))?.[1];

async function query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${dbId}/query`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ sql, params }),
  });
  const b = (await res.json()) as { success: boolean; result?: { results: T[] }[]; errors?: unknown };
  if (!b.success) throw new Error(`D1 query failed: ${JSON.stringify(b.errors)}`);
  return b.result?.[0]?.results ?? [];
}

let failed = process.argv.includes('--failed');
if (!failed && process.env.GITHUB_REPOSITORY) {
  // the most recent finished score run
  const r = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/actions/workflows/score.yml/runs?status=completed&per_page=1`, {
    headers: { authorization: `Bearer ${process.env.GITHUB_TOKEN ?? ''}`, accept: 'application/vnd.github+json' },
  }).then((x) => x.json()).catch(() => null) as { workflow_runs?: { conclusion: string }[] } | null;
  failed = r?.workflow_runs?.[0]?.conclusion === 'failure';
}
const scoredAt = (await query<{ at: string | null }>('SELECT max(computed_at) AS at FROM spot_scores_v2'))[0]?.at ?? null;
console.log(`watchdog: last score ${scoredAt}, last run ${failed ? 'failed' : 'ok'} → ${await runWatchdog(query, { failed, scoredAt })}`);
