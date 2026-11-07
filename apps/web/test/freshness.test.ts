import { describe, expect, it } from 'vitest';
import { freshness } from '../src/scripts/format';

const now = Date.parse('2026-11-07T12:00:00Z');
const ago = (min: number) => new Date(now - min * 60000).toISOString();

describe('N5: data freshness (one rule for the banner and the plan card)', () => {
  it('fresh data: a small line, no warning', () => {
    expect(freshness(ago(40), ago(12), now)).toMatchObject({ weatherMin: 12, scoredMin: 40, stale: false, banner: null, line: 'Hava verisi: 12 dk önce' });
    expect(freshness(ago(5), ago(1), now).line).toBe('Hava verisi: az önce');
    expect(freshness(ago(5), ago(95), now).line).toBe('Hava verisi: 1 sa 35 dk önce');
    expect(freshness(null, null, now)).toMatchObject({ weatherMin: null, scoredMin: null, stale: false, line: 'Hava verisi: henüz alınmadı' });
    expect(freshness('bozuk', undefined, now).scoredMin).toBeNull();
  });
  it('past 2 h either the scoring or the weather makes it stale, with the existing banner text', () => {
    const s = freshness(ago(185), ago(20), now);
    expect(s.stale).toBe(true);
    expect(s.short).toBe('Veriler 3 saat eski; hava ve güvenliği ayrıca kontrol edin.');
    expect(s.banner).toBe('Veriler 3 saat eski (son puanlama: 11:55, hava verisi: 14:40). Puanlar eski olabilir; hava ve güvenliği ayrıca kontrol edin.');
    const w = freshness(ago(30), ago(130), now);
    expect(w.stale).toBe(true);
    expect(w.banner).toMatch(/^Veriler 2 saat eski \(son puanlama: 14:30, hava verisi: 12:50\)/);
    expect(freshness(null, ago(200), now).banner).toMatch(/^Veriler 3 saat eski \(hava verisi: /);
    expect(freshness(ago(120), ago(120), now).stale).toBe(false); // exactly 2 h is not yet stale
  });
});
