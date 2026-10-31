// Catch log (C4, admin only). A session = spot + time span + effort + method; catches per species, or an
// explicit zero catch. On save the model output for the session hours is frozen from what is already stored:
// spot_scores_v2_history (full output of past hours) and the live list (score/band/rank of current/future
// hours). Hours older than the history are filled by score.yml from the hourly observations ("recomputed").
import { Hono } from 'hono';
import type { Env } from '../env';
import type { ListEntryV2 } from '../precompute_v2';

export const catchRoutes = new Hono<{ Bindings: Env }>();

const HOUR = 3_600_000;
export const LEGAL_MIN_CM: Record<string, number> = { istavrit: 13 };

export interface CatchItem {
  species: string;
  count: number;
  length_cm: number | null;
}
export interface SessionInput {
  spot_id: string;
  start_at: string;
  end_at: string;
  active_min: number;
  rods: number;
  jig_g: number | null;
  hook_no: string | null;
  lure_len_cm: number | null;
  lure_color: string | null;
  under_lamp: boolean | null;
  zero_catch: boolean;
  note: string | null;
  items: CatchItem[];
}

const num = (x: unknown, lo: number, hi: number): x is number => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
const none = (x: unknown) => x === undefined || x === null || x === '';
const str = (x: unknown, max: number): x is string => typeof x === 'string' && x.trim().length > 0 && x.length <= max;

/** Pure validation; warnings (e.g. under the legal minimum size) do not block saving. */
export function validateSession(b: Record<string, unknown>, now: Date): { ok: true; value: SessionInput; warnings: string[] } | { ok: false; error: string } {
  if (!str(b.spot_id, 80)) return { ok: false, error: 'invalid_spot' };
  const start = new Date(String(b.start_at));
  const end = new Date(String(b.end_at));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return { ok: false, error: 'invalid_time' };
  if (end.getTime() > now.getTime() + HOUR || end.getTime() - start.getTime() > 24 * HOUR) return { ok: false, error: 'invalid_time' };
  const span = Math.round((end.getTime() - start.getTime()) / 60_000);
  const active = none(b.active_min) ? span : b.active_min;
  if (!num(active, 1, span)) return { ok: false, error: 'invalid_active_min' };
  const rods = none(b.rods) ? 1 : b.rods;
  if (!num(rods, 1, 10) || !Number.isInteger(rods)) return { ok: false, error: 'invalid_rods' };
  if (!none(b.jig_g) && !num(b.jig_g, 0.1, 60)) return { ok: false, error: 'invalid_jig_g' };
  if (!none(b.lure_len_cm) && !num(b.lure_len_cm, 0.5, 30)) return { ok: false, error: 'invalid_lure_len' };
  for (const k of ['hook_no', 'lure_color'] as const) if (!none(b[k]) && !str(b[k], 40)) return { ok: false, error: `invalid_${k}` };
  if (!none(b.note) && !str(b.note, 1000)) return { ok: false, error: 'invalid_note' };
  if (!none(b.under_lamp) && typeof b.under_lamp !== 'boolean') return { ok: false, error: 'invalid_under_lamp' };
  const raw = none(b.items) ? [] : b.items;
  if (!Array.isArray(raw) || raw.length > 200) return { ok: false, error: 'invalid_items' };
  const items: CatchItem[] = [];
  for (const it of raw as Record<string, unknown>[]) {
    const species = none(it?.species) ? 'istavrit' : it.species;
    if (!str(species, 40)) return { ok: false, error: 'invalid_species' };
    if (!num(it.count, 1, 500) || !Number.isInteger(it.count)) return { ok: false, error: 'invalid_count' };
    if (!none(it.length_cm) && !num(it.length_cm, 1, 150)) return { ok: false, error: 'invalid_length' };
    items.push({ species: species.trim().toLocaleLowerCase('tr'), count: it.count, length_cm: none(it.length_cm) ? null : (it.length_cm as number) });
  }
  const zero = b.zero_catch === true;
  // "Sıfır av" is an explicit answer, not an empty form.
  if (zero && items.length) return { ok: false, error: 'zero_catch_with_items' };
  if (!zero && !items.length) return { ok: false, error: 'catch_or_zero_required' };
  const warnings = items
    .filter((i) => i.length_cm !== null && LEGAL_MIN_CM[i.species] !== undefined && i.length_cm < LEGAL_MIN_CM[i.species]!)
    .map((i) => `${i.length_cm} cm ${i.species} yasal asgari boyun (${LEGAL_MIN_CM[i.species]} cm) altında — denize geri bırakın.`);
  return {
    ok: true,
    warnings,
    value: {
      spot_id: b.spot_id,
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      active_min: active,
      rods,
      jig_g: none(b.jig_g) ? null : (b.jig_g as number),
      hook_no: none(b.hook_no) ? null : (b.hook_no as string),
      lure_len_cm: none(b.lure_len_cm) ? null : (b.lure_len_cm as number),
      lure_color: none(b.lure_color) ? null : (b.lure_color as string),
      under_lamp: none(b.under_lamp) ? null : (b.under_lamp as boolean),
      zero_catch: zero,
      note: none(b.note) ? null : (b.note as string),
      items,
    },
  };
}

