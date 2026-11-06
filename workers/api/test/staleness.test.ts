import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { guardScoring, needsFullRun, shouldAlert, shouldDispatch } from '../src/lib/staleness';
import { resetAndSeed } from './helpers';

const NOW = new Date('2026-11-06T22:07:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();

describe('K0: scoring freshness decisions', () => {
  it('full run, dispatch and alert thresholds', () => {
    expect(needsFullRun(ago(60), NOW)).toBe(false);
    expect(needsFullRun(ago(80), NOW)).toBe(true);
    expect(needsFullRun(null, NOW)).toBe(true);
    expect(shouldDispatch(ago(80), null, NOW)).toBe(true);
    expect(shouldDispatch(ago(80), ago(10), NOW)).toBe(false); // dispatched 10 min ago
    expect(shouldDispatch(ago(30), null, NOW)).toBe(false);
    expect(shouldAlert(ago(130), null, NOW)).toBe(true);
    expect(shouldAlert(ago(130), ago(120), NOW)).toBe(false); // alerted within 6 h
    expect(shouldAlert(ago(100), null, NOW)).toBe(false);
  });
});

describe('K0: guardScoring (Worker cron)', () => {
  beforeAll(async () => { await resetAndSeed(); });
  const calls: { url: string; init: RequestInit }[] = [];
  const fake = (status: number) => (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(null, { status }); }) as unknown as typeof fetch;

  it('without tokens it only reports; with them it dispatches score.yml and sends one ntfy alert', async () => {
    await env.DB.prepare('DELETE FROM spot_scores_v2').run();
    await env.DB.prepare("DELETE FROM meta WHERE key IN ('score_dispatch_at', 'alert_stale_at')").run();
    expect(await guardScoring({ ...env, GH_DISPATCH_TOKEN: undefined, NTFY_TOPIC: undefined }, NOW, fake(204))).toMatchObject({ dispatched: 'no token', alert: 'no ntfy topic' });
    expect(calls).toHaveLength(0);
    const e = { ...env, GH_DISPATCH_TOKEN: 'x', NTFY_TOPIC: 't' };
    const r = await guardScoring(e, NOW, fake(204));
    expect(r).toMatchObject({ dispatched: 'dispatched', alert: 'sent' });
    expect(calls[0]!.url).toBe('https://api.github.com/repos/LiVNLOUD/av-livn/actions/workflows/score.yml/dispatches');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ ref: 'main' });
    expect(calls[1]!.url).toBe('https://ntfy.sh/t');
    // second cron an hour later: no repeat dispatch within 30 min? (60 > 30 → dispatch again), alert de-duplicated for 6 h
    const r2 = await guardScoring(e, new Date(NOW.getTime() + 20 * 60_000), fake(204));
    expect(r2).toMatchObject({ dispatched: 'fresh', alert: 'ok' });
    const bad = await guardScoring(e, new Date(NOW.getTime() + 60 * 60_000), fake(403));
    expect(bad.dispatched).toBe('dispatch failed 403');
  });
});
