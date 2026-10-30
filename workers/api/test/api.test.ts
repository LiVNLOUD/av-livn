import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { refreshWeather } from '../src/cron';
import { app } from '../src/index';
import { omFetch, resetAndSeed } from './helpers';

const AUTH = { authorization: 'Bearer test-admin-token', 'content-type': 'application/json' };

beforeAll(async () => {
  await resetAndSeed();
  const now = new Date();
  await refreshWeather(env, now, omFetch(now));
});

describe('GET /api/health', () => {
  it('reports schema f1', async () => {
    const body = await (await app.request('/api/health', {}, env)).json<{ ok: boolean; schema: string }>();
    expect(body).toMatchObject({ ok: true, schema: 'f1' });
  });

  it('JSON 404 for unknown routes', async () => {
    expect((await app.request('/api/nope', {}, env)).status).toBe(404);
  });
});

describe('GET /api/spots', () => {
  it('lists spots sorted by current score with components summary', async () => {
    const res = await app.request('/api/spots', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json<{ spots: { id: string; score: { total: number | null; missing: string[] } }[]; data_fetched_at: string }>();
    expect(body.spots).toHaveLength(3);
    const totals = body.spots.map((s) => s.score.total ?? -1);
    expect([...totals].sort((a, b) => b - a)).toEqual(totals);
    expect(body.spots.every((s) => typeof s.score.total === 'number')).toBe(true);
    const noProbe = body.spots.find((s) => s.id === 'osm-way-3')!;
    expect(noProbe.score.missing).toContain('akinti');
    expect(body.data_fetched_at).toBeTruthy();
  });

  it('rejects unknown and TODO species', async () => {
    expect((await (await app.request('/api/spots?species=yok', {}, env)).json<{ error: string }>()).error).toBe('unknown_species');
    expect((await (await app.request('/api/spots?species=levrek', {}, env)).json<{ error: string }>()).error).toBe('species_not_ready');
    expect((await app.request('/api/spots/osm-way-1?species=kalamar', {}, env)).status).toBe(400);
  });
});

describe('GET /api/spots/:id', () => {
  it('returns 72 hourly scores with full component breakdown and conditions', async () => {
    const res = await app.request('/api/spots/osm-way-1', {}, env);
    const body = await res.json<{
      scores: { ts: string; total: number; components: { key: string; reason: string }[] }[];
      conditions: { ts: string; windSpeed?: number }[];
      data: { sea_grid: { distance_km: number } | null };
    }>();
    expect(body.scores).toHaveLength(72);
    expect(body.scores[0]!.components).toHaveLength(7);
    expect(body.conditions).toHaveLength(72);
    expect(body.conditions[0]!.windSpeed).toBeTypeOf('number');
    expect(body.data.sea_grid!.distance_km).toBeGreaterThan(0);
  });

  it('honours the hours parameter and 404s unknown spots', async () => {
    const body = await (await app.request('/api/spots/osm-way-3?hours=5', {}, env)).json<{ scores: unknown[]; data: { sea_grid: unknown } }>();
    expect(body.scores).toHaveLength(5);
    expect(body.data.sea_grid).toBeNull();
    expect((await app.request('/api/spots/yok', {}, env)).status).toBe(404);
  });
});

describe('admin', () => {
  it('is disabled without ADMIN_TOKEN and rejects bad tokens', async () => {
    const off = await app.request('/api/admin/spots/osm-way-1', { method: 'PATCH', headers: AUTH, body: '{}' }, { ...env, ADMIN_TOKEN: undefined });
    expect(off.status).toBe(503);
    const bad = await app.request('/api/admin/spots/osm-way-1', { method: 'PATCH', headers: { ...AUTH, authorization: 'Bearer wrong' }, body: '{}' }, env);
    expect(bad.status).toBe(401);
    const none = await app.request('/api/admin/spots/osm-way-1', { method: 'PATCH', body: '{}' }, env);
    expect(none.status).toBe(401);
  });

  it('patches field data and marks the spot admin-edited', async () => {
    const res = await app.request(
      '/api/admin/spots/osm-way-2',
      { method: 'PATCH', headers: AUTH, body: JSON.stringify({ name: ' Kumla mendirek ', has_light: true, status: 'verified', notes: 'gece lambası var' }) },
      env,
    );
    expect(res.status).toBe(200);
    expect((await res.json<{ spot: object }>()).spot).toMatchObject({ name: 'Kumla mendirek', has_light: true, status: 'verified' });
    const row = await env.DB.prepare("SELECT admin_edited_at FROM spots WHERE id = 'osm-way-2'").first<{ admin_edited_at: string }>();
    expect(row!.admin_edited_at).toBeTruthy();
    const clear = await app.request('/api/admin/spots/osm-way-2', { method: 'PATCH', headers: AUTH, body: JSON.stringify({ has_light: null, notes: null }) }, env);
    expect((await clear.json<{ spot: { has_light: unknown } }>()).spot.has_light).toBeNull();
  });

  it.each([
    [{ name: 'x' }, 'invalid_name'],
    [{ has_light: 'evet' }, 'invalid_has_light'],
    [{ status: 'ok' }, 'invalid_status'],
    [{ notes: 5 }, 'invalid_notes'],
    [{}, 'empty_patch'],
  ])('rejects invalid patch %j', async (patch, error) => {
    const res = await app.request('/api/admin/spots/osm-way-1', { method: 'PATCH', headers: AUTH, body: JSON.stringify(patch) }, env);
    expect(res.status).toBe(400);
    expect((await res.json<{ error: string }>()).error).toBe(error);
  });

  it('404s / 400s on unknown spot and bad JSON', async () => {
    expect((await app.request('/api/admin/spots/yok', { method: 'PATCH', headers: AUTH, body: '{"status":"rejected"}' }, env)).status).toBe(404);
    expect((await app.request('/api/admin/spots/osm-way-1', { method: 'PATCH', headers: AUTH, body: 'nope' }, env)).status).toBe(400);
    expect((await app.request('/api/admin/spots', { method: 'POST', headers: AUTH, body: 'nope' }, env)).status).toBe(400);
  });

  it('creates manual spots that are scored immediately once the cron has run', async () => {
    const res = await app.request(
      '/api/admin/spots',
      { method: 'POST', headers: AUTH, body: JSON.stringify({ name: 'Tirilye kayalık', lat: 40.39, lon: 28.79, shore_normal_deg: 10, probe_lat: 40.4, probe_lon: 28.79, has_light: false }) },
      env,
    );
    expect(res.status).toBe(201);
    const { spot } = await res.json<{ spot: { id: string; source: string; probe: object } }>();
    expect(spot.id).toMatch(/^manual-/);
    expect(spot.source).toBe('manual');
    expect(spot.probe).toEqual({ lat: 40.4, lon: 28.79 });
    const noProbe = await app.request('/api/admin/spots', { method: 'POST', headers: AUTH, body: JSON.stringify({ name: 'Kıyı', lat: 40.4, lon: 28.8, shore_normal_deg: 0 }) }, env);
    expect(((await noProbe.json<{ spot: { probe: unknown } }>()).spot.probe)).toBeNull();
  });

  it.each([
    [{ name: 'A b', lat: 41, lon: 28.9, shore_normal_deg: 0 }, 'invalid_position'],
    [{ name: 'A b', lat: 40.4, lon: 28.9, shore_normal_deg: 400 }, 'invalid_shore_normal'],
    [{ name: 'A b', lat: 40.4, lon: 28.9, shore_normal_deg: 0, probe_lat: 40.4, probe_lon: 30 }, 'invalid_probe'],
    [{ lat: 40.4, lon: 28.9, shore_normal_deg: 0 }, 'invalid_name'],
    [{ name: 'A b', lat: 40.4, lon: 28.9, shore_normal_deg: 0, has_light: 'x' }, 'invalid_has_light'],
  ])('rejects invalid new spot %j', async (body, error) => {
    const res = await app.request('/api/admin/spots', { method: 'POST', headers: AUTH, body: JSON.stringify(body) }, env);
    expect(res.status).toBe(400);
    expect((await res.json<{ error: string }>()).error).toBe(error);
  });
});
