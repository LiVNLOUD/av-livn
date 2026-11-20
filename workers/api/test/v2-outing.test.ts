import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { refreshWeather } from '../src/cron';
import { app } from '../src/index';
import { depthCheck } from '../src/lib/depthcheck';
import { fieldRecords, type FieldDepthRow, type FieldObsRow } from '../src/precompute_v2';
import { coarseMethod, validateOuting, validateSession } from '../src/routes/catch';
import { omFetch, resetAndSeed, writeScoresV2 } from './helpers';

const AUTH = { authorization: 'Bearer test-admin-token', 'content-type': 'application/json' };
const NOW = new Date('2026-11-08T23:00:00Z');
const post = (path: string, body: unknown) => app.request(path, { method: 'POST', headers: AUTH, body: JSON.stringify(body) }, env);

beforeAll(async () => {
  await resetAndSeed();
  const now = new Date();
  await refreshWeather(env, now, omFetch(now));
  await writeScoresV2(now);
});

describe('depthCheck (D4, V2.9)', () => {
  const base = { distanceM: null, kind: 'iskele', neighbours: [] as number[], dtmMax100m: null };
  const st = (r: ReturnType<typeof depthCheck>, n: string) => r.checks.find((c) => c.name === n)!.state;
  it('a check that cannot be evaluated is not a pass; the first field depth of a spot always waits for review', () => {
    // Tirilye, 5 m, no neighbours, no distance, DTM 2 m
    const r = depthCheck({ ...base, depthM: 5, dtmMax100m: 2 });
    expect(st(r, 'olabilirlik')).toBe('gecti');
    expect(st(r, 'kiyi_uzakligi')).toBe('degerlendirilmedi');
    expect(st(r, 'komsu_kayitlar')).toBe('degerlendirilmedi');
    expect(st(r, 'diger_kaynaklar')).toBe('gecti');
    expect(r.ok).toBe(false);
    expect(depthCheck({ ...base, depthM: 5 }).checks.every((c) => c.name === 'olabilirlik' || c.state === 'degerlendirilmedi')).toBe(true);
  });
  it('auto-approval: range passed + neighbours evaluated and agreeing + distance or DTM evaluated and passed', () => {
    expect(depthCheck({ ...base, depthM: 5, neighbours: [5.2, 4.8], dtmMax100m: 2 }).ok).toBe(true);
    expect(depthCheck({ ...base, depthM: 5, neighbours: [5.2, 4.8], distanceM: 10 }).ok).toBe(true);
    // neighbours agree but nothing geometric was evaluated
    expect(depthCheck({ ...base, depthM: 5, neighbours: [5.2] }).ok).toBe(false);
    // neighbours disagree
    expect(depthCheck({ ...base, depthM: 12, neighbours: [4, 5], dtmMax100m: 6 }).ok).toBe(false);
    expect(st(depthCheck({ ...base, depthM: 60 }), 'olabilirlik')).toBe('kaldi');
    expect(st(depthCheck({ ...base, depthM: 12, distanceM: 5, kind: 'kumsal' }), 'kiyi_uzakligi')).toBe('kaldi');
    expect(st(depthCheck({ ...base, depthM: 25, dtmMax100m: 1.5 }), 'diger_kaynaklar')).toBe('kaldi');
  });
  it('uncertainty and method note', () => {
    const r = depthCheck({ ...base, depthM: 5 });
    expect(r.uncertaintyM).toBe(0.8);
    expect(r.methodNote).toMatch(/misina açısı ve akıntı belirsiz/);
    expect(depthCheck({ ...base, depthM: 1 }).uncertaintyM).toBe(0.5);
  });
});

