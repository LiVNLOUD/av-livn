// Best fishing windows (E3). Per spot and local calendar day: the peak hour, widened to the contiguous hours
// whose score stays above max(floor, peak − DROP), at most MAX_LEN hours. The list shows each spot once.
// Pure; used by /api/windows (home page) and the notification job.
import { dataTier, missingNote } from '@av-livn/scoring';
import type { ListEntryV2 } from '../precompute_v2';

export interface SpotHours {
  id: string;
  name: string;
  start_hour: number; // epoch hours of list[0]
  list: ListEntryV2[];
  /** I2: access estimate (acik / belirsiz / kisitli_feribot); windows use the same filter as the list. */
  access?: string | null;
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
  /** Plain-language part of the reason (source/evidence stripped). */
  why: string | null;
  /** The main reason rests on a C-level assumption. */
  assumed: boolean;
  /** I2: 'guclu' = peak ≥ WINDOW_GOOD with complete data; 'goreli' = best of what there is (lowered floor or
   *  missing current/turbidity). Hours without wind/wave data are never part of a window. */
  tier: 'guclu' | 'goreli';
  /** Missing-data note for the peak hour, or null; `data` is its tier (v2/data.ts). */
  missing: string | null;
  data: 'tam' | 'goreli';
  access: string | null;
}

export const WINDOW_GOOD = 65;
export const DROP = 8;
export const MAX_LEN = 4;
const TZ = 3; // Europe/Istanbul

const ok = (e: ListEntryV2 | undefined): e is ListEntryV2 => !!e && e[0] !== null && e[4] === 0 && dataTier(e[7] ?? 0) !== 'yok';
const localDay = (h: number) => Math.floor((h + TZ) / 24);

export function plainReason(reason: string | null): { why: string | null; assumed: boolean } {
  if (!reason) return { why: null, assumed: false };
  const assumed = /varsayım|kanıt C|\(C\)/.test(reason);
  const why = reason.split(' — ')[0]!.replace(/^Öne çıkaran: /, '').replace(/^Geri çeken: /, 'zayıf yanı: ');
  return { why: why.charAt(0).toLocaleUpperCase('tr') + why.slice(1), assumed };
}

/** Window around the peak of one spot within [a, b): grow towards the better neighbour while ≥ floor. */
function around(s: SpotHours, a: number, b: number, floor: number): Window | null {
  const at = (h: number) => s.list[h - s.start_hour];
  let peak = -1;
  for (let h = a; h < b; h++) {
    const e = at(h);
    if (ok(e) && (peak < 0 || e[0]! > at(peak)![0]!)) peak = h;
  }
  if (peak < 0) return null;
  const pe = at(peak)!;
  const cut = Math.max(floor, pe[0]! - DROP);
  if (pe[0]! < cut) return null;
  let start = peak;
  let end = peak + 1;
  const good = (h: number) => h >= a && h < b && ok(at(h)) && at(h)![0]! >= cut;
  while (end - start < MAX_LEN) {
    const l = good(start - 1) ? at(start - 1)![0]! : -1;
    const r = good(end) ? at(end)![0]! : -1;
    if (l < 0 && r < 0) break;
    if (r >= l) end++;
    else start--;
  }
  const reason = pe[6]?.[2] ?? null;
  const mask = pe[7] ?? 0;
  const data = dataTier(mask) === 'tam' ? 'tam' : 'goreli'; // 'yok' hours never reach here (ok())
  const tier = pe[0]! >= WINDOW_GOOD && data === 'tam' ? 'guclu' : 'goreli';
  return { spot_id: s.id, name: s.name, start, end, peak, total: pe[0]!, p10: pe[1], p90: pe[2], rank: pe[3], reason, ...plainReason(reason), tier, missing: missingNote(mask), data, access: s.access ?? null };
}

/**
 * Candidate windows: one per spot per local day in [from, from + hours), peak ≥ floor. Sorted by peak score,
 * then earlier start; `perSpot` windows per spot at most (1 = each spot once), `n` in total. When fewer than
 * `n` reach WINDOW_GOOD the floor falls to the 85th percentile of all hours (the page always compares) and
 * those windows are marked `goreli` — the page then says "no strong option". `openOnly` keeps only spots
 * whose access is 'acik' (the list's "hide uncertain/restricted access" filter).
 */
export function bestWindows(spots: SpotHours[], from: number, hours = 72, opts: { n?: number; perSpot?: number; threshold?: number; openOnly?: boolean } = {}): { threshold: number; strong: number; windows: Window[] } {
  if (opts.openOnly) spots = spots.filter((s) => s.access === 'acik');
  const n = opts.n ?? 5;
  const perSpot = opts.perSpot ?? 1;
  const end = from + hours;
  const build = (floor: number) => {
    const out: Window[] = [];
    for (const s of spots) {
      for (let d = localDay(from); d <= localDay(end - 1); d++) {
        const a = Math.max(from, d * 24 - TZ);
        const b = Math.min(end, (d + 1) * 24 - TZ);
        const w = around(s, a, b, floor);
        if (w && w.total >= floor) out.push(w);
      }
    }
    out.sort((x, y) => y.total - x.total || x.start - y.start);
    const count = new Map<string, number>();
    return out.filter((w) => {
      const c = count.get(w.spot_id) ?? 0;
      if (c >= perSpot) return false;
      count.set(w.spot_id, c + 1);
      return true;
    });
  };
  let threshold = opts.threshold ?? WINDOW_GOOD;
  let all = build(threshold);
  if (opts.threshold === undefined && all.length < n) {
    const vals = spots
      .flatMap((s) => Array.from({ length: hours }, (_, i) => s.list[from + i - s.start_hour]).filter(ok).map((e) => e[0]!))
      .sort((a, b) => a - b);
    if (vals.length) {
      threshold = Math.min(threshold, vals[Math.floor(vals.length * 0.85)]!);
      all = build(threshold);
    }
  }
  const windows = all.slice(0, n);
  return { threshold, strong: windows.filter((w) => w.tier === 'guclu').length, windows };
}
