// K0: scoring freshness. GitHub's scheduler skips hourly runs (6 Nov: 19:23, 20:23, 21:23 never started), so the
// score job and its watchdog cannot rely on it alone. Two independent guards:
//   - the score job's --pending runs switch to a full run when the newest score is older than FULL_RUN_MIN;
//   - the Worker's hourly cron (Cloudflare, not GitHub) dispatches score.yml when scores are older than DISPATCH_MIN
//     (needs GH_DISPATCH_TOKEN: fine-grained, Actions read/write, this repo only) and sends the ntfy stale alert
//     itself after STALE_ALERT_H (same 6 h de-duplication key as scripts/watchdog.ts).
import type { Env } from '../env';

export const FULL_RUN_MIN = 75;
export const DISPATCH_MIN = 75;
export const DISPATCH_GAP_MIN = 30;
export const STALE_ALERT_H = 2;
export const ALERT_GAP_H = 6;
/** Q1: the score job fetches weather itself first when the newest fetch is older than this. */
export const WEATHER_REFRESH_MIN = 60;
/** Q1: the refresh endpoint fetches at most once per this many minutes (the Worker cron included). */
export const WEATHER_REFRESH_GAP_MIN = 15;
export const DISPATCH_LOG_MAX = 200;
const REPO = 'LiVNLOUD/av-livn';

const minutesSince = (iso: string | null | undefined, now: Date) => (iso ? (now.getTime() - Date.parse(iso)) / 60_000 : Infinity);

/** A --pending run does the full hourly work when the newest score is too old (scheduler skipped runs). */
export function needsFullRun(scoredAt: string | null, now: Date): boolean {
  return minutesSince(scoredAt, now) > FULL_RUN_MIN;
}

export function shouldDispatch(scoredAt: string | null, lastDispatch: string | null, now: Date): boolean {
  return minutesSince(scoredAt, now) > DISPATCH_MIN && minutesSince(lastDispatch, now) > DISPATCH_GAP_MIN;
}

/**
 * Weather is fetched by the Worker's Cloudflare cron at :07, scoring runs in GitHub Actions. Scores only use the
 * weather of their own run, so when GitHub skips runs the shown scores rest on weather up to ~2 h old although
 * fresh weather sits in D1. After a successful fetch the cron therefore starts scoring at once whenever the
 * newest scores were computed before that fetch (one dispatch per 30 min at most).
 */
export function shouldRescoreAfterFetch(o: { scoredAt: string | null; newestFetch: string | null; fetchOk: boolean; lastDispatch: string | null; now: Date }): boolean {
  if (!o.fetchOk || !o.newestFetch) return false;
  const behind = o.scoredAt === null || Date.parse(o.scoredAt) < Date.parse(o.newestFetch);
  return behind && minutesSince(o.lastDispatch, o.now) > DISPATCH_GAP_MIN;
}

/** Score job: nothing to do when the newest scores already use the newest weather and no field edit waits. */
export function nothingNew(scoredAt: string | null, newestFetch: string | null, pending: number): boolean {
  return pending === 0 && scoredAt !== null && newestFetch !== null && Date.parse(scoredAt) >= Date.parse(newestFetch);
}

/** Q1: scoring is about to start on weather older than 60 min (or none): fetch fresh weather first. */
export function needsWeatherRefresh(newestFetch: string | null, now: Date): boolean {
  return minutesSince(newestFetch, now) > WEATHER_REFRESH_MIN;
}

/**
 * Q1: the backup trigger also covers weather. When this cron's own fetch failed and the stored weather is older
 * than 60 min, a score run is started anyway: it fetches weather itself first (needsWeatherRefresh), a second
 * attempt from another moment and another machine.
 */
export function shouldDispatchForWeather(o: { newestFetch: string | null; fetchOk: boolean; lastDispatch: string | null; now: Date }): boolean {
  return !o.fetchOk && needsWeatherRefresh(o.newestFetch, o.now) && minutesSince(o.lastDispatch, o.now) > DISPATCH_GAP_MIN;
}

/** Q1: keep the last DISPATCH_LOG_MAX dispatches (newest last) so reports read a record, not a reconstruction. */
export function appendLog<T>(raw: string | null, entry: T, max = DISPATCH_LOG_MAX): T[] {
  let xs: T[] = [];
  try { const v = raw ? JSON.parse(raw) : []; if (Array.isArray(v)) xs = v as T[]; } catch { /* corrupt log: start again */ }
  return [...xs, entry].slice(-max);
}

export function shouldAlert(scoredAt: string | null, lastAlert: string | null, now: Date): boolean {
  return minutesSince(scoredAt, now) > STALE_ALERT_H * 60 && minutesSince(lastAlert, now) > ALERT_GAP_H * 60;
}

