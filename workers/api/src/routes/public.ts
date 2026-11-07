// Read-only endpoints: scores are precomputed by cron (see precompute.ts); handlers only slice stored JSON.
import { Hono, type Context } from 'hono';
import type { Env } from '../env';
import { ACTIVE_COUNT_SQL, publicSpotDetail, type SpotRow } from '../lib/spots';
import { fieldRecords, isSpecies, SPECIES, type FieldDepthRow, type FieldObsRow, type ListEntryV2, type Species } from '../precompute_v2';
import { FETCHED_SQL, WEATHER_RUNS_SQL, parseWeatherRun, fetchedAt, HOURS_SQL, hoursBody, LIST_SQL, listBody, preKey, WINDOWS_SQL, windowsBody, type HoursRow, type ListRow, type WindowsRow } from '../lib/views';
import { DEFAULT_PROFILES } from '@av-livn/scoring';
import { calibrationPassed, MIN_SESSIONS, parseReport, reportKey } from '../lib/calibration';

export const publicRoutes = new Hono<{ Bindings: Env }>();

const HOUR = 3_600_000;
// No edge cache: handlers only read precomputed rows, and measured Cache API put/clone cost (~4 ms CPU per miss)
// exceeded the work it saved. `no-cache` because the livn.tr zone rewrites max-age to 4 h for browsers.
const NO_CACHE = { 'cache-control': 'no-cache' };

// Public API = scores, ranks, bands and general spot info only (docs/PRIVACY.md). Field notes, photos, measured
// values and the catch log are served by /api/admin/* (ADMIN_TOKEN). v1 scores are no longer served publicly.
// H3: ?species=istavrit|levrek (default istavrit); anything else → species_not_ready.
const sp = (c: Ctx): Species | null => {
  const q = c.req.query('species') ?? 'istavrit';
  return isSpecies(q) ? q : null;
};
const notReady = (c: Ctx) => c.json({ ok: false, error: 'species_not_ready', species: SPECIES }, 400);
publicRoutes.get('/spots', (c) => (sp(c) ? listV2(c, sp(c)!) : notReady(c)));
publicRoutes.get('/spots/:id', (c) => (sp(c) ? detailV2(c, sp(c)!) : notReady(c)));
publicRoutes.get('/windows', (c) => (sp(c) ? windowsV2(c, sp(c)!) : notReady(c)));
publicRoutes.get('/hours', (c) => (sp(c) ? hoursV2(c, sp(c)!) : notReady(c)));
/** F1: owner-drawn forbidden areas as GeoJSON (names and shapes are public map info). */
publicRoutes.get('/forbidden', async (c) => {
  const r = await c.env.DB.prepare('SELECT id, name, geojson FROM forbidden_area ORDER BY created_at').all<{ id: string; name: string; geojson: string }>();
  return c.json(
    { type: 'FeatureCollection', features: r.results.map((a) => ({ type: 'Feature', geometry: JSON.parse(a.geojson), properties: { id: a.id, name: a.name, source: 'yönetici' } })) },
    200,
    NO_CACHE,
  );
});
// M2: the public endpoint returns the generic, brand-free classes only; the owner's personal set is admin-only
// (GET /api/admin/tackle) and a visitor's own set lives on their device.
// P2/P5: weather grids and model spread, built hourly in Actions and stored in D1 meta; served as stored (no CPU)
const GRIDS: Record<string, string> = { wx: 'grid_wx', sea: 'grid_sea', cur: 'grid_cur', spread: 'model_spread' };
publicRoutes.get('/grid/:name', async (c) => {
  const key = GRIDS[c.req.param('name')];
  if (!key) return c.json({ ok: false, error: 'unknown_grid', grids: Object.keys(GRIDS) }, 404);
  const r = await c.env.DB.prepare('SELECT value FROM meta WHERE key = ?1').bind(key).first<{ value: string }>();
  if (!r) return c.json({ ok: false, error: 'not_ready' }, 404);
  return c.body(r.value, 200, { 'content-type': 'application/json; charset=UTF-8', 'cache-control': 'public, max-age=600' });
});
publicRoutes.get('/tackle', (c) => c.json({ ok: true, profiles: DEFAULT_PROFILES }, 200, NO_CACHE));
// N3: whether the forward calibration has passed its first check (caps the plan's trust at "Orta" until then).
// Only the verdict and the session count of the report; coefficients and sessions stay admin-only.
publicRoutes.get('/trust-gate', async (c) => {
  const species = sp(c);
  if (!species) return notReady(c);
  const r = parseReport((await c.env.DB.prepare('SELECT value FROM meta WHERE key = ?1').bind(reportKey(species)).first<{ value: string }>())?.value);
  return c.json({ ok: true, species, passed: calibrationPassed(r), n: r?.n ?? 0, min: MIN_SESSIONS }, 200, { 'cache-control': 'public, max-age=600' });
});

type Ctx = Context<{ Bindings: Env }>;

/** Requested hour (?at=ISO) clamped to [now, now + 71 h]; default now. */
function hourOf(c: Ctx): number {
  const now = Math.floor(Date.now() / HOUR);
  const t = Date.parse(c.req.query('at') ?? '');
  return Number.isNaN(t) ? now : Math.min(Math.max(Math.floor(t / HOUR), now), now + 71);
}

