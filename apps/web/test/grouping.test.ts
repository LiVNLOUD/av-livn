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
