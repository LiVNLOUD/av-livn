import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { forbiddenUpdates, inside, validateArea, type Ring } from '../src/lib/forbidden';
import { omFetch, resetAndSeed, writeScoresV2 } from './helpers';
import { refreshWeather } from '../src/cron';

const auth = { authorization: 'Bearer test-admin-token', 'content-type': 'application/json' };
const sq = (lon: number, lat: number, d = 0.01): Ring => [[lon - d, lat - d], [lon + d, lat - d], [lon + d, lat + d], [lon - d, lat + d]];

describe('forbidden areas (pure)', () => {
  it('point in polygon and hide/unhide decisions; owner-hidden spots untouched', () => {
    expect(inside(29, 40, sq(29, 40))).toBe(true);
    expect(inside(29.1, 40, sq(29, 40))).toBe(false);
    const u = forbiddenUpdates([{ id: 'a', name: 'Gemport', ring: sq(29, 40) }], [
      { id: 'in', lat: 40, lon: 29, hidden_reason: null },
      { id: 'out-was', lat: 41, lon: 29, hidden_reason: 'forbidden' },
      { id: 'admin', lat: 40, lon: 29, hidden_reason: 'admin' },
      { id: 'out', lat: 41, lon: 29, hidden_reason: null },
    ]);
    expect(u).toEqual({ hide: ['in'], unhide: ['out-was'] });
    expect(validateArea({ name: 'x', ring: sq(1, 1) })).toEqual({ ok: false, error: 'invalid_name' });
    expect(validateArea({ name: 'Roda', ring: [[1, 1]] })).toEqual({ ok: false, error: 'invalid_ring' });
    expect(validateArea({ name: 'Roda', ring: [[1, 1], [2, 2], [500, 1]] })).toEqual({ ok: false, error: 'invalid_ring' });
    expect(validateArea({ name: 'Roda', ring: sq(1, 1) })).toMatchObject({ ok: true });
  });
});

describe('F1: hide/unhide, forbidden areas, auto-added fields', () => {
  beforeAll(async () => {
    await resetAndSeed();
    const now = new Date();
    await refreshWeather(env, now, omFetch(now));
    await writeScoresV2(now);
  });
  const count = async () => (await (await app.request('/api/spots', {}, env)).json<{ count: number }>()).count;
  it('owner hides a spot from everyone and restores it', async () => {
    const n = await count();
    expect((await app.request('/api/admin/spots/osm-way-2', { method: 'PATCH', headers: auth, body: JSON.stringify({ hidden: 'x' }) }, env)).status).toBe(400);
    expect((await app.request('/api/admin/spots/osm-way-2', { method: 'PATCH', headers: auth, body: JSON.stringify({ hidden: true }) }, env)).status).toBe(200);
    expect(await count()).toBe(n - 1);
    expect((await app.request('/api/spots/osm-way-2', {}, env)).status).toBe(200); // card still reachable by link
    const adm = await (await app.request('/api/admin/spots', { headers: auth }, env)).json<{ spots: { id: string; hidden_reason: string | null }[] }>();
    expect(adm.spots.find((s) => s.id === 'osm-way-2')!.hidden_reason).toBe('admin');
    await app.request('/api/admin/spots/osm-way-2', { method: 'PATCH', headers: auth, body: JSON.stringify({ hidden: false }) }, env);
    expect(await count()).toBe(n);
  });
  it('a drawn area hides the spots inside; deleting it brings them back; public layer lists it', async () => {
    const s = await env.DB.prepare("SELECT lat, lon FROM spots WHERE id = 'osm-way-1'").first<{ lat: number; lon: number }>();
    const n = await count();
    expect((await app.request('/api/admin/forbidden', { method: 'POST', headers: auth, body: '{}' }, env)).status).toBe(400);
    const r = await app.request('/api/admin/forbidden', { method: 'POST', headers: auth, body: JSON.stringify({ name: 'Gemport', ring: sq(s!.lon, s!.lat, 0.001) }) }, env);
    const b = await r.json<{ id: string; hide: string[] }>();
    expect(r.status).toBe(201);
    expect(b.hide).toEqual(['osm-way-1']);
    expect(await count()).toBe(n - 1);
    const pub = await (await app.request('/api/forbidden', {}, env)).json<{ features: { properties: { name: string } }[] }>();
    expect(pub.features.map((f) => f.properties.name)).toEqual(['Gemport']);
    expect((await app.request(`/api/admin/forbidden/${b.id}`, { method: 'DELETE', headers: auth }, env)).status).toBe(200);
    expect((await app.request(`/api/admin/forbidden/${b.id}`, { method: 'DELETE', headers: auth }, env)).status).toBe(404);
    expect(await count()).toBe(n);
  });
  it('public spot carries auto_added and near links', async () => {
    await env.DB.prepare("UPDATE spots SET auto_added = 1, near_json = '[\"osm-way-2\"]' WHERE id = 'osm-way-3'").run();
    const l = await (await app.request('/api/spots', {}, env)).json<{ spots: { id: string; auto_added: boolean; near: string[] }[] }>();
    expect(l.spots.find((s) => s.id === 'osm-way-3')).toMatchObject({ auto_added: true, near: ['osm-way-2'] });
  });
});