describe('Dip: __ m endpoint and review queue', () => {
  it('the first entry waits in the queue; after its approval an agreeing second entry is approved and rescored', async () => {
    const first = await post('/api/admin/spots/osm-way-1/depth', { depth_m: 5 });
    expect(first.status).toBe(201);
    const f = await first.json<{ status: string; obs_id: string }>();
    expect(f.status).toBe('onaysiz');
    expect((await app.request(`/api/admin/field/${f.obs_id}`, { method: 'PATCH', headers: AUTH, body: JSON.stringify({ status: 'onayli' }) }, env)).status).toBe(200);
    const ok = await post('/api/admin/spots/osm-way-1/depth', { depth_m: 5.3, distance_m: 15 });
    const a = await ok.json<{ status: string }>();
    expect(a.status).toBe('onayli');
    const bad = await post('/api/admin/spots/osm-way-1/depth', { depth_m: 35, distance_m: 4 });
    const b = await bad.json<{ status: string; obs_id: string; rescore: string }>();
    expect(b.status).toBe('onaysiz');
    expect(b.rescore).toBe('waiting_review');
    const q = await (await app.request('/api/admin/depth-queue', { headers: AUTH }, env)).json<{ items: { obs_id: string; depth_m: number; check: { name: string; state: string }[]; method_note: string }[] }>();
    const it = q.items.find((x) => x.obs_id === b.obs_id)!;
    expect(it.depth_m).toBe(35);
    expect(it.check.some((c) => c.state === 'kaldi')).toBe(true);
    expect(it.method_note).toMatch(/kurşun/);
    expect((await post('/api/admin/spots/osm-way-1/depth', { depth_m: -1 })).status).toBe(400);
    expect((await post('/api/admin/spots/yok/depth', { depth_m: 3 })).status).toBe(404);
  });
  it('fieldRecords ignores an unreviewed field depth, keeps an approved one', () => {
    const o = (id: string, status: FieldObsRow['status']): FieldObsRow => ({ id, spot_id: 's', observed_at: '2026-11-08T20:00:00Z', substrate: null, snag: null, structure: null, has_light: null, light_color: null, access: null, note: null, source_kind: 'saha', status } as FieldObsRow);
    const d = (obs_id: string, depth_m: number): FieldDepthRow => ({ obs_id, distance_m: 0, method: 'plumb', depth_m, sink_s: null, jig_g: null } as FieldDepthRow);
    const only = fieldRecords([o('a', 'onaysiz')], [d('a', 30)]).get('s');
    expect(only?.depths ?? []).toHaveLength(0);
    const both = fieldRecords([o('a', 'onaysiz'), o('b', 'onayli')], [d('a', 30), d('b', 5)]).get('s')!;
    expect(both.depths.map((x) => x.depth_m)).toEqual([5]);
  });
});

