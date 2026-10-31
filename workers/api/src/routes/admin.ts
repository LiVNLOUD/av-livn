import { Hono } from 'hono';
import type { Env } from '../env';
import { catchRoutes } from './catch';
import { CELL_DEG, cellKey } from '../lib/seed';
import { ACTIVE, adminSpot, loadSnapshots, STATUSES, type SpotRow } from '../lib/spots';
import { fieldRecords, oceanMap, rescoreSpot, UPSERT_V2_SQL, type FieldDepthRow, type FieldObsRow, type ListEntryV2 } from '../precompute_v2';

export const adminRoutes = new Hono<{ Bindings: Env }>();

/** Constant-time comparison of SHA-256 digests, so neither content nor length leaks through timing. */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const x = new Uint8Array(da);
  const y = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}

adminRoutes.use('*', async (c, next) => {
  const token = c.env.ADMIN_TOKEN;
  if (!token) return c.json({ ok: false, error: 'admin_disabled' }, 503);
  const auth = c.req.header('authorization') ?? '';
  const given = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!given || !(await safeEqual(given, token))) return c.json({ ok: false, error: 'unauthorized' }, 401);
  await next();
});

type Fields = { name?: unknown; has_light?: unknown; status?: unknown; notes?: unknown };
type Valid = { ok: true; set: Record<string, string | number | null> } | { ok: false; error: string };

export function validateFields(body: Fields): Valid {
  const set: Record<string, string | number | null> = {};
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length < 2 || body.name.length > 80) return { ok: false, error: 'invalid_name' };
    set.name = body.name.trim();
  }
  if (body.has_light !== undefined) {
    if (body.has_light !== null && typeof body.has_light !== 'boolean') return { ok: false, error: 'invalid_has_light' };
    set.has_light = body.has_light === null ? null : body.has_light ? 1 : 0;
    set.lamp_admin = set.has_light;
  }
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status as (typeof STATUSES)[number])) return { ok: false, error: 'invalid_status' };
    set.status = body.status as string;
  }
  if (body.notes !== undefined) {
    if (body.notes !== null && (typeof body.notes !== 'string' || body.notes.length > 1000)) return { ok: false, error: 'invalid_notes' };
    set.notes = body.notes as string | null;
  }
  if (Object.keys(set).length === 0) return { ok: false, error: 'empty_patch' };
  return { ok: true, set };
}

adminRoutes.get('/ping', (c) => c.json({ ok: true }));
adminRoutes.route('/catch', catchRoutes);

/** All spots with private fields (lamp state, notes) for /admin/ and /saha/. */
adminRoutes.get('/spots', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM spots ORDER BY name').all<SpotRow>();
  return c.json({ ok: true, spots: results.map(adminSpot) });
});

adminRoutes.patch('/spots/:id', async (c) => {
  const body = await c.req.json<Fields>().catch(() => null);
  if (!body || typeof body !== 'object') return c.json({ ok: false, error: 'invalid_json' }, 400);
  const v = validateFields(body);
  if (!v.ok) return c.json(v, 400);
  const now = new Date().toISOString();
  const cols = Object.keys(v.set);
  const n = cols.length;
  const res = await c.env.DB.prepare(
    `UPDATE spots SET ${cols.map((k, i) => `${k} = ?${i + 1}`).join(', ')}, admin_edited_at = ?${n + 1}, updated_at = ?${n + 1} WHERE id = ?${n + 2}`,
  )
    .bind(...cols.map((k) => v.set[k]), now, c.req.param('id'))
    .run();
  if (!res.meta.changes) return c.json({ ok: false, error: 'not_found' }, 404);
  const row = await c.env.DB.prepare('SELECT * FROM spots WHERE id = ?1').bind(c.req.param('id')).first<SpotRow>();
  // Scores reflect the edit after the next hourly scoring run (GitHub Actions, score.yml).
  return c.json({ ok: true, spot: adminSpot(row!) });
});

interface NewSpot extends Fields {
  lat?: unknown;
  lon?: unknown;
  shore_normal_deg?: unknown;
  probe_lat?: unknown;
  probe_lon?: unknown;
}

