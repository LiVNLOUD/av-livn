// F0: owner-editable tackle profiles (D1 meta.tackle_profiles); defaults = the two sets in docs/TACKLE.md.
import { DEFAULT_PROFILES, type TackleProfile } from '@av-livn/scoring';

export function parseProfiles(json: string | null | undefined): TackleProfile[] {
  if (!json) return DEFAULT_PROFILES;
  try {
    const v = validateProfiles(JSON.parse(json));
    return v.ok ? v.value : DEFAULT_PROFILES;
  } catch {
    return DEFAULT_PROFILES;
  }
}

export function validateProfiles(b: unknown): { ok: true; value: TackleProfile[] } | { ok: false; error: string } {
  if (!Array.isArray(b) || b.length !== 2) return { ok: false, error: 'two_profiles_required' };
  const out: TackleProfile[] = [];
  for (const id of ['lrf', 'spin'] as const) {
    const p = (b as Record<string, unknown>[]).find((x) => x && x.id === id);
    if (!p) return { ok: false, error: `missing_${id}` };
    const num = (x: unknown, lo: number, hi: number) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
    if (typeof p.name !== 'string' || p.name.trim().length < 2 || p.name.length > 120) return { ok: false, error: `invalid_${id}_name` };
    if (!num(p.jigMin, 0.1, 100) || !num(p.jigMax, 0.1, 100) || (p.jigMin as number) > (p.jigMax as number)) return { ok: false, error: `invalid_${id}_jig` };
    if (!num(p.maxGustKmh, 5, 120)) return { ok: false, error: `invalid_${id}_gust` };
    if (typeof p.line !== 'string' || p.line.length > 120) return { ok: false, error: `invalid_${id}_line` };
    out.push({ id, name: p.name.trim(), jigMin: p.jigMin as number, jigMax: p.jigMax as number, maxGustKmh: p.maxGustKmh as number, line: p.line.trim() });
  }
  return { ok: true, value: out };
}
