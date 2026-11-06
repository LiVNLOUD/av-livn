// M2: the visitor's own tackle, stored on this device only (Ayarlar → Takımım). Optional; without it every
// suggestion uses the generic, brand-free classes (DEFAULT_PROFILES). Nothing here is sent to the server.
import { DEFAULT_PROFILES, type TackleProfile } from '@av-livn/scoring';

export const MY_TACKLE_KEY = 'av-livn-my-tackle';
export interface MySet { min: number; max: number; line: string; leader: string }
export interface MyTackle { light: MySet | null; heavy: MySet | null }

const num = (x: unknown, lo: number, hi: number): x is number => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
const str = (x: unknown) => (typeof x === 'string' ? x.trim().slice(0, 60) : '');

function cleanSet(x: unknown): MySet | null {
  const o = x as Record<string, unknown> | null;
  if (!o || typeof o !== 'object' || !num(o.min, 0.1, 100) || !num(o.max, 0.1, 100) || o.min > o.max) return null;
  return { min: o.min, max: o.max, line: str(o.line), leader: str(o.leader) };
}

/** Parse what is stored; anything invalid counts as "not set". */
export function parseMy(json: string | null | undefined): MyTackle | null {
  if (!json) return null;
  try {
    const o = JSON.parse(json) as Record<string, unknown>;
    const m = { light: cleanSet(o.light), heavy: cleanSet(o.heavy) };
    return m.light || m.heavy ? m : null;
  } catch {
    return null;
  }
}

const lineOf = (s: MySet, fallback: string) => [s.line, s.leader].filter(Boolean).join(' + ') || fallback;

/** Profiles for the tackle engine: the device's sets where given, the generic classes otherwise. */
export function toProfiles(my: MyTackle | null): { profiles: TackleProfile[]; personal: { lrf: boolean; spin: boolean } } {
  const [lrf, spin] = DEFAULT_PROFILES as [TackleProfile, TackleProfile];
  const l = my?.light ?? null;
  const h = my?.heavy ?? null;
  return {
    profiles: [
      l ? { ...lrf, name: `Senin hafif takımın (${fmtG(l.min)}–${fmtG(l.max)} g)`, jigMin: l.min, jigMax: l.max, line: lineOf(l, lrf.line) } : lrf,
      h ? { ...spin, name: `Senin ağır takımın (${fmtG(h.min)}–${fmtG(h.max)} g)`, jigMin: h.min, jigMax: h.max, line: lineOf(h, spin.line) } : spin,
    ],
    personal: { lrf: !!l, spin: !!h },
  };
}

export const fmtG = (g: number) => String(g).replace('.', ',');

/** Moving the owner's server-side set (pre-M2) to this device: line "A + B" → line A, leader B. */
export function fromServer(profiles: TackleProfile[]): MyTackle {
  const set = (p: TackleProfile | undefined): MySet | null => {
    if (!p) return null;
    const [line = '', ...rest] = p.line.split(' + ');
    return { min: p.jigMin, max: p.jigMax, line: line.trim(), leader: rest.join(' + ').trim() };
  };
  return { light: set(profiles.find((p) => p.id === 'lrf')), heavy: set(profiles.find((p) => p.id === 'spin')) };
}

/** The plan's one-line tackle with the device's set named instead of the generic class. */
export function personalLine(line: string, profile: 'lrf' | 'spin', personal: { lrf: boolean; spin: boolean }): string {
  if (!personal[profile]) return line;
  return line.replace(/^[^·]+·/, `${profile === 'lrf' ? 'Hafif takımın' : 'Ağır takımın'} ·`);
}

export function loadMy(): MyTackle | null {
  try { return parseMy(localStorage.getItem(MY_TACKLE_KEY)); } catch { return null; }
}
export function saveMy(m: MyTackle | null): void {
  try {
    if (m && (m.light || m.heavy)) localStorage.setItem(MY_TACKLE_KEY, JSON.stringify(m));
    else localStorage.removeItem(MY_TACKLE_KEY);
  } catch {}
}