const inRange = (x: unknown, lo: number, hi: number): x is number => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
const isLat = (x: unknown): x is number => inRange(x, 40.2, 40.7);
const isLon = (x: unknown): x is number => inRange(x, 28.5, 29.4);

adminRoutes.post('/spots', async (c) => {
  const b = await c.req.json<NewSpot>().catch(() => null);
  if (!b || typeof b !== 'object') return c.json({ ok: false, error: 'invalid_json' }, 400);
  if (!isLat(b.lat) || !isLon(b.lon)) return c.json({ ok: false, error: 'invalid_position' }, 400);
  if (!inRange(b.shore_normal_deg, 0, 360)) return c.json({ ok: false, error: 'invalid_shore_normal' }, 400);
  const probe = b.probe_lat === undefined || b.probe_lat === null ? null : { lat: b.probe_lat, lon: b.probe_lon };
  if (probe && (!isLat(probe.lat) || !isLon(probe.lon))) return c.json({ ok: false, error: 'invalid_probe' }, 400);
  const v = validateFields({ name: b.name, has_light: b.has_light ?? null, notes: b.notes ?? null });
  if (!v.ok) return c.json(v, 400);
  if (v.set.name === undefined) return c.json({ ok: false, error: 'invalid_name' }, 400);

  const id = `manual-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();
  const wx = cellKey('wx', b.lat, b.lon);
  const [, i, j] = wx.split(':').map(Number) as [number, number, number];
  const sea = probe ? cellKey('sea', probe.lat as number, probe.lon as number) : null;
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT OR IGNORE INTO cells (id, kind, lat, lon) VALUES (?1, 'wx', ?2, ?3)").bind(wx, +(i * CELL_DEG).toFixed(4), +(j * CELL_DEG).toFixed(4)),
    ...(probe && sea ? [c.env.DB.prepare("INSERT OR IGNORE INTO cells (id, kind, lat, lon) VALUES (?1, 'sea', ?2, ?3)").bind(sea, probe.lat, probe.lon)] : []),
    c.env.DB.prepare(
      `INSERT INTO spots (id, name, kind, lat, lon, probe_lat, probe_lon, shore_normal_deg, has_light, status, notes, source, wx_cell, sea_cell, admin_edited_at, updated_at)
       VALUES (?1, ?2, 'manual', ?3, ?4, ?5, ?6, ?7, ?8, 'candidate', ?9, 'manual', ?10, ?11, ?12, ?12)`,
    ).bind(id, v.set.name, b.lat, b.lon, probe?.lat ?? null, probe?.lon ?? null, b.shore_normal_deg, v.set.has_light ?? null, v.set.notes ?? null, wx, sea, now),
  ]);
  const row = await c.env.DB.prepare('SELECT * FROM spots WHERE id = ?1').bind(id).first<SpotRow>();
  return c.json({ ok: true, spot: adminSpot(row!) }, 201);
});

// ---------------------------------------------------------------- field form (B5)

const SUBSTRATES = ['kum', 'cakil', 'kaya', 'midyeli', 'yosunlu', 'camur'] as const;
const SNAGS = ['yosun', 'midye', 'camur', 'hicbiri'] as const;
const STRUCTURES = ['iskele', 'mendirek', 'dogal_kaya'] as const;
const COLORS = ['beyaz', 'sari', 'led'] as const;
const ACCESS = ['acik', 'kisitli_feribot', 'belirsiz'] as const;
const KINDS = ['saha', 'uzaktan', 'masabasi'] as const;
const REVIEW = ['onaysiz', 'onayli', 'reddedildi'] as const;
const MAX_PHOTO_B64 = 550_000; // ≈ 400 KB JPEG

export interface FieldInput {
  observed_at: string;
  substrate: string[] | null;
  snag: string | null;
  structure: string | null;
  /** undefined = not answered (spot unchanged); null = "bilinmiyor". */
  has_light: boolean | null | undefined;
  light_color: string | null;
  access: string | null;
  note: string | null;
  depths: { distance_m: number; method: 'plumb' | 'sink'; depth_m: number | null; sink_s: number | null; jig_g: number | null }[];
  photo: { mime: string; data_b64: string } | null;
  /** saha ölçümü / uzaktan gözlem / masa başı veri (model priority saha > uzaktan > masabasi). */
  source_kind: (typeof KINDS)[number];
  status: (typeof REVIEW)[number];
  light_prob: number | null;
  evidence: Record<string, string> | null;
}

const oneOf = <T extends string>(v: unknown, list: readonly T[]): v is T => typeof v === 'string' && (list as readonly string[]).includes(v);
const opt = (v: unknown) => v === undefined || v === null || v === '';

/** Pure validation of a field-form submission. */
export function validateFieldInput(b: Record<string, unknown>, now: Date): { ok: true; value: FieldInput } | { ok: false; error: string } {
  const at = b.observed_at === undefined ? now : new Date(String(b.observed_at));
  if (Number.isNaN(at.getTime()) || at.getTime() > now.getTime() + 3_600_000) return { ok: false, error: 'invalid_observed_at' };
  if (!opt(b.substrate) && (!Array.isArray(b.substrate) || !b.substrate.every((s) => oneOf(s, SUBSTRATES)))) return { ok: false, error: 'invalid_substrate' };
  if (!opt(b.snag) && !oneOf(b.snag, SNAGS)) return { ok: false, error: 'invalid_snag' };
  if (!opt(b.structure) && !oneOf(b.structure, STRUCTURES)) return { ok: false, error: 'invalid_structure' };
  if (b.has_light !== undefined && b.has_light !== null && typeof b.has_light !== 'boolean') return { ok: false, error: 'invalid_has_light' };
  if (!opt(b.light_color) && !oneOf(b.light_color, COLORS)) return { ok: false, error: 'invalid_light_color' };
  if (!opt(b.access) && !oneOf(b.access, ACCESS)) return { ok: false, error: 'invalid_access' };
  if (!opt(b.note) && (typeof b.note !== 'string' || b.note.length > 1000)) return { ok: false, error: 'invalid_note' };
  const rawDepths = b.depths === undefined ? [] : b.depths;
  if (!Array.isArray(rawDepths) || rawDepths.length > 20) return { ok: false, error: 'invalid_depths' };
  const depths: FieldInput['depths'] = [];
  for (const d of rawDepths as Record<string, unknown>[]) {
    if (!d || !inRange(d.distance_m, 0, 300)) return { ok: false, error: 'invalid_distance' };
    if (d.method === 'plumb') {
      if (!inRange(d.depth_m, 0, 80)) return { ok: false, error: 'invalid_depth' };
      depths.push({ distance_m: d.distance_m, method: 'plumb', depth_m: d.depth_m, sink_s: null, jig_g: null });
    } else if (d.method === 'sink') {
      if (!inRange(d.sink_s, 0.5, 120) || !inRange(d.jig_g, 0.3, 40)) return { ok: false, error: 'invalid_sink' };
      depths.push({ distance_m: d.distance_m, method: 'sink', depth_m: null, sink_s: d.sink_s, jig_g: d.jig_g });
    } else return { ok: false, error: 'invalid_method' };
  }
  if (!opt(b.source_kind) && !oneOf(b.source_kind, KINDS)) return { ok: false, error: 'invalid_source_kind' };
  const kind = (opt(b.source_kind) ? 'saha' : b.source_kind) as FieldInput['source_kind'];
  if (!opt(b.status) && !oneOf(b.status, REVIEW)) return { ok: false, error: 'invalid_status' };
  if (!opt(b.light_prob) && !inRange(b.light_prob, 0, 1)) return { ok: false, error: 'invalid_light_prob' };
  if (kind === 'saha' && !opt(b.light_prob)) return { ok: false, error: 'light_prob_needs_non_field_source' };
  if (kind !== 'saha' && depths.some((d) => d.method === 'sink')) return { ok: false, error: 'sink_time_needs_field_source' };
  if (!opt(b.evidence) && (typeof b.evidence !== 'object' || Array.isArray(b.evidence) || JSON.stringify(b.evidence).length > 2000)) return { ok: false, error: 'invalid_evidence' };
  let photo: FieldInput['photo'] = null;
  if (!opt(b.photo)) {
    const p = b.photo as Record<string, unknown>;
    if (!oneOf(p?.mime, ['image/jpeg', 'image/webp'] as const) || typeof p.data_b64 !== 'string' || p.data_b64.length > MAX_PHOTO_B64 || !/^[A-Za-z0-9+/=]+$/.test(p.data_b64))
      return { ok: false, error: 'invalid_photo' };
    photo = { mime: p.mime as string, data_b64: p.data_b64 };
  }
  return {
    ok: true,
    value: {
      observed_at: at.toISOString(),
      substrate: opt(b.substrate) || (b.substrate as string[]).length === 0 ? null : [...new Set(b.substrate as string[])],
      snag: opt(b.snag) ? null : (b.snag as string),
      structure: opt(b.structure) ? null : (b.structure as string),
      has_light: b.has_light as boolean | null | undefined,
      light_color: opt(b.light_color) ? null : (b.light_color as string),
      access: opt(b.access) ? null : (b.access as string),
      note: opt(b.note) ? null : (b.note as string),
      depths,
      photo,
      source_kind: kind,
      // Desk findings wait for the user's review; field and remote entries are the user's own.
      status: (opt(b.status) ? (kind === 'masabasi' ? 'onaysiz' : 'onayli') : b.status) as FieldInput['status'],
      light_prob: opt(b.light_prob) ? null : (b.light_prob as number),
      evidence: opt(b.evidence) ? null : (b.evidence as Record<string, string>),
    },
  };
}

/**
 * After a field edit: mark the spot for the 15-minute Monte Carlo run (score.yml --pending) and, unless
 * meta.rescore_mode = 'deferred' (set when the point score costs > 10 ms CPU), write the point score now.
 * Returns the new list entry, 'deferred', or null for an unknown spot.
 */
export async function rescoreNow(db: D1Database, id: string, now = new Date()): Promise<ListEntryV2 | 'deferred' | null> {
  const [exists, mode] = await db.batch([
    db.prepare('SELECT id FROM spots WHERE id = ?1').bind(id),
    db.prepare("SELECT value FROM meta WHERE key = 'rescore_mode'"),
  ]);
  if (!exists!.results.length) return null;
  const deferred = (mode!.results[0] as { value: string } | undefined)?.value === 'deferred';
  await db
    .prepare('INSERT INTO pending_rescore (spot_id, since, immediate) VALUES (?1, ?2, ?3) ON CONFLICT(spot_id) DO UPDATE SET since = excluded.since, immediate = excluded.immediate')
    .bind(id, now.toISOString(), deferred ? 0 : 1)
    .run();
  if (deferred) return 'deferred';
  return pointRescore(db, id, now);
}

async function pointRescore(db: D1Database, id: string, now: Date): Promise<ListEntryV2 | null> {
  const [spotRes, obsRes, depthRes, scoreRes, oSeries, oNormal] = await db.batch([
    db.prepare('SELECT * FROM spots WHERE id = ?1').bind(id),
    db.prepare('SELECT * FROM field_obs WHERE spot_id = ?1').bind(id),
    db.prepare('SELECT d.* FROM field_depth d JOIN field_obs o ON o.id = d.obs_id WHERE o.spot_id = ?1').bind(id),
    db.prepare(`SELECT v.spot_id, v.start_hour, v.list_json FROM spot_scores_v2 v JOIN spots s ON s.id = v.spot_id WHERE s.${ACTIVE}`),
    db.prepare('SELECT * FROM ocean_series WHERE spot_id = ?1').bind(id),
    db.prepare('SELECT * FROM ocean_normal WHERE spot_id = ?1').bind(id),
  ]);
  const row = spotRes!.results[0] as SpotRow | undefined;
  if (!row) return null;
  const snaps = await loadSnapshots(db, row.sea_cell ? [row.wx_cell, row.sea_cell] : [row.wx_cell]);
  const stored = (scoreRes!.results as { spot_id: string; start_hour: number; list_json: string }[]).map((r) => ({
    id: r.spot_id,
    start_hour: r.start_hour,
    list: JSON.parse(r.list_json) as ListEntryV2[],
  }));
  const rec = rescoreSpot(
    row,
    snaps.get(row.wx_cell),
    row.sea_cell ? snaps.get(row.sea_cell) : undefined,
    now,
    fieldRecords(obsRes!.results as FieldObsRow[], depthRes!.results as FieldDepthRow[]).get(id),
    stored.find((s) => s.id === id) ?? null,
    stored.filter((s) => s.id !== id),
    oceanMap(oSeries!.results as never[], oNormal!.results as never[]).get(id),
  );
  await db.prepare(UPSERT_V2_SQL).bind(rec.spot_id, rec.model_version, rec.computed_at, rec.start_hour, rec.list_json, rec.detail_json, 1).run();
  return (JSON.parse(rec.list_json) as ListEntryV2[])[0]!;
}

const scoreJson = (r: ListEntryV2 | 'deferred' | null) =>
  r === 'deferred' || r === null
    ? { rescore: 'deferred' as const, score: null }
    : { rescore: 'immediate' as const, score: { total: r[0], p10: r[1], p90: r[2], rank: r[3], gated: r[4] === 1 } };

/** Statements writing one observation (insert or full replace) and the spot fields it drives. */
function obsStatements(db: D1Database, obsId: string, spotId: string, f: FieldInput, now: Date, replace: boolean): D1PreparedStatement[] {
  const light = f.has_light === undefined || f.has_light === null ? null : f.has_light ? 1 : 0;
  const cols = [obsId, spotId, f.observed_at, f.substrate ? JSON.stringify(f.substrate) : null, f.snag, f.structure, light, f.light_color, f.access, f.note,
    now.toISOString(), f.source_kind, f.status, f.light_prob, f.evidence ? JSON.stringify(f.evidence) : null];
  const out = [
    ...(replace ? [db.prepare('DELETE FROM field_depth WHERE obs_id = ?1').bind(obsId)] : []),
    db.prepare(
      `INSERT INTO field_obs (id, spot_id, observed_at, substrate, snag, structure, has_light, light_color, access, note, created_at, source_kind, status, light_prob, evidence_json)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
       ON CONFLICT(id) DO UPDATE SET observed_at = excluded.observed_at, substrate = excluded.substrate, snag = excluded.snag, structure = excluded.structure,
       has_light = excluded.has_light, light_color = excluded.light_color, access = excluded.access, note = excluded.note, source_kind = excluded.source_kind,
       status = excluded.status, light_prob = excluded.light_prob, evidence_json = excluded.evidence_json`,
    ).bind(...cols),
    ...f.depths.map((d) =>
      db.prepare('INSERT INTO field_depth (obs_id, distance_m, method, depth_m, sink_s, jig_g) VALUES (?1, ?2, ?3, ?4, ?5, ?6)').bind(obsId, d.distance_m, d.method, d.depth_m, d.sink_s, d.jig_g),
    ),
  ];
  if (f.photo) out.push(db.prepare('INSERT OR REPLACE INTO field_photo (obs_id, mime, data_b64) VALUES (?1, ?2, ?3)').bind(obsId, f.photo.mime, f.photo.data_b64));
  if (f.access && f.source_kind !== 'masabasi') out.push(db.prepare('UPDATE spots SET access = ?1, updated_at = ?2 WHERE id = ?3').bind(f.access, now.toISOString(), spotId));
  return out;
}

/**
 * spots.has_light is the field (saha) answer: the newest non-rejected saha observation with a lamp state.
 * When none is left after an edit/delete, it falls back to the admin's value (lamp_admin), else NULL (unknown).
 */
function syncLamp(db: D1Database, spotId: string, now: Date): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE spots SET
         has_light = COALESCE((SELECT has_light FROM field_obs WHERE spot_id = ?1 AND source_kind = 'saha' AND status != 'reddedildi' AND has_light IS NOT NULL
                               ORDER BY observed_at DESC LIMIT 1), lamp_admin),
         admin_edited_at = ?2, updated_at = ?2
       WHERE id = ?1`,
    )
    .bind(spotId, now.toISOString());
}