const meta = (env: Env, key: string) => env.DB.prepare('SELECT value FROM meta WHERE key = ?1').bind(key).first<{ value: string }>().then((r) => r?.value ?? null);
const setMeta = (env: Env, key: string, value: string) =>
  env.DB.prepare('INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, value).run();

/** POST a workflow_dispatch for score.yml (real backup path and the dry test share this). */
async function dispatchScore(env: Env, fetcher: typeof fetch, inputs?: Record<string, string>): Promise<string> {
  if (!env.GH_DISPATCH_TOKEN) return 'no token';
  const r = await fetcher(`https://api.github.com/repos/${REPO}/actions/workflows/score.yml/dispatches`, {
    method: 'POST',
    headers: { authorization: `Bearer ${env.GH_DISPATCH_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'av-livn-worker', 'content-type': 'application/json' },
    body: JSON.stringify(inputs ? { ref: 'main', inputs } : { ref: 'main' }),
  });
  return r.status === 204 ? 'dispatched' : `dispatch failed ${r.status}`;
}

/**
 * End-to-end test of the backup trigger without ageing any score: when meta.score_dispatch_test is
 * {"status":"requested"} (set with `wrangler d1 execute`), the next cron dispatches score.yml with dry_run=true
 * through the same code and records the outcome there. score_dispatch_at is left alone.
 */
export async function dispatchTest(env: Env, now: Date, fetcher: typeof fetch = fetch): Promise<string | null> {
  const raw = await meta(env, 'score_dispatch_test');
  let req: { status?: string } | null = null;
  try { req = raw ? JSON.parse(raw) : null; } catch { req = null; }
  if (req?.status !== 'requested') return null;
  const status = await dispatchScore(env, fetcher, { dry_run: 'true' });
  await setMeta(env, 'score_dispatch_test', JSON.stringify({ at: now.toISOString(), status, token: !!env.GH_DISPATCH_TOKEN }));
  return status;
}

/** Hourly from the Worker cron: re-start a skipped score run and alert the owner on stale scores. */
export async function guardScoring(env: Env, now: Date, fetcher: typeof fetch = fetch, fetchOk = false): Promise<{ scoredAt: string | null; dispatched: string; alert: string; reason: string | null }> {
  const scoredAt = (await env.DB.prepare('SELECT max(computed_at) AS at FROM spot_scores_v2').first<{ at: string | null }>())?.at ?? null;
  const newestFetch = (await env.DB.prepare('SELECT max(fetched_at) AS at FROM forecast_snapshots').first<{ at: string | null }>())?.at ?? null;
  let dispatched = 'fresh';
  let reason: string | null = null;
  const lastDispatch = await meta(env, 'score_dispatch_at');
  if (shouldRescoreAfterFetch({ scoredAt, newestFetch, fetchOk, lastDispatch, now })) reason = 'new weather';
  else if (shouldDispatchForWeather({ newestFetch, fetchOk, lastDispatch, now })) reason = 'stale weather';
  else if (shouldDispatch(scoredAt, lastDispatch, now)) reason = 'stale scores';
  if (reason) {
    dispatched = await dispatchScore(env, fetcher);
    if (dispatched === 'dispatched') await setMeta(env, 'score_dispatch_at', now.toISOString());
    await setMeta(env, 'score_dispatch_log', JSON.stringify(appendLog(await meta(env, 'score_dispatch_log'), { at: now.toISOString(), reason, status: dispatched })));
  }
  let alert = 'ok';
  if (shouldAlert(scoredAt, await meta(env, 'alert_stale_at'), now)) {
    if (!env.NTFY_TOPIC) alert = 'no ntfy topic';
    else {
      const ageH = Math.floor(minutesSince(scoredAt, now) / 60);
      const r = await fetcher(`https://ntfy.sh/${env.NTFY_TOPIC}`, {
        method: 'POST',
        headers: { title: 'av.livn: puanlar eski', tags: 'warning', click: `https://github.com/${REPO}/actions/workflows/score.yml` },
        body: `En son puan ${Number.isFinite(ageH) ? `${ageH} saat` : 'bilinmeyen süre'} önce hesaplandı (sınır ${STALE_ALERT_H} saat). Yedek tetik: ${dispatched}.`,
      });
      alert = r.ok ? 'sent' : `ntfy failed ${r.status}`;
      if (r.ok) await setMeta(env, 'alert_stale_at', now.toISOString());
    }
  }
  // hourly summary for checking the guard live (token presence only, never its value)
  await setMeta(env, 'score_guard_last', JSON.stringify({ at: now.toISOString(), scoredAt, newestFetch, reason, dispatched, alert, token: !!env.GH_DISPATCH_TOKEN }));
  return { scoredAt, dispatched, alert, reason };
}
