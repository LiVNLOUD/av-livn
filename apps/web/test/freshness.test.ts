import { describe, expect, it } from 'vitest';
import { freshness } from '../src/scripts/format';

const now = Date.parse('2026-11-07T12:00:00Z');
const ago = (min: number) => new Date(now - min * 60000).toISOString();
const icon = (initMin: number) => ({ model: 'dwd_icon_eu', init: ago(initMin), interval_s: 10800 });

describe('N5/§18: data freshness (one rule for the banner and the plan card)', () => {
  it('fresh data: a small line, no warning', () => {
    expect(freshness(ago(40), ago(12), now)).toMatchObject({ weatherMin: 12, scoredMin: 40, stale: false, banner: null, line: 'Hava verisi: 12 dk önce' });
    expect(freshness(ago(5), ago(1), now).line).toBe('Hava verisi: az önce');
    expect(freshness(ago(5), ago(95), now).line).toBe('Hava verisi: 1 sa 35 dk önce');
    expect(freshness(null, null, now)).toMatchObject({ weatherMin: null, scoredMin: null, stale: false, line: 'Hava verisi: henüz alınmadı' });
    expect(freshness('bozuk', undefined, now).scoredMin).toBeNull();
    // the model run is named in the line (local time) and a run within 2 × its interval is fine
    const f = freshness(ago(10), ago(5), now, { wx: icon(300), sea: null, fetch: { at: ago(5), ok: true, errors: 0 } });
    expect(f).toMatchObject({ stale: false, line: 'Hava verisi: 5 dk önce (model 10:00)' });
    expect(f.modelAges).toEqual([{ kind: 'hava', model: 'dwd_icon_eu', min: 300, limitMin: 360 }]);
  });
  it('(a) the fetch the scores used or the scoring older than 2 h', () => {
    const s = freshness(ago(185), ago(200), now);
    expect(s.stale).toBe(true);
    expect(s.short).toBe('Veriler 3 saat eski; hava ve güvenliği ayrıca kontrol edin.');
    expect(s.banner).toBe('Veriler 3 saat eski (son puanlama: 11:55, hava verisi: 11:40). Puanlar eski olabilir; hava ve güvenliği ayrıca kontrol edin.');
    expect(freshness(ago(30), ago(130), now).banner).toMatch(/^Veriler 2 saat eski \(son puanlama: 14:30, hava verisi: 12:50\)/);
    expect(freshness(null, ago(200), now).banner).toMatch(/^Veriler 3 saat eski \(hava verisi: /);
    expect(freshness(ago(120), ago(120), now).stale).toBe(false); // exactly 2 h is not yet stale
  });
  it('(b) the forecast run older than twice the model update interval (ICON-EU 3 h → 6 h)', () => {
    const f = freshness(ago(10), ago(5), now, { wx: icon(400), sea: { model: 'meteofrance_wave', init: ago(100), interval_s: 43200 }, fetch: { at: ago(5), ok: true, errors: 0 } });
    expect(f.stale).toBe(true);
    expect(f.banner).toBe('Hava tahmin modeli 6 saattir güncellenmedi (dwd_icon_eu; olağan aralık 3 sa). Puanlar eski olabilir; hava ve güvenliği ayrıca kontrol edin.');
    expect(f.short).toBe('Tahmin verisi eski olabilir; hava ve güvenliği ayrıca kontrol edin.');
    // unknown model run (not identified) → only the fetch rule
    expect(freshness(ago(10), ago(5), now, { wx: null, sea: null, fetch: null }).stale).toBe(false);
  });
  it('(c) the last fetch attempt failed while the data in use is over an hour old', () => {
    const failed = { wx: icon(200), sea: null, fetch: { at: ago(1), ok: false, errors: 2 } };
    expect(freshness(ago(70), ago(75), now, failed)).toMatchObject({ stale: true, banner: expect.stringMatching(/^Son hava çekimi başarısız\./) });
    expect(freshness(ago(20), ago(25), now, failed).stale).toBe(false); // data still recent
  });
});