adminRoutes.post('/spots/:id/field', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || typeof body !== 'object') return c.json({ ok: false, error: 'invalid_json' }, 400);
  const now = new Date();
  const v = validateFieldInput(body, now);
  if (!v.ok) return c.json(v, 400);
  const exists = await c.env.DB.prepare('SELECT id FROM spots WHERE id = ?1').bind(id).first();
  if (!exists) return c.json({ ok: false, error: 'not_found' }, 404);
  const obsId = `obs-${crypto.randomUUID().slice(0, 12)}`;
  await c.env.DB.batch([...obsStatements(c.env.DB, obsId, id, v.value, now, false), syncLamp(c.env.DB, id, now)]);
  const r = c.req.query('rescore') === '0' ? null : await rescoreNow(c.env.DB, id, now);
  return c.json({ ok: true, obs_id: obsId, ...(r === null ? { rescore: 'skipped', score: null } : scoreJson(r)) }, 201);
});

adminRoutes.patch('/field/:obs', async (c) => {
  const obsId = c.req.param('obs');
  const o = await c.env.DB.prepare('SELECT spot_id FROM field_obs WHERE id = ?1').bind(obsId).first<{ spot_id: string }>();
  if (!o) return c.json({ ok: false, error: 'not_found' }, 404);
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body || typeof body !== 'object') return c.json({ ok: false, error: 'invalid_json' }, 400);
  const now = new Date();
  // Review only (onayla / reddet a desk finding): keep everything else.
  if (Object.keys(body).length === 1 && 'status' in body) {
    if (!oneOf(body.status, REVIEW)) return c.json({ ok: false, error: 'invalid_status' }, 400);
    await c.env.DB.batch([c.env.DB.prepare('UPDATE field_obs SET status = ?1 WHERE id = ?2').bind(body.status, obsId), syncLamp(c.env.DB, o.spot_id, now)]);
  } else {
    const v = validateFieldInput(body, now);
    if (!v.ok) return c.json(v, 400);
    await c.env.DB.batch([...obsStatements(c.env.DB, obsId, o.spot_id, v.value, now, true), syncLamp(c.env.DB, o.spot_id, now)]);
  }
  return c.json({ ok: true, obs_id: obsId, ...scoreJson(await rescoreNow(c.env.DB, o.spot_id, now)) });
});

