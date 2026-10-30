// Read-only endpoints: scores are precomputed by cron (see precompute.ts); handlers only slice stored JSON.
import { getProfile, type SpeciesProfile } from '@av-livn/scoring';
import { Hono } from 'hono';
import type { Env } from '../env';
import { cachedJson } from '../lib/cache';
import { publicSpot, publicSpotDetail, type SpotRow } from '../lib/spots';

export const publicRoutes = new Hono<{ Bindings: Env }>();

const HOUR = 3_600_000;

function profileFor(id: string | undefined): SpeciesProfile | { error: string } {
  const p = getProfile(id ?? 'istavrit');
  if (!p) return { error: 'unknown_species' };
  if (Object.keys(p.weights).length === 0) return { error: 'species_not_ready' };
  return p;
}

type ListEntry = [number | null, 0 | 1, string | null, number];

publicRoutes.get('/spots', (c) =>
  cachedJson(c, 600, async () => {
    const profile = profileFor(c.req.query('species'));
    if ('error' in profile) return c.json({ ok: false, error: profile.error }, 400);
    const [rows, fetched] = await c.env.DB.batch([
      c.env.DB.prepare(
        `SELECT s.*, sc.start_hour, sc.list_json, sc.computed_at FROM spots s
         LEFT JOIN spot_scores sc ON sc.spot_id = s.id AND sc.species = ?1
         WHERE s.status != 'rejected'`,
      ).bind(profile.id),
      c.env.DB.prepare('SELECT max(fetched_at) AS at FROM forecast_snapshots'),
    ]);
    const nowHour = Math.floor(Date.now() / HOUR);
    const spots = (rows!.results as (SpotRow & { start_hour: number | null; list_json: string | null })[]).map((r) => {
      const entry = r.list_json && r.start_hour !== null ? (JSON.parse(r.list_json) as ListEntry[])[nowHour - r.start_hour] : undefined;
      return {
        ...publicSpot(r),
        score: entry
          ? { total: entry[0], gated: entry[1] === 1, warnings: entry[2] ? [entry[2]] : [], missing_count: entry[3] }
          : { total: null, gated: false, warnings: [], missing_count: 0 },
      };
    });
    spots.sort((a, b) => (b.score.total ?? -1) - (a.score.total ?? -1) || a.name.localeCompare(b.name, 'tr'));
    const at = (fetched!.results[0] as { at: string | null } | undefined)?.at ?? null;
    return c.json({ ok: true, species: { id: profile.id, name: profile.name }, at: new Date(nowHour * HOUR).toISOString(), data_fetched_at: at, spots });
  }),
);

publicRoutes.get('/spots/:id', (c) =>
  cachedJson(c, 600, async () => {
    const profile = profileFor(c.req.query('species'));
    if ('error' in profile) return c.json({ ok: false, error: profile.error }, 400);
    const hours = Math.min(Math.max(Number(c.req.query('hours') ?? 72) || 72, 1), 72);
    const r = await c.env.DB.prepare(
      `SELECT s.*, sc.start_hour, sc.detail_json FROM spots s
       LEFT JOIN spot_scores sc ON sc.spot_id = s.id AND sc.species = ?2
       WHERE s.id = ?1`,
    )
      .bind(c.req.param('id'), profile.id)
      .first<SpotRow & { start_hour: number | null; detail_json: string | null }>();
    if (!r) return c.json({ ok: false, error: 'not_found' }, 404);
    const from = r.start_hour === null ? 0 : Math.max(0, Math.floor(Date.now() / HOUR) - r.start_hour);
    // The stored packed detail is spliced in as a raw string: no parse/serialise of ~45 KB per request.
    // Clients call unpackDetail(packed, from, hours).
    const head = JSON.stringify({ ok: true, species: { id: profile.id, name: profile.name, weights: profile.weights }, spot: publicSpotDetail(r), from, hours });
    return c.body(`${head.slice(0, -1)},"packed":${r.detail_json ?? 'null'}}`, 200, { 'content-type': 'application/json; charset=utf-8' });
  }),
);
