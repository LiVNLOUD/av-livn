import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { crossWind, tackleClass, tackleLine, tackleLevrekLine, DEFAULT_PROFILES, JIG_SIZES, lightCase, R19_CITE, tackle, tackleLevrek, tackleLevrekShort, tackleShort, unitIssues, type TackleInput } from '../src/tackle';

const base: TackleInput = { depthM: 4, currentMs: 0.05, windKmh: 8, gustKmh: 12, crossKmh: 4, sunAlt: -20, lampP: 0.9, turbidity: 1, sstDev: 0 };

/**
 * G2 scenario table (docs/TACKLE.md "Örnek senaryolar"): inputs and expected suggestions are fixed here; changing a
 * rule changes this table and the doc together.
 */
export const SCENARIOS: { name: string; input: TackleInput; expect: { profile: 'lrf' | 'spin'; jig: string; zone: string; sink: string; color: string } }[] = [
  {
    name: 'Gece, sakin, lambalı iskele (4 m)',
    input: base,
    expect: { profile: 'lrf', jig: '1,2 g sabit', zone: 'yüzeye yakın', sink: '3–5 s', color: 'şeffaf-simli' },
  },
  {
    name: 'Gece, 25 km/sa yan rüzgar, hamle 30',
    input: { ...base, windKmh: 25, gustKmh: 30, crossKmh: 25 },
    expect: { profile: 'lrf', jig: '3 g sabit', zone: 'yüzeye yakın', sink: '2–5 s', color: 'şeffaf-simli' },
  },
  {
    name: 'Gündüz, derin mendirek (10 m), sakin',
    input: { ...base, depthM: 10, sunAlt: 35, lampP: null },
    expect: { profile: 'lrf', jig: '3 g mafsallı', zone: 'dibe yakın', sink: '16–38 s', color: 'doğal' },
  },
  {
    name: 'Alacakaranlık, akıntılı burun (kayalık 6 m, 0,3 m/s)',
    input: { ...base, depthM: 6, sunAlt: -3, currentMs: 0.3, crossKmh: 8, kind: 'rocky' },
    expect: { profile: 'lrf', jig: '2 g sabit', zone: 'orta su', sink: '6–14 s', color: 'doğal' },
  },
  {
    name: '5–6 g arası: gündüz 12 m, akıntı 0,3 m/s → LRF sınırında',
    input: { ...base, depthM: 12, sunAlt: 30, lampP: null, currentMs: 0.3 },
    expect: { profile: 'lrf', jig: '5 g sabit', zone: 'dibe yakın', sink: '15–36 s', color: 'doğal' },
  },
  {
    name: '6 g gerektiren: gündüz 12 m, akıntı 0,45 m/s',
    input: { ...base, depthM: 12, sunAlt: 30, lampP: null, currentMs: 0.45 },
    expect: { profile: 'spin', jig: '6 g sabit', zone: 'dibe yakın', sink: '14–33 s', color: 'doğal' },
  },
  {
    name: '8 g gerektiren: gündüz 14 m, akıntı 0,6 m/s',
    input: { ...base, depthM: 14, sunAlt: 30, lampP: null, currentMs: 0.6 },
    expect: { profile: 'spin', jig: '8 g sabit', zone: 'dibe yakın', sink: '14–33 s', color: 'doğal' },
  },
];

