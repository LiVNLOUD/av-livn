import { describe, expect, it } from 'vitest';
import { crossWind, DEFAULT_PROFILES, lightCase, tackle, tackleShort, type TackleInput } from '../src/tackle';

const base: TackleInput = { depthM: 4, currentMs: 0.05, windKmh: 8, gustKmh: 12, crossKmh: 4, sunAlt: -20, lampP: 0.9, turbidity: 1, sstDev: 0 };

describe('tackle (F0)', () => {
  it('calm lit night: LRF, light articulated jighead, clear sparkle, #8, legal row', () => {
    const t = tackle(base);
    expect(t.profile).toBe('lrf');
    expect(t.jigG).toBe(2); // (0.8 + 1) × 1.1 = 1.98 → 2
    expect(t.jigType).toBe('mafsallı');
    expect(t.color).toBe('şeffaf-simli');
    expect(t.hook).toBe(8);
    expect(t.rows.map((r) => r.key)).toEqual(['takim', 'jighead', 'igne', 'silikon', 'renk', 'saydirma', 'yasal']);
    expect(t.rows.find((r) => r.key === 'yasal')!.value).toBe('13 cm');
    expect(t.rows.find((r) => r.key === 'igne')!.evidence).toBe('A');
    expect(t.notes.join(' ')).toMatch(/yasak \(md\. 8\/8\)/);
    expect(JSON.stringify(t.rows)).not.toMatch(/fener|lamba götür|ışık götür/i);
    expect(tackleShort(t)).toBe('LRF · 2 g mafsallı · #8 · 5 cm şeffaf-simli');
  });
  it('wind, current, cross wind or depth push to spin with fixed head', () => {
    for (const o of [{ gustKmh: 40 }, { crossKmh: 25 }, { currentMs: 0.3 }, { depthM: 12 }] as Partial<TackleInput>[]) {
      const t = tackle({ ...base, ...o });
      expect(t.profile).toBe('spin');
      expect(t.jigType).toBe('sabit');
      expect(t.jigG).toBeGreaterThanOrEqual(5);
      expect(t.rows[0]!.why).toMatch(/hafif takım kontrolü kaybeder/);
    }
    expect(tackle({ ...base, depthM: 40, currentMs: 0.6 }).jigG).toBe(20);
  });
  it('dark night, twilight, day, turbid and cold water', () => {
    const dark = tackle({ ...base, lampP: 0.1 });
    expect(dark.color).toBe('koyu siluet');
    expect(dark.notes.length).toBe(2);
    expect(tackle({ ...base, sunAlt: -3 }).color).toBe('doğal');
    expect(tackle({ ...base, sunAlt: 30, lampP: null }).color).toBe('doğal');
    const turbid = tackle({ ...base, turbidity: 0.5 });
    expect([turbid.color, turbid.lureCm]).toEqual(['parlak', 6]);
    expect(tackle({ ...base, sstDev: -2 }).lureCm).toBe(4);
    const x = tackle({ ...base, crossKmh: 16, currentMs: null, windKmh: null, gustKmh: null, turbidity: null, sstDev: null });
    expect(x.jigType).toBe('sabit');
    expect(x.jigG).toBe(2.5);
    expect(tackle({ ...base, depthM: 0 }).sinkS).toBe(2);
  });
  it('custom profiles and helpers', () => {
    const t = tackle(base, [{ ...DEFAULT_PROFILES[0]!, jigMax: 1.5 }], 15);
    expect(t.profile).toBe('spin'); // 2 g needed > 1.5 g, falls back to the default spin profile
    expect(t.rows[0]!.why).toMatch(/üst sınırı 1,5 g/);
    expect(t.rows.at(-1)!.value).toBe('15 cm');
    expect(tackle(base, []).profile).toBe('lrf'); // no profiles → defaults
    expect(tackle({ ...base, crossKmh: null }).jigType).toBe('mafsallı');
    expect(tackleShort(tackle({ ...base, gustKmh: 40 }))).toMatch(/^Spin · /);
    expect(lightCase(-10, null)).toBe('karanlık gece');
    expect(lightCase(5, 1)).toBe('gündüz');
    expect(crossWind(20, 90, 0)).toBe(20);
    expect(crossWind(20, 0, 0)).toBe(0);
    expect(crossWind(null, 0, 0)).toBeNull();
  });
});
