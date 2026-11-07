import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { refreshOnRequest } from '../src/cron';
import { appendLog, guardScoring, needsWeatherRefresh, shouldDispatchForWeather } from '../src/lib/staleness';
import { omFetch, resetAndSeed } from './helpers';

const NOW = new Date('2026-11-05T17:07:00Z');
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString();

describe('Q1: weather freshness before scoring', () => {
  it('refresh when the newest fetch is over 60 min old or missing', () => {
    expect(needsWeatherRefresh(ago(59), NOW)).toBe(false);
    expect(needsWeatherRefresh(ago(61), NOW)).toBe(true);
    expect(needsWeatherRefresh(null, NOW)).toBe(true);
  });
  it('backup trigger covers weather: failed fetch and old weather → dispatch (at most every 30 min)', () => {
    const base = { newestFetch: ago(70), fetchOk: false, lastDispatch: null, now: NOW };
    expect(shouldDispatchForWeather(base)).toBe(true);
    expect(shouldDispatchForWeather({ ...base, fetchOk: true })).toBe(false); // the cron's own fetch worked
    expect(shouldDispatchForWeather({ ...base, newestFetch: ago(30) })).toBe(false);
    expect(shouldDispatchForWeather({ ...base, lastDispatch: ago(10) })).toBe(false);
  });
  it('dispatch log keeps the newest entries and survives a corrupt value', () => {
    expect(appendLog(null, 1)).toEqual([1]);
    expect(appendLog('[1,2,3]', 4, 3)).toEqual([2, 3, 4]);
    expect(appendLog('{bad', 1)).toEqual([1]);
    expect(appendLog('{"a":1}', 1)).toEqual([1]);
  });
});

describe('Q1: guard and refresh endpoint (Worker)', () => {
  beforeEach(async () => { await resetAndSeed(); });
  const ok204 = (async () => new Response(null, { status: 204 })) as unknown as typeof fetch;

  it("guard dispatches with reason 'stale weather' after a failed fetch and logs every dispatch", async () => {
    await env.DB.prepare('DELETE FROM forecast_snapshots').run();
    await env.DB.prepare("INSERT INTO forecast_snapshots (cell_id, fetched_at, json) VALUES ('x', ?1, '{}')").bind(ago(90)).run();
    await env.DB.prepare('DELETE FROM spot_scores_v2').run(); // stale scores alone would also dispatch; weather comes first
    await env.DB.prepare("DELETE FROM meta WHERE key IN ('score_dispatch_at', 'score_dispatch_log')").run();
    const r = await guardScoring({ ...env, GH_DISPATCH_TOKEN: 't' }, NOW, ok204, false);
    expect(r).toMatchObject({ reason: 'stale weather', dispatched: 'dispatched' });
    const log = JSON.parse((await env.DB.prepare("SELECT value FROM meta WHERE key = 'score_dispatch_log'").first<{ value: string }>())!.value);
    expect(log).toEqual([{ at: NOW.toISOString(), reason: 'stale weather', status: 'dispatched' }]);
  });

  it('refresh on request: fetches like the cron, refuses within 15 min of the last fetch', async () => {
    await env.DB.prepare("DELETE FROM meta WHERE key = 'om_last_run'").run();
    const r = await refreshOnRequest(env, NOW, omFetch(NOW));
    expect(r.skipped).toBeNull();
    expect((r as { wx: number }).wx).toBeGreaterThan(0);
    const again = await refreshOnRequest(env, new Date(NOW.getTime() + 10 * 60_000), omFetch(NOW));
    expect(again).toEqual({ skipped: 'recent', last: NOW.toISOString() });
    expect((await refreshOnRequest(env, new Date(NOW.getTime() + 16 * 60_000), omFetch(NOW))).skipped).toBeNull();
  });

  it('endpoint is behind ADMIN_TOKEN and reports a recent fetch without fetching', async () => {
    expect((await app.request('/api/admin/weather/refresh', { method: 'POST' }, env)).status).toBe(401);
    await env.DB.prepare("INSERT INTO meta (key, value) VALUES ('om_last_run', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify({ at: new Date().toISOString() })).run();
    const res = await app.request('/api/admin/weather/refresh', { method: 'POST', headers: { authorization: 'Bearer test-admin-token' } }, env);
    expect(await res.json()).toMatchObject({ ok: true, skipped: 'recent' });
  });
});
