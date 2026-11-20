// M2: the visitor's own tackle, stored on this device only (Ayarlar → Takımım). Optional; without it every
// suggestion uses the generic, brand-free classes (DEFAULT_PROFILES). Nothing here is sent to the server.
import { DEFAULT_PROFILES, type Bait, type Gear, type Mode, type TackleProfile } from '@av-livn/scoring';

export const MY_TACKLE_KEY = 'av-livn-my-tackle';
export interface MySet { min: number; max: number; line: string; leader: string }
/** V2.3: what the angler owns (on this device only). Lists are sizes they have; an empty list means "none". */
export interface MyGear {
  jighead: number[]; // g
  silikon: number[]; // cm
  mikroJig: number[]; // g
  kursun: number[]; // g (dropshot and bottom sinkers)
  igne: number[]; // hook no
  samandira: boolean;
  capari: boolean;
  baits: Bait[];
}
export interface MyTackle { light: MySet | null; heavy: MySet | null; mode?: Mode; gear?: MyGear | null }

export const GEAR_OPTIONS = {
  jighead: [0.5, 0.8, 1, 1.5, 2, 3, 5],
  silikon: [3, 4, 5, 6],
  mikroJig: [5, 7, 10, 15],
  kursun: [5, 10, 20, 30, 40],
  igne: [6, 8, 10],
} as const;
export const BAITS: Bait[] = ['hamsi', 'karides', 'midye'];
const MODES: Mode[] = ['suni', 'dogal', 'hepsi'];

const num = (x: unknown, lo: number, hi: number): x is number => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
const str = (x: unknown) => (typeof x === 'string' ? x.trim().slice(0, 60) : '');

function cleanSet(x: unknown): MySet | null {
  const o = x as Record<string, unknown> | null;
  if (!o || typeof o !== 'object' || !num(o.min, 0.1, 100) || !num(o.max, 0.1, 100) || o.min > o.max) return null;
  return { min: o.min, max: o.max, line: str(o.line), leader: str(o.leader) };
}

const nums = (x: unknown, lo: number, hi: number): number[] =>
  Array.isArray(x) ? [...new Set(x.filter((v): v is number => num(v, lo, hi)))].sort((a, b) => a - b).slice(0, 20) : [];

function cleanGear(x: unknown): MyGear | null {
  const o = x as Record<string, unknown> | null;
  if (!o || typeof o !== 'object') return null;
  return {
    jighead: nums(o.jighead, 0.1, 100), silikon: nums(o.silikon, 1, 30), mikroJig: nums(o.mikroJig, 0.1, 100),
    kursun: nums(o.kursun, 0.1, 500), igne: nums(o.igne, 1, 30), samandira: o.samandira === true, capari: o.capari === true,
    baits: Array.isArray(o.baits) ? BAITS.filter((b) => (o.baits as unknown[]).includes(b)) : [],
  };
}

/** The method engine's view of the inventory: undefined when the angler has not filled it (nothing is assumed). */
export function toOwned(my: MyTackle | null): { owned: Partial<Record<Gear, boolean>> | undefined; baits: Bait[] | undefined; mode: Mode } {
  const g = my?.gear;
  const mode = my?.mode ?? 'hepsi';
  if (!g) return { owned: undefined, baits: undefined, mode };
  return {
    owned: {
      jighead: g.jighead.length > 0, silikon: g.silikon.length > 0, mikro_jig: g.mikroJig.length > 0,
      dropshot_kursun: g.kursun.length > 0, dip_kursun: g.kursun.length > 0, igne: g.igne.length > 0,
      samandira: g.samandira, capari: g.capari,
    },
    baits: g.baits.length ? g.baits : undefined,
    mode,
  };
}

/** Parse what is stored; anything invalid counts as "not set". */
export function parseMy(json: string | null | undefined): MyTackle | null {
  if (!json) return null;
  try {
    const o = JSON.parse(json) as Record<string, unknown>;
    const m: MyTackle = { light: cleanSet(o.light), heavy: cleanSet(o.heavy) };
    if (MODES.includes(o.mode as Mode)) m.mode = o.mode as Mode;
    const g = cleanGear(o.gear);
    if (g) m.gear = g;
    return m.light || m.heavy || m.mode || m.gear ? m : null;
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
    if (m && (m.light || m.heavy || m.mode || m.gear)) localStorage.setItem(MY_TACKLE_KEY, JSON.stringify(m));
    else localStorage.removeItem(MY_TACKLE_KEY);
  } catch {}
}
