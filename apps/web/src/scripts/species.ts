// H3: selected species, shared by every page: ?tur= in the URL wins, then the last choice on this device.
export const SPECIES = ['istavrit', 'levrek'] as const;
export type Species = (typeof SPECIES)[number];
export const SPECIES_TR: Record<Species, string> = { istavrit: 'İstavrit', levrek: 'Levrek' };
export const LEGAL_MIN: Record<Species, number> = { istavrit: 13, levrek: 25 };
const KEY = 'av-livn-species';

export const isSpecies = (x: unknown): x is Species => typeof x === 'string' && (SPECIES as readonly string[]).includes(x);

export function currentSpecies(search = typeof location === 'undefined' ? '' : location.search): Species {
  const q = new URLSearchParams(search).get('tur');
  if (isSpecies(q)) return q;
  try {
    const v = localStorage.getItem(KEY);
    if (isSpecies(v)) return v;
  } catch {}
  return 'istavrit';
}

export function saveSpecies(s: Species): void {
  try { localStorage.setItem(KEY, s); } catch {}
}

/** API path with ?species= (istavrit is the API default and is left out). */
export function api(path: string, s: Species): string {
  if (s === 'istavrit') return path;
  return `${path}${path.includes('?') ? '&' : '?'}species=${s}`;
}

/** Page link carrying the species (?tur=). */
export function link(path: string, s: Species): string {
  if (s === 'istavrit') return path;
  return `${path}${path.includes('?') ? '&' : '?'}tur=${s}`;
}