describe('outings with method sections (D5)', () => {
  const sec = (start: string, end: string, extra: Record<string, unknown>) => ({ start_at: start, end_at: end, target_species: 'istavrit', ...extra });
  const body = {
    spot_id: 'osm-way-1', start_at: '2026-11-08T17:00:00Z', end_at: '2026-11-08T21:00:00Z', people: 2, retro: true,
    sections: [
      sec('2026-11-08T17:00:00Z', '2026-11-08T18:00:00Z', { tackle_method: 'lrf', bites: 0, zero_catch: true, retro: true }),
      sec('2026-11-08T18:00:00Z', '2026-11-08T21:00:00Z', { tackle_method: 'dropshot_yem', bait: 'hamsi', bites: 40, retro: true,
        items: [{ species: 'istavrit', count: 60, length_cm: 11.5, weight_kg: 4.6 }, { species: 'izmarit', count: 12, weight_kg: 1.4 }] }),
    ],
  };
  it('validation: sections inherit the spot, zero is explicit, bites and bait are kept; warnings per section and per person', () => {
    const v = validateOuting(body, NOW);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.value.sections.map((s) => [s.section_no, s.tackle_method, s.method, s.bites])).toEqual([[1, 'lrf', 'lrf', 0], [2, 'dropshot_yem', 'diger', 40]]);
    expect(v.warnings.some((w) => /^Bölüm 2: 11,5 cm istavrit/.test(w))).toBe(true);
    // 6 kg for two people = 3 kg each: under the limit, no bag warning
    expect(v.warnings.some((w) => /Günlük sınır/.test(w))).toBe(false);
    const solo = validateOuting({ ...body, people: 1 }, NOW);
    expect(solo.ok && solo.warnings.some((w) => /Günlük sınır aşıldı/.test(w))).toBe(true);
    expect(validateOuting({ ...body, sections: [sec('2026-11-08T22:00:00Z', '2026-11-08T22:30:00Z', { zero_catch: true })] }, NOW)).toEqual({ ok: false, error: 'section_1_outside_outing' });
    expect(validateOuting({ ...body, people: 0 }, NOW)).toEqual({ ok: false, error: 'invalid_people' });
    expect(validateOuting({ ...body, sections: [] }, NOW)).toEqual({ ok: false, error: 'invalid_sections' });
    expect(validateSession({ ...body.sections[0], spot_id: 'x', tackle_method: 'tel' }, NOW)).toEqual({ ok: false, error: 'invalid_tackle_method' });
    expect(validateSession({ ...body.sections[0], spot_id: 'x', bites: -2 }, NOW)).toEqual({ ok: false, error: 'invalid_bites' });
    expect(validateSession({ ...body.sections[0], spot_id: 'x', bait: 'solucan' }, NOW)).toEqual({ ok: false, error: 'invalid_bait' });
    expect(coarseMethod('capari_yemli')).toBe('capari');
    expect(coarseMethod('mikro_jig')).toBe('spin');
  });
  it('create, list, split (edit) and delete through the admin API', async () => {
    const r = await post('/api/admin/catch/outing', body);
    expect(r.status).toBe(201);
    const c = await r.json<{ id: string; sections: { id: string }[] }>();
    expect(c.sections).toHaveLength(2);
    const list = await (await app.request('/api/admin/catch/outing', { headers: AUTH }, env)).json<{ outings: { id: string; people: number; sections: { section_no: number; bites: number; items: { species: string; weight_kg: number | null }[] }[] }[] }>();
    const o = list.outings.find((x) => x.id === c.id)!;
    expect(o.people).toBe(2);
    expect(o.sections.map((s) => s.bites)).toEqual([0, 40]);
    expect(o.sections[1]!.items.find((i) => i.species === 'izmarit')!.weight_kg).toBe(1.4);
    // edit: keep section 1 by id, split section 2 into two
    const put = await app.request(`/api/admin/catch/outing/${c.id}`, { method: 'PUT', headers: AUTH, body: JSON.stringify({ ...body, sections: [
      { ...body.sections[0], id: c.sections[0]!.id },
      sec('2026-11-08T18:00:00Z', '2026-11-08T19:30:00Z', { tackle_method: 'dropshot_yem', bait: 'hamsi', bites: 25, retro: true, items: [{ count: 35 }] }),
      sec('2026-11-08T19:30:00Z', '2026-11-08T21:00:00Z', { tackle_method: 'dropshot_yem', bait: 'karides', bites: 15, retro: true, items: [{ count: 25 }] }),
    ] }) }, env);
    expect(put.status).toBe(200);
    const after = await (await app.request('/api/admin/catch/outing', { headers: AUTH }, env)).json<{ outings: { id: string; sections: { id: string; section_no: number }[] }[] }>();
    const secs = after.outings.find((x) => x.id === c.id)!.sections;
    expect(secs.map((s) => s.section_no)).toEqual([1, 2, 3]);
    expect(secs[0]!.id).toBe(c.sections[0]!.id);
    expect(secs.some((s) => s.id === c.sections[1]!.id)).toBe(false);
    expect((await app.request(`/api/admin/catch/outing/${c.id}`, { method: 'DELETE', headers: AUTH }, env)).status).toBe(200);
    const gone = await env.DB.prepare('SELECT count(*) AS n FROM catch_session WHERE outing_id = ?1').bind(c.id).first<{ n: number }>();
    expect(gone!.n).toBe(0);
    expect((await app.request('/api/admin/catch/outing/yok', { method: 'PUT', headers: AUTH, body: JSON.stringify(body) }, env)).status).toBe(404);
  });
});
