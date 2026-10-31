import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { refreshWeather } from '../src/cron';
import { app } from '../src/index';
import { applyOcean, computeSpotV2, fieldRecords, oceanMap, packV2, rescoreSpot, spotV2, type ListEntryV2, type Ocean, type PackedV2 } from '../src/precompute_v2';
import type { SpotRow } from '../src/lib/spots';
import { omFetch, resetAndSeed, writeScoresV2 } from './helpers';

type ListBody = { model: string; count: number; spots: { id: string; access: string | null; score: { total: number | null; p10: number | null; p90: number | null; rank: number | null; partial: boolean } }[] };
type DetailBody = { spot: Record<string, unknown>; field: Record<string, any> | null; spot_count: number; partial: boolean; from: number; hours: number; ranks: number[]; packed: PackedV2 | null };

beforeAll(async () => {
  await resetAndSeed();
  const now = new Date();
  await refreshWeather(env, now, omFetch(now));
  expect(await writeScoresV2(now)).toBe(3);
});

describe('GET /api/spots?model=v2', () => {
  it('lists expected score, band and rank at the current hour', async () => {
    const body = await (await app.request('/api/spots?model=v2', {}, env)).json<ListBody>();
    expect(body.model).toBe('v2.0');
    expect(body.count).toBe(3);
    const s = body.spots;
    expect(s.map((x) => x.score.rank)).toEqual([...s.map((x) => x.score.rank)].sort((a, b) => a! - b!));
    for (const x of s) {
      expect(x.score.total).not.toBeNull();
      expect(x.score.p10!).toBeLessThanOrEqual(x.score.total!);
      expect(x.score.p90!).toBeGreaterThanOrEqual(x.score.total!);
      expect(x.score.partial).toBe(false);
    }
  });

  it('"N mera içinde" has one source: list count = detail spot_count = active spots (rejected excluded)', async () => {
    await env.DB.prepare("UPDATE spots SET status = 'rejected' WHERE id = 'osm-way-3'").run();
    const list = await (await app.request('/api/spots?model=v2&c=1', {}, env)).json<ListBody>();
    const det = await (await app.request('/api/spots/osm-way-1?model=v2&c=1', {}, env)).json<DetailBody>();
    const n = await env.DB.prepare("SELECT count(*) AS n FROM spots WHERE status != 'rejected'").first<{ n: number }>();
    expect([list.count, det.spot_count]).toEqual([n!.n, n!.n]);
    expect(list.count).toBe(2);
    await env.DB.prepare("UPDATE spots SET status = 'candidate' WHERE id = 'osm-way-3'").run();
  });

  it('null score for spots without a v2 row', async () => {
    await env.DB.prepare("DELETE FROM spot_scores_v2 WHERE spot_id = 'osm-way-3'").run();
    const body = await (await app.request('/api/spots?model=v2&x=1', {}, env)).json<ListBody>();
    expect(body.spots.find((x) => x.id === 'osm-way-3')!.score).toMatchObject({ total: null, rank: null });
    await writeScoresV2(new Date());
  });
});

describe('GET /api/spots/:id?model=v2', () => {
  it('returns packed v2 hours with sources, evidence and ranks', async () => {
    const res = await app.request('/api/spots/osm-way-1?model=v2&hours=6', {}, env);
    expect(res.headers.get('cache-control')).toBe('no-cache');
    const b = await res.json<DetailBody>();
    expect(b.packed!.v).toBe(2);
    expect(b.packed!.meta.comps.map((c) => c[0])).toContain('derinlik');
    expect(b.packed!.meta.comps.find((c) => c[0] === 'taban')![4]).toBe('EUSeaMap');
    expect(b.ranks).toHaveLength(6);
    expect(b.spot_count).toBe(3);
    expect(b.field).toBeNull();
    expect((await app.request('/api/spots/nope?model=v2', {}, env)).status).toBe(404);
  });
});

