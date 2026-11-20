import { describe, expect, it } from 'vitest';
import { itemsText, parseItems, yieldByMethod } from '../src/scripts/outing';

describe('outing editor helpers', () => {
  it('parses "tür adet [kg]" lines; rejects the first unreadable line', () => {
    expect(parseItems('istavrit 60 4,6\nizmarit 12; Levrek 1 0.8kg\n')).toEqual({ ok: true, items: [
      { species: 'istavrit', count: 60, weight_kg: 4.6 }, { species: 'izmarit', count: 12 }, { species: 'levrek', count: 1, weight_kg: 0.8 }] });
    expect(parseItems('')).toEqual({ ok: true, items: [] });
    expect(parseItems('istavrit çok')).toEqual({ ok: false, line: 'istavrit çok' });
    expect(itemsText([{ species: 'istavrit', count: 60, weight_kg: 4.6 }, { species: 'izmarit', count: 12, weight_kg: null }])).toBe('istavrit 60 4,6\nizmarit 12');
  });
  it('yield per method is descriptive: per rod-hour, with independent outings counted once', () => {
    const rows = yieldByMethod([
      { outing_id: 'o1', tackle_method: 'lrf', method: 'lrf', active_min: 60, rods: 1, bites: 0, target_species: 'istavrit', items: [] },
      { outing_id: 'o1', tackle_method: 'dropshot_yem', method: 'diger', active_min: 180, rods: 1, bites: 40, target_species: 'istavrit', items: [{ species: 'istavrit', count: 60 }, { species: 'izmarit', count: 12 }] },
      { outing_id: 'o2', tackle_method: 'dropshot_yem', method: 'diger', active_min: 60, rods: 2, bites: null, target_species: null, items: [{ species: 'istavrit', count: 6 }] },
      { outing_id: 'o3', tackle_method: null, method: null, active_min: 30, rods: 1, bites: null, target_species: 'istavrit', items: [] },
    ]);
    expect(rows.map((r) => r.method)).toEqual(['bilinmiyor', 'dropshot_yem', 'lrf']);
    const ds = rows.find((r) => r.method === 'dropshot_yem')!;
    expect(ds).toMatchObject({ outings: 2, sections: 2, hours: 5, fish: 66, fishPerH: 13.2, bites: 40, bitesPerH: 13.33 });
    expect(rows.find((r) => r.method === 'lrf')).toMatchObject({ fish: 0, bitesPerH: 0, outings: 1 });
    expect(rows.find((r) => r.method === 'bilinmiyor')!.bitesPerH).toBeNull();
  });
});
