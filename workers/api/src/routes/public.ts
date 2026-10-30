// Read-only endpoints: scores are precomputed by cron (see precompute.ts); handlers only slice stored JSON.
import { getProfile, type SpeciesProfile } from '@av-livn/scoring';
import { Hono, type Context } from 'hono';
import type { Env } from '../env';
import { publicSpot, publicSpotDetail, type SpotRow } from '../lib/spots';
import { fieldRecords, type FieldDepthRow, type FieldObsRow, type ListEntryV2 } from '../precompute_v2';

export const publicRoutes = new Hono<{ Bindings: Env }>();

const HOUR = 3_600_000;
// No edge cache: handlers only read precomputed rows, and measured Cache API put/clone cost (~4 ms CPU per miss)
// exceeded the work it saved. `no-cache` because the livn.tr zone rewrites max-age to 4 h for browsers.
const NO_CACHE = { 'cache-control': 'no-cache' };

function profileFor(id: string | undefined): SpeciesProfile | { error: string } {
  const p = getProfile(id ?? 'istavrit');
  if (!p) return { error: 'unknown_species' };
  if (Object.keys(p.weights).length === 0) return { error: 'species_not_ready' };
  return p;
}

type ListEntry = [number | null, 0 | 1, string | null, number];

publicRoutes.get('/spots', async (c) => {
    if (c.req.query('model') === 'v2') return listV2(c);
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
    return c.json({ ok: true, species: { id: profile.id, name: profile.name }, at: new Date(nowHour * HOUR).toISOString(), data_fetched_at: at, spots }, 200, NO_CACHE);
});

publicRoutes.get('/spots/:id', async (c) => {
    if (c.req.query('model') === 'v2') return detailV2(c);
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
    return c.body(`${head.slice(0, -1)},"packed":${r.detail_json ?? 'null'}}`, 200, { 'content-type': 'application/json; charset=utf-8', ...NO_CACHE });
});

type Ctx = Context<{ Bindings: Env }>;

/** v2 list: expected score, 10–90 % band and rank (among scored spots) at the current hour. */
async function listV2(c: Ctx) {
  const [rows, fetched] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT s.*, v.start_hour, v.list_json, v.model_version, v.computed_at AS scored_at, v.partial FROM spots s
       LEFT JOIN spot_scores_v2 v ON v.spot_id = s.id WHERE s.status != 'rejected'`,
    ),
    c.env.DB.prepare('SELECT max(fetched_at) AS at FROM forecast_snapshots'),
  ]);
  const nowHour = Math.floor(Date.now() / HOUR);
  type Row = SpotRow & { start_hour: number | null; list_json: string | null; model_version: string | null; partial: number | null };
  const all = rows!.results as Row[];
  const spots = all.map((r) => {
    const e = r.list_json && r.start_hour !== null ? (JSON.parse(r.list_json) as ListEntryV2[])[nowHour - r.start_hour] : undefined;
    return {
      ...publicSpot(r),
      score: e
        ? { total: e[0], p10: e[1], p90: e[2], rank: e[3], gated: e[4] === 1, warnings: e[5] ? [e[5]] : [], partial: r.partial === 1 }
        : { total: null, p10: null, p90: null, rank: null, gated: false, warnings: [], partial: false },
    };
  });
  spots.sort((a, b) => (b.score.total ?? -1) - (a.score.total ?? -1) || a.name.localeCompare(b.name, 'tr'));
  const at = (fetched!.results[0] as { at: string | null } | undefined)?.at ?? null;
  const version = all.find((r) => r.model_version)?.model_version ?? null;
  return c.json({ ok: true, model: version, at: new Date(nowHour * HOUR).toISOString(), data_fetched_at: at, count: spots.length, spots }, 200, NO_CACHE);
}

/** v2 detail: spot, field summary and the packed v2 hours (spliced raw, as for v1). */
async function detailV2(c: Ctx) {
  const id = c.req.param('id')!;
  const hours = Math.min(Math.max(Number(c.req.query('hours') ?? 72) || 72, 1), 72);
  const [spotRes, obsRes, depthRes, countRes] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT s.*, v.start_hour, v.detail_json, v.list_json, v.partial FROM spots s LEFT JOIN spot_scores_v2 v ON v.spot_id = s.id WHERE s.id = ?1').bind(id),
    c.env.DB.prepare('SELECT * FROM field_obs WHERE spot_id = ?1 ORDER BY observed_at').bind(id),
    c.env.DB.prepare('SELECT d.* FROM field_depth d JOIN field_obs o ON o.id = d.obs_id WHERE o.spot_id = ?1').bind(id),
    c.env.DB.prepare("SELECT count(*) AS n FROM spots WHERE status != 'rejected'"),
  ]);
  const r = spotRes!.results[0] as (SpotRow & { start_hour: number | null; detail_json: string | null; list_json: string | null; partial: number | null }) | undefined;
  if (!r) return c.json({ ok: false, error: 'not_found' }, 404);
  const obs = obsRes!.results as FieldObsRow[];
  const rec = fieldRecords(obs, depthRes!.results as FieldDepthRow[]).get(id) ?? null;
  const from = r.start_hour === null ? 0 : Math.max(0, Math.floor(Date.now() / HOUR) - r.start_hour);
  const ranks = r.list_json ? (JSON.parse(r.list_json) as ListEntryV2[]).slice(from, from + hours).map((e) => e[3]) : [];
  const head = JSON.stringify({
    ok: true,
    spot: publicSpotDetail(r),
    field: rec && { ...rec, observations: obs.length, last_note: [...obs].reverse().find((o) => o.note)?.note ?? null },
    spot_count: (countRes!.results[0] as { n: number }).n,
    partial: r.partial === 1,
    from,
    hours,
    ranks,
  });
  return c.body(`${head.slice(0, -1)},"packed":${r.detail_json ?? 'null'}}`, 200, { 'content-type': 'application/json; charset=utf-8', ...NO_CACHE });
}