/** Whole UTC hours touched by the session. */
export function sessionHours(start: string, end: string): number[] {
  const a = Math.floor(Date.parse(start) / HOUR);
  const b = Math.floor((Date.parse(end) - 1) / HOUR);
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

export type FrozenHour = { hour: number; source: 'history' | 'forecast' | 'recomputed' } & Record<string, unknown>;

/** Freeze from stored rows; hours not found stay missing (partial). */
export function freeze(hours: number[], history: { hour: number; json: string }[], live: { start_hour: number; list: ListEntryV2[] } | null): { hours: FrozenHour[]; missing: number[] } {
  const byHour = new Map(history.map((h) => [h.hour, h.json]));
  const out: FrozenHour[] = [];
  const missing: number[] = [];
  for (const h of hours) {
    const j = byHour.get(h);
    const e = live?.list[h - live.start_hour];
    if (j) out.push({ hour: h, source: 'history', ...(JSON.parse(j) as Record<string, unknown>) });
    else if (e) out.push({ hour: h, source: 'forecast', total: e[0], p10: e[1], p90: e[2], rank: e[3], reason: e[6] });
    else missing.push(h);
  }
  return { hours: out, missing };
}

/** Catch per hour per rod for the target species (default istavrit): the calibration unit. */
export function cpue(items: CatchItem[], activeMin: number, rods: number, species = 'istavrit'): number {
  const n = items.filter((i) => i.species === species).reduce((a, i) => a + i.count, 0);
  return Math.round((n / (activeMin / 60) / rods) * 100) / 100;
}

async function saveSession(env: Env, id: string, v: SessionInput, now: Date, replace: boolean): Promise<{ freeze_status: string; missing: number }> {
  const hours = sessionHours(v.start_at, v.end_at);
  const [hist, live] = await env.DB.batch([
    env.DB.prepare(`SELECT hour, json FROM spot_scores_v2_history WHERE spot_id = ?1 AND hour BETWEEN ?2 AND ?3`).bind(v.spot_id, hours[0], hours[hours.length - 1]),
    env.DB.prepare('SELECT start_hour, list_json FROM spot_scores_v2 WHERE spot_id = ?1').bind(v.spot_id),
  ]);
  const l = live!.results[0] as { start_hour: number; list_json: string } | undefined;
  const f = freeze(hours, hist!.results as { hour: number; json: string }[], l ? { start_hour: l.start_hour, list: JSON.parse(l.list_json) as ListEntryV2[] } : null);
  const status = f.missing.length ? 'partial' : 'complete';
  const model = JSON.stringify({ frozen_at: now.toISOString(), hours: f.hours, missing: f.missing });
  await env.DB.batch([
    ...(replace ? [env.DB.prepare('DELETE FROM catch_item WHERE session_id = ?1').bind(id)] : []),
    env.DB.prepare(
      `INSERT INTO catch_session (id, spot_id, start_at, end_at, active_min, rods, jig_g, hook_no, lure_len_cm, lure_color, under_lamp, zero_catch, note, created_at, model_json, freeze_status)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
       ON CONFLICT(id) DO UPDATE SET spot_id = excluded.spot_id, start_at = excluded.start_at, end_at = excluded.end_at, active_min = excluded.active_min,
       rods = excluded.rods, jig_g = excluded.jig_g, hook_no = excluded.hook_no, lure_len_cm = excluded.lure_len_cm, lure_color = excluded.lure_color,
       under_lamp = excluded.under_lamp, zero_catch = excluded.zero_catch, note = excluded.note, model_json = excluded.model_json, freeze_status = excluded.freeze_status`,
    ).bind(id, v.spot_id, v.start_at, v.end_at, v.active_min, v.rods, v.jig_g, v.hook_no, v.lure_len_cm, v.lure_color,
      v.under_lamp === null ? null : v.under_lamp ? 1 : 0, v.zero_catch ? 1 : 0, v.note, now.toISOString(), model, status),
    ...v.items.map((i) => env.DB.prepare('INSERT INTO catch_item (session_id, species, count, length_cm) VALUES (?1, ?2, ?3, ?4)').bind(id, i.species, i.count, i.length_cm)),
  ]);
  return { freeze_status: status, missing: f.missing.length };
}

catchRoutes.post('/', async (c) => {
  const b = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!b || typeof b !== 'object') return c.json({ ok: false, error: 'invalid_json' }, 400);
  const now = new Date();
  const v = validateSession(b, now);
  if (!v.ok) return c.json(v, 400);
  if (!(await c.env.DB.prepare('SELECT id FROM spots WHERE id = ?1').bind(v.value.spot_id).first())) return c.json({ ok: false, error: 'not_found' }, 404);
  const id = `ses-${crypto.randomUUID().slice(0, 12)}`;
  const r = await saveSession(c.env, id, v.value, now, false);
  return c.json({ ok: true, id, warnings: v.warnings, cpue: cpue(v.value.items, v.value.active_min, v.value.rods), ...r }, 201);
});

