import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { refreshWeather } from '../src/cron';
import { app } from '../src/index';
import { fieldRecords, packV2, rescoreSpot, spotV2, type ListEntryV2, type PackedV2 } from '../src/precompute_v2';
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
  it('reuses the previous band offsets and re-ranks against stored totals', async () => {
    const rows = (await env.DB.prepare('SELECT * FROM spots ORDER BY id').all()).results as unknown as SpotRow[];
    const stored = (await env.DB.prepare('SELECT spot_id, start_hour, list_json FROM spot_scores_v2 ORDER BY spot_id').all<{ spot_id: string; start_hour: number; list_json: string }>()).results;
    const parse = (r: { start_hour: number; list_json: string }) => ({ start_hour: r.start_hour, list: JSON.parse(r.list_json) as ListEntryV2[] });
    const { loadSnapshots } = await import('../src/lib/spots');
    const row = rows[0]!;
    const snaps = await loadSnapshots(env.DB, [row.wx_cell, row.sea_cell!]);
    const now = new Date();
    const rec = rescoreSpot(row, snaps.get(row.wx_cell), snaps.get(row.sea_cell!), now, undefined, parse(stored[0]!), stored.slice(1).map(parse));
    const list = JSON.parse(rec.list_json) as ListEntryV2[];
    const old = parse(stored[0]!).list[0]!;
    expect(list[0]![0]).toBe(old[0]);
    expect(list[0]![2]! - list[0]![1]!).toBeCloseTo(old[2]! - old[1]!, 6);
    expect(list[0]![3]).toBeGreaterThanOrEqual(1);
    const fresh = rescoreSpot(row, snaps.get(row.wx_cell), undefined, now, undefined, null, []);
    expect((JSON.parse(fresh.list_json) as ListEntryV2[])[0]!.slice(1, 4)).toEqual([null, null, 1]);
    const empty = rescoreSpot(row, undefined, undefined, now, undefined, parse(stored[0]!), []);
    expect((JSON.parse(empty.list_json) as ListEntryV2[])[0]!.slice(0, 3)).toEqual([null, null, null]);
  });

  it('packV2 keeps component metadata once', () => {
    const p = packV2(
      [{ ts: 't', total: 1, raw: 0.1, p10: null, p90: null, gated: true, warnings: ['w'], lampP: null, wNight: 1, components: [{ key: 'k', label: 'K', group: 'statik', weight: null, value: null, source: 'saha', evidence: 'C', reason: 'r' }] }],
      { computed_at: 'c', weather_fetched_at: null, sea_fetched_at: null, sea_grid: null, field_at: null, depth_field_at: null, sink_calibration: null },
    );
    expect(p.meta.comps).toEqual([['k', 'K', 'statik', null, 'saha', 'C']]);
    expect(p.h[0]).toEqual(['t', 1, 0.1, null, null, 1, ['w'], 1, null, [null], ['r']]);
  });
});
