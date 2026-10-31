// Read-only endpoints: scores are precomputed by cron (see precompute.ts); handlers only slice stored JSON.
import { Hono, type Context } from 'hono';
import type { Env } from '../env';
import { ACTIVE, ACTIVE_COUNT_SQL, publicSpot, publicSpotDetail, type SpotRow } from '../lib/spots';
import { fieldRecords, type FieldDepthRow, type FieldObsRow, type ListEntryV2 } from '../precompute_v2';

export const publicRoutes = new Hono<{ Bindings: Env }>();

const HOUR = 3_600_000;
// No edge cache: handlers only read precomputed rows, and measured Cache API put/clone cost (~4 ms CPU per miss)
// exceeded the work it saved. `no-cache` because the livn.tr zone rewrites max-age to 4 h for browsers.
const NO_CACHE = { 'cache-control': 'no-cache' };

// Public API = scores, ranks, bands and general spot info only (docs/PRIVACY.md). Field notes, photos, measured
// values and the catch log are served by /api/admin/* (ADMIN_TOKEN). v1 scores are no longer served publicly.
publicRoutes.get('/spots', (c) => (c.req.query('species') && c.req.query('species') !== 'istavrit' ? c.json({ ok: false, error: 'species_not_ready' }, 400) : listV2(c)));
publicRoutes.get('/spots/:id', (c) => detailV2(c));

type Ctx = Context<{ Bindings: Env }>;

/** v2 list: expected score, 10–90 % band and rank (among scored spots) at the current hour. */
async function listV2(c: Ctx) {
  const [rows, fetched] = await c.env.DB.batch([
    c.env.DB.prepare(
      `SELECT s.*, v.start_hour, v.list_json, v.model_version, v.computed_at AS scored_at, v.partial FROM spots s
       LEFT JOIN spot_scores_v2 v ON v.spot_id = s.id WHERE s.${ACTIVE}`,
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
        ? { total: e[0], p10: e[1], p90: e[2], rank: e[3], gated: e[4] === 1, warnings: e[5] ? [e[5]] : [], partial: r.partial === 1, reason: e[6]?.[2] ?? null }
        : { total: null, p10: null, p90: null, rank: null, gated: false, warnings: [], partial: false, reason: null },
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
    c.env.DB.prepare("SELECT s.*, v.start_hour, v.detail_json, v.list_json, v.partial FROM spots s LEFT JOIN spot_scores_v2 v ON v.spot_id = s.id WHERE s.id = ?1 AND s.status != 'proposed'").bind(id),
    c.env.DB.prepare('SELECT * FROM field_obs WHERE spot_id = ?1 ORDER BY observed_at').bind(id),
    c.env.DB.prepare('SELECT d.* FROM field_depth d JOIN field_obs o ON o.id = d.obs_id WHERE o.spot_id = ?1').bind(id),
    c.env.DB.prepare(ACTIVE_COUNT_SQL),
  ]);
  const r = spotRes!.results[0] as (SpotRow & { start_hour: number | null; detail_json: string | null; list_json: string | null; partial: number | null }) | undefined;
  if (!r) return c.json({ ok: false, error: 'not_found' }, 404);
  const obs = obsRes!.results as FieldObsRow[];
  const rec = fieldRecords(obs, depthRes!.results as FieldDepthRow[]).get(id) ?? null;
  const from = r.start_hour === null ? 0 : Math.max(0, Math.floor(Date.now() / HOUR) - r.start_hour);
  const entries = r.list_json ? (JSON.parse(r.list_json) as ListEntryV2[]).slice(from, from + hours) : [];
  const ranks = entries.map((e) => e[3]);
  const reasons = entries.map((e) => e[6]?.[2] ?? null);
  const head = JSON.stringify({
    ok: true,
    spot: publicSpotDetail(r),
    // Which kinds of field knowledge exist, never their values (badges on the card).
    field: rec && {
      observations: obs.filter((o) => o.status !== 'reddedildi' && (o.source_kind ?? 'saha') !== 'masabasi').length,
      desk_pending: obs.filter((o) => o.source_kind === 'masabasi' && o.status === 'onaysiz').length,
      kinds: { lamba: rec.lamp?.kind ?? null, derinlik: rec.depthKind, taban: rec.substrateKind, yapi: rec.structureKind },
    },
    spot_count: (countRes!.results[0] as { n: number }).n,
    partial: r.partial === 1,
    from,
    hours,
    ranks,
    reasons,
  });
  return c.body(`${head.slice(0, -1)},"packed":${r.detail_json ?? 'null'}}`, 200, { 'content-type': 'application/json; charset=utf-8', ...NO_CACHE });
}
