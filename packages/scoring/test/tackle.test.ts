import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { crossWind, DEFAULT_PROFILES, JIG_SIZES, lightCase, R19_CITE, tackle, tackleShort, unitIssues, type TackleInput } from '../src/tackle';

const base: TackleInput = { depthM: 4, currentMs: 0.05, windKmh: 8, gustKmh: 12, crossKmh: 4, sunAlt: -20, lampP: 0.9, turbidity: 1, sstDev: 0 };

/**
 * G2 scenario table (docs/TACKLE.md "Örnek senaryolar"): inputs and expected suggestions are fixed here; changing a
 * rule changes this table and the doc together.
 */
export const SCENARIOS: { name: string; input: TackleInput; expect: { profile: 'lrf' | 'spin'; jig: string; zone: string; sink: number; color: string } }[] = [
  {
    name: 'Gece, sakin, lambalı iskele (4 m)',
    input: base,
    expect: { profile: 'lrf', jig: '1,2 g sabit', zone: 'yüzeye yakın', sink: 3, color: 'şeffaf-simli' },
  },
  {
    name: 'Gece, 25 km/sa yan rüzgar (hamle 30)',
    input: { ...base, windKmh: 25, gustKmh: 30, crossKmh: 25 },
    expect: { profile: 'spin', jig: '5 g sabit', zone: 'yüzeye yakın', sink: 2, color: 'şeffaf-simli' },
  },
  {
    name: 'Gece, 25 km/sa yan rüzgar, hamle 25 içinde',
    input: { ...base, windKmh: 22, gustKmh: 25, crossKmh: 25 },
    expect: { profile: 'lrf', jig: '2 g sabit', zone: 'yüzeye yakın', sink: 2, color: 'şeffaf-simli' },
  },
  {
    name: 'Gündüz, derin mendirek (10 m), sakin',
    input: { ...base, depthM: 10, sunAlt: 35, lampP: null },
    expect: { profile: 'lrf', jig: '3 g mafsallı', zone: 'dibe yakın', sink: 16, color: 'doğal' },
  },
  {
    name: 'Alacakaranlık, akıntılı burun (kayalık 6 m, 0,3 m/s)',
    input: { ...base, depthM: 6, sunAlt: -3, currentMs: 0.3, crossKmh: 8, kind: 'rocky' },
    expect: { profile: 'lrf', jig: '2 g sabit', zone: 'orta su', sink: 6, color: 'doğal' },
  },
  {
    name: '6 g gerektiren: gündüz 12 m, akıntı 0,4 m/s',
    input: { ...base, depthM: 12, sunAlt: 30, lampP: null, currentMs: 0.4 },
    expect: { profile: 'spin', jig: '6 g sabit', zone: 'dibe yakın', sink: 13, color: 'doğal' },
  },
];

