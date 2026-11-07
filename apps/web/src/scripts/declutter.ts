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
  /** N4: settlements merged into this badge (the first one names it); one entry when not merged. */
  places?: string[];
}

/** Text shown on a badge: "Armutlu · 26 mera", or for merged neighbours "Mudanya çevresi · 14 mera". */
export const badgeLabel = (b: PlaceBadge) => `${b.place}${(b.places?.length ?? 1) > 1 ? ' çevresi' : ''} · ${b.count} mera`;
/** Approximate on-screen size of a badge label (12 px bold text + pill padding). */
export const badgeSize = (b: PlaceBadge): [number, number] => [7 * badgeLabel(b).length + 14, 22];

/**
 * N4: neighbouring settlements whose badges overlap on screen are merged into one ("… çevresi"), repeatedly until
 * no two overlap; counts add up, ids join, best score kept, position = count-weighted mean. Named after the
 * settlement with the most spots. The click list still shows every spot.
 */
export function mergeBadges(badges: PlaceBadge[], toPx: (lon: number, lat: number) => { x: number; y: number }, size = badgeSize, pad = 4): PlaceBadge[] {
  let out = badges.map((b) => ({ ...b, places: b.places ?? [b.place] }));
  for (;;) {
    let hit: [number, number] | null = null;
    for (let i = 0; i < out.length && !hit; i++)
      for (let j = i + 1; j < out.length && !hit; j++) {
        const a = out[i]!, b = out[j]!;
        const pa = toPx(a.lon, a.lat), pb = toPx(b.lon, b.lat);
        const [wa, ha] = size(a), [wb, hb] = size(b);
        if (Math.abs(pa.x - pb.x) < (wa + wb) / 2 + pad && Math.abs(pa.y - pb.y) < (ha + hb) / 2 + pad) hit = [i, j];
      }
    if (!hit) return out;
    const [a, b] = [out[hit[0]]!, out[hit[1]]!];
    const [big, small] = a.count >= b.count ? [a, b] : [b, a];
    const n = a.count + b.count;
    const best = a.best === null ? b.best : b.best === null ? a.best : Math.max(a.best, b.best);
    const merged: PlaceBadge & { places: string[] } = {
      place: big.place, places: [...big.places, ...small.places], ids: [...big.ids, ...small.ids], count: n, best,
      lon: (a.lon * a.count + b.lon * b.count) / n, lat: (a.lat * a.count + b.lat * b.count) / n,
    };
    out = [...out.filter((_, k) => k !== hit![0] && k !== hit![1]), merged];
  }
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
