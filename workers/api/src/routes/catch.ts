// Catch log (C4, admin only). A session = spot + time span + effort + method; catches per species, or an
// explicit zero catch. On save the model output for the session hours is frozen from what is already stored:
// spot_scores_v2_history (full output of past hours) and the live list (score/band/rank of current/future
// hours). Hours older than the history are filled by score.yml from the hourly observations ("recomputed").
import { Hono } from 'hono';
import type { Env } from '../env';
import { SPECIES, type ListEntryV2 } from '../precompute_v2';

export const catchRoutes = new Hono<{ Bindings: Env }>();

const HOUR = 3_600_000;
export const LEGAL_MIN_CM: Record<string, number> = {
  // 6/2 Tebliğ 2024/21 Çizelge 7 (docs/REGULATION.md)
  istavrit: 13, levrek: 25, 'lüfer': 18, kolyoz: 18, 'karagöz': 18, sargos: 21, 'çipura': 20, mezgit: 13,
};

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
  /** I6: what was targeted; a session for another species is never a zero for istavrit. */
  target_species: string;
  method: 'lrf' | 'spin' | 'capari' | 'diger' | null;
  /** Entered afterwards from memory (explicit, or saved > RETRO_H after the end). */
  retro: boolean;
  /** Model output the angler saw before starting (Sahadayım "başla"), if captured in time. */
  start_forecast: StartForecast | null;
}

/** I6: forecast captured on the device before the session (Sahadayım start / plan screen). */
export interface StartForecast {
  captured_at: string;
  model_version: string;
  species: string;
  hours: { hour: number; total: number | null; p10: number | null; p90: number | null; rank: number | null }[];
}
export const TARGETS = [...Object.keys(LEGAL_MIN_CM), 'diger'];
export const METHODS = ['lrf', 'spin', 'capari', 'diger'] as const;
/** Saved this long after the end without an explicit flag → retrospective. */
export const RETRO_H = 6;
/** A start forecast counts as prospective when captured no later than this after the start. */
export const PROSPECTIVE_GRACE_MIN = 15;

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
  const target = none(b.target_species) ? null : String(b.target_species).trim().toLocaleLowerCase('tr');
  if (!target || !TARGETS.includes(target)) return { ok: false, error: 'invalid_target_species' };
  if (!none(b.method) && !METHODS.includes(b.method as (typeof METHODS)[number])) return { ok: false, error: 'invalid_method' };
  if (!none(b.retro) && typeof b.retro !== 'boolean') return { ok: false, error: 'invalid_retro' };
  let startForecast: StartForecast | null = null;
  if (!none(b.start_forecast)) {
    const f = b.start_forecast as Partial<StartForecast>;
    const ok = f && typeof f === 'object' && typeof f.captured_at === 'string' && !Number.isNaN(Date.parse(f.captured_at)) && typeof f.model_version === 'string'
      && typeof f.species === 'string' && Array.isArray(f.hours) && f.hours.length <= 48 && f.hours.every((h) => h && Number.isInteger(h.hour));
    if (!ok) return { ok: false, error: 'invalid_start_forecast' };
    // only a forecast captured before (or right at) the start is prospective; a later one is just dropped
    if (Date.parse(f.captured_at!) <= start.getTime() + PROSPECTIVE_GRACE_MIN * 60_000) startForecast = f as StartForecast;
  }
  const zero = b.zero_catch === true;
  // "Sıfır av" is an explicit answer, not an empty form.
  if (zero && items.length) return { ok: false, error: 'zero_catch_with_items' };
  if (!zero && !items.length) return { ok: false, error: 'catch_or_zero_required' };
  const warnings = items
    .filter((i) => i.length_cm !== null && LEGAL_MIN_CM[i.species] !== undefined && i.length_cm < LEGAL_MIN_CM[i.species]!)
    .map((i) => `${String(i.length_cm).replace('.', ',')} cm ${i.species} yasal asgari boyun (${LEGAL_MIN_CM[i.species]} cm) altında — denize geri bırakın.`);
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
      target_species: target,
      method: none(b.method) ? null : (b.method as SessionInput['method']),
      retro: b.retro === true || (none(b.retro) && now.getTime() > end.getTime() + RETRO_H * HOUR),
      start_forecast: startForecast,
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

/** I6: model_json is written once. An edit keeps it unless the spot or the time span changed (then re-frozen and
 *  marked recomputed). A start forecast (captured before the session) makes it prospective ('dondurulmus'). */
