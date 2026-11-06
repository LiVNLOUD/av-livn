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
const REPO = 'LiVNLOUD/av-livn';

const minutesSince = (iso: string | null | undefined, now: Date) => (iso ? (now.getTime() - Date.parse(iso)) / 60_000 : Infinity);

/** A --pending run does the full hourly work when the newest score is too old (scheduler skipped runs). */
export function needsFullRun(scoredAt: string | null, now: Date): boolean {
  return minutesSince(scoredAt, now) > FULL_RUN_MIN;
}

export function shouldDispatch(scoredAt: string | null, lastDispatch: string | null, now: Date): boolean {
  return minutesSince(scoredAt, now) > DISPATCH_MIN && minutesSince(lastDispatch, now) > DISPATCH_GAP_MIN;
}

export function shouldAlert(scoredAt: string | null, lastAlert: string | null, now: Date): boolean {
  return minutesSince(scoredAt, now) > STALE_ALERT_H * 60 && minutesSince(lastAlert, now) > ALERT_GAP_H * 60;
}

const meta = (env: Env, key: string) => env.DB.prepare('SELECT value FROM meta WHERE key = ?1').bind(key).first<{ value: string }>().then((r) => r?.value ?? null);
const setMeta = (env: Env, key: string, value: string) =>
  env.DB.prepare('INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, value).run();

/** Hourly from the Worker cron: re-start a skipped score run and alert the owner on stale scores. */
export async function guardScoring(env: Env, now: Date, fetcher: typeof fetch = fetch): Promise<{ scoredAt: string | null; dispatched: string; alert: string }> {
  const scoredAt = (await env.DB.prepare('SELECT max(computed_at) AS at FROM spot_scores_v2').first<{ at: string | null }>())?.at ?? null;
  let dispatched = 'fresh';
  if (shouldDispatch(scoredAt, await meta(env, 'score_dispatch_at'), now)) {
    if (!env.GH_DISPATCH_TOKEN) dispatched = 'no token';
    else {
      const r = await fetcher(`https://api.github.com/repos/${REPO}/actions/workflows/score.yml/dispatches`, {
        method: 'POST',
        headers: { authorization: `Bearer ${env.GH_DISPATCH_TOKEN}`, accept: 'application/vnd.github+json', 'user-agent': 'av-livn-worker', 'content-type': 'application/json' },
        body: JSON.stringify({ ref: 'main' }),
      });
      dispatched = r.status === 204 ? 'dispatched' : `dispatch failed ${r.status}`;
      if (r.status === 204) await setMeta(env, 'score_dispatch_at', now.toISOString());
    }
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
  return { scoredAt, dispatched, alert };
}
