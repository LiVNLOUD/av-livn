// Marker declutter without clustering: markers closer than `min` px on screen are spread on a ring around
// their group's centre (chord between neighbours = min); every spot stays visible, a leader line joins the
// shown marker to its true position. Recomputed on every zoom, so markers rejoin as you zoom in.

export interface Pt {
  x: number;
  y: number;
}

export function groups(pts: Pt[], min: number): number[][] {
  const parent = pts.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  for (let i = 0; i < pts.length; i++)
    for (let j = i + 1; j < pts.length; j++) if (Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y) < min) parent[find(i)] = find(j);
  const out = new Map<number, number[]>();
  pts.forEach((_, i) => out.set(find(i), [...(out.get(find(i)) ?? []), i]));
  return [...out.values()];
}

/** Displayed positions (same order as input). */
export function declutter(pts: Pt[], min: number): Pt[] {
  const out = pts.map((p) => ({ ...p }));
  for (const g of groups(pts, min)) {
    if (g.length < 2) continue;
    const c = { x: g.reduce((a, i) => a + pts[i]!.x, 0) / g.length, y: g.reduce((a, i) => a + pts[i]!.y, 0) / g.length };
    const r = min / (2 * Math.sin(Math.PI / g.length));
    // Keep each marker on the side it really lies (angle around the centre), ties by input order.
    const order = [...g].sort((a, b) => Math.atan2(pts[a]!.y - c.y, pts[a]!.x - c.x) - Math.atan2(pts[b]!.y - c.y, pts[b]!.x - c.x) || a - b);
    const a0 = Math.atan2(pts[order[0]!]!.y - c.y, pts[order[0]!]!.x - c.x) || -Math.PI / 2;
    order.forEach((i, k) => {
      const a = a0 + (2 * Math.PI * k) / g.length;
      out[i] = { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) };
    });
  }
  return out;
}