async function saveSession(env: Env, id: string, v: SessionInput, now: Date, replace: boolean): Promise<{ freeze_status: string; missing: number; forecast_kind: string; refrozen: boolean }> {
  const prev = replace
    ? await env.DB.prepare('SELECT spot_id, start_at, end_at, model_json, freeze_status, forecast_kind, forecast_meta FROM catch_session WHERE id = ?1').bind(id).first<{ spot_id: string; start_at: string; end_at: string; model_json: string | null; freeze_status: string; forecast_kind: string; forecast_meta: string | null }>()
    : null;
  const keep = !!prev && prev.spot_id === v.spot_id && prev.start_at === v.start_at && prev.end_at === v.end_at && !v.start_forecast;
  let model: string | null;
  let status: string;
  let kind: string;
  let meta: string | null;
  let missing = 0;
  if (keep) {
    model = prev!.model_json;
    status = prev!.freeze_status;
    kind = prev!.forecast_kind;
    meta = prev!.forecast_meta;
  } else {
    const hours = sessionHours(v.start_at, v.end_at);
    const [hist, live] = await env.DB.batch([
      env.DB.prepare(`SELECT species, hour, json FROM spot_scores_v2_history WHERE spot_id = ?1 AND hour BETWEEN ?2 AND ?3`).bind(v.spot_id, hours[0], hours[hours.length - 1]),
      env.DB.prepare('SELECT species, model_version, start_hour, list_json FROM spot_scores_v2 WHERE spot_id = ?1').bind(v.spot_id),
    ]);
    // H3: the model output is frozen for every species (istavrit at the top level as before, others under `species`)
    const lives = live!.results as { species: string; model_version: string; start_hour: number; list_json: string }[];
    const frozen = (species: string) => {
      const l = lives.find((r) => r.species === species);
      const h = (hist!.results as { species: string; hour: number; json: string }[]).filter((r) => r.species === species);
      return freeze(hours, h, l ? { start_hour: l.start_hour, list: JSON.parse(l.list_json) as ListEntryV2[] } : null);
    };
    const f = frozen('istavrit');
    const others = Object.fromEntries(SPECIES.filter((s) => s !== 'istavrit').map((s) => [s, frozen(s)]));
    status = f.missing.length ? 'partial' : 'complete';
    missing = f.missing.length;
    model = JSON.stringify({ frozen_at: now.toISOString(), hours: f.hours, missing: f.missing, species: others, start_forecast: v.start_forecast });
    kind = v.start_forecast ? 'dondurulmus' : 'yeniden_hesaplanmis';
    meta = JSON.stringify(v.start_forecast
      ? { model_version: v.start_forecast.model_version, captured_at: v.start_forecast.captured_at, valid_hours: v.start_forecast.hours.map((h) => h.hour), species: v.start_forecast.species, sources: 'cihazda başlangıç tahmini' }
      : { model_version: lives.find((r) => r.species === 'istavrit')?.model_version ?? null, captured_at: now.toISOString(), valid_hours: hours, sources: 'kayıtlı saat çıktıları (history/forecast), sonradan alındı', refrozen_after_edit: !!prev });
  }
  await env.DB.batch([
    ...(replace ? [env.DB.prepare('DELETE FROM catch_item WHERE session_id = ?1').bind(id)] : []),
    env.DB.prepare(
      `INSERT INTO catch_session (id, spot_id, start_at, end_at, active_min, rods, jig_g, hook_no, lure_len_cm, lure_color, under_lamp, zero_catch, note, created_at, model_json, freeze_status,
         target_species, method, retro, forecast_kind, forecast_meta)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21)
       ON CONFLICT(id) DO UPDATE SET spot_id = excluded.spot_id, start_at = excluded.start_at, end_at = excluded.end_at, active_min = excluded.active_min,
       rods = excluded.rods, jig_g = excluded.jig_g, hook_no = excluded.hook_no, lure_len_cm = excluded.lure_len_cm, lure_color = excluded.lure_color,
       under_lamp = excluded.under_lamp, zero_catch = excluded.zero_catch, note = excluded.note, model_json = excluded.model_json, freeze_status = excluded.freeze_status,
       target_species = excluded.target_species, method = excluded.method, retro = excluded.retro, forecast_kind = excluded.forecast_kind, forecast_meta = excluded.forecast_meta`,
    ).bind(id, v.spot_id, v.start_at, v.end_at, v.active_min, v.rods, v.jig_g, v.hook_no, v.lure_len_cm, v.lure_color,
      v.under_lamp === null ? null : v.under_lamp ? 1 : 0, v.zero_catch ? 1 : 0, v.note, now.toISOString(), model, status,
      v.target_species, v.method, v.retro ? 1 : 0, kind, meta),
    ...v.items.map((i) => env.DB.prepare('INSERT INTO catch_item (session_id, species, count, length_cm) VALUES (?1, ?2, ?3, ?4)').bind(id, i.species, i.count, i.length_cm)),
  ]);
  return { freeze_status: status, missing, forecast_kind: kind, refrozen: !keep && !!prev };
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
    'zero_catch', 'target_species', 'method', 'retro', 'forecast_kind', 'species', 'count', 'length_cm', 'cpue_istavrit_per_h_rod', 'model_hours', 'model_sources', 'model_mean_total', 'model_mean_p10', 'model_mean_p90', 'model_mean_rank'];
  const rows = [head.join(',')];
  for (const { s, items } of sessions) {
    const m = s.model_json ? (JSON.parse(s.model_json as string) as { hours: FrozenHour[] }) : { hours: [] };
    const mean = (k: string) => {
      const v = m.hours.map((h) => h[k]).filter((x): x is number => typeof x === 'number');
      return v.length ? Math.round((v.reduce((a, x) => a + x, 0) / v.length) * 10) / 10 : null;
    };
    const base = [s.id, s.spot_id, s.spot_name, s.start_at, s.end_at, s.active_min, s.rods, s.jig_g, s.hook_no, s.lure_len_cm, s.lure_color, s.under_lamp, s.zero_catch, s.target_species, s.method, s.retro, s.forecast_kind];
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
