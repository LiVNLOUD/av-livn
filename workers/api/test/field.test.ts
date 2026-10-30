import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { refreshWeather } from '../src/cron';
import { app } from '../src/index';
import { validateFieldInput } from '../src/routes/admin';
import { omFetch, resetAndSeed, writeScoresV2 } from './helpers';

const AUTH = { authorization: 'Bearer test-admin-token', 'content-type': 'application/json' };
const post = (path: string, body: unknown) => app.request(path, { method: 'POST', headers: AUTH, body: JSON.stringify(body) }, env);
const NOW = new Date('2026-11-07T10:00:00Z');

beforeAll(async () => {
  await resetAndSeed();
  const now = new Date();
  await refreshWeather(env, now, omFetch(now));
  await writeScoresV2(now);
});

describe('validateFieldInput', () => {
  it('accepts a full form and normalises empties', () => {
    const v = validateFieldInput(
      {
        substrate: ['kaya', 'kaya', 'midyeli'], snag: 'midye', structure: 'iskele', has_light: true, light_color: 'led', access: 'acik', note: '',
        depths: [{ distance_m: 20, method: 'plumb', depth_m: 4.5 }, { distance_m: 40, method: 'sink', sink_s: 12, jig_g: 3 }],
        photo: { mime: 'image/jpeg', data_b64: 'AAAA' },
      },
      NOW,
    );
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.value.substrate).toEqual(['kaya', 'midyeli']);
    expect(v.value.note).toBeNull();
    expect(v.value.depths[1]).toEqual({ distance_m: 40, method: 'sink', depth_m: null, sink_s: 12, jig_g: 3 });
    expect(v.value.observed_at).toBe(NOW.toISOString());
    const empty = validateFieldInput({ substrate: [], has_light: null }, NOW);
    expect(empty.ok && [empty.value.substrate, empty.value.has_light, empty.value.photo]).toEqual([null, null, null]);
  });

  it.each([
    [{ observed_at: 'nope' }, 'invalid_observed_at'],
    [{ observed_at: '2026-11-08T10:00:00Z' }, 'invalid_observed_at'],
    [{ substrate: ['lava'] }, 'invalid_substrate'],
    [{ substrate: 'kaya' }, 'invalid_substrate'],
    [{ snag: 'x' }, 'invalid_snag'],
    [{ structure: 'x' }, 'invalid_structure'],
    [{ has_light: 'yes' }, 'invalid_has_light'],
    [{ light_color: 'mor' }, 'invalid_light_color'],
    [{ access: 'x' }, 'invalid_access'],
    [{ note: 'x'.repeat(1001) }, 'invalid_note'],
    [{ depths: 'x' }, 'invalid_depths'],
    [{ depths: [null] }, 'invalid_distance'],
    [{ depths: [{ distance_m: 10, method: 'plumb', depth_m: 99 }] }, 'invalid_depth'],
    [{ depths: [{ distance_m: 10, method: 'sink', sink_s: 0.1, jig_g: 2 }] }, 'invalid_sink'],
    [{ depths: [{ distance_m: 10, method: 'echo' }] }, 'invalid_method'],
    [{ photo: { mime: 'image/png', data_b64: 'AA' } }, 'invalid_photo'],
    [{ photo: { mime: 'image/jpeg', data_b64: 'not base64!' } }, 'invalid_photo'],
  ])('rejects %j', (body, error) => {
    expect(validateFieldInput(body as Record<string, unknown>, NOW)).toEqual({ ok: false, error });
  });
});

