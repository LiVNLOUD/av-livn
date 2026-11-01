import { describe, expect, it } from 'vitest';
import { columnMax, groupSame, isGroup, rankLabel, splitBeaches, tieCounts } from '../src/scripts/grouping';

describe('G3 grouping', () => {
  it('groups identical signatures at the first member, leaves others', () => {
    const items = [{ id: 'a', s: '1' }, { id: 'b', s: '2' }, { id: 'c', s: '1' }, { id: 'd', s: null }, { id: 'e', s: '3' }];
    const out = groupSame(items, (x) => x.s);
    expect(out.map((x) => (isGroup(x) ? `[${x.group.map((g) => g.id).join('')}]` : x.id))).toEqual(['[ac]', 'b', 'd', 'e']);
    expect(groupSame(items, (x) => x.s, 3)).toHaveLength(5);
  });
  it('rank labels with ties', () => {
    expect(rankLabel(46, 18)).toBe('46.–63. eşit');
    expect(rankLabel(3, 1)).toBe('3.');
    const t = tieCounts([1, 2, 2, 4, null]);
    expect([t.get(1), t.get(2), t.get(4)]).toEqual([1, 2, 1]);
  });
  it('beaches split off, column max', () => {
    const r = splitBeaches([{ kind: 'pier' }, { kind: 'beach' }, { kind: 'rocky' }]);
    expect([r.main.length, r.beaches.length]).toEqual([2, 1]);
    expect(columnMax([[1, null, 3], [2, null, null]], 3)).toEqual([2, null, 3]);
  });
});

describe('H5 date labels', async () => {
  const { fmtDay } = await import('../src/scripts/format');
  const { dayLabel, hourStep } = await import('../src/scripts/heatmap');
  it('full weekday first, never two-letter days', () => {
    expect(fmtDay('2026-11-01T12:00:00Z')).toBe('Pazar 1 Kas');
    expect(fmtDay('2026-11-02T12:00:00Z')).toBe('Pazartesi 2 Kas');
    const d = new Date(Date.UTC(2026, 10, 1, 0));
    expect(dayLabel(d, 400)).toBe('Pazar 1 Kasım');
    expect(dayLabel(d, 85)).toBe('Pazar 1 Kas');
    expect(dayLabel(d, 60)).toBe('Pazar 1');
    expect(dayLabel(d, 50)).toBe('1 Kas');
    expect(dayLabel(d, 20)).toBe('');
    for (const px of [20, 50, 60, 85, 400]) expect(dayLabel(d, px)).not.toMatch(/^(Paz|Pzt|Pa|Pt) /);
  });
  it('hour ticks thin out so labels never touch', () => {
    expect(hourStep(16)).toBe(3);
    expect(hourStep(6)).toBe(6);
    expect(hourStep(3)).toBe(12);
    expect(hourStep(1)).toBe(24);
    for (const cw of [1, 2, 4, 6, 9, 12, 16, 24]) expect(hourStep(cw) * cw >= 26 || hourStep(cw) === 24).toBe(true);
  });
});
