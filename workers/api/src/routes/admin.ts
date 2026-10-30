import { Hono } from 'hono';
import type { Env } from '../env';
import { CELL_DEG, cellKey } from '../lib/seed';
import { publicSpot, STATUSES, type SpotRow } from '../lib/spots';
import { purgeSpot } from '../lib/cache';

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
  await purgeSpot(new URL(c.req.url).origin, row!.id);
  return c.json({ ok: true, spot: publicSpot(row!) });
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
  await purgeSpot(new URL(c.req.url).origin, row!.id);
  return c.json({ ok: true, spot: publicSpot(row!) }, 201);
});
