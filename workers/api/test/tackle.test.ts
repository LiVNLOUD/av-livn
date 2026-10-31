import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_PROFILES } from '@av-livn/scoring';
import { app } from '../src/index';
import { parseProfiles, validateProfiles } from '../src/lib/tackle';
import { FETCHED_SQL, fetchedAt, HOURS_SQL, LIST_SQL, preBodies, WINDOWS_SQL, type HoursRow, type ListRow, type WindowsRow } from '../src/lib/views';
import { omFetch, resetAndSeed, writeScoresV2 } from './helpers';
import { refreshWeather } from '../src/cron';

const auth = { authorization: 'Bearer test-admin-token', 'content-type': 'application/json' };

describe('tackle profiles (F0)', () => {
  beforeAll(async () => {
    await resetAndSeed();
    const now = new Date();
    await refreshWeather(env, now, omFetch(now));
    await writeScoresV2(now);
  });
  it('validation and parsing', () => {
    expect(validateProfiles({})).toEqual({ ok: false, error: 'two_profiles_required' });
    expect(validateProfiles([DEFAULT_PROFILES[0], DEFAULT_PROFILES[0]])).toEqual({ ok: false, error: 'missing_spin' });
    expect(validateProfiles([{ ...DEFAULT_PROFILES[0], name: 'x' }, DEFAULT_PROFILES[1]])).toMatchObject({ ok: false, error: 'invalid_lrf_name' });
    expect(validateProfiles([{ ...DEFAULT_PROFILES[0], jigMin: 5, jigMax: 1 }, DEFAULT_PROFILES[1]])).toMatchObject({ error: 'invalid_lrf_jig' });
    expect(validateProfiles([DEFAULT_PROFILES[0], { ...DEFAULT_PROFILES[1], maxGustKmh: 500 }])).toMatchObject({ error: 'invalid_spin_gust' });
    expect(validateProfiles([DEFAULT_PROFILES[0], { ...DEFAULT_PROFILES[1], line: 3 }])).toMatchObject({ error: 'invalid_spin_line' });
    expect(parseProfiles(null)).toEqual(DEFAULT_PROFILES);
    expect(parseProfiles('{bad')).toEqual(DEFAULT_PROFILES);
    expect(parseProfiles('[]')).toEqual(DEFAULT_PROFILES);
  });
  it('owner edits, everyone reads; packed detail carries open-data tackle inputs', async () => {
    expect((await (await app.request('/api/tackle', {}, env)).json<{ profiles: unknown[] }>()).profiles).toEqual(DEFAULT_PROFILES);
    expect((await app.request('/api/admin/tackle', { method: 'PUT', body: '[]' }, env)).status).toBe(401);
    expect((await app.request('/api/admin/tackle', { method: 'PUT', headers: auth, body: '[]' }, env)).status).toBe(400);
    const edited = [{ ...DEFAULT_PROFILES[0]!, jigMax: 2.5 }, DEFAULT_PROFILES[1]!];
    expect((await app.request('/api/admin/tackle', { method: 'PUT', headers: auth, body: JSON.stringify(edited) }, env)).status).toBe(200);
    expect((await (await app.request('/api/tackle', {}, env)).json<{ profiles: { jigMax: number }[] }>()).profiles[0]!.jigMax).toBe(2.5);
    const d = await (await app.request('/api/spots/osm-way-1', {}, env)).json<{ packed: { h: unknown[]; tk: (number | null)[][] } }>();
    expect(d.packed.tk).toHaveLength(d.packed.h.length);
    expect(d.packed.tk[0]).toHaveLength(9);
    expect(typeof d.packed.tk[0]![0]).toBe('number');
  });
  it('calibration status (F4): count, next threshold, last report', async () => {
    expect((await app.request('/api/admin/calibration', {}, env)).status).toBe(401);
    const a = await (await app.request('/api/admin/calibration', { headers: auth }, env)).json<{ sessions: number; next_threshold: number; report: unknown }>();
    expect(a).toMatchObject({ sessions: 0, next_threshold: 30, report: null });
    await env.DB.prepare("INSERT INTO meta (key, value) VALUES ('calibration_report', ?1) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind('{"status":"yetersiz veri","n":0}').run();
    expect((await (await app.request('/api/admin/calibration', { headers: auth }, env)).json<{ report: { status: string } }>()).report.status).toBe('yetersiz veri');
    await env.DB.prepare("UPDATE meta SET value = '{bad' WHERE key = 'calibration_report'").run();
    expect((await (await app.request('/api/admin/calibration', { headers: auth }, env)).json<{ report: unknown }>()).report).toBeNull();
  });
  it('precomputed public bodies (F CPU): same as live, served raw, cleared by owner changes', async () => {
    const h = Math.floor(Date.now() / 3_600_000);
    const live = await Promise.all(['/api/spots', '/api/hours', '/api/windows'].map(async (u) => (await app.request(u, {}, env)).json()));
    const [list, hrs, win, fet] = await Promise.all([LIST_SQL, HOURS_SQL, WINDOWS_SQL, FETCHED_SQL].map(async (q) => (await env.DB.prepare(q).all()).results));
    const bodies = preBodies(list as ListRow[], hrs as HoursRow[], win as WindowsRow[], fetchedAt(fet!), [h]);
    expect(bodies.map(([k]) => k)).toEqual([`pub:list:${h}`, `pub:hours:${h}`, `pub:windows:${h}`]);
    bodies.forEach(([, v], i) => expect(JSON.parse(v)).toEqual(live[i]));
    for (const [k, v] of bodies) await env.DB.prepare('INSERT INTO meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(k, v).run();
    for (const u of ['/api/spots', '/api/hours', '/api/windows']) {
      const r = await app.request(u, {}, env);
      expect(r.headers.get('x-av-pre')).toBe('1');
      expect(r.headers.get('content-type')).toContain('application/json');
    }
    // other hours / lengths are built live
    expect((await app.request(`/api/spots?at=${new Date((h + 5) * 3_600_000).toISOString()}`, {}, env)).headers.get('x-av-pre')).toBeNull();
    expect((await app.request('/api/windows?hours=24', {}, env)).headers.get('x-av-pre')).toBeNull();
    // a failed admin change keeps them, a successful one drops them
    await app.request('/api/admin/spots/osm-way-1', { method: 'PATCH', headers: auth, body: JSON.stringify({ name: 'x' }) }, env);
    expect((await app.request('/api/hours', {}, env)).headers.get('x-av-pre')).toBe('1');
    expect((await app.request('/api/admin/spots/osm-way-1', { method: 'PATCH', headers: auth, body: JSON.stringify({ notes: 'n' }) }, env)).status).toBe(200);
    expect((await app.request('/api/hours', {}, env)).headers.get('x-av-pre')).toBeNull();
    expect(await env.DB.prepare("SELECT COUNT(*) AS n FROM meta WHERE key LIKE 'pub:%'").first('n')).toBe(0);
  });
});
