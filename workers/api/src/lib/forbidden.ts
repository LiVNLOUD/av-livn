// F1: owner-drawn forbidden areas. Pure helpers: point-in-polygon and which spots to hide/unhide; the Worker
// applies them when an area is saved or deleted, and the scoring job re-applies them every run.

export type Ring = [number, number][]; // [lon, lat]
export interface Area { id: string; name: string; ring: Ring }
export interface SpotPos { id: string; lat: number; lon: number; hidden_reason: string | null }

/** Ray casting; the ring may be open or closed. */
export function inside(lon: number, lat: number, ring: Ring): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Spots to hide (inside an area, not hidden yet) and to unhide (hidden by an area that no longer covers them). Owner-hidden spots are left alone. */
export function forbiddenUpdates(areas: Area[], spots: SpotPos[]): { hide: string[]; unhide: string[] } {
  const hide: string[] = [];
  const unhide: string[] = [];
  for (const s of spots) {
    const inAny = areas.some((a) => inside(s.lon, s.lat, a.ring));
    if (inAny && s.hidden_reason === null) hide.push(s.id);
    else if (!inAny && s.hidden_reason === 'forbidden') unhide.push(s.id);
  }
  return { hide, unhide };
}

export function validateArea(b: unknown): { ok: true; name: string; ring: Ring } | { ok: false; error: string } {
  const o = b as { name?: unknown; ring?: unknown } | null;
  if (!o || typeof o.name !== 'string' || o.name.trim().length < 2 || o.name.length > 80) return { ok: false, error: 'invalid_name' };
  const r = o.ring;
  if (!Array.isArray(r) || r.length < 3 || r.length > 200) return { ok: false, error: 'invalid_ring' };
  for (const p of r) {
    if (!Array.isArray(p) || p.length !== 2 || typeof p[0] !== 'number' || typeof p[1] !== 'number' || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90) return { ok: false, error: 'invalid_ring' };
  }
  return { ok: true, name: o.name.trim(), ring: r as Ring };
}

export const parseArea = (row: { id: string; name: string; geojson: string }): Area => ({ id: row.id, name: row.name, ring: (JSON.parse(row.geojson) as { coordinates: Ring[] }).coordinates[0]! });