describe('tackle (F0/G2)', () => {
  it.each(SCENARIOS)('$name', ({ input, expect: e }) => {
    const t = tackle(input);
    expect([t.profile, `${String(t.jigG).replace('.', ',')} g ${t.jigType}`, t.zone, t.rows.find((r) => r.key === 'saydirma')!.value, t.color]).toEqual([e.profile, e.jig, e.zone, e.sink, e.color]);
  });

  it('rows, hook trade-off, legal size, md. 8/8', () => {
    const t = tackle(base);
    expect(t.rows.map((r) => r.key)).toEqual(['takim', 'jighead', 'igne', 'silikon', 'renk', 'saydirma', 'yasal']);
    const hook = t.rows.find((r) => r.key === 'igne')!;
    expect([hook.value, hook.evidence]).toEqual(['#8', 'C']);
    expect(hook.why).toMatch(/çapari \(el oltası\) iğnelerinde ölçüldü, LRF jighead'e aktarım; LRF için doğrulanmadı \(R19b\)/);
    expect(hook.why).toMatch(/#8: daha seçici, yasal boy üstü oranı yüksek, daha az vuruş/);
    expect(hook.why).toMatch(/#10: daha çok vuruş, 13 cm altı oranı yüksek, geri bırakma/);
    expect(hook.why).not.toContain(R19_CITE); // M2: the citation sits under "Neden?", not in the row
    expect(hook.source).toBe(R19_CITE);
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
    expect(tackle({ ...base, depthM: 40, currentMs: 0.9, sunAlt: 20 }).jigG).toBe(10); // istavrit spin: 6–10 g
    expect(tackle({ ...base, depthM: 40, currentMs: 0.9, sunAlt: 20 }).rows[0]!.why).toMatch(/koşul istavrit için zor/);
  });

  it('H1: set chosen by weight only — never spin under 6 g, never LRF over 5 g (random inputs)', () => {
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    let spins = 0;
    for (let k = 0; k < 2000; k++) {
      const t = tackle({
        depthM: rnd() * 25, currentMs: rnd() * 0.8, windKmh: rnd() * 50, gustKmh: rnd() * 70, crossKmh: rnd() * 45,
        sunAlt: rnd() * 120 - 60, lampP: rnd(), turbidity: rnd(), sstDev: rnd() * 6 - 3, kind: rnd() < 0.3 ? 'rocky' : 'pier',
      });
      if (t.profile === 'spin') {
        spins++;
        expect(t.jigG).toBeGreaterThanOrEqual(6);
      } else expect(t.jigG).toBeLessThanOrEqual(5);
    }
    expect(spins).toBeGreaterThan(0);
    // gusts never switch the set; they add a casting note
    const g = tackle({ ...base, gustKmh: 45 });
    expect(g.profile).toBe('lrf');
    expect(g.notes.join(' ')).toMatch(/Hamle 45 km\/sa: atışta misinayı elle frenle, rüzgara yan at/);
    expect(DEFAULT_PROFILES[1]).toMatchObject({ jigMin: 6, jigMax: 30 });
  });

  it('M2: brand-free defaults, generic classes and the plain one-line', () => {
    const txt = JSON.stringify(DEFAULT_PROFILES);
    expect(txt).not.toMatch(/Gosen|Ares|Vanford|Bassterra|Nasci|Kairiki|Daiwa|Shimano/);
    expect(DEFAULT_PROFILES.map((p) => p.name)).toEqual(['Ultra hafif / LRF (0,5–5 g)', 'Spin (6–30 g)']);
    expect(DEFAULT_PROFILES[0]!.line).toBe('PE 0.2–0.4 + ≈3–5 lb florokarbon lider');
    expect([tackleClass('lrf', 2).label, tackleClass('spin', 10).label, tackleClass('spin', 21).label]).toEqual(['Ultra hafif / LRF (0,5–5 g)', 'Hafif spin (3–15 g)', 'Spin (6–30 g)']);
    expect(tackleLine(tackle(base))).toBe('Ultra hafif LRF · 1,2 g sabit jighead · #8 iğne · 5 cm şeffaf-simli silikon · yüzeye yakın, 3–5 sn say');
    expect(tackleLevrekLine(tackleLevrek({ ...base, waveM: 0.6 }))).toMatch(/^Hafif spin · \d+ g · /);
    expect(tackleLevrekLine(tackleLevrek({ ...base, waveM: 0.1, currentMs: 0.05, windKmh: 5, gustKmh: 8, depthM: 2, kind: 'harbour' }))).toMatch(/^Hafif LRF · /);
    for (const t of [tackle(base), tackleLevrek(base)]) expect(JSON.stringify(t.rows)).not.toMatch(/Gosen|Bassterra|Kairiki|Daiwa/);
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
    expect([x.jigType, x.jigG]).toEqual(['sabit', 2]); // 1.04 + 0.12 × 6 = 1.76 → 2 g
    expect(x.rows[1]!.why).toMatch(/yan rüzgar 16 km\/sa/);
    expect(tackle({ ...base, depthM: 0 }).sinkS).toBe(2);
  });

  it('custom profiles and helpers', () => {
    const t = tackle(base, [{ ...DEFAULT_PROFILES[0]!, jigMax: 0.8 }], 15);
    expect([t.profile, t.jigG]).toEqual(['lrf', 0.8]); // 1.1 g needed, below spin's 6 g: LRF at its limit
    expect(t.rows[0]!.why).toMatch(/LRF üst sınırında \(0,8 g\) kal/);
    expect(t.rows.at(-1)!.value).toBe('15 cm');
    expect(tackle(base, []).profile).toBe('lrf');
    expect(tackle({ ...base, crossKmh: null }).jigType).toBe('sabit');
    expect(tackleShort(tackle({ ...base, depthM: 14, sunAlt: 30, currentMs: 0.6 }))).toMatch(/^Spin · 8 g/);
    expect(tackle({ ...base, gustKmh: 40 }).rows[0]!.why).toMatch(/hamle 40 km\/sa: atışta misinayı elle frenle/);
    expect(lightCase(-10, null)).toBe('bilinmeyen gece');
    expect(lightCase(-10, 0.2)).toBe('karanlık gece');
    expect(lightCase(5, 1)).toBe('gündüz');
    expect(crossWind(20, 90, 0)).toBe(20);
    expect(crossWind(20, 0, 0)).toBe(0);
    expect(crossWind(null, 0, 0)).toBeNull();
  });
});

// H3: levrek tackle scenario table (docs/species/levrek/TACKLE.md "Örnek senaryolar")
const lb: TackleInput = { depthM: 4, currentMs: 0.05, windKmh: 8, gustKmh: 12, crossKmh: 4, sunAlt: -20, lampP: 0.2, turbidity: 1, sstDev: 0, waveM: 0.3, kind: 'rocky' };
export const LEVREK_SCENARIOS: { name: string; input: TackleInput; expect: [string, number, string, string] }[] = [
  { name: 'Fırtına ertesi bulanık gece, kayalık', input: { ...lb, waveM: 0.8, turbidity: 0.6, windKmh: 20, gustKmh: 30 }, expect: ['spin', 14, 'silikon shad 10–12 cm', 'chartreuse / beyaz'] },
  { name: 'Sakin berrak gece, lambalı iskele (3 m)', input: { ...lb, kind: 'pier', waveM: 0.15, lampP: 0.9, depthM: 3 }, expect: ['lrf', 3, 'LRF shad 5–7 cm', 'beyaz-gümüş (ışık–gölge sınırı)'] },
  { name: 'Yağış sonrası alacakaranlık, dere ağzı', input: { ...lb, kind: 'river_mouth', sunAlt: -3, depthM: 1.5, turbidity: 0.7, waveM: 0.4 }, expect: ['spin', 10, 'silikon shad 10–12 cm', 'chartreuse / beyaz'] },
  { name: 'Gündüz, derin mendirek (9 m), akıntı 0,3', input: { ...lb, kind: 'breakwater', sunAlt: 30, lampP: null, depthM: 9, currentMs: 0.3, waveM: 0.6 }, expect: ['spin', 28, 'metal jig 28 g', 'doğal, ince profil'] },
  { name: 'Kış ani soğuma gecesi, kumsal', input: { ...lb, kind: 'beach', sstDev: -2.5, depthM: 1.5, waveM: 0.5 }, expect: ['spin', 14, 'minnow 7–9 cm', 'koyu siluet (siyah, mor)'] },
  { name: 'Alacakaranlık, sığ berrak kayalık', input: { ...lb, sunAlt: -3, depthM: 2, waveM: 0.6 }, expect: ['spin', 14, 'minnow 9–12 cm', 'doğal gümüş (sardalya)'] },
];

describe('tackle levrek (H3)', () => {
  it.each(LEVREK_SCENARIOS)('$name', ({ input, expect: e }) => {
    const t = tackleLevrek(input);
    expect([t.profile, t.weightG, `${t.lure} ${t.lureCm}`, t.color]).toEqual(e);
  });
  it('spin always 6–32 g, LRF ≤ 5 g; legal 25 cm; md. 8/8; units', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 1500; k++) {
      const t = tackleLevrek({
        depthM: rnd() * 15, currentMs: rnd() * 0.6, windKmh: rnd() * 40, gustKmh: rnd() * 60, crossKmh: rnd() * 30, sunAlt: rnd() * 100 - 50,
        lampP: rnd(), turbidity: rnd(), sstDev: rnd() * 6 - 3, waveM: rnd() * 1.6, kind: ['rocky', 'pier', 'beach', 'river_mouth', 'harbour', 'breakwater'][k % 6],
      });
      if (t.profile === 'spin') expect(t.weightG >= 6 && t.weightG <= 32).toBe(true);
      else expect(t.weightG).toBeLessThanOrEqual(5);
      for (const r of t.rows) expect(unitIssues(`${r.value} ${r.why}`), r.key).toEqual([]);
    }
    const t = tackleLevrek(lb);
    expect(t.rows.find((r) => r.key === 'yasal')).toMatchObject({ value: '25 cm', evidence: 'A' });
    expect(t.notes.join(' ')).toMatch(/md\. 8\/8/);
    expect(JSON.stringify(t.rows)).not.toMatch(/fener|lamba götür|ışık götür/i);
    expect(tackleLevrekShort(tackleLevrek({ ...lb, kind: 'pier', waveM: 0.1, depthM: 2 }))).toMatch(/^LRF · /);
    expect(tackleLevrek({ ...lb, gustKmh: 45 }).notes.join(' ')).toMatch(/Hamle 45 km\/sa/);
    expect(tackleLevrek({ ...lb, sunAlt: 30, lampP: null, depthM: 4, waveM: 0.2 }).lure).toBe('silikon kum balığı');
    expect(tackleLevrek({ ...lb, waveM: 1.4, turbidity: null, sstDev: null, currentMs: null, windKmh: null, gustKmh: null }).weightG).toBe(24);
    expect(tackleLevrek(lb, [], 30).rows.at(-1)!.value).toBe('30 cm');
    const { waveM: _w, kind: _k, ...bare } = lb;
    expect(tackleLevrek(bare).profile).toBe('spin'); // no wave, no kind: spin, not sheltered
    expect(tackleLevrekShort(tackleLevrek(lb))).toMatch(/^Spin · 10 g/);
  });
});

describe('I3: unknown lamp → conditional advice; missing data is not calm', () => {
  it('lamp 0.5 (prior) or null at night gives both variants, lit first; 0.85 counts as lit', () => {
    for (const lampP of [null, 0.5]) {
      const t = tackle({ ...base, lampP });
      expect(t.light).toBe('bilinmeyen gece');
      const color = t.rows.find((r) => r.key === 'renk')!;
      expect(color.value).toBe('şeffaf-simli / koyu siluet');
      expect(color.why).toMatch(/^lamba suya düşüyorsa şeffaf-simli .*; karanlıksa koyu siluet/);
      expect(t.notes[0]).toMatch(/Lamba durumu bilinmiyor/);
    }
    expect(tackle({ ...base, lampP: 0.85 }).light).toBe('aydınlık gece');
    expect(tackle({ ...base, lampP: 0.85 }).rows.find((r) => r.key === 'renk')!.value).toBe('şeffaf-simli');
    expect(tackle({ ...base, sunAlt: 20, lampP: null }).light).toBe('gündüz');
    const lv = tackleLevrek({ ...lb, lampP: null });
    expect(lv.light).toBe('bilinmeyen gece');
    expect(lv.rows.find((r) => r.key === 'renk')!.value).toContain(' / ');
  });
  it('missing current/wind/wave is named, and never unlocks the light levrek LRF set', () => {
    const t = tackle({ ...base, currentMs: null, windKmh: null, gustKmh: null });
    expect(t.notes.at(-1)).toMatch(/^akıntı, rüzgar verisi yok: ağırlık sakin suya göre/);
    expect(tackle(base).notes.some((n) => /verisi yok/.test(n))).toBe(false);
    const calm: TackleInput = { depthM: 3, currentMs: 0.05, windKmh: 5, gustKmh: 8, crossKmh: 2, sunAlt: -20, lampP: 1, turbidity: 1, sstDev: 0, waveM: 0.1, kind: 'pier' };
    expect(tackleLevrek(calm).profile).toBe('lrf');
    expect(tackleLevrek({ ...calm, waveM: null }).profile).toBe('spin');
    expect(tackleLevrek({ ...calm, gustKmh: null }).profile).toBe('lrf');
    expect(tackleLevrek({ ...calm, gustKmh: null, windKmh: null }).profile).toBe('spin');
    expect(tackleLevrek({ ...calm, waveM: null }).notes.at(-1)).toMatch(/dalga verisi yok/);
  });
});

describe('I4: strong current is a fishability note, not an availability penalty', () => {
  it('≥ 0.5 m/s adds the note (istavrit, lit and unknown lamp)', () => {
    expect(tackle({ ...base, currentMs: 0.6 }).notes.at(-1)).toMatch(/^akıntı 0,60 m\/s: hafif takımla kontrol zor \(avlanabilirlik\)/);
    expect(tackle({ ...base, currentMs: 0.6, lampP: null }).notes.at(-1)).toMatch(/avlanabilirlik/);
    expect(tackle({ ...base, currentMs: 0.3 }).notes.some((n) => /avlanabilirlik/.test(n))).toBe(false);
  });
});

describe('I7: one sink model, a range, total cast weight', () => {
  it('uses v2/sink.ts and the field factor; warns when jighead + lure exceed the LRF rod', async () => {
    const { sinkSpeed } = await import('../src/v2/sink');
    const t = tackle({ ...base, depthM: 10, sunAlt: 35, lampP: null });
    expect(t.sinkS).toBe(Math.round(10 / sinkSpeed(3)));
    const cal = tackle({ ...base, depthM: 10, sunAlt: 35, lampP: null, sinkK: 2 });
    expect(cal.sinkS).toBe(Math.round(10 / (2 * sinkSpeed(3))));
    expect(t.totalG).toBe(3.5);
    const edge = tackle({ ...base, depthM: 12, sunAlt: 30, lampP: null, currentMs: 0.3 });
    expect(edge.notes.some((n) => n.startsWith('toplam atış ağırlığı ≈ 5,5 g'))).toBe(true);
    expect(tackle(base).notes.some((n) => n.startsWith('toplam atış'))).toBe(false);
  });
});
