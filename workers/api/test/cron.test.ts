import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { refreshWeather } from '../src/cron';
import { buildUrl, fetchSnapshots, parseResponse, type FetchStats } from '../src/lib/openmeteo';
import { mergeSnapshots, valuesAt } from '../src/lib/series';
import { omFetch, resetAndSeed } from './helpers';

const NOW = new Date('2026-11-05T17:07:00Z');

describe('open-meteo client', () => {
  it('builds multi-location URLs with the agreed variables', () => {
    const wx = new URL(buildUrl('wx', [{ id: 'a', lat: 40.4, lon: 28.9 }, { id: 'b', lat: 40.35, lon: 29 }]));
    expect(wx.searchParams.get('latitude')).toBe('40.4,40.35');
    expect(wx.searchParams.get('hourly')).toBe('pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,precipitation,cloud_cover');
    expect(wx.searchParams.get('past_days')).toBe('2');
    const sea = new URL(buildUrl('sea', [{ id: 'a', lat: 40.4, lon: 28.9 }]));
    expect(sea.hostname).toBe('marine-api.open-meteo.com');
    expect(sea.searchParams.get('hourly')).toContain('sea_level_height_msl');
    expect(sea.searchParams.get('hourly')).toContain('wave_direction');
    expect(sea.searchParams.get('past_days')).toBe('3');
    expect(sea.searchParams.has('wind_speed_unit')).toBe(false);
  });

  it('rejects location count mismatches and skips empty locations', () => {
    expect(() => parseResponse([{}, {}], [{ id: 'a', lat: 0, lon: 0 }])).toThrow(/2 locations/);
    expect(parseResponse({ hourly: { time: [] } }, [{ id: 'a', lat: 0, lon: 0 }]).size).toBe(0);
  });

  it('merges snapshots and converts current km/h → m/s', () => {
    const pts = mergeSnapshots(
      { t0: '2026-11-05T00:00Z', v: { pressure_msl: [1010, null], unknown_var: [1] } },
      { t0: '2026-11-05T01:00Z', v: { ocean_current_velocity: [3.6] } },
      null,
    );
    expect(pts).toEqual([
      { ts: '2026-11-05T00:00:00.000Z', pressure: 1010 },
      { ts: '2026-11-05T01:00:00.000Z', curVel: 1 },
    ]);
    expect(valuesAt({ t0: '2026-11-05T00:00Z', v: { a: [1, 2] } }, new Date('2026-11-05T05:00Z'))).toBeNull();
  });
});

describe('refreshWeather (hourly cron)', () => {
  beforeEach(() => resetAndSeed());

  it('fetches each kind once, stores snapshots and one observation per cell', async () => {
    const calls: string[] = [];
    const r = await refreshWeather(env, NOW, omFetch(NOW, calls));
    expect(r).toEqual({ wx: 3, sea: 2, errors: [], calls: 2, statuses: [200, 200] });
    expect(calls).toHaveLength(2);
    const last = await env.DB.prepare("SELECT value FROM meta WHERE key = 'om_last_run'").first<{ value: string }>();
    expect(JSON.parse(last!.value)).toMatchObject({ calls: 2, wx: 3, sea: 2 });
    const snaps = await env.DB.prepare('SELECT count(*) AS n FROM forecast_snapshots').first<{ n: number }>();
    expect(snaps!.n).toBe(5);
    const obs = await env.DB.prepare("SELECT * FROM observations WHERE ts = '2026-11-05T17:00:00.000Z' ORDER BY cell_id").all<Record<string, number | null>>();
    expect(obs.results).toHaveLength(5);
    const sea = obs.results.find((o) => String(o.cell_id).startsWith('sea'))!;
    expect(sea.wave_h).not.toBeNull();
    expect(sea.pressure).toBeNull();
    // rerun in the same hour is idempotent
    await refreshWeather(env, NOW, omFetch(NOW));
    expect((await env.DB.prepare('SELECT count(*) AS n FROM observations').first<{ n: number }>())!.n).toBe(5);
  });

  it('records errors per kind, keeps going and keeps the last good snapshots', async () => {
    await refreshWeather(env, NOW, omFetch(NOW));
    const before = await env.DB.prepare("SELECT cell_id, fetched_at FROM forecast_snapshots WHERE cell_id LIKE 'sea:%' ORDER BY cell_id").all();
    const failing = (async (u: RequestInfo | URL) =>
      String(u).includes('marine') ? new Response('boom', { status: 502 }) : omFetch(NOW)(u)) as typeof fetch;
    const waits: number[] = [];
    const later = new Date(NOW.getTime() + 3_600_000);
    const r = await refreshWeather(env, later, failing, async (ms) => void waits.push(ms));
    expect(r.wx).toBe(3);
    expect(r.sea).toBe(0);
    expect(r.errors[0]).toContain('HTTP 502');
    expect(r.calls).toBe(5); // wx once + marine 1 + 3 retries
    expect(waits).toEqual([2000, 4000, 8000]);
    const after = await env.DB.prepare("SELECT cell_id, fetched_at FROM forecast_snapshots WHERE cell_id LIKE 'sea:%' ORDER BY cell_id").all();
    expect(after.results).toEqual(before.results);
  });

  it('backs off on 429 (Retry-After honoured, capped) and recovers', async () => {
    let n = 0;
    const flaky = (async (u: RequestInfo | URL) => {
      n++;
      if (n === 1) return new Response('slow down', { status: 429, headers: { 'retry-after': '120' } });
      if (n === 2) throw new Error('reset');
      return omFetch(NOW)(u);
    }) as typeof fetch;
    const waits: number[] = [];
    const stats: FetchStats = { calls: 0, statuses: [] };
    const snaps = await fetchSnapshots('wx', [{ id: 'a', lat: 40.4, lon: 28.9 }], flaky, { stats, sleep: async (ms) => void waits.push(ms) });
    expect(snaps.size).toBe(1);
    expect(waits).toEqual([30000, 4000]);
    expect(stats).toEqual({ calls: 3, statuses: [429, 0, 200] });
  });

  it('does not retry client errors', async () => {
    const bad = (async () => new Response('bad', { status: 400 })) as typeof fetch;
    await expect(fetchSnapshots('wx', [{ id: 'a', lat: 0, lon: 0 }], bad, { sleep: async () => {} })).rejects.toThrow('HTTP 400');
  });

  it('does nothing without cells', async () => {
    await env.DB.prepare('DELETE FROM cells').run();
    expect(await refreshWeather(env, NOW, omFetch(NOW))).toEqual({ wx: 0, sea: 0, errors: [], calls: 0, statuses: [] });
  });
});
