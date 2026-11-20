import { describe, expect, it } from 'vitest';
import { fromServer, parseMy, personalLine, toOwned, toProfiles } from '../src/scripts/mytackle';

describe('mytackle v2 (on-device inventory)', () => {
  it('old records (two sets only) still parse; nothing about gear is assumed', () => {
    const m = parseMy(JSON.stringify({ light: { min: 0.5, max: 5, line: 'PE 0.3', leader: '4 lb' }, heavy: null }));
    expect(m?.light?.max).toBe(5);
    expect(m?.gear).toBeUndefined();
    expect(toOwned(m)).toEqual({ owned: undefined, baits: undefined, mode: 'hepsi' });
  });
  it('gear lists are cleaned, deduplicated and sorted; unknown baits and modes dropped', () => {
    const m = parseMy(JSON.stringify({ mode: 'dogal', gear: { jighead: [2, 1, 1, 'x', -3], silikon: [4], mikroJig: [], kursun: [20], igne: [8], samandira: true, capari: 'yes', baits: ['hamsi', 'solucan'] } }));
    expect(m?.mode).toBe('dogal');
    expect(m?.gear).toEqual({ jighead: [1, 2], silikon: [4], mikroJig: [], kursun: [20], igne: [8], samandira: true, capari: false, baits: ['hamsi'] });
    const o = toOwned(m);
    expect(o.mode).toBe('dogal');
    expect(o.baits).toEqual(['hamsi']);
    expect(o.owned).toMatchObject({ jighead: true, mikro_jig: false, dropshot_kursun: true, dip_kursun: true, samandira: true, capari: false });
    expect(parseMy(JSON.stringify({ mode: 'hepsi', gear: { baits: [] } }))?.gear?.baits).toEqual([]);
    expect(toOwned(parseMy(JSON.stringify({ gear: {} }))).baits).toBeUndefined();
  });
  it('a record with only a mode is kept; garbage is "not set"', () => {
    expect(parseMy(JSON.stringify({ mode: 'suni' }))?.mode).toBe('suni');
    expect(parseMy(JSON.stringify({ mode: 'baska' }))).toBeNull();
    expect(parseMy('{')).toBeNull();
    expect(parseMy(null)).toBeNull();
  });
  it('profiles and the personal line are unchanged by the gear section', () => {
    const m = parseMy(JSON.stringify({ light: { min: 1, max: 3, line: '', leader: '' }, gear: { jighead: [1] } }));
    const p = toProfiles(m);
    expect(p.personal).toEqual({ lrf: true, spin: false });
    expect(personalLine('LRF · 1 g', 'lrf', p.personal)).toBe('Hafif takımın · 1 g');
    expect(fromServer(p.profiles).light?.min).toBe(1);
  });
});
