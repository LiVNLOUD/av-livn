// Best fishing windows: contiguous hours per spot where the v2 score stays high. Pure; used by the public
// /api/windows endpoint (D2 home page) and by the notification job (D9).
import type { ListEntryV2 } from '../precompute_v2';

export interface SpotHours {
  id: string;
  name: string;
  start_hour: number; // epoch hours of list[0]
  list: ListEntryV2[];
}

export interface Window {
  spot_id: string;
  name: string;
  start: number; // epoch hour, inclusive
  end: number; // epoch hour, exclusive
  peak: number; // epoch hour of the best score
  total: number;
  p10: number | null;
  p90: number | null;
  rank: number;
  reason: string | null;
}

export const WINDOW_GOOD = 65;

/**
 * Runs of minLen–maxLen hours with score ≥ threshold (not gated) in [from, from + hours). When fewer than `n` runs
 * reach WINDOW_GOOD the threshold falls to the 85th percentile of all hours, so the page always has something
 * to compare. Sorted by peak score, at most `perSpot` windows per spot, `n` in total.
 */
export function bestWindows(spots: SpotHours[], from: number, hours = 72, opts: { n?: number; perSpot?: number; threshold?: number; minLen?: number; maxLen?: number } = {}): { threshold: number; windows: Window[] } {
  const n = opts.n ?? 5;
  const perSpot = opts.perSpot ?? 2;
  const minLen = opts.minLen ?? 1;
  const maxLen = opts.maxLen ?? 12; // a long good stretch is split: a window is one outing, not a weekend
  const at = (s: SpotHours, h: number) => s.list[h - s.start_hour];
  const ok = (e: ListEntryV2 | undefined): e is ListEntryV2 => !!e && e[0] !== null && e[4] === 0;
  const runs = (thr: number) => {
    const out: Window[] = [];
    for (const s of spots) {
      let cur: Window | null = null;
      for (let h = from; h <= from + hours; h++) {
        const e = h < from + hours ? at(s, h) : undefined;
        if (cur && cur.end - cur.start >= maxLen) {
          out.push(cur);
          cur = null;
        }
        if (ok(e) && e[0]! >= thr) {
          if (!cur) cur = { spot_id: s.id, name: s.name, start: h, end: h + 1, peak: h, total: e[0]!, p10: e[1], p90: e[2], rank: e[3], reason: e[6]?.[2] ?? null };
          else {
            cur.end = h + 1;
            if (e[0]! > cur.total) Object.assign(cur, { peak: h, total: e[0]!, p10: e[1], p90: e[2], rank: e[3], reason: e[6]?.[2] ?? null });
          }
        } else if (cur) {
          if (cur.end - cur.start >= minLen) out.push(cur);
          cur = null;
        }
      }
    }
    return out;
  };
  let threshold = opts.threshold ?? WINDOW_GOOD;
  let all = runs(threshold);
  if (opts.threshold === undefined && all.length < n) {
    const vals = spots.flatMap((s) => Array.from({ length: hours }, (_, i) => at(s, from + i)).filter(ok).map((e) => e[0]!)).sort((a, b) => a - b);
    if (vals.length) {
      threshold = Math.min(threshold, vals[Math.floor(vals.length * 0.85)]!);
      all = runs(threshold);
    }
  }
  all.sort((a, b) => b.total - a.total || a.start - b.start);
  const count = new Map<string, number>();
  const windows = all.filter((w) => {
    const c = count.get(w.spot_id) ?? 0;
    if (c >= perSpot) return false;
    count.set(w.spot_id, c + 1);
    return true;
  });
  return { threshold, windows: windows.slice(0, n) };
}
