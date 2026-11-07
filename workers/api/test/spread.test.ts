import { env } from 'cloudflare:workers';
import { app } from '../src/index';
import { describe, expect, it } from 'vitest';
import { buildGrid, cellSpread, dirSpread, LATTICE, latticePoints, valueSpread } from '../src/lib/spread';

describe('P2: weather-model spread', () => {
  it('value spread: min, max, sd; needs two models', () => {
    expect(valueSpread([10, 20, null])).toEqual([10, 20, 5]);
    expect(valueSpread([12, 12, 12, 12])).toEqual([12, 12, 0]);
    expect(valueSpread([7, null])).toBeNull();
    expect(valueSpread([])).toBeNull();
  });
  it('direction spread is circular (350° and 10° are 10° from their mean)', () => {
    expect(dirSpread([350, 10])).toBe(10);
    expect(dirSpread([90, 90, 90])).toBe(0);
    expect(dirSpread([0, 180, null])).toBeGreaterThanOrEqual(90);
    expect(dirSpread([45])).toBeNull();
  });
  it('cell spread from a multi-model response, aligned to the hour', () => {
    const time = ['2026-11-07T16:00', '2026-11-07T17:00', '2026-11-07T18:00'];
    const h0 = Math.floor(Date.parse('2026-11-07T17:00Z') / 3_600_000);
    const hourly = {
      time,
      wind_speed_10m_a: [5, 10, 12], wind_speed_10m_b: [6, 20, 14],
      wind_gusts_10m_a: [9, 30, 20], wind_gusts_10m_b: [9, 44, 22],
      wind_direction_10m_a: [0, 350, 90], wind_direction_10m_b: [0, 10, 100],
      precipitation_a: [0, 0, 1], precipitation_b: [0, 0.4, 3],
      cloud_cover_a: [0, 50, 100], cloud_cover_b: [0, 70, 100],
    };
    const c = cellSpread('wx-1', 40.4, 29, hourly, h0, 3, ['a', 'b']);
    expect(c.w[0]).toEqual([10, 20, 5]);
    expect(c.g[0]).toEqual([30, 44, 7]);
    expect(c.d[0]).toBe(10);
    expect(c.p[0]).toEqual([0, 0.4, 0.2]);
    expect(c.c[1]).toEqual([100, 100, 0]);
    expect(c.w[2]).toBeNull(); // past the response
    expect(c.m).toEqual({ a: [10, 12, null], b: [20, 14, null] });
  });
  it('grid: lattice points row-major, hour × point integers, missing → null', () => {
    const pts = latticePoints();
    expect(pts).toHaveLength(LATTICE.nlat * LATTICE.nlon);
    expect(pts[1]).toEqual({ lat: 40.15, lon: 28.5 });
    const h0 = Math.floor(Date.parse('2026-11-07T17:00Z') / 3_600_000);
    const locs = [{ hourly: { time: ['2026-11-07T17:00'], wind_speed_10m: [12.34] } }, { hourly: { time: ['2026-11-07T17:00'], wind_speed_10m: [null] } }];
    const g = buildGrid(locs, { ws: { key: 'wind_speed_10m', scale: 10 } }, h0, 2, { ...LATTICE, nlat: 1, nlon: 2 }, 'test', new Date(0));
    expect(g.vars.ws).toEqual([[123, null], [null, null]]);
    expect(g).toMatchObject({ from_hour: h0, hours: 2, nlat: 1, nlon: 2, source: 'test' });
  });
});

describe('P2/P5: grid endpoint serves the stored JSON as is', () => {
  it('known names only; not ready until built; cached 10 min', async () => {
    expect((await app.request('/api/grid/x', {}, env)).status).toBe(404);
    await env.DB.prepare("DELETE FROM meta WHERE key = 'grid_wx'").run();
    expect(await (await app.request('/api/grid/wx', {}, env)).json()).toEqual({ ok: false, error: 'not_ready' });
    await env.DB.prepare("INSERT INTO meta (key, value) VALUES ('grid_wx', '{\"from_hour\":1}')").run();
    const r = await app.request('/api/grid/wx', {}, env);
    expect([r.status, await r.text(), r.headers.get('cache-control')]).toEqual([200, '{"from_hour":1}', 'public, max-age=600']);
  });
});