describe('field records and v2 inputs', () => {
  it('merges the latest non-null values and converts depths', () => {
    const obs = [
      { id: 'a', spot_id: 's', observed_at: '2026-11-01T10:00Z', substrate: '["kaya"]', snag: 'midye', structure: 'iskele', has_light: 1, light_color: 'beyaz', access: null, note: 'x' },
      { id: 'b', spot_id: 's', observed_at: '2026-11-02T10:00Z', substrate: null, snag: null, structure: 'mendirek', has_light: null, light_color: null, access: null, note: null },
    ];
    const depths = [
      { obs_id: 'a', distance_m: 20, method: 'plumb' as const, depth_m: 4, sink_s: null, jig_g: null },
      { obs_id: 'b', distance_m: 25, method: 'sink' as const, depth_m: null, sink_s: 10, jig_g: 2 },
    ];
    const rec = fieldRecords(obs, depths).get('s')!;
    expect(rec.substrate).toEqual(['kaya']);
    expect(rec.structure).toBe('mendirek');
    expect(rec.snag).toBe('midye');
    expect(rec.calibration!.pairs).toBe(1);
    expect(rec.depths.map((d) => d.quality)).toEqual(['plumb', 'sink_cal']);
    expect(rec.lastDepthAt).toBe('2026-11-02T10:00Z');
    const none = fieldRecords([{ ...obs[1]!, id: 'c', spot_id: 't' }], []).get('t')!;
    expect([none.substrate, none.depths.length, none.lastDepthAt]).toEqual([null, 0, null]);
  });

  it('maps a spot row to model input (kind, ferry access, bands, lamp)', async () => {
    const row = (await env.DB.prepare("SELECT * FROM spots WHERE id = 'osm-way-1'").first()) as unknown as SpotRow;
    const s = spotV2({ ...row, access: 'kisitli_feribot', has_light: 1 });
    expect(s.ferry).toBe(true);
    expect(s.lamp).toBe(true);
    expect(s.dtm.d0_50).toBeCloseTo((1 + 2.5 + 4) / 3, 6);
    expect(s.fetchKm).toHaveLength(16);
    const m = spotV2({ ...row, kind: 'manual', profile_json: null, fetch_json: null, has_light: 0 });
    expect([m.kind, m.dtm.d0_50, m.fetchKm, m.lamp]).toEqual(['manual', null, null, false]);
  });
});

describe('single-spot rescore', () => {
  it('point score only: band cleared, rank against stored totals, previous reason kept', async () => {
    const rows = (await env.DB.prepare('SELECT * FROM spots ORDER BY id').all()).results as unknown as SpotRow[];
    const stored = (await env.DB.prepare('SELECT spot_id, start_hour, list_json FROM spot_scores_v2 ORDER BY spot_id').all<{ spot_id: string; start_hour: number; list_json: string }>()).results;
    const parse = (r: { start_hour: number; list_json: string }) => ({ start_hour: r.start_hour, list: JSON.parse(r.list_json) as ListEntryV2[] });
    const { loadSnapshots } = await import('../src/lib/spots');
    const row = rows[0]!;
    const snaps = await loadSnapshots(env.DB, [row.wx_cell, row.sea_cell!]);
    const now = new Date();
    const prev = parse(stored[0]!);
    const rec = rescoreSpot(row, snaps.get(row.wx_cell), snaps.get(row.sea_cell!), now, undefined, prev, stored.slice(1).map(parse));
    const list = JSON.parse(rec.list_json) as ListEntryV2[];
    expect(list[0]![0]).toBe(prev.list[0]![0]);
    expect([list[0]![1], list[0]![2]]).toEqual([null, null]);
    expect(list[0]![3]).toBeGreaterThanOrEqual(1);
    expect(list[0]![6]).toEqual(prev.list[0]![6]);
    const fresh = rescoreSpot(row, snaps.get(row.wx_cell), undefined, now, undefined, null, []);
    expect((JSON.parse(fresh.list_json) as ListEntryV2[])[0]!.slice(1, 4)).toEqual([null, null, 1]);
  });

  it('packV2 keeps component metadata once', () => {
    const p = packV2(
      [{ ts: 't', total: 1, raw: 0.1, p10: null, p90: null, gated: true, warnings: ['w'], lampP: null, wNight: 1, components: [{ key: 'k', label: 'K', group: 'statik', weight: null, value: null, source: 'saha', evidence: 'C', reason: 'r' }] }],
      { computed_at: 'c', weather_fetched_at: null, sea_fetched_at: null, sea_grid: null, field_at: null, depth_field_at: null, sink_calibration: null, ocean: null, ocean_normal: null },
    );
    expect(p.meta.comps).toEqual([['k', 'K', 'statik', null, 'saha', 'C']]);
    expect(p.h[0]).toEqual(['t', 1, 0.1, null, null, 1, ['w'], 1, null, [null], ['saha bilgisi (yalnız yönetici görür)']]);
  });
});

