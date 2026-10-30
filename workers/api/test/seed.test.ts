import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { assignCells, cellKey, seedSql } from '../src/lib/seed';
import { resetAndSeed, runSql, SPOTS } from './helpers';

describe('seed', () => {
  beforeEach(() => resetAndSeed());

  it('buckets spots into weather and sea cells', () => {
    expect(cellKey('wx', 40.376, 28.883)).toBe('wx:808:578');
    const { cells, bySpot } = assignCells(SPOTS);
    expect(bySpot.get('osm-way-3')!.sea).toBeNull();
    expect(cells.filter((c) => c.kind === 'wx')).toHaveLength(3);
    expect(cells.filter((c) => c.kind === 'sea')).toHaveLength(2);
    const sea = cells.find((c) => c.id === bySpot.get('osm-way-1')!.sea)!;
    expect([sea.lat, sea.lon]).toEqual([40.383, 28.883]);
  });

  it('escapes quotes and rejects non-finite numbers', () => {
    expect(seedSql({ features: SPOTS }, 'now')).toContain("'Kumla''nın Mendireği'");
    const bad = structuredClone(SPOTS[0]!);
    bad.properties.shore_normal_deg = Number.NaN;
    expect(() => seedSql({ features: [bad] }, 'now')).toThrow(/non-finite/);
  });

  it('is idempotent and preserves admin-edited field data', async () => {
    await env.DB.prepare("UPDATE spots SET name = 'Saha adı', has_light = 1, status = 'verified', notes = 'lamba var', admin_edited_at = 'x' WHERE id = 'osm-way-1'").run();
    const moved = structuredClone(SPOTS);
    moved[0]!.geometry.coordinates = [28.884, 40.377];
    moved[0]!.properties.name = 'OSM yeni adı';
    await runSql(seedSql({ features: moved }, '2026-11-01T00:00:00Z'));
    const r = await env.DB.prepare("SELECT * FROM spots WHERE id = 'osm-way-1'").first<Record<string, unknown>>();
    expect(r).toMatchObject({ name: 'Saha adı', has_light: 1, status: 'verified', notes: 'lamba var', lat: 40.377 });
    const r2 = await env.DB.prepare("SELECT name FROM spots WHERE id = 'osm-way-2'").first();
    expect(r2).toEqual({ name: "Kumla'nın Mendireği" });
  });

  it('removes vanished OSM spots and orphan cells but keeps admin-edited ones', async () => {
    await env.DB.prepare("UPDATE spots SET admin_edited_at = 'x' WHERE id = 'osm-way-2'").run();
    await runSql(seedSql({ features: [SPOTS[0]!] }, 'now'));
    const ids = (await env.DB.prepare('SELECT id FROM spots ORDER BY id').all()).results.map((r) => r.id);
    expect(ids).toEqual(['osm-way-1', 'osm-way-2']);
    const cells = (await env.DB.prepare('SELECT count(*) AS n FROM cells').first<{ n: number }>())!.n;
    expect(cells).toBe(4);
    await runSql(seedSql({ features: [] }, 'now'));
    expect((await env.DB.prepare('SELECT id FROM spots').all()).results).toEqual([{ id: 'osm-way-2' }]);
  });
});
