import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { refreshWeather } from '../src/cron';
import { buildUrl, parseResponse } from '../src/lib/openmeteo';
import { mergeSnapshots, valuesAt } from '../src/lib/series';
import { omFetch, resetAndSeed } from './helpers';

const NOW = new Date('2026-11-05T17:07:00Z');

describe('open-meteo client', () => {
  it('builds multi-location URLs with the agreed variables', () => {
    const wx = new URL(buildUrl('wx', [{ id: 'a', lat: 40.4, lon: 28.9 }, { id: 'b', lat: 40.35, lon: 29 }]));
    expect(wx.searchParams.get('latitude')).toBe('40.4,40.35');
    expect(wx.searchParams.get('hourly')).toBe('pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,precipitation,cloud_cover');
    expect(wx.searchParams.get('past_days')).toBe('1');
    const sea = new URL(buildUrl('sea', [{ id: 'a', lat: 40.4, lon: 28.9 }]));
    expect(sea.hostname).toBe('marine-api.open-meteo.com');
    expect(sea.searchParams.get('hourly')).toContain('sea_level_height_msl');
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
    expect(r).toEqual({ wx: 3, sea: 2, errors: [] });
    expect(calls).toHaveLength(2);
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

  it('records errors per kind and keeps going', async () => {
    const failing = (async (u: RequestInfo | URL) =>
      String(u).includes('marine') ? new Response('boom', { status: 502 }) : omFetch(NOW)(u)) as typeof fetch;
    const r = await refreshWeather(env, NOW, failing);
    expect(r.wx).toBe(3);
    expect(r.sea).toBe(0);
    expect(r.errors[0]).toContain('HTTP 502');
  });

  it('does nothing without cells', async () => {
    await env.DB.prepare('DELETE FROM cells').run();
    expect(await refreshWeather(env, NOW, omFetch(NOW))).toEqual({ wx: 0, sea: 0, errors: [] });
  });
});