describe('Copernicus overlay', () => {
  it('replaces water temperature/current, marks the source and adds the short normal', () => {
    const pts = [
      { ts: '2026-11-01T00:00:00.000Z', sst: 18, curVel: 0.05, windSpeed: 5 },
      { ts: '2026-11-01T01:00:00.000Z', sst: 18 },
    ];
    const normal = Array.from({ length: 366 }, (_, i) => (i === 304 ? 17.5 : null));
    const ocean = oceanMap(
      [{ spot_id: 's', fetched_at: 'f', json: JSON.stringify({ t0: '2026-11-01T00:00Z', cell: { lat: 1, lon: 2, distance_km: 0.3 }, sst: [16.5, null, 16.4], cur: [0.2, 0.1, null] }) }],
      [{ spot_id: 's', computed_at: 'c', json: JSON.stringify({ from: '2021-11-01', to: '2026-10-31', years: 6, cell: { lat: 1, lon: 2, distance_km: 0.3 }, normal }) }],
    ).get('s');
    const out = applyOcean(pts, ocean);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ sst: 16.5, sstSource: 'copernicus', curVel: 0.2, windSpeed: 5, sstNormal: 17.5 });
    expect(out[1]).toMatchObject({ sst: 18 });
    expect(out[1]!.sstSource).toBeUndefined();
    expect(out[2]).toMatchObject({ sst: 16.4, sstSource: 'copernicus' });
    expect(out[2]!.curVel).toBeUndefined();
    expect(applyOcean(pts, undefined)).toBe(pts);
    const onlyNormal = applyOcean(pts, { normal: ocean!.normal });
    expect(onlyNormal[0]!.sst).toBe(18);
    const noCur = applyOcean([], { series: { fetched_at: 'f', data: { ...ocean!.series!.data, cur: null } } });
    expect(noCur[0]!.curVel).toBeUndefined();
  });

  it('flows into sources, the deviation term and the packed meta', async () => {
    const row = (await env.DB.prepare("SELECT * FROM spots WHERE id = 'osm-way-1'").first()) as unknown as SpotRow;
    const { loadSnapshots } = await import('../src/lib/spots');
    const snaps = await loadSnapshots(env.DB, [row.wx_cell, row.sea_cell!]);
    const now = new Date();
    const t0 = new Date(Math.floor(now.getTime() / 3_600_000) * 3_600_000 - 72 * 3_600_000);
    const sst = Array.from({ length: 160 }, () => 15);
    const ocean: Ocean = {
      series: { fetched_at: 'f', data: { t0: t0.toISOString().slice(0, 13) + ':00Z', cell: { lat: 40.38, lon: 28.88, distance_km: 0.4 }, sst, cur: null } },
      normal: { computed_at: 'c', data: { from: '2021-11-01', to: '2026-10-31', years: 5, cell: { lat: 40.38, lon: 28.88, distance_km: 0.4 }, normal: Array.from({ length: 366 }, () => 17) } },
    };
    const r = computeSpotV2(row, snaps.get(row.wx_cell), snaps.get(row.sea_cell!), now, undefined, 0, ocean);
    expect(r.packed.meta.ocean).toEqual({ fetched_at: 'f', cell: { lat: 40.38, lon: 28.88, distance_km: 0.4 } });
    expect(r.packed.meta.ocean_normal).toEqual({ years: 5, from: '2021-11-01', to: '2026-10-31' });
    const c = Object.fromEntries(r.hours[0]!.components.map((x) => [x.key, x]));
    expect(c.su_degisim!.source).toBe('Copernicus');
    expect(c.su_sapma!.reason).toBe('−2.0 °C (5 yıllık kısa normal)');
  });
});
