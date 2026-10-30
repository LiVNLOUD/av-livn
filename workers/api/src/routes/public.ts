import { getProfile, scoreAt, scoreSeries, type SpeciesProfile } from '@av-livn/scoring';
import { Hono } from 'hono';
import type { Env } from '../env';
import { mergeSnapshots } from '../lib/series';
import { haversineKm, loadSnapshots, publicSpot, toSpotInput, type SpotRow } from '../lib/spots';

export const publicRoutes = new Hono<{ Bindings: Env }>();

function profileFor(id: string | undefined): SpeciesProfile | { error: string } {
  const p = getProfile(id ?? 'istavrit');
  if (!p) return { error: 'unknown_species' };
  if (Object.keys(p.weights).length === 0) return { error: 'species_not_ready' };
  return p;
}

publicRoutes.get('/spots', async (c) => {
  const profile = profileFor(c.req.query('species'));
  if ('error' in profile) return c.json({ ok: false, error: profile.error }, 400);
  const { results } = await c.env.DB.prepare("SELECT * FROM spots WHERE status != 'rejected' ORDER BY name").all<SpotRow>();
  const snaps = await loadSnapshots(c.env.DB, results.flatMap((r) => (r.sea_cell ? [r.wx_cell, r.sea_cell] : [r.wx_cell])));
  const now = new Date();
  const spots = results.map((r) => {
    const points = mergeSnapshots(snaps.get(r.wx_cell)?.snap, r.sea_cell ? snaps.get(r.sea_cell)?.snap : null);
    const s = scoreAt({ spot: toSpotInput(r), at: now, profile, points });
    return { ...publicSpot(r), score: { total: s.total, gated: s.gated, warnings: s.warnings, missing: s.missing } };
  });
  spots.sort((a, b) => (b.score.total ?? -1) - (a.score.total ?? -1));
  const fetched = [...snaps.values()].map((s) => s.fetched_at).sort();
  return c.json(
    { ok: true, species: { id: profile.id, name: profile.name }, at: now.toISOString(), data_fetched_at: fetched.at(-1) ?? null, spots },
    200,
    { 'cache-control': 'public, max-age=120' },
  );
});

publicRoutes.get('/spots/:id', async (c) => {
  const profile = profileFor(c.req.query('species'));
  if ('error' in profile) return c.json({ ok: false, error: profile.error }, 400);
  const hours = Math.min(Math.max(Number(c.req.query('hours') ?? 72) || 72, 1), 96);
  const r = await c.env.DB.prepare('SELECT * FROM spots WHERE id = ?1').bind(c.req.param('id')).first<SpotRow>();
  if (!r) return c.json({ ok: false, error: 'not_found' }, 404);
  const snaps = await loadSnapshots(c.env.DB, r.sea_cell ? [r.wx_cell, r.sea_cell] : [r.wx_cell]);
  const wx = snaps.get(r.wx_cell);
  const sea = r.sea_cell ? snaps.get(r.sea_cell) : undefined;
  const points = mergeSnapshots(wx?.snap, sea?.snap);
  const scores = scoreSeries({ spot: toSpotInput(r), from: new Date(), hours, profile, points });
  const byHour = new Map(points.map((p) => [p.ts.slice(0, 13), p]));
  const conditions = scores.map((s) => byHour.get(s.ts.slice(0, 13)) ?? { ts: s.ts });
  const seaGrid =
    sea?.snap.lat !== undefined && sea.snap.lon !== undefined
      ? { lat: sea.snap.lat, lon: sea.snap.lon, distance_km: Math.round(haversineKm(r.lat, r.lon, sea.snap.lat, sea.snap.lon) * 10) / 10 }
      : null;
  return c.json(
    {
      ok: true,
      species: { id: profile.id, name: profile.name, weights: profile.weights },
      spot: publicSpot(r),
      data: { weather_fetched_at: wx?.fetched_at ?? null, sea_fetched_at: sea?.fetched_at ?? null, sea_grid: seaGrid },
      scores,
      conditions,
    },
    200,
    { 'cache-control': 'public, max-age=120' },
  );
});
