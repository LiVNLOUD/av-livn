import { describe, expect, it } from 'vitest';
import { fitStep, timelineRows, timelineSvg, type TimelineIn } from '../src/scripts/timeline';

const H0 = Math.floor(Date.UTC(2026, 10, 10, 13) / 3_600_000); // 16:00 local
const base = (o: Partial<TimelineIn> = {}): TimelineIn => ({
  fromHour: H0, fit: Array.from({ length: 24 }, (_, i) => 40 + i), gated: [], window: [3, 7], selected: 3,
  wind: Array(24).fill(8), gust: Array(24).fill(14), dir: Array(24).fill(135), rain: Array(24).fill(0), wave: Array(24).fill(0.2), sun: Array(24).fill(-10), ...o,
});

describe('V1.3 av zaman çizelgesi', () => {
  it('same data → same SVG; 24 hit columns; all rows present', () => {
    const a = timelineSvg(base(), 600), b = timelineSvg(base(), 600);
    expect(a).toBe(b);
    expect(a.match(/class="tl-hit"/g)).toHaveLength(24);
    for (const cls of ['tl-sky', 'tl-fit', 'tl-wind', 'tl-gust', 'tl-arr', 'tl-wave', 'tl-win', 'tl-sel']) expect(a).toContain(`class="${cls}`);
    expect(timelineRows().map((r) => r.label)).toEqual(['Gün / gece', 'Uygunluk', 'Rüzgar · hamle', 'Yağış', 'Dalga', 'Güvenlik']);
  });
  it('the selected hour is one line through all rows at the column centre, labelled in local time', () => {
    const s = timelineSvg(base({ selected: 5 }), 480);
    expect(s).toMatch(/<line class="tl-sel" x1="110" x2="110" y1="14"/); // 480/24 = 20 px; centre of column 5
    expect(s).toContain('>21:00</text>'); // 16:00 + 5 h
  });
  it('suitability: height and a colour step that changes with the value', () => {
    expect([null, 10, 30, 44, 45, 59, 60, 74, 75, 100].map(fitStep)).toEqual([null, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
    const s = timelineSvg(base({ fit: [10, 50, 90, ...Array(21).fill(null)] }), 480);
    expect(s).toContain('class="tl-fit f0"');
    expect(s).toContain('class="tl-fit f2"');
    expect(s).toContain('class="tl-fit f4"');
    expect(s.match(/class="tl-nodata"/g)!.length).toBeGreaterThanOrEqual(21); // missing scores hatched, not blank
  });
  it('rain: zero draws no bars and says so; missing is hatched; a known cell is drawn in its column', () => {
    expect(timelineSvg(base(), 480)).toContain('>yağış yok</text>');
    const r = Array(24).fill(0); r[4] = 2;
    const s = timelineSvg(base({ rain: r }), 480);
    expect(s.match(/class="tl-rain"/g)).toHaveLength(1);
    expect(s).toMatch(/class="tl-rain" x="82"/); // column 4 at 20 px + 2
    const m = timelineSvg(base({ rain: Array(24).fill(null) }), 480);
    expect(m).not.toContain('class="tl-rain"');
    expect(m).not.toContain('yağış yok');
  });
  it('not loaded yet vs missing: different states', () => {
    const s = timelineSvg(base({ wind: undefined, rain: undefined, wave: undefined }), 480);
    for (const t of ['rüzgar yükleniyor', 'yağış yükleniyor', 'dalga yükleniyor']) expect(s).toContain(t);
    expect(timelineSvg(base({ wave: Array(24).fill(null) }), 480)).toContain('dalga verisi yok');
    expect(timelineSvg(base({ wave: Array(24).fill(0) }), 480)).toContain('dalga ≈ 0 m');
  });
  it('safety hours marked; none says so; wind arrows point where the wind blows to', () => {
    const s = timelineSvg(base({ gated: [2, 3, 30] }), 480);
    expect(s.match(/class="tl-gate"/g)).toHaveLength(2);
    expect(timelineSvg(base(), 480)).toContain('güvenlik sınırı aşılan saat yok');
    expect(timelineSvg(base(), 480)).toMatch(/rotate\(315\)/); // from SE (135°) → blows to NW
  });
});
