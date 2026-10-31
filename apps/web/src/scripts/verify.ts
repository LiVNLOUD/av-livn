// D6 forecast vs. actual: pure statistics over catch-log sessions and their frozen model output.
// Small samples are the rule here, so every figure carries n and a 95 % interval, and nothing is claimed
// below MIN_N (the page says "veri az").

export const MIN_N = 5;
export const BINS = [0, 40, 65, 80, 101] as const; // display bands (40/65) plus a top bin

export interface Session {
  id: string;
  spot_id: string;
  spot_name?: string;
  start_at: string;
  zero_catch: number | boolean;
  cpue: number; // istavrit / hour / rod
  model: { hours: { total?: unknown; p10?: unknown; p90?: unknown; rank?: unknown }[] } | null;
}

export interface Row {
  id: string;
  spot: string;
  start: string;
  day: string; // Europe/Istanbul date of the session start (an "evening" for rank pairs)
  cpue: number;
  zero: boolean;
  total: number | null;
  p10: number | null;
  p90: number | null;
  rank: number | null;
  hours: number;
}

const mean = (v: number[]) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : null);
const nums = (v: unknown[]) => v.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
const r1 = (x: number | null) => (x === null ? null : Math.round(x * 10) / 10);

export function rows(sessions: Session[]): Row[] {
  return sessions.map((s) => {
    const h = s.model?.hours ?? [];
    const m = (k: 'total' | 'p10' | 'p90' | 'rank') => r1(mean(nums(h.map((x) => x[k]))));
    const t = Date.parse(s.start_at);
    const day = Number.isNaN(t) ? '' : new Date(t + 3 * 3_600_000).toISOString().slice(0, 10);
    return { id: s.id, spot: s.spot_name ?? s.spot_id, start: s.start_at, day, cpue: s.cpue, zero: s.zero_catch === 1 || s.zero_catch === true || s.cpue === 0, total: m('total'), p10: m('p10'), p90: m('p90'), rank: m('rank'), hours: h.length };
  });
}

/** Mean with a t-based 95 % interval (normal 1.96 from n ≥ 30); null interval below n = 2. */
export function meanCI(v: number[]): { n: number; mean: number | null; lo: number | null; hi: number | null } {
  const n = v.length;
  const m = mean(v);
  if (n < 2 || m === null) return { n, mean: m, lo: null, hi: null };
  const sd = Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1));
  const T = [12.71, 4.3, 3.18, 2.78, 2.57, 2.45, 2.36, 2.31, 2.26, 2.23, 2.2, 2.18, 2.16, 2.14, 2.13, 2.12, 2.11, 2.1, 2.09, 2.09, 2.08, 2.07, 2.07, 2.06, 2.06, 2.06, 2.05, 2.05, 2.05];
  const t = n - 1 <= T.length ? T[n - 2]! : 1.96;
  const half = (t * sd) / Math.sqrt(n);
  return { n, mean: m, lo: Math.max(0, m - half), hi: m + half };
}

/** Wilson 95 % interval for k successes in n trials. */
export function wilson(k: number, n: number): { n: number; p: number | null; lo: number | null; hi: number | null } {
  if (n === 0) return { n, p: null, lo: null, hi: null };
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { n, p, lo: Math.max(0, c - h), hi: Math.min(1, c + h) };
}

export interface BinStat {
  lo: number;
  hi: number;
  cpue: ReturnType<typeof meanCI>;
  zero: ReturnType<typeof wilson>;
}

/** Per score bin (session mean of the frozen hourly score): mean CPUE and zero-catch rate. */
export function byBin(r: Row[], bins: readonly number[] = BINS): BinStat[] {
  const out: BinStat[] = [];
  for (let i = 0; i < bins.length - 1; i++) {
    const lo = bins[i]!;
    const hi = bins[i + 1]!;
    const inBin = r.filter((x) => x.total !== null && x.total >= lo && x.total < hi);
    out.push({ lo, hi: Math.min(hi, 100), cpue: meanCI(inBin.map((x) => x.cpue)), zero: wilson(inBin.filter((x) => x.zero).length, inBin.length) });
  }
  return out;
}

/**
 * Rank accuracy: every pair of sessions at two different spots on the same evening (same local date) whose
 * frozen ranks differ and whose CPUE differs. Hit = the better-ranked spot caught more per hour per rod.
 */
export function rankPairs(r: Row[]): { pairs: { a: Row; b: Row; hit: boolean }[]; acc: ReturnType<typeof wilson> } {
  const pairs: { a: Row; b: Row; hit: boolean }[] = [];
  for (let i = 0; i < r.length; i++)
    for (let j = i + 1; j < r.length; j++) {
      const a = r[i]!;
      const b = r[j]!;
      if (!a.day || a.day !== b.day || a.spot === b.spot || a.rank === null || b.rank === null || a.rank === b.rank || a.cpue === b.cpue) continue;
      const better = a.rank < b.rank ? a : b;
      const worse = better === a ? b : a;
      pairs.push({ a: better, b: worse, hit: better.cpue > worse.cpue });
    }
  return { pairs, acc: wilson(pairs.filter((p) => p.hit).length, pairs.length) };
}
