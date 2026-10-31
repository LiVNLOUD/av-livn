// G3: list and heat map layout helpers (pure). Structures first, beaches in one collapsible group; spots with the
// exact same score and band shown as one expandable row; tied ranks written out ("46.–63. eşit").

/** Group items whose signature is identical (null = never grouped). The group sits where its first member was. */
export function groupSame<T>(items: T[], sig: (t: T) => string | null, min = 2): (T | { group: T[]; sig: string })[] {
  const by = new Map<string, T[]>();
  for (const it of items) {
    const k = sig(it);
    if (k !== null) by.set(k, [...(by.get(k) ?? []), it]);
  }
  const out: (T | { group: T[]; sig: string })[] = [];
  const placed = new Set<string>();
  for (const it of items) {
    const k = sig(it);
    const g = k === null ? undefined : by.get(k);
    if (!g || g.length < min) out.push(it);
    else if (!placed.has(k!)) {
      placed.add(k!);
      out.push({ group: g, sig: k! });
    }
  }
  return out;
}

export const isGroup = <T>(x: T | { group: T[]; sig: string }): x is { group: T[]; sig: string } => typeof x === 'object' && x !== null && 'group' in x;

/** "46." or, when n spots share the rank, "46.–63. eşit" (competition ranking: ties share the lowest rank). */
export function rankLabel(rank: number, tied: number): string {
  return tied > 1 ? `${rank}.–${rank + tied - 1}. eşit` : `${rank}.`;
}

/** How many of the given ranks equal each rank. */
export function tieCounts(ranks: (number | null)[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const r of ranks) if (r !== null) m.set(r, (m.get(r) ?? 0) + 1);
  return m;
}

/** Structures (everything but beaches) first, then beaches; order inside each part is kept. */
export function splitBeaches<T extends { kind: string }>(items: T[]): { main: T[]; beaches: T[] } {
  return { main: items.filter((s) => s.kind !== 'beach'), beaches: items.filter((s) => s.kind === 'beach') };
}

/** Per-hour maximum over rows (null where every row is null). */
export function columnMax(rows: (number | null)[][], hours: number): (number | null)[] {
  return Array.from({ length: hours }, (_, c) => {
    const v = rows.map((r) => r[c]).filter((x): x is number => x !== null && x !== undefined);
    return v.length ? Math.max(...v) : null;
  });
}