describe('tackle (F0/G2)', () => {
  it.each(SCENARIOS)('$name', ({ input, expect: e }) => {
    const t = tackle(input);
    expect([t.profile, `${String(t.jigG).replace('.', ',')} g ${t.jigType}`, t.zone, t.sinkS, t.color]).toEqual([e.profile, e.jig, e.zone, e.sink, e.color]);
  });

  it('rows, hook trade-off, legal size, md. 8/8', () => {
    const t = tackle(base);
    expect(t.rows.map((r) => r.key)).toEqual(['takim', 'jighead', 'igne', 'silikon', 'renk', 'saydirma', 'yasal']);
    const hook = t.rows.find((r) => r.key === 'igne')!;
    expect([hook.value, hook.evidence]).toEqual(['#8', 'A']);
    expect(hook.why).toMatch(/#8: daha seçici, yasal boy üstü oranı yüksek, daha az vuruş/);
    expect(hook.why).toMatch(/#10: daha çok vuruş, 13 cm altı oranı yüksek, geri bırakma/);
    expect(hook.why).toContain(R19_CITE);
    expect(t.rows.find((r) => r.key === 'jighead')!.why).toMatch(/modelin gece kolu/);
    expect(t.rows.find((r) => r.key === 'yasal')!.value).toBe('13 cm');
    expect(t.notes.join(' ')).toMatch(/yasak \(md\. 8\/8\)/);
    expect(JSON.stringify(t.rows)).not.toMatch(/fener|lamba götür|ışık götür/i);
    expect(tackleShort(t)).toBe('LRF · 1,2 g sabit · #8 · 5 cm şeffaf-simli');
  });

  it('R19 citation matches RESEARCH.md word for word', () => {
    const doc = readFileSync(new URL('../../../docs/RESEARCH.md', import.meta.url), 'utf8');
    const row = doc.split('\n').find((l) => l.startsWith('| R19 |'))!;
    expect(row).toContain('Peksu M., Uzer U., Yıldız T., Ayaz A., Karakulak F.S. (2020)');
    expect(row.replace(/\*/g, '')).toContain('J. Appl. Ichthyol. 36(6):893–900');
    expect(R19_CITE).toBe('Peksu M., Uzer U., Yıldız T., Ayaz A., Karakulak F.S. (2020). J. Appl. Ichthyol. 36(6):893–900');
  });

  it('night calm weights stay 0.8–1.5 g, real jighead sizes, LRF limit 5 g', () => {
    for (const d of [1, 2, 4, 8, 15]) {
      const t = tackle({ ...base, depthM: d });
      expect(t.jigG).toBeGreaterThanOrEqual(0.8);
      expect(t.jigG).toBeLessThanOrEqual(1.5);
      expect(t.sinkS).toBeGreaterThanOrEqual(2);
      expect(t.sinkS).toBeLessThanOrEqual(4);
      expect(JIG_SIZES).toContain(t.jigG);
    }
    expect(DEFAULT_PROFILES[0]!.jigMax).toBe(5);
    expect(tackle({ ...base, depthM: 40, currentMs: 0.9, sunAlt: 20 }).jigG).toBe(20);
  });

  it('units in every text (G2)', () => {
    for (const p of DEFAULT_PROFILES) expect(unitIssues(`${p.name} ${p.line}`)).toEqual([]);
    for (const { input } of SCENARIOS) {
      const t = tackle(input);
      for (const r of t.rows) expect(unitIssues(`${r.value} ${r.why}`), r.key).toEqual([]);
      expect(unitIssues(t.notes.join(' '))).toEqual([]);
    }
    expect(unitIssues('Gosen PE 0.2 + FC 0,8–1,2 lb')).toHaveLength(2);
    expect(unitIssues('FC 3 lb')).toHaveLength(2);
    expect(unitIssues('FC 0.8–1.2 numara (≈3–5 lb)')).toEqual([]);
    expect(unitIssues('rüzgar 20 km/s')).toEqual(['hız km/sa ile yazılır']);
  });

  it('twilight, day, dark, turbid, cold, rocky bottom target', () => {
    const dark = tackle({ ...base, lampP: 0.1 });
    expect(dark.color).toBe('koyu siluet');
    expect(dark.notes.length).toBe(2);
    expect(tackle({ ...base, sunAlt: -3 }).rows[1]!.why).toMatch(/alacakaranlık tepesi/);
    const day = tackle({ ...base, sunAlt: 30, lampP: null });
    expect(day.rows[1]!.why).toMatch(/gündüz kolu/);
    expect(day.rows[5]!.why).toMatch(/dibe yakın/);
    expect(tackle({ ...base, sunAlt: -3 }).rows[5]!.why).toMatch(/orta su/);
    const turbid = tackle({ ...base, turbidity: 0.5 });
    expect([turbid.color, turbid.lureCm]).toEqual(['parlak', 6]);
    expect(tackle({ ...base, sstDev: -2 }).lureCm).toBe(4);
    expect(tackle({ ...base, kind: 'rocky' }).jigType).toBe('mafsallı'); // rocky bottom target, calm
    expect(tackle({ ...base, kind: 'rocky', currentMs: 0.3 }).jigType).toBe('sabit');
    const x = tackle({ ...base, crossKmh: 16, currentMs: null, windKmh: null, gustKmh: null, turbidity: null, sstDev: null });
    expect([x.jigType, x.jigG]).toEqual(['sabit', 1.5]);
    expect(x.rows[1]!.why).toMatch(/yan rüzgar 16 km\/sa/);
    expect(tackle({ ...base, depthM: 0 }).sinkS).toBe(2);
  });

  it('custom profiles and helpers', () => {
    const t = tackle(base, [{ ...DEFAULT_PROFILES[0]!, jigMax: 0.8 }], 15);
    expect(t.profile).toBe('spin'); // 1.1 g needed > 0.8 g, falls back to the default spin profile
    expect(t.rows[0]!.why).toMatch(/üst sınırı 0,8 g/);
    expect(t.rows.at(-1)!.value).toBe('15 cm');
    expect(tackle(base, []).profile).toBe('lrf');
    expect(tackle({ ...base, crossKmh: null }).jigType).toBe('sabit');
    expect(tackleShort(tackle({ ...base, gustKmh: 40 }))).toMatch(/^Spin · /);
    expect(tackle({ ...base, gustKmh: 40 }).rows[0]!.why).toMatch(/hamle 40 km\/sa > LRF sınırı 25 km\/sa/);
    expect(lightCase(-10, null)).toBe('karanlık gece');
    expect(lightCase(5, 1)).toBe('gündüz');
    expect(crossWind(20, 90, 0)).toBe(20);
    expect(crossWind(20, 0, 0)).toBe(0);
    expect(crossWind(null, 0, 0)).toBeNull();
  });
});
