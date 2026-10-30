import { describe, expect, it } from 'vitest';
import { packDetail, unpackDetail, type Detail } from '../src/packed';

const detail: Detail = {
  meta: { computed_at: 'now', weather_fetched_at: 'w', sea_fetched_at: null, sea_grid: null, conditions: [{ key: 'ruzgar', label: 'Rüzgar', target: 't', affects: true }] },
  hours: [0, 1, 2].map((i) => ({
    ts: `2026-11-05T1${i}:00Z`,
    total: i === 2 ? null : 10 * i,
    raw: 40,
    gated: i === 1,
    warnings: i === 1 ? ['uyarı'] : [],
    missing: i === 2 ? ['akinti'] : [],
    components: [
      { key: 'ruzgar_dalga_kiyiya_gore', weight: 27, value: 0.12345, contribution: 3.33315, reason: 'r' },
      { key: 'akinti', weight: 13, value: i === 2 ? null : 1, contribution: i === 2 ? null : 13, reason: 'a' },
    ],
    multipliers: [{ key: 'gece_carpani', value: 0.25, phase: 'day', reason: 'gündüz' }],
    conditions: [{ key: 'ruzgar', display: '5 km/sa', suitability: 0.98765, band: 'good' }],
  })),
};

describe('packed detail', () => {
  it('round-trips with rounded numbers and derived missing keys', () => {
    const back = unpackDetail(JSON.parse(JSON.stringify(packDetail(detail))));
    expect(back.meta).toEqual(detail.meta);
    expect(back.hours).toHaveLength(3);
    expect(back.hours[1]).toMatchObject({ total: 10, gated: true, warnings: ['uyarı'], missing: [] });
    expect(back.hours[2]!.missing).toEqual(['akinti']);
    expect(back.hours[0]!.components[0]).toEqual({ key: 'ruzgar_dalga_kiyiya_gore', weight: 27, value: 0.123, contribution: 3.333, reason: 'r' });
    expect(back.hours[0]!.conditions[0]).toEqual({ key: 'ruzgar', display: '5 km/sa', suitability: 0.988, band: 'good' });
    expect(back.hours[0]!.multipliers).toEqual(detail.hours[0]!.multipliers);
  });

  it('slices hours and handles empty details and missing multipliers', () => {
    const p = packDetail(detail);
    expect(unpackDetail(p, 1, 1).hours.map((h) => h.ts)).toEqual(['2026-11-05T11:00Z']);
    expect(packDetail({ meta: detail.meta, hours: [] }).meta).toMatchObject({ comps: [], mult: null });
    const noMult = packDetail({ ...detail, hours: [{ ...detail.hours[0]!, multipliers: [] }] });
    expect(noMult.h[0]![6]).toBeNull();
    expect(unpackDetail(noMult).hours[0]!.multipliers).toEqual([]);
  });
});
