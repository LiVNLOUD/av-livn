// Public list/hours/windows bodies as pure functions of the stored rows. The Worker builds them live as a
// fallback; the score job (scripts/score-job.ts) builds them once per hour and stores the JSON text in meta
// (`pub:<kind>:<species>:<epoch hour>`), so the default requests cost one row read instead of parsing every list_json
// (Phase F: 63 spots pushed live parsing over the ~10 ms CPU budget).
import { ACTIVE, publicSpot, type SpotRow } from './spots';
import { dataTier, missingNote } from '@av-livn/scoring';
import { bestWindows } from './windows';
import type { ListEntryV2 } from '../precompute_v2';

const HOUR = 3_600_000;

// ?1 = species (H3)
export const LIST_SQL = `SELECT s.*, v.start_hour, v.list_json, v.model_version, v.computed_at AS scored_at, v.partial FROM spots s
       LEFT JOIN spot_scores_v2 v ON v.spot_id = s.id AND v.species = ?1 WHERE s.${ACTIVE}`;
export const HOURS_SQL = `SELECT s.*, v.start_hour, v.list_json, v.computed_at AS scored_at FROM spots s JOIN spot_scores_v2 v ON v.spot_id = s.id AND v.species = ?1 WHERE s.${ACTIVE}`;
export const WINDOWS_SQL = `SELECT s.id, s.name, s.access, v.start_hour, v.list_json FROM spots s JOIN spot_scores_v2 v ON v.spot_id = s.id AND v.species = ?1 WHERE s.${ACTIVE}`;
export const FETCHED_SQL = 'SELECT max(fetched_at) AS at FROM forecast_snapshots';
export const PRE_KINDS = ['list', 'hours', 'windows'] as const;
export const preKey = (kind: (typeof PRE_KINDS)[number], hour: number, species = 'istavrit') => `pub:${kind}:${species}:${hour}`;
/** Any change to which spots are public (hide, forbidden area, edit, rescore) drops the stored bodies. */
export const CLEAR_PRE_SQL = "DELETE FROM meta WHERE key LIKE 'pub:%'";

export type ListRow = SpotRow & { start_hour: number | null; list_json: string | null; model_version: string | null; partial: number | null; scored_at: string | null };
export type HoursRow = SpotRow & { start_hour: number; list_json: string; scored_at: string };
export type WindowsRow = { id: string; name: string; access?: string | null; start_hour: number; list_json: string };

export const fetchedAt = (r: unknown[]) => (r[0] as { at: string | null } | undefined)?.at ?? null;

export function listBody(all: ListRow[], dataFetchedAt: string | null, nowHour: number, species = 'istavrit') {
  const spots = all.map((r) => {
    const e = r.list_json && r.start_hour !== null ? (JSON.parse(r.list_json) as ListEntryV2[])[nowHour - r.start_hour] : undefined;
    return {
      ...publicSpot(r),
      score: e
        ? { total: e[0], p10: e[1], p90: e[2], rank: e[3], gated: e[4] === 1, warnings: e[5] ? [e[5]] : [], partial: r.partial === 1, reason: e[6]?.[2] ?? null,
            data: dataTier(e[7] ?? 0), missing: missingNote(e[7] ?? 0), top3: e[8] ?? null }
        : { total: null, p10: null, p90: null, rank: null, gated: false, warnings: [], partial: false, reason: null, data: null, missing: null, top3: null },
    };
  });
  spots.sort((a, b) => (b.score.total ?? -1) - (a.score.total ?? -1) || a.name.localeCompare(b.name, 'tr'));
  const version = all.find((r) => r.model_version)?.model_version ?? null;
  const scored = all.reduce<string | null>((m, r) => (r.scored_at && (m === null || r.scored_at > m) ? r.scored_at : m), null);
  return { ok: true, species, model: version, at: new Date(nowHour * HOUR).toISOString(), data_fetched_at: dataFetchedAt, scored_at: scored, count: spots.length, spots };
}

/** Per active spot the next 72 h: score (rounded), band width (p90 − p10) and gated hours. */
export function hoursBody(all: HoursRow[], dataFetchedAt: string | null, from: number, species = 'istavrit') {
  const spots = all.map((r) => {
    const list = JSON.parse(r.list_json) as ListEntryV2[];
    const t: (number | null)[] = [];
    const w: (number | null)[] = [];
    const g: number[] = [];
    for (let i = 0; i < 72; i++) {
      const e = list[from + i - r.start_hour];
      t.push(e && e[0] !== null ? Math.round(e[0]) : null);
      w.push(e && e[1] !== null && e[2] !== null ? Math.round(e[2] - e[1]) : null);
      if (e && e[4] === 1) g.push(i);
    }
    const p = publicSpot(r);
    return { id: p.id, name: p.name, kind: p.kind, place: p.place, access: p.access, status: p.status, lat: p.lat, lon: p.lon, t, w, g };
  });
  const scored = all.reduce<string | null>((m, r) => (m === null || r.scored_at > m ? r.scored_at : m), null);
  return { ok: true, species, from: new Date(from * HOUR).toISOString(), hours: 72, scored_at: scored, data_fetched_at: dataFetchedAt, spots };
}

/** Best windows for all spots and, separately, for open-access spots only (I2: the list's access filter applies
 *  here too, computed server-side so a filtered list is never just the unfiltered top 5 minus the closed ones). */
export function windowsBody(rows: WindowsRow[], from: number, hours: number, species = 'istavrit') {
  const spots = rows.map((r) => ({ id: r.id, name: r.name, access: r.access ?? null, start_hour: r.start_hour, list: JSON.parse(r.list_json) as ListEntryV2[] }));
  const iso = (h: number) => new Date(h * HOUR).toISOString();
  const out = (b: ReturnType<typeof bestWindows>) => ({ threshold: b.threshold, strong: b.strong, windows: b.windows.map((w) => ({ ...w, start: iso(w.start), end: iso(w.end), peak: iso(w.peak) })) });
  const all = out(bestWindows(spots, from, hours));
  // I9: "today" = from now until 06:00 local tomorrow (tonight included), for the home page's first question
  const lh = (from + 3) % 24;
  const todayH = lh >= 6 ? 24 - lh + 6 : 6 - lh;
  const today = { all: out(bestWindows(spots, from, todayH, { n: 3 })), open: out(bestWindows(spots, from, todayH, { n: 3, openOnly: true })), hours: todayH };
  return { ok: true, species, from: iso(from), hours, ...all, open: out(bestWindows(spots, from, hours, { openOnly: true })), today };
}

/** Bodies for the given hours, as [meta key, JSON text] rows (score job). */
export function preBodies(list: ListRow[], hoursRows: HoursRow[], win: WindowsRow[], dataFetchedAt: string | null, hours: number[], species = 'istavrit'): [string, string][] {
  return hours.flatMap((h) => [
    [preKey('list', h, species), JSON.stringify(listBody(list, dataFetchedAt, h, species))],
    [preKey('hours', h, species), JSON.stringify(hoursBody(hoursRows, dataFetchedAt, h, species))],
    [preKey('windows', h, species), JSON.stringify(windowsBody(win, h, 72, species))],
  ] as [string, string][]);
}
