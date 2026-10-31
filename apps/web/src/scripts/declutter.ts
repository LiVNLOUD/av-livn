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

/** Displayed positions (same order as input). Groups larger than `maxGroup` are left in place (G5: spread only
 * small groups at close zoom). */
export function declutter(pts: Pt[], min: number, maxGroup = Infinity): Pt[] {
  const out = pts.map((p) => ({ ...p }));
  for (const g of groups(pts, min)) {
    if (g.length < 2 || g.length > maxGroup) continue;
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

/** G5: at far zoom, spots of one settlement are drawn as one badge (visual only, the data is not merged). */
export interface PlaceSpot {
  id: string;
  place: string | null;
  lon: number;
  lat: number;
  total: number | null;
}
export interface PlaceBadge {
  place: string;
  ids: string[];
  count: number;
  best: number | null;
  lon: number;
  lat: number;
}

/** Badge key: the main settlement ("Güzelyalı Siteler", "Güzelyalı Burgaz" → "Güzelyalı"), so neighbouring
 * quarters do not stack badges on top of each other. */
export const settlementKey = (place: string) => place.trim().split(/\s+/)[0]!.replace(/[.,]$/, '');

/** Badges for settlements with at least `min` spots; the other spots stay single. Badge at the mean position. */
export function placeBadges(spots: PlaceSpot[], min = 2): { badges: PlaceBadge[]; single: string[] } {
  const by = new Map<string, PlaceSpot[]>();
  const single: string[] = [];
  for (const s of spots) {
    if (!s.place) single.push(s.id);
    else by.set(settlementKey(s.place), [...(by.get(settlementKey(s.place)) ?? []), s]);
  }
  const badges: PlaceBadge[] = [];
  for (const [place, g] of by) {
    if (g.length < min) {
      single.push(...g.map((s) => s.id));
      continue;
    }
    const scores = g.map((s) => s.total).filter((t): t is number => t !== null);
    badges.push({
      place, ids: g.map((s) => s.id), count: g.length, best: scores.length ? Math.max(...scores) : null,
      lon: g.reduce((a, s) => a + s.lon, 0) / g.length, lat: g.reduce((a, s) => a + s.lat, 0) / g.length,
    });
  }
  badges.sort((a, b) => b.count - a.count || a.place.localeCompare(b.place, 'tr'));
  return { badges, single };
}