describe('POST /api/admin/spots/:id/field', () => {
  it('needs the admin token', async () => {
    expect((await app.request('/api/admin/spots/osm-way-1/field', { method: 'POST', body: '{}' }, env)).status).toBe(401);
  });

  it('stores the observation, updates lamp/access and rescores the spot immediately', async () => {
    const before = await env.DB.prepare("SELECT list_json, start_hour FROM spot_scores_v2 WHERE spot_id = 'osm-way-2'").first<{ list_json: string; start_hour: number }>();
    const res = await post('/api/admin/spots/osm-way-2/field', {
      substrate: ['kaya'], structure: 'mendirek', has_light: true, light_color: 'sari', access: 'acik', note: 'ölçüm',
      depths: [{ distance_m: 10, method: 'plumb', depth_m: 6 }, { distance_m: 15, method: 'sink', sink_s: 15, jig_g: 2 }, { distance_m: 80, method: 'sink', sink_s: 22, jig_g: 2 }],
      photo: { mime: 'image/jpeg', data_b64: 'QUJD' },
    });
    expect(res.status).toBe(201);
    const b = await res.json<{ ok: boolean; obs_id: string; rescored: boolean; score: { total: number; rank: number } }>();
    expect(b.rescored).toBe(true);
    expect(b.score.total).toBeGreaterThan(0);
    const spot = await env.DB.prepare("SELECT has_light, access, admin_edited_at FROM spots WHERE id = 'osm-way-2'").first<Record<string, unknown>>();
    expect(spot).toMatchObject({ has_light: 1, access: 'acik' });
    const after = await env.DB.prepare("SELECT list_json, partial FROM spot_scores_v2 WHERE spot_id = 'osm-way-2'").first<{ list_json: string; partial: number }>();
    expect(after!.partial).toBe(1);
    expect(after!.list_json).not.toBe(before!.list_json);

    const d = await (await app.request('/api/spots/osm-way-2?model=v2', {}, env)).json<{ field: Record<string, any>; partial: boolean; packed: { meta: { comps: unknown[][]; sink_calibration: { pairs: number } } } }>();
    expect(d.partial).toBe(true);
    expect(d.field.observations).toBe(1);
    expect(d.field.last_note).toBe('ölçüm');
    expect(d.field.depths.map((x: { quality: string }) => x.quality)).toEqual(['plumb', 'sink_cal', 'sink_cal']);
    expect(d.packed.meta.sink_calibration.pairs).toBe(1);
    const sources = Object.fromEntries(d.packed.meta.comps.map((c) => [c[0], c[4]]));
    expect(sources).toMatchObject({ derinlik: 'saha', taban: 'saha', yapi: 'saha', lamba: 'saha' });

    const list = await (await app.request('/api/admin/spots/osm-way-2/field', { headers: AUTH }, env)).json<{ observations: { id: string; has_photo: number; depths: unknown[] }[] }>();
    expect(list.observations[0]).toMatchObject({ id: b.obs_id, has_photo: 1 });
    expect(list.observations[0]!.depths).toHaveLength(3);
  });

  it('can skip the rescore, rejects bad input and unknown spots', async () => {
    const r = await post('/api/admin/spots/osm-way-1/field?rescore=0', { note: 'sadece not' });
    expect(await r.json()).toMatchObject({ ok: true, rescored: false, score: null });
    expect((await post('/api/admin/spots/osm-way-1/field', { snag: 'x' })).status).toBe(400);
    expect((await app.request('/api/admin/spots/osm-way-1/field', { method: 'POST', headers: AUTH, body: 'nope' }, env)).status).toBe(400);
    expect((await post('/api/admin/spots/none/field', {})).status).toBe(404);
  });

  it('on-demand rescore and deleting an observation', async () => {
    const r = await post('/api/admin/spots/osm-way-1/rescore', {});
    expect(await r.json()).toMatchObject({ ok: true, score: { gated: false } });
    expect((await post('/api/admin/spots/none/rescore', {})).status).toBe(404);
    const list = await (await app.request('/api/admin/spots/osm-way-1/field', { headers: AUTH }, env)).json<{ observations: { id: string }[] }>();
    const id = list.observations[0]!.id;
    expect((await app.request(`/api/admin/field/${id}`, { method: 'DELETE', headers: AUTH }, env)).status).toBe(200);
    expect((await app.request(`/api/admin/field/${id}`, { method: 'DELETE', headers: AUTH }, env)).status).toBe(404);
  });
});
