// V2.5/V2.7: pure helpers for the admin outing editor and the descriptive method yield summary.

export interface ItemIn { species: string; count: number; weight_kg?: number }
/**
 * One catch line per row: "tür adet [kg]" (e.g. "istavrit 60 4,6", "izmarit 12"). Returns the items or the first
 * line that could not be read. Empty input → no items.
 */
export function parseItems(text: string): { ok: true; items: ItemIn[] } | { ok: false; line: string } {
  const items: ItemIn[] = [];
  for (const raw of text.split(/\n|;/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(\p{L}[\p{L} ]*?)\s+(\d+)(?:\s+(\d+(?:[.,]\d+)?)\s*(?:kg)?)?$/u.exec(line);
    if (!m) return { ok: false, line };
    const it: ItemIn = { species: m[1]!.trim().toLocaleLowerCase('tr'), count: Number(m[2]) };
    if (m[3]) it.weight_kg = Number(m[3].replace(',', '.'));
    items.push(it);
  }
  return { ok: true, items };
}
export const itemsText = (items: { species: string; count: number; weight_kg?: number | null }[]) =>
  items.map((i) => `${i.species} ${i.count}${i.weight_kg ? ` ${String(i.weight_kg).replace('.', ',')}` : ''}`).join('\n');

export interface SectionRow { outing_id: string; tackle_method: string | null; method: string | null; active_min: number; rods: number; bites: number | null; target_species: string | null; items: { species: string; count: number }[] }
export interface YieldRow { method: string; outings: number; sections: number; hours: number; bites: number | null; fish: number; bitesPerH: number | null; fishPerH: number }

/**
 * Descriptive yield per method (D5): bites and fish per rod-hour, with the number of independent outings beside it.
 * Not a ranking and not used to choose a method automatically; sections of one night are not independent.
 */
export function yieldByMethod(sections: SectionRow[]): YieldRow[] {
  const by = new Map<string, { outings: Set<string>; sections: number; hours: number; bites: number; biteHours: number; fish: number }>();
  for (const s of sections) {
    const k = s.tackle_method ?? s.method ?? 'bilinmiyor';
    const h = (s.active_min / 60) * Math.max(1, s.rods);
    const target = s.target_species ?? 'istavrit';
    const fish = s.items.filter((i) => i.species === target).reduce((a, i) => a + i.count, 0);
    const e = by.get(k) ?? { outings: new Set<string>(), sections: 0, hours: 0, bites: 0, biteHours: 0, fish: 0 };
    e.outings.add(s.outing_id);
    e.sections += 1;
    e.hours += h;
    e.fish += fish;
    if (s.bites !== null) { e.bites += s.bites; e.biteHours += h; }
    by.set(k, e);
  }
  const r2 = (x: number) => Math.round(x * 100) / 100;
  return [...by.entries()].map(([method, e]) => ({
    method, outings: e.outings.size, sections: e.sections, hours: r2(e.hours),
    bites: e.biteHours ? e.bites : null, bitesPerH: e.biteHours ? r2(e.bites / e.biteHours) : null,
    fish: e.fish, fishPerH: e.hours ? r2(e.fish / e.hours) : 0,
  })).sort((a, b) => a.method.localeCompare(b.method, 'tr'));
}
