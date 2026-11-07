import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { dispatchTest, guardScoring, needsFullRun, shouldAlert, shouldDispatch } from '../src/lib/staleness';
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

describe('backup trigger: dry end-to-end test on request', () => {
  beforeAll(async () => { await resetAndSeed(); });
  const calls: { url: string; init: RequestInit }[] = [];
  const fake = (status: number) => (async (url: string, init: RequestInit) => { calls.push({ url, init }); return new Response(null, { status }); }) as unknown as typeof fetch;
  const read = async (k: string) => (await env.DB.prepare('SELECT value FROM meta WHERE key = ?1').bind(k).first<{ value: string }>())?.value ?? null;
  const request = () => env.DB.prepare("INSERT INTO meta (key, value) VALUES ('score_dispatch_test', '{\"status\":\"requested\"}') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
  const e = { ...env, GH_DISPATCH_TOKEN: 'secret-value', NTFY_TOPIC: 't' };

  it('does nothing without a request', async () => {
    await env.DB.prepare("DELETE FROM meta WHERE key = 'score_dispatch_test'").run();
    expect(await dispatchTest(e, NOW, fake(204))).toBeNull();
    await env.DB.prepare("INSERT INTO meta (key, value) VALUES ('score_dispatch_test', '{bad')").run();
    expect(await dispatchTest(e, NOW, fake(204))).toBeNull();
    expect(calls).toHaveLength(0);
  });
  it('requested: dispatches score.yml with dry_run through the real path, records the result once, leaves score_dispatch_at alone', async () => {
    await env.DB.prepare("DELETE FROM meta WHERE key = 'score_dispatch_at'").run();
    await request();
    expect(await dispatchTest(e, NOW, fake(204))).toBe('dispatched');
    expect(calls[0]!.url).toBe('https://api.github.com/repos/LiVNLOUD/av-livn/actions/workflows/score.yml/dispatches');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ ref: 'main', inputs: { dry_run: 'true' } });
    expect(JSON.parse((await read('score_dispatch_test'))!)).toEqual({ at: NOW.toISOString(), status: 'dispatched', token: true });
    expect(await read('score_dispatch_at')).toBeNull();
    expect(await dispatchTest(e, NOW, fake(204))).toBeNull(); // one shot
    expect(calls).toHaveLength(1);
  });
  it('failure and missing token are recorded', async () => {
    await request();
    expect(await dispatchTest(e, NOW, fake(403))).toBe('dispatch failed 403');
    await request();
    expect(await dispatchTest({ ...e, GH_DISPATCH_TOKEN: undefined }, NOW, fake(204))).toBe('no token');
    expect(JSON.parse((await read('score_dispatch_test'))!)).toMatchObject({ status: 'no token', token: false });
  });
  it('guardScoring leaves an hourly summary with token presence only', async () => {
    await guardScoring(e, NOW, fake(204));
    const g = (await read('score_guard_last'))!;
    expect(JSON.parse(g)).toMatchObject({ at: NOW.toISOString(), token: true });
    expect(g).not.toContain('secret-value');
  });
});
