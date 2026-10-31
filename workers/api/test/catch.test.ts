import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { refreshWeather } from '../src/cron';
import { app } from '../src/index';
import { cpue, freeze, sessionHours, toCsv, validateSession } from '../src/routes/catch';
import { omFetch, resetAndSeed, writeScoresV2 } from './helpers';

const AUTH = { authorization: 'Bearer test-admin-token', 'content-type': 'application/json' };
const NOW = new Date('2026-11-07T20:30:00Z');
const base = { spot_id: 'osm-way-1', start_at: '2026-11-07T18:00:00Z', end_at: '2026-11-07T20:00:00Z' };

beforeAll(async () => {
  await resetAndSeed();
  const now = new Date();
  await refreshWeather(env, now, omFetch(now));
  await writeScoresV2(now);
});

describe('validateSession', () => {
  it('defaults effort, normalises species and warns under the legal minimum size', () => {
    const v = validateSession({ ...base, items: [{ count: 3, length_cm: 12 }, { species: 'İstavrit', count: 2 }, { species: 'Kolyoz', count: 1, length_cm: 20 }] }, NOW);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.value).toMatchObject({ active_min: 120, rods: 1, zero_catch: false, under_lamp: null });
    expect(v.value.items.map((i) => i.species)).toEqual(['istavrit', 'istavrit', 'kolyoz']);
    expect(v.warnings).toEqual(['12 cm istavrit yasal asgari boyun (13 cm) altında — denize geri bırakın.']);
  });

  it('zero catch is explicit and differs from an empty form', () => {
    expect(validateSession({ ...base }, NOW)).toEqual({ ok: false, error: 'catch_or_zero_required' });
    expect(validateSession({ ...base, zero_catch: true }, NOW).ok).toBe(true);
    expect(validateSession({ ...base, zero_catch: true, items: [{ count: 1 }] }, NOW)).toEqual({ ok: false, error: 'zero_catch_with_items' });
  });

  it.each([
    [{ spot_id: '' }, 'invalid_spot'],
    [{ end_at: '2026-11-07T17:00:00Z' }, 'invalid_time'],
    [{ end_at: '2026-11-09T17:00:00Z' }, 'invalid_time'],
    [{ start_at: '2026-11-06T10:00:00Z' }, 'invalid_time'],
    [{ active_min: 500 }, 'invalid_active_min'],
    [{ rods: 1.5 }, 'invalid_rods'],
    [{ jig_g: 0 }, 'invalid_jig_g'],
    [{ lure_len_cm: 99 }, 'invalid_lure_len'],
    [{ hook_no: 'x'.repeat(50) }, 'invalid_hook_no'],
    [{ lure_color: 5 }, 'invalid_lure_color'],
    [{ note: 'x'.repeat(1001) }, 'invalid_note'],
    [{ under_lamp: 'evet' }, 'invalid_under_lamp'],
    [{ items: 'x' }, 'invalid_items'],
    [{ items: [{ species: 5, count: 1 }] }, 'invalid_species'],
    [{ items: [{ count: 0 }] }, 'invalid_count'],
    [{ items: [{ count: 1, length_cm: 400 }] }, 'invalid_length'],
  ])('rejects %j', (patch, error) => {
    expect(validateSession({ ...base, items: [{ count: 1 }], ...patch }, NOW)).toEqual({ ok: false, error });
  });
});

describe('freezing and units', () => {
  it('session hours, freeze from history / live / missing, CPUE per hour per rod', () => {
    expect(sessionHours('2026-11-07T18:00:00Z', '2026-11-07T20:00:00Z')).toHaveLength(2);
    const h0 = Math.floor(Date.parse('2026-11-07T18:00:00Z') / 3_600_000);
    const f = freeze([h0, h0 + 1, h0 + 2], [{ hour: h0, json: JSON.stringify({ total: 70 }) }], { start_hour: h0 + 1, list: [[60, 50, 70, 2, 0, null, null]] });
    expect(f.hours.map((h) => h.source)).toEqual(['history', 'forecast']);
    expect(f.missing).toEqual([h0 + 2]);
    expect(freeze([h0], [], null)).toEqual({ hours: [], missing: [h0] });
    expect(cpue([{ species: 'istavrit', count: 6, length_cm: null }, { species: 'kolyoz', count: 9, length_cm: null }], 90, 2)).toBe(2);
  });
});

