import { describe, expect, it } from 'vitest';
import { spotFeatures } from '../src/scripts/declutter';
import { ablative, nowVsPlan } from '../src/scripts/plan';
import { stripSvg } from '../src/scripts/strip';
import { lureFill, rigSvg } from '../src/scripts/rig';
import { visibleTicks } from '../src/scripts/heatmap';

describe('O2: one map feature and one label per spot', () => {
  const s = (id: string, extra = {}) => ({ id, name: `M ${id}`, lon: 29, lat: 40.4, total: 60, gated: false, rank: 1, ...extra });
  it('a spot spread off its true position is still one feature; at most one pick; gated shows the safety mark', () => {
    const f = spotFeatures([{ s: s('a'), lon: 29.001, lat: 40.4 }, { s: s('b', { gated: true, total: 30 }), lon: 29, lat: 40.401 }, { s: s('c', { total: null, rank: null }), lon: 29, lat: 40.4 }], 'a');
    expect(f).toHaveLength(3);
    expect(f.filter((x) => x.properties.pick).map((x) => x.properties.id)).toEqual(['a']);
    expect(f[0]!.geometry.coordinates).toEqual([29.001, 40.4]); // shown position, not the true one
    expect(new Set(f.map((x) => x.properties.label)).size).toBe(3);
    expect(f[1]!.properties).toMatchObject({ score: '!', label: 'M b · güvenlik', gated: true });
    expect(f[2]!.properties).toMatchObject({ score: '–', total: -1, rank: 99 });
    expect(spotFeatures([{ s: s('a'), lon: 29, lat: 40 }], null)[0]!.properties.pick).toBe(false);
  });
});

describe('O3: now vs the plan hour', () => {
  it('safety cap now: says why and from when it calms', () => {
    expect(nowVsPlan({ nowGated: true, gustKmh: 44, waveM: 0.4, calmFrom: '20:00', planIsNow: false, nowTotal: 30, planTime: '21:00' }))
      .toBe("Şu an rüzgar sert (hamle 44 km/sa, güvenli değil); 20:00'den sonra yatışıyor.");
    expect(nowVsPlan({ nowGated: true, gustKmh: 20, waveM: 1.4, calmFrom: '19:00', planIsNow: false, nowTotal: 30, planTime: '21:00' })).toMatch(/^Şu an dalga yüksek \(1,4 m, güvenli değil\); 19:00'dan sonra/);
    expect(nowVsPlan({ nowGated: true, gustKmh: null, waveM: null, calmFrom: null, planIsNow: false, nowTotal: 30, planTime: '21:00' })).toMatch(/güvenlik sınırı .* önümüzdeki saatlerde de sürüyor/);
    expect(nowVsPlan({ nowGated: false, gustKmh: 10, waveM: 0.2, calmFrom: null, planIsNow: false, nowTotal: 48, planTime: '21:00' })).toBe('Şu an puan 48; en iyi saat 21:00.');
    expect(nowVsPlan({ nowGated: false, gustKmh: 10, waveM: 0.2, calmFrom: null, planIsNow: false, nowTotal: null, planTime: '21:00' })).toBeNull();
    expect(nowVsPlan({ nowGated: true, gustKmh: 44, waveM: 0, calmFrom: '20:00', planIsNow: true, nowTotal: 30, planTime: '21:00' })).toBeNull();
  });
  it('Turkish ablative for clock times', () => {
    expect(['00:00', '01:00', '03:00', '06:00', '09:00', '10:00', '19:00', '20:00', '21:00', '23:00'].map(ablative)).toEqual(['dan', 'den', 'ten', 'dan', 'dan', 'dan', 'dan', 'den', 'den', 'ten']);
  });
});

describe('O4: 24-hour strip and tackle picture', () => {
  it('strip: 24 cells, safety hours hatched, window framed, selected hour marked', () => {
    const t = Array.from({ length: 30 }, (_, i) => (i === 5 ? null : 40 + i));
    const svg = stripSvg({ fromHour: 491000, t, gated: [0, 1], window: [8, 12], selected: 9 });
    expect((svg.match(/class="st-cell/g) ?? []).length).toBe(24);
    expect((svg.match(/class="st-cell gated"/g) ?? []).length).toBe(2);
    expect(svg).toContain('fill="url(#st-gate)"');
    expect(svg).toContain('class="st-win"');
    expect(svg).toContain('class="st-sel"');
    expect(svg).toContain('puan yok');
    const none = stripSvg({ fromHour: 491000, t: t.slice(0, 6), gated: [], window: [30, 40], selected: -1 });
    expect(none).not.toContain('st-win');
    expect(none).not.toContain('st-sel');
  });
  it('rig: target layer highlighted, count range, two variants when the lamp is unknown, no brand', () => {
    const one = rigSvg([{ weightG: 1.2, lureCm: 5, color: 'şeffaf-simli', zone: 'yüzeye yakın', sink: '2–4 sn' }]);
    expect(one).toContain('class="rg-zone on" x="4" y="34">yüzeye yakın');
    expect(one).toContain('1,2 g · 5 cm · say 2–4 sn');
    expect(one).not.toContain('rg-var');
    const two = rigSvg([
      { label: 'ışık suya düşüyorsa', weightG: 1.2, lureCm: 5, color: 'şeffaf-simli', zone: 'yüzeye yakın', sink: '3–5 sn' },
      { label: 'karanlıksa', weightG: 1.2, lureCm: 5, color: 'koyu siluet', zone: 'yüzeye yakın', sink: null },
      { label: 'fazla', weightG: 1, lureCm: 4, color: 'x', zone: 'orta su', sink: null },
    ]);
    expect((two.match(/class="rg-var"/g) ?? []).length).toBe(2);
    expect(two).toContain('karanlıksa');
    expect(two).not.toMatch(/Gosen|Ares|Bassterra|Daiwa|Shimano/);
    expect([lureFill('koyu siluet'), lureFill('parlak'), lureFill('doğal'), lureFill('?')]).toEqual(['#463f63', '#e8e23a', '#c9b28a', '#c9b28a']);
    expect(rigSvg([{ weightG: 10, lureCm: 12, color: 'beyaz', zone: 'dibe yakın', sink: null }])).toContain('class="rg-zone on" x="4" y="94">dibe yakın');
  });
});

describe('O6: the "now" label never touches an hour label', () => {
  it('ticks overlapping the now box are dropped, the others kept', () => {
    const ticks = [0, 40, 80, 120].map((x, k) => ({ x, text: String(k * 3).padStart(2, '0') }));
    const now: [number, number] = [70, 111];
    const kept = visibleTicks(ticks, now);
    expect(kept.map((t) => t.x)).toEqual([0, 40, 120]);
    for (const t of kept) expect(t.x + 2 * 6.6 + 8 <= now[0] || t.x >= now[1]).toBe(true);
  });
});