adminRoutes.get('/spots/:id/field', async (c) => {
  const id = c.req.param('id');
  const [obs, depths] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT o.*, (SELECT count(*) FROM field_photo p WHERE p.obs_id = o.id) AS has_photo FROM field_obs o WHERE o.spot_id = ?1 ORDER BY observed_at DESC').bind(id),
    c.env.DB.prepare('SELECT d.* FROM field_depth d JOIN field_obs o ON o.id = d.obs_id WHERE o.spot_id = ?1').bind(id),
  ]);
  const ds = depths!.results as FieldDepthRow[];
  const rows = obs!.results as (FieldObsRow & { has_photo: number })[];
  return c.json({
    ok: true,
    observations: rows.map((o) => ({ ...o, depths: ds.filter((d) => d.obs_id === o.id) })),
    record: fieldRecords(rows, ds).get(id) ?? null,
  });
});

adminRoutes.delete('/field/:obs', async (c) => {
  const o = await c.env.DB.prepare('SELECT spot_id FROM field_obs WHERE id = ?1').bind(c.req.param('obs')).first<{ spot_id: string }>();
  if (!o) return c.json({ ok: false, error: 'not_found' }, 404);
  const now = new Date();
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM field_depth WHERE obs_id = ?1').bind(c.req.param('obs')),
    c.env.DB.prepare('DELETE FROM field_photo WHERE obs_id = ?1').bind(c.req.param('obs')),
    c.env.DB.prepare('DELETE FROM field_obs WHERE id = ?1').bind(c.req.param('obs')),
    syncLamp(c.env.DB, o.spot_id, now),
  ]);
  return c.json({ ok: true, ...scoreJson(await rescoreNow(c.env.DB, o.spot_id, now)) });
});

adminRoutes.post('/spots/:id/rescore', async (c) => {
  const r = await rescoreNow(c.env.DB, c.req.param('id'));
  if (r === null) return c.json({ ok: false, error: 'not_found' }, 404);
  return c.json({ ok: true, ...scoreJson(r) });
});