describe('catch API (admin only)', () => {
  it('requires the token', async () => {
    expect((await app.request('/api/admin/catch', {}, env)).status).toBe(401);
    expect((await app.request('/api/admin/catch/export.csv', {}, env)).status).toBe(401);
  });

  it('creates, lists, edits, exports and deletes a session with a frozen model', async () => {
    const now = new Date();
    const start = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000 - 3_600_000).toISOString();
    const hour = Math.floor(now.getTime() / 3_600_000);
    await env.DB.prepare('INSERT OR REPLACE INTO spot_scores_v2_history (spot_id, hour, json) VALUES (?1, ?2, ?3)').bind('osm-way-1', hour - 1, JSON.stringify({ total: 66, rank: 1, inputs: { cloud: 10 } })).run();
    const r = await app.request('/api/admin/catch', { method: 'POST', headers: AUTH, body: JSON.stringify({ spot_id: 'osm-way-1', start_at: start, end_at: now.toISOString(), rods: 2, jig_g: 1.5, under_lamp: true, items: [{ count: 4, length_cm: 11 }] }) }, env);
    expect(r.status).toBe(201);
    const b = await r.json<{ id: string; warnings: string[]; freeze_status: string; cpue: number }>();
    expect(b.warnings).toHaveLength(1);
    expect(b.freeze_status).toBe('complete');
    const list = await (await app.request('/api/admin/catch', { headers: AUTH }, env)).json<{ sessions: { id: string; items: unknown[]; model: { hours: { source: string }[] }; cpue: number }[] }>();
    const s = list.sessions.find((x) => x.id === b.id)!;
    expect(s.model.hours.map((h) => h.source)).toEqual(['history', 'forecast']);
    expect(s.items).toHaveLength(1);
    const put = await app.request(`/api/admin/catch/${b.id}`, { method: 'PUT', headers: AUTH, body: JSON.stringify({ spot_id: 'osm-way-1', start_at: start, end_at: now.toISOString(), zero_catch: true, note: 'boş, düzeltildi' }) }, env);
    expect(await put.json()).toMatchObject({ ok: true, cpue: 0 });
    const csv = await (await app.request('/api/admin/catch/export.csv', { headers: AUTH }, env)).text();
    expect(csv.split('\n')[0]).toContain('cpue_istavrit_per_h_rod');
    expect(csv).toContain(`${b.id},osm-way-1`);
    expect((await app.request(`/api/admin/catch/${b.id}`, { method: 'DELETE', headers: AUTH }, env)).status).toBe(200);
    expect((await app.request(`/api/admin/catch/${b.id}`, { method: 'DELETE', headers: AUTH }, env)).status).toBe(404);
  });

  it('rejects bad input, unknown spots and sessions; old hours stay partial', async () => {
    const past = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000 - 3 * 86_400_000);
    const base = { spot_id: 'osm-way-1', start_at: past.toISOString(), end_at: new Date(past.getTime() + 2 * 3_600_000).toISOString() };
    expect((await app.request('/api/admin/catch', { method: 'POST', headers: AUTH, body: 'x' }, env)).status).toBe(400);
    expect((await app.request('/api/admin/catch', { method: 'POST', headers: AUTH, body: JSON.stringify({ ...base }) }, env)).status).toBe(400);
    expect((await app.request('/api/admin/catch', { method: 'POST', headers: AUTH, body: JSON.stringify({ ...base, spot_id: 'yok', zero_catch: true }) }, env)).status).toBe(404);
    const old = await app.request('/api/admin/catch', { method: 'POST', headers: AUTH, body: JSON.stringify({ ...base, zero_catch: true }) }, env);
    expect(await old.json()).toMatchObject({ freeze_status: 'partial', missing: 2 });
    expect((await app.request('/api/admin/catch/yok', { method: 'PUT', headers: AUTH, body: '{}' }, env)).status).toBe(404);
    const { sessions } = await (await app.request('/api/admin/catch', { headers: AUTH }, env)).json<{ sessions: { id: string }[] }>();
    expect((await app.request(`/api/admin/catch/${sessions[0]!.id}`, { method: 'PUT', headers: AUTH, body: 'x' }, env)).status).toBe(400);
    expect((await app.request(`/api/admin/catch/${sessions[0]!.id}`, { method: 'PUT', headers: AUTH, body: '{}' }, env)).status).toBe(400);
  });

  it('CSV escapes and writes a zero-catch row', () => {
    const csv = toCsv([{ s: { id: 's', spot_id: 'a', spot_name: 'Ad, "x"', start_at: 't', end_at: 'u', active_min: 60, rods: 1, zero_catch: 1, model_json: null }, items: [] }]);
    expect(csv.split('\n')[1]).toContain('"Ad, ""x"""');
    expect(csv.split('\n')[1]).toContain(',,0,,0,0,,,,,');
  });
});
