import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { identifyModel, matchModel, metaUrl, parseRunMeta, recordWeatherRuns } from '../src/lib/modelrun';
import { resetAndSeed } from './helpers';

const NOW = new Date('2026-11-07T16:07:00Z');
const series = (base: number) => ({ wind_speed_10m: Array.from({ length: 48 }, (_, i) => base + i), wind_gusts_10m: Array.from({ length: 48 }, (_, i) => base + 2 * i), temperature_2m: Array.from({ length: 48 }, () => 15) });

describe('MODEL.md §18: model run behind the weather', () => {
  beforeAll(async () => { await resetAndSeed(); });
  it('meta.json parsing: init/availability/interval, anything malformed is unknown', () => {
    expect(parseRunMeta('dwd_icon_eu', { last_run_initialisation_time: 1794052800, last_run_availability_time: 1794057868, update_interval_seconds: 10800 }))
      .toEqual({ model: 'dwd_icon_eu', init: '2026-11-07T12:00:00.000Z', available: '2026-11-07T13:24:28.000Z', interval_s: 10800 });
    expect(parseRunMeta('m', { last_run_initialisation_time: 1794052800, update_interval_seconds: 3600 })!.available).toBeNull();
    expect(parseRunMeta('m', { update_interval_seconds: 3600 })).toBeNull();
    expect(parseRunMeta('m', { last_run_initialisation_time: 1, update_interval_seconds: 0 })).toBeNull();
    expect(parseRunMeta('m', null)).toBeNull();
    expect(metaUrl('wx', 'dwd_icon_eu')).toBe('https://api.open-meteo.com/data/dwd_icon_eu/static/meta.json');
    expect(metaUrl('sea', 'dwd_ewam')).toBe('https://marine-api.open-meteo.com/data/dwd_ewam/static/meta.json');
  });
  it('identification: only an exact match on enough values counts', () => {
    expect(matchModel(series(5), [['a', series(6)], ['b', series(5)]])).toBe('b');
    expect(matchModel(series(5), [['a', series(6)]])).toBeNull();
    expect(matchModel({ x: [1, 2] }, [['a', { x: [1, 2] }]])).toBeNull(); // too few values
    expect(matchModel({ x: [1, 2] }, [['a', {}]])).toBeNull();
    expect(matchModel({ x: Array.from({ length: 30 }, (_, i) => (i % 2 ? null : i)) }, [['a', { x: Array.from({ length: 30 }, (_, i) => i) }]])).toBeNull(); // 15 compared < 24
  });
  const fakeOm = (bestBase: number, models: Record<string, number>, metaOk = true) => (async (url: string) => {
    const u = new URL(url);
    if (u.pathname.endsWith('/static/meta.json')) return metaOk ? Response.json({ last_run_initialisation_time: 1794052800, last_run_availability_time: 1794057868, update_interval_seconds: 10800 }) : new Response('', { status: 404 });
    const m = u.searchParams.get('models')!;
    const base = m === 'best_match' ? bestBase : models[m];
    if (base === undefined) return new Response('', { status: 400 });
    const s = series(base);
    return Response.json({ hourly: u.hostname.startsWith('marine') ? { wave_height: s.wind_speed_10m } : s });
  }) as unknown as typeof fetch;
  it('identifyModel walks the candidates; a failed request or no match is null', async () => {
    expect(await identifyModel('wx', { lat: 40, lon: 29 }, fakeOm(5, { dwd_icon_eu: 5 }))).toBe('dwd_icon_eu');
    expect(await identifyModel('wx', { lat: 40, lon: 29 }, fakeOm(5, { dwd_icon_eu: 6, dwd_icon: 5 }))).toBe('dwd_icon');
    expect(await identifyModel('sea', { lat: 40, lon: 29 }, fakeOm(9, { meteofrance_wave: 1 }))).toBeNull();
    expect(await identifyModel('wx', { lat: 40, lon: 29 }, (async () => { throw new Error('net'); }) as unknown as typeof fetch)).toBeNull();
  });
  it('recordWeatherRuns: identifies on request, stores runs and the fetch outcome; weekly re-check otherwise', async () => {
    await env.DB.prepare("INSERT INTO meta (key, value) VALUES ('model_check', 'requested') ON CONFLICT(key) DO UPDATE SET value = excluded.value").run();
    const r = await recordWeatherRuns(env, NOW, true, 0, fakeOm(5, { dwd_icon_eu: 5, meteofrance_wave: 5 }));
    expect(r.wx).toMatchObject({ model: 'dwd_icon_eu', init: '2026-11-07T12:00:00.000Z', interval_s: 10800 });
    expect(r.sea).toMatchObject({ model: 'meteofrance_wave' });
    expect(r.fetch).toEqual({ at: NOW.toISOString(), ok: true, errors: 0 });
    const read = async (k: string) => (await env.DB.prepare('SELECT value FROM meta WHERE key = ?1').bind(k).first<{ value: string }>())?.value;
    expect(JSON.parse((await read('model_check'))!)).toMatchObject({ wx: 'dwd_icon_eu', sea: 'meteofrance_wave' });
    expect(JSON.parse((await read('weather_runs'))!).wx.model).toBe('dwd_icon_eu');
    // next hour: no re-identification (identity is a day old at most), meta.json failing → unknown, fetch failed
    const calls: string[] = [];
    const spy = (async (url: string) => { calls.push(url); return new Response('', { status: 503 }); }) as unknown as typeof fetch;
    const r2 = await recordWeatherRuns(env, new Date(NOW.getTime() + 3_600_000), false, 2, spy);
    expect(calls.every((u) => u.endsWith('/static/meta.json'))).toBe(true);
    expect(r2).toMatchObject({ wx: null, sea: null, fetch: { ok: false, errors: 2 } });
  });
});