/** Precomputed body (score job, lib/views.ts) for the default request at this hour; null → build live. */
async function pre(c: Ctx, kind: 'list' | 'hours' | 'windows', hour: number, species: Species): Promise<Response | null> {
  const r = await c.env.DB.prepare('SELECT value FROM meta WHERE key = ?1').bind(preKey(kind, hour, species)).first<{ value: string }>();
  return r ? c.body(r.value, 200, { 'content-type': 'application/json; charset=UTF-8', ...NO_CACHE, 'x-av-pre': '1' }) : null;
}

/** v2 list: expected score, 10–90 % band and rank (among scored spots) at the current or requested hour. */
async function listV2(c: Ctx, species: Species) {
  const nowHour = hourOf(c);
  if (nowHour === Math.floor(Date.now() / HOUR)) {
    const p = await pre(c, 'list', nowHour, species);
    if (p) return p;
  }
  const [rows, fetched, runs] = await c.env.DB.batch([c.env.DB.prepare(LIST_SQL).bind(species), c.env.DB.prepare(FETCHED_SQL), c.env.DB.prepare(WEATHER_RUNS_SQL)]);
  return c.json(listBody(rows!.results as ListRow[], fetchedAt(fetched!.results), nowHour, species, parseWeatherRun((runs!.results[0] as { value?: string } | undefined)?.value)), 200, NO_CACHE);
}

/** Spot × hour grid for the heat map (E2). */
async function hoursV2(c: Ctx, species: Species) {
  const from = Math.floor(Date.now() / HOUR);
  const p = await pre(c, 'hours', from, species);
  if (p) return p;
  const [rows, fetched] = await c.env.DB.batch([c.env.DB.prepare(HOURS_SQL).bind(species), c.env.DB.prepare(FETCHED_SQL)]);
  return c.json(hoursBody(rows!.results as HoursRow[], fetchedAt(fetched!.results), from, species), 200, NO_CACHE);
}

/** Best windows of the next 72 h (D2). */
async function windowsV2(c: Ctx, species: Species) {
  const from = Math.floor(Date.now() / HOUR);
  const hours = Math.min(Math.max(Number(c.req.query('hours') ?? 72) || 72, 1), 72);
  if (hours === 72) {
    const p = await pre(c, 'windows', from, species);
    if (p) return p;
  }
  const rows = await c.env.DB.prepare(WINDOWS_SQL).bind(species).all<WindowsRow>();
  return c.json(windowsBody(rows.results, from, hours, species), 200, NO_CACHE);
}

/** v2 detail: spot, field summary and the packed v2 hours (spliced raw, as for v1). */
async function detailV2(c: Ctx, species: Species) {
  const id = c.req.param('id')!;
  const hours = Math.min(Math.max(Number(c.req.query('hours') ?? 72) || 72, 1), 72);
  const [spotRes, obsRes, depthRes, countRes, satPts, satBand] = await c.env.DB.batch([
    c.env.DB.prepare("SELECT s.*, v.start_hour, v.detail_json, v.list_json, v.partial FROM spots s LEFT JOIN spot_scores_v2 v ON v.spot_id = s.id AND v.species = ?2 WHERE s.id = ?1 AND s.status != 'proposed'").bind(id, species),
    c.env.DB.prepare('SELECT * FROM field_obs WHERE spot_id = ?1 ORDER BY observed_at').bind(id),
    c.env.DB.prepare('SELECT d.* FROM field_depth d JOIN field_obs o ON o.id = d.obs_id WHERE o.spot_id = ?1').bind(id),
    c.env.DB.prepare(ACTIVE_COUNT_SQL),
    c.env.DB.prepare('SELECT dist_m, depth_m, sigma_m, obs_date FROM sat_depth_points WHERE spot_id = ?1 ORDER BY dist_m').bind(id),
    c.env.DB.prepare('SELECT band, kind, depth_m, sigma_m, n FROM sat_depth_band WHERE spot_id = ?1').bind(id),
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
    species,
    spot: publicSpotDetail(r),
    // Which kinds of field knowledge exist, never their values (badges on the card).
    field: rec && {
      observations: obs.filter((o) => o.status !== 'reddedildi' && (o.source_kind ?? 'saha') !== 'masabasi').length,
      desk_pending: obs.filter((o) => o.source_kind === 'masabasi' && o.status === 'onaysiz').length,
      kinds: { lamba: rec.lamp?.kind ?? null, derinlik: rec.depthKind, taban: rec.substrateKind, yapi: rec.structureKind },
    },
    // Faz R: public satellite depth (ICESat-2 ATL24 points within 150 m, measured; cast-band values incl. SDB if accepted)
    sat: { points: satPts!.results, bands: satBand!.results },
    spot_count: (countRes!.results[0] as { n: number }).n,
    partial: r.partial === 1,
    from,
    hours,
    ranks,
    reasons,
  });
  return c.body(`${head.slice(0, -1)},"packed":${r.detail_json ?? 'null'}}`, 200, { 'content-type': 'application/json; charset=utf-8', ...NO_CACHE });
}
