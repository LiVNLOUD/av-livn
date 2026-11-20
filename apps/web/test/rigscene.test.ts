import { describe, expect, it } from 'vitest';
import { colorNote, lureFill, rigScene, sinkerFor } from '../src/scripts/rigscene';

const names = (m: Parameters<typeof rigScene>[0], o = {}) => rigScene(m, 'bagla', o).parts.map((p) => p.name);

describe('rig scene (V2.4)', () => {
  it('each method has its own real connection layout', () => {
    expect(names('lrf')).toEqual(['ana ip', 'düğüm', 'lider', 'jighead', 'silikon', 'iğne (silikonun içinde)']);
    expect(names('mikro_jig')).toContain('asist iğne');
    expect(names('dropshot_yem', { bait: 'hamsi' })).toEqual(['ana ip', 'düğüm', 'lider', 'iğne (palomar ile ipe)', 'yem', 'kurşun']);
    expect(names('dip', { bait: 'karides' })).toContain('köstek + iğne (2 adet)');
    expect(names('samandira', { bait: 'midye' })).toEqual(['ana ip', 'stoper + boncuk', 'kayar şamandıra', 'saçma kurşun', 'fırdöndü', 'iğne', 'yem']);
    expect(names('capari_tuylu')).toContain('çapari (tüylü, 6 iğne)');
    expect(names('capari_yemli', { bait: 'hamsi' })).toEqual(['ana ip', 'fırdöndü', 'çapari (yemli, 6 iğne)', 'yem', 'kurşun']);
    expect(names('dropshot_yem')).not.toContain('yem');
    expect(new Set(['lrf', 'dropshot_yem', 'samandira', 'capari_tuylu'].map((m) => names(m as never).join('|'))).size).toBe(4);
  });
  it('every part is tappable with its Turkish name and size; the hook inside the lure is drawn', () => {
    const s = rigScene('lrf', 'bagla', { jigG: 1.5, lureCm: 4, hookNo: 8, color: 'şeffaf-simli' });
    const tapped = [...s.svg.matchAll(/data-part="([^"]+)"/g)].map((m) => m[1]);
    expect(tapped).toEqual(s.parts.map((p) => p.id));
    expect(s.svg).toContain('<title>jighead · 1,5 g · #8</title>');
    expect(s.svg).toContain('rs-hidden');
    expect(s.parts.find((p) => p.id === 'silikon')!.size).toBe('4 cm');
    expect(s.colorNote).toMatch(/Ekrandaki renk su altındaki görünüm değildir/);
  });
  it('the use view is a labelled teaching loop with four steps that stays still with reduced motion', () => {
    const s = rigScene('dropshot_yem', 'kullan', { bait: 'hamsi' });
    expect(s.steps).toHaveLength(4);
    expect(s.svg).toContain('eğitim animasyonu');
    expect(s.svg).toMatch(/prefers-reduced-motion:reduce\)\{\.rs-kullan \.rs-dot-dropshot_yem\{animation:none/);
    expect((s.svg.match(/class="rs-step"/g) ?? []).length).toBe(4);
    expect(s.colorNote).toBeNull(); // natural bait: no lure colour
    for (const m of ['lrf', 'mikro_jig', 'dip', 'samandira', 'capari_tuylu', 'capari_yemli'] as const) expect(rigScene(m, 'kullan').steps).toHaveLength(4);
  });
  it('same input → same SVG (deterministic)', () => {
    expect(rigScene('samandira', 'bagla', { bait: 'midye' }).svg).toBe(rigScene('samandira', 'bagla', { bait: 'midye' }).svg);
  });
  it('colour fills, notes and the sinker rule', () => {
    expect(lureFill(undefined)).toBe('#c9d6dc');
    expect(lureFill('koyu siluet')).toBe('#2b2f3a');
    expect(lureFill('parlak')).toBe('#f2d64b');
    expect(lureFill('doğal')).toBe('#9fb7a2');
    expect(colorNote(undefined)).toBeNull();
    expect(colorNote('koyu siluet')).toMatch(/siluet/);
    expect(colorNote('parlak')).toMatch(/bulanık/);
    expect(colorNote('doğal')).toMatch(/berrak/);
    expect(sinkerFor(1, null)).toBe(10);
    expect(sinkerFor(5, 0.2)).toBe(30);
    expect(sinkerFor(12, 0.6)).toBe(40);
  });
});
