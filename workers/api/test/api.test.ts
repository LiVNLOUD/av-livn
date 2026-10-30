import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { CRON_SCORE, refreshWeather, runCron } from '../src/cron';
import { app } from '../src/index';
import { omFetch, resetAndSeed } from './helpers';

const AUTH = { authorization: 'Bearer test-admin-token', 'content-type': 'application/json' };

beforeAll(async () => {
  await resetAndSeed();
  const now = new Date();
  await refreshWeather(env, now, omFetch(now));
  for (const cron of CRON_SCORE) await runCron(cron, env, now);
});

describe('GET /api/health', () => {
  it('reports the current schema', async () => {
    const body = await (await app.request('/api/health', {}, env)).json<{ ok: boolean; schema: string }>();
    expect(body).toMatchObject({ ok: true, schema: 'f1.2' });
  });

  it('JSON 404 for unknown routes', async () => {
    expect((await app.request('/api/nope', {}, env)).status).toBe(404);
  });
});

describe('GET /api/spots (reads precomputed scores)', () => {
  it('lists spots sorted by the current hour score', async () => {
    const res = await app.request('/api/spots', {}, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-cache');
    const body = await res.json<{ spots: { id: string; score: { total: number | null; missing_count: number } }[]; data_fetched_at: string }>();
    expect(body.spots).toHaveLength(3);
    const totals = body.spots.map((s) => s.score.total ?? -1);
    expect([...totals].sort((a, b) => b - a)).toEqual(totals);
    expect(body.spots.every((s) => typeof s.score.total === 'number')).toBe(true);
    expect(body.spots.find((s) => s.id === 'osm-way-3')!.score.missing_count).toBeGreaterThan(0);
    expect(body.data_fetched_at).toBeTruthy();
  });

  it('only reads: a tampered stored list is returned as-is', async () => {
    const row = await env.DB.prepare("SELECT start_hour, list_json FROM spot_scores WHERE spot_id = 'osm-way-1'").first<{ start_hour: number; list_json: string }>();
    const list = JSON.parse(row!.list_json) as unknown[];
    const idx = Math.floor(Date.now() / 3_600_000) - row!.start_hour;
    list[idx] = [12.3, 1, 'test uyarısı', 0];
    await env.DB.prepare("UPDATE spot_scores SET list_json = ?1 WHERE spot_id = 'osm-way-1'").bind(JSON.stringify(list)).run();
    const body = await (await app.request('/api/spots?v=tamper', {}, env)).json<{ spots: { id: string; score: object }[] }>();
    expect(body.spots.find((s) => s.id === 'osm-way-1')!.score).toEqual({ total: 12.3, gated: true, warnings: ['test uyarısı'], missing_count: 0 });
  });

  it('shows null scores before the first scoring run', async () => {
    await env.DB.prepare("DELETE FROM spot_scores WHERE spot_id = 'osm-way-2'").run();
    const body = await (await app.request('/api/spots?v=empty', {}, env)).json<{ spots: { id: string; score: { total: unknown } }[] }>();
    expect(body.spots.at(-1)).toMatchObject({ id: 'osm-way-2', score: { total: null } });
    const detail = await (await app.request('/api/spots/osm-way-2?v=empty', {}, env)).json<{ scores: unknown[]; data: { computed_at: unknown } }>();
    expect(detail.scores).toEqual([]);
    expect(detail.data.computed_at).toBeNull();
    await runCron(CRON_SCORE[0]!, env);
    await runCron(CRON_SCORE[1]!, env);
    await runCron(CRON_SCORE[2]!, env);
  });

  it('rejects unknown and TODO species', async () => {
    expect((await (await app.request('/api/spots?species=yok', {}, env)).json<{ error: string }>()).error).toBe('unknown_species');
    expect((await (await app.request('/api/spots?species=levrek', {}, env)).json<{ error: string }>()).error).toBe('species_not_ready');
    expect((await app.request('/api/spots/osm-way-1?species=kalamar', {}, env)).status).toBe(400);
  });
});

describe('GET /api/spots/:id', () => {
  it('returns 72 hours with components, night multiplier and coloured conditions', async () => {
    const body = await (await app.request('/api/spots/osm-way-1', {}, env)).json<{
      scores: { ts: string; total: number; components: { key: string }[]; multipliers: { key: string; value: number }[]; conditions: { key: string; band: string }[] }[];
      data: { sea_grid: { distance_km: number } | null; conditions: { key: string; target: string }[] };
    }>();
    expect(body.scores).toHaveLength(72);
    expect(body.scores[0]!.components).toHaveLength(6);
    expect(body.scores[0]!.multipliers[0]!.key).toBe('gece_carpani');
    expect(body.scores[0]!.conditions.map((c) => c.key)).toEqual(body.data.conditions.map((c) => c.key));
    expect(body.data.conditions.find((c) => c.key === 'hamle')!.target).toContain('40 km/sa');
    expect(body.data.sea_grid!.distance_km).toBeGreaterThan(0);
  });

  it('starts at the current hour and honours the hours parameter; 404s unknown spots', async () => {
    const body = await (await app.request('/api/spots/osm-way-3?hours=5', {}, env)).json<{ scores: { ts: string }[]; data: { sea_grid: unknown } }>();
    expect(body.scores).toHaveLength(5);
    expect(Date.parse(body.scores[0]!.ts)).toBe(Math.floor(Date.now() / 3_600_000) * 3_600_000);
    expect(body.data.sea_grid).toBeNull();
    expect((await app.request('/api/spots/yok', {}, env)).status).toBe(404);
  });
});

describe('cron routing', () => {
  it('rejects unknown cron expressions', async () => {
    await expect(runCron('0 0 * * *', env)).rejects.toThrow(/unknown cron/);
  });

  it('splits spots over the scoring crons', async () => {
    const counts = [];
    for (const cron of CRON_SCORE) counts.push(((await runCron(cron, env)) as { spots: number }).spots);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(3);
    expect(counts).toEqual([1, 1, 1]);
  });
});

describe('admin', () => {
  it('ping answers only with the token', async () => {
    expect((await app.request('/api/admin/ping', { headers: AUTH }, env)).status).toBe(200);
    expect((await app.request('/api/admin/ping', {}, env)).status).toBe(401);
  });

  it('re-scores a spot right after a lamp edit', async () => {
    const night = async () => {
      const b = await (await app.request(`/api/spots/osm-way-1?v=${Math.random()}`, {}, env)).json<{ scores: { multipliers: { phase: string; value: number }[] }[] }>();
      return b.scores.map((s) => s.multipliers[0]!).find((m) => m.phase === 'full')!.value;
    };
    expect(await night()).toBe(0.75);
    await app.request('/api/admin/spots/osm-way-1', { method: 'PATCH', headers: AUTH, body: JSON.stringify({ has_light: true }) }, env);
    expect(await night()).toBe(1);
  });

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

describe('edge cache', () => {
  it('serves repeated GETs from cache until the TTL expires', async () => {
    const url = 'https://av.livn.tr/api/spots/osm-way-1?hours=3';
    const first = await (await app.request(url, {}, env)).json<{ spot: { name: string } }>();
    await env.DB.prepare("UPDATE spots SET name = 'Değişti' WHERE id = 'osm-way-1'").run();
    const res2 = await app.request(url, {}, env);
    expect(res2.headers.get('cache-control')).toBe('no-cache');
    const second = await res2.json<{ spot: { name: string } }>();
    expect(second.spot.name).toBe(first.spot.name);
    const fresh = await (await app.request(url + '&x=1', {}, env)).json<{ spot: { name: string } }>();
    expect(fresh.spot.name).toBe('Değişti');
  });
});
