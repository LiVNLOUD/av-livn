import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { CRON_FETCH, refreshWeather, runCron } from '../src/cron';
import { app } from '../src/index';
import { omFetch, resetAndSeed, writeScores, writeScoresV2 } from './helpers';

const AUTH = { authorization: 'Bearer test-admin-token', 'content-type': 'application/json' };

beforeAll(async () => {
  await resetAndSeed();
  const now = new Date();
  await refreshWeather(env, now, omFetch(now));
  expect(await writeScores(now)).toBe(3);
});

describe('GET /api/health', () => {
  it('reports the current schema', async () => {
    const body = await (await app.request('/api/health', {}, env)).json<{ ok: boolean; schema: string }>();
    expect(body).toMatchObject({ ok: true, schema: 'v2.5' });
  });

  it('JSON 404 for unknown routes', async () => {
    expect((await app.request('/api/nope', {}, env)).status).toBe(404);
  });
});

describe('public spot API (v2 only)', () => {
  it('lists v2 scores; v1 and unknown species are not served', async () => {
    await writeScoresV2();
    const b = await (await app.request('/api/spots', {}, env)).json<{ model: string; spots: { score: object }[] }>();
    expect(b.model).toBe('v2.0');
    expect(b.spots).toHaveLength(3);
    expect((await app.request('/api/spots?species=levrek', {}, env)).status).toBe(400);
  });

  it('includes DTM depth features and the 0–500 m profile; 404s unknown spots', async () => {
    const b = await (await app.request('/api/spots/osm-way-1?v=depth', {}, env)).json<{ spot: Record<string, any> }>();
    expect(b.spot).toMatchObject({ depth_200m: 8.5, slope_pct: 3.1, max_depth_100m: 5.2, probe_source: 'dtm', normal_source: 'dtm' });
    expect(b.spot.profile).toHaveLength(21);
    expect(b.spot.alt).toEqual({ lat: 40.375, lon: 28.883 });
    expect(b.spot.fetch_km).toHaveLength(16);
    expect(b.spot.substrate).toEqual({ class: 'Sandy mud', biozone: 'Infralittoral', distance_m: 0, confidence: 2 });
    const other = await (await app.request('/api/spots/osm-way-2?v=depth', {}, env)).json<{ spot: Record<string, any> }>();
    expect(other.spot).toMatchObject({ profile: null, alt: null, fetch_km: null, substrate: null });
    expect((await app.request('/api/spots/yok', {}, env)).status).toBe(404);
  });
});

describe('privacy: public endpoints never return field values (docs/PRIVACY.md)', () => {
  it('field notes, lamp state, measured depths and visit dates stay behind ADMIN_TOKEN', async () => {
    await app.request('/api/admin/spots/osm-way-1', { method: 'PATCH', headers: AUTH, body: JSON.stringify({ notes: 'GİZLİ-NOT', has_light: true }) }, env);
    await app.request('/api/admin/spots/osm-way-1/field', {
      method: 'POST', headers: AUTH,
      body: JSON.stringify({ note: 'GİZLİ-SAHA', substrate: ['kaya'], structure: 'iskele', has_light: true, depths: [{ distance_m: 20, method: 'plumb', depth_m: 7.77 }], photo: { mime: 'image/jpeg', data_b64: 'QUJD' } }),
    }, env);
    await writeScoresV2();
    const list = await (await app.request('/api/spots?p=1', {}, env)).text();
    const det = await (await app.request('/api/spots/osm-way-1?p=1', {}, env)).text();
    for (const body of [list, det]) {
      for (const secret of ['GİZLİ', '7.77', 'has_light', '"notes"', 'QUJD', 'depth_field_at":"', 'observed_at', 'kaya']) expect(body).not.toContain(secret);
    }
    const d = JSON.parse(det) as { field: Record<string, any>; spot: { lamp_known: boolean }; packed: { meta: { comps: unknown[][] }; h: unknown[][] } };
    expect(d.spot.lamp_known).toBe(true);
    expect(d.field).toEqual({ observations: 1, desk_pending: 0, kinds: { lamba: 'saha', derinlik: 'saha', taban: 'saha', yapi: 'saha' } });
    const i = d.packed.meta.comps.findIndex((c) => c[0] === 'derinlik');
    expect((d.packed.h[0]![9] as unknown[])[i]).toBeNull();
    expect((d.packed.h[0]![10] as string[])[i]).toContain('yalnız yönetici');
    // the owner still sees everything with the token
    const adm = await (await app.request('/api/admin/spots', { headers: AUTH }, env)).json<{ spots: { id: string; notes: string; has_light: boolean }[] }>();
    expect(adm.spots.find((s) => s.id === 'osm-way-1')).toMatchObject({ notes: 'GİZLİ-NOT', has_light: true });
    expect((await app.request('/api/admin/spots', {}, env)).status).toBe(401);
  });
});

describe('cron routing', () => {
  it('rejects unknown cron expressions', async () => {
    await expect(runCron('0 0 * * *', env)).rejects.toThrow(/unknown cron/);
  });

  it('the only Worker cron is the :07 weather fetch (scoring runs in Actions)', () => {
    expect(CRON_FETCH).toBe('7 * * * *');
  });
});

describe('admin', () => {
  it('ping answers only with the token', async () => {
    expect((await app.request('/api/admin/ping', { headers: AUTH }, env)).status).toBe(200);
    expect((await app.request('/api/admin/ping', {}, env)).status).toBe(401);
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

describe('caching', () => {
  it('API responses are never cached by browsers or the edge', async () => {
    expect((await app.request('/api/spots', {}, env)).headers.get('cache-control')).toBe('no-cache');
    expect((await app.request('/api/spots/osm-way-1', {}, env)).headers.get('cache-control')).toBe('no-cache');
  });
});

describe('compact detail storage', () => {
  it('pack/unpack round-trips and stays under D1 limits', async () => {
    const { packDetail, unpackDetail, computeSpot } = await import('../src/precompute');
    const { loadSnapshots } = await import('../src/lib/spots');
    const { PROFILES } = await import('@av-livn/scoring');
    const row = await env.DB.prepare("SELECT * FROM spots WHERE id = 'osm-way-1'").first();
    const r = row as unknown as import('../src/lib/spots').SpotRow;
    const snaps = await loadSnapshots(env.DB, [r.wx_cell, r.sea_cell!]);
    const res = computeSpot(r, snaps.get(r.wx_cell), snaps.get(r.sea_cell!), PROFILES.istavrit!, new Date());
    const packed = packDetail(res.detail);
    const size = JSON.stringify(packed).length;
    expect(size).toBeLessThan(90_000);
    expect(size).toBeLessThan(JSON.stringify(res.detail).length * 0.7);
    const back = unpackDetail(JSON.parse(JSON.stringify(packed)), 2, 3);
    expect(back.hours.map((h) => h.ts)).toEqual(res.detail.hours.slice(2, 5).map((h) => h.ts));
    const a = back.hours[0]!;
    const b = res.detail.hours[2]!;
    expect(a.components.map((c) => [c.key, c.weight, c.reason])).toEqual(b.components.map((c) => [c.key, c.weight, c.reason]));
    expect(a.conditions.map((c) => [c.key, c.display, c.band])).toEqual(b.conditions.map((c) => [c.key, c.display, c.band]));
    expect(a.multipliers[0]).toEqual(b.multipliers[0]);
    expect(a.missing).toEqual(b.missing);
    expect(unpackDetail({ ...packed, h: [[...packed.h[0]!.slice(0, 6), null, []] as never], meta: { ...packed.meta, mult: null } }).hours[0]!.multipliers).toEqual([]);
  });
});