catchRoutes.put('/:id', async (c) => {
  const id = c.req.param('id');
  if (!(await c.env.DB.prepare('SELECT id FROM catch_session WHERE id = ?1').bind(id).first())) return c.json({ ok: false, error: 'not_found' }, 404);
  const b = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!b || typeof b !== 'object') return c.json({ ok: false, error: 'invalid_json' }, 400);
  const now = new Date();
  const v = validateSession(b, now);
  if (!v.ok) return c.json(v, 400);
  const r = await saveSession(c.env, id, v.value, now, true);
  return c.json({ ok: true, id, warnings: v.warnings, cpue: cpue(v.value.items, v.value.active_min, v.value.rods), ...r });
});

catchRoutes.get('/', async (c) => {
  const [s, i] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT c.*, p.name AS spot_name FROM catch_session c JOIN spots p ON p.id = c.spot_id ORDER BY start_at DESC LIMIT 200'),
    c.env.DB.prepare('SELECT * FROM catch_item'),
  ]);
  const items = i!.results as (CatchItem & { session_id: string })[];
  return c.json({
    ok: true,
    sessions: (s!.results as Record<string, unknown>[]).map((x) => {
      const its = items.filter((it) => it.session_id === x.id).map(({ species, count, length_cm }) => ({ species, count, length_cm }));
      return { ...x, model_json: undefined, model: x.model_json ? JSON.parse(x.model_json as string) : null, items: its, cpue: cpue(its, x.active_min as number, x.rods as number) };
    }),
  });
});

catchRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const r = await c.env.DB.batch([c.env.DB.prepare('DELETE FROM catch_item WHERE session_id = ?1').bind(id), c.env.DB.prepare('DELETE FROM catch_session WHERE id = ?1').bind(id)]);
  return r[1]!.meta.changes ? c.json({ ok: true }) : c.json({ ok: false, error: 'not_found' }, 404);
});

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per catch line (or one row for a zero-catch session) with the session's mean frozen model output. */
export function toCsv(sessions: { s: Record<string, unknown>; items: CatchItem[] }[]): string {
  const head = ['session_id', 'spot_id', 'spot_name', 'start_at', 'end_at', 'active_min', 'rods', 'jig_g', 'hook_no', 'lure_len_cm', 'lure_color', 'under_lamp',
    'zero_catch', 'species', 'count', 'length_cm', 'cpue_istavrit_per_h_rod', 'model_hours', 'model_sources', 'model_mean_total', 'model_mean_p10', 'model_mean_p90', 'model_mean_rank'];
  const rows = [head.join(',')];
  for (const { s, items } of sessions) {
    const m = s.model_json ? (JSON.parse(s.model_json as string) as { hours: FrozenHour[] }) : { hours: [] };
    const mean = (k: string) => {
      const v = m.hours.map((h) => h[k]).filter((x): x is number => typeof x === 'number');
      return v.length ? Math.round((v.reduce((a, x) => a + x, 0) / v.length) * 10) / 10 : null;
    };
    const base = [s.id, s.spot_id, s.spot_name, s.start_at, s.end_at, s.active_min, s.rods, s.jig_g, s.hook_no, s.lure_len_cm, s.lure_color, s.under_lamp, s.zero_catch];
    const tail = [cpue(items, s.active_min as number, s.rods as number), m.hours.length, [...new Set(m.hours.map((h) => h.source))].join('+'), mean('total'), mean('p10'), mean('p90'), mean('rank')];
    const lines = items.length ? items.map((i) => [i.species, i.count, i.length_cm]) : [['', 0, '']];
    for (const l of lines) rows.push([...base, ...l, ...tail].map(csvCell).join(','));
  }
  return rows.join('\n') + '\n';
}

catchRoutes.get('/export.csv', async (c) => {
  const [s, i] = await c.env.DB.batch([
    c.env.DB.prepare('SELECT c.*, p.name AS spot_name FROM catch_session c JOIN spots p ON p.id = c.spot_id ORDER BY start_at'),
    c.env.DB.prepare('SELECT * FROM catch_item'),
  ]);
  const items = i!.results as (CatchItem & { session_id: string })[];
  const csv = toCsv((s!.results as Record<string, unknown>[]).map((x) => ({ s: x, items: items.filter((it) => it.session_id === x.id) })));
  return c.body(csv, 200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="av-gunlugu.csv"', 'cache-control': 'no-store' });
});
