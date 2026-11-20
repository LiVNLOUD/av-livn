import { describe, expect, it } from 'vitest';
import { AUTUMN_MONTHS, LADDER_MINUTES, METHODS, SINK_NOTE, TIRILYE_ISKELESI, ladder, pickBait, recommendMethods, type MethodContext } from '../src/methods';

const base: MethodContext = { month: 6, light: 'gündüz', depthM: 5, currentMs: 0.1, gustKmh: 15, waveM: 0.2, kind: 'iskele' };
const ids = (a: { id: string }[]) => a.map((m) => m.id);

describe('pickBait', () => {
  it('seasonal: hamsi Oct–Feb, karides otherwise, midye on rock', () => {
    expect(pickBait({ month: 11, kind: 'iskele' })).toBe('hamsi');
    expect(pickBait({ month: 2, kind: 'iskele' })).toBe('hamsi');
    expect(pickBait({ month: 6, kind: 'iskele' })).toBe('karides');
    expect(pickBait({ month: 6, kind: 'kayalik' })).toBe('midye');
  });
  it("the angler's own list wins when the seasonal bait is not on it", () => {
    expect(pickBait({ month: 11, kind: 'iskele', baits: ['hamsi', 'karides'] })).toBe('hamsi');
    expect(pickBait({ month: 11, kind: 'iskele', baits: ['karides'] })).toBe('karides');
    expect(pickBait({ month: 11, kind: 'iskele', baits: [] })).toBe('hamsi');
  });
});

describe('recommendMethods', () => {
  it('lit night, calm, shallow: LRF first; natural bait offered as the second (D6)', () => {
    const a = recommendMethods({ ...base, light: 'aydınlık gece', depthM: 3 });
    expect(a.primary.id).toBe('lrf');
    expect(a.primary.reasons.some((r) => r.kind === 'literatur' && /R19/.test(r.text))).toBe(true);
    expect(a.secondary.category).toBe('dogal');
    expect(a.ranked).toHaveLength(7);
    expect(a.ladderMinutes).toBe(LADDER_MINUTES);
    expect(a.note).toMatch(/doğrulanmamış bir saha kuralı/);
  });
  it('day, deep, current: a sinking method leads; LRF is marked down for current', () => {
    const a = recommendMethods({ ...base, depthM: 8, currentMs: 0.5, gustKmh: 35 });
    expect(['dropshot_yem', 'mikro_jig']).toContain(a.primary.id);
    const lrf = a.ranked.find((m) => m.id === 'lrf')!;
    expect(lrf.reasons.some((r) => /taşır/.test(r.text))).toBe(true);
    const sam = a.ranked.find((m) => m.id === 'samandira')!;
    expect(sam.reasons.some((r) => /sürüklenir/.test(r.text))).toBe(true);
  });
  it('autumn: natural methods carry the anchovy-run line as a HYPOTHESIS; Nov dropshot cites 8 Kas as one field observation', () => {
    const a = recommendMethods({ ...base, month: 11, spotId: TIRILYE_ISKELESI });
    const ds = a.ranked.find((m) => m.id === 'dropshot_yem')!;
    expect(ds.bait).toBe('hamsi');
    expect(ds.reasons.find((r) => r.kind === 'hipotez')!.text).toMatch(/göstermez/);
    expect(ds.reasons.find((r) => r.kind === 'saha')!.text).toMatch(/kontrollü karşılaştırma değil/);
    const lrf = a.ranked.find((m) => m.id === 'lrf')!;
    expect(lrf.reasons.some((r) => r.kind === 'hipotez')).toBe(false);
    expect(lrf.bait).toBeNull();
    expect(AUTUMN_MONTHS).toContain(11);
    // December: hypothesis but no 8 Kas line
    const dec = recommendMethods({ ...base, month: 12 }).ranked.find((m) => m.id === 'dropshot_yem')!;
    expect(dec.reasons.some((r) => r.kind === 'saha')).toBe(false);
  });
  it('V2.9: the 8 Kas line only at Tirilye İskelesi; hypothesis and field lines never change the weight', () => {
    const other = recommendMethods({ ...base, month: 11, spotId: 'osm-way-1' }).ranked.find((m) => m.id === 'dropshot_yem')!;
    expect(other.reasons.some((r) => r.kind === 'saha')).toBe(false);
    const w = (month: number, spotId?: string) => Object.fromEntries(recommendMethods({ ...base, month, spotId }).ranked.map((m) => [m.id, m.weight]));
    // same conditions, with (Nov at Tirilye: hypothesis + field line) and without (June: neither line)
    expect(w(11, TIRILYE_ISKELESI)).toEqual(w(6));
    expect(w(11, 'osm-way-1')).toEqual(w(6));
  });
  it('V2.9: Nov 18:00 at night with an estimated depth ≥ 4 m — no "gündüz" line; depth lines are assumptions', () => {
    const a = recommendMethods({ ...base, month: 11, light: 'karanlık gece', depthM: 6 });
    const all = a.ranked.flatMap((m) => m.reasons);
    expect(all.some((r) => /gündüz/.test(r.text))).toBe(false);
    const depth = all.filter((r) => /derinli(k|ği) [≥<]/.test(r.text));
    expect(depth.length).toBeGreaterThan(0);
    expect(depth.every((r) => r.kind === 'varsayim' && /tahmini derinlik/.test(r.text))).toBe(true);
    // with an approved field depth the same lines are conditions
    const f = recommendMethods({ ...base, month: 11, light: 'karanlık gece', depthM: 6, depthSource: 'saha' }).ranked.flatMap((m) => m.reasons).filter((r) => /derinli(k|ği) [≥<]/.test(r.text));
    expect(f.every((r) => r.kind === 'kosul' && /saha derinliği/.test(r.text))).toBe(true);
    // shallow estimate: the micro jig warning is an assumption too
    const sh = recommendMethods({ ...base, depthM: 2 }).ranked.find((m) => m.id === 'mikro_jig')!.reasons.find((r) => /< 4 m/.test(r.text))!;
    expect(sh.kind).toBe('varsayim');
  });
  it('mode limits the pool; secondary is the next of the same category', () => {
    const s = recommendMethods({ ...base, mode: 'suni' });
    expect(ids(s.ranked).every((id) => METHODS[id as keyof typeof METHODS].category === 'suni')).toBe(true);
    expect(s.secondary.category).toBe('suni');
    const d = recommendMethods({ ...base, mode: 'dogal' });
    expect(d.ranked.every((m) => m.category === 'dogal')).toBe(true);
  });
  it('owned gear first; missing gear marked down; unknown stays neutral', () => {
    const none = recommendMethods(base).ranked.find((m) => m.id === 'lrf')!;
    expect(none.owned).toBeNull();
    const a = recommendMethods({ ...base, owned: { dropshot_kursun: false, igne: true, jighead: true, silikon: true, capari: true } });
    expect(a.ranked.find((m) => m.id === 'dropshot_yem')!.owned).toBe(false);
    expect(a.ranked.find((m) => m.id === 'dropshot_yem')!.reasons.some((r) => r.kind === 'envanter' && /yok/.test(r.text))).toBe(true);
    expect(a.ranked.find((m) => m.id === 'lrf')!.owned).toBe(true);
    expect(a.ranked.find((m) => m.id === 'samandira')!.owned).toBeNull(); // samandira not stated
  });
  it('kind and light branches: rock, beach, night shallow, twilight, missing weather', () => {
    const rock = recommendMethods({ ...base, kind: 'kayalik' }).ranked.find((m) => m.id === 'dip')!;
    expect(rock.reasons.some((r) => /takılır/.test(r.text))).toBe(true);
    const beach = recommendMethods({ ...base, kind: 'kumsal' }).ranked.find((m) => m.id === 'dip')!;
    expect(beach.reasons.some((r) => /kumsal/.test(r.text))).toBe(true);
    const tw = recommendMethods({ ...base, light: 'alacakaranlık', depthM: 2 });
    expect(tw.ranked.find((m) => m.id === 'lrf')!.reasons.some((r) => /alacakaranlık/.test(r.text))).toBe(true);
    expect(tw.ranked.find((m) => m.id === 'mikro_jig')!.reasons.some((r) => /sığ/.test(r.text))).toBe(true);
    const nul = recommendMethods({ ...base, currentMs: null, gustKmh: null, waveM: null, light: 'karanlık gece', depthM: 2, kind: 'diger', mode: 'dogal' });
    // ties keep the pool order (dropshot, dip, …, çapari yemli all weigh 1 here)
    expect(nul.ranked.map((m) => m.weight)).toEqual([...nul.ranked.map((m) => m.weight)].sort((x, y) => y - x));
    expect(ids(nul.ranked).indexOf('dropshot_yem')).toBeLessThan(ids(nul.ranked).indexOf('dip'));
    const day = recommendMethods({ ...base, kind: 'diger' });
    expect(day.ranked.find((m) => m.id === 'capari_tuylu')!.reasons.some((r) => /sürüde/.test(r.text))).toBe(true);
    expect(day.ranked.find((m) => m.id === 'capari_yemli')!.reasons.some((r) => /sürüde/.test(r.text))).toBe(true);
    const litCalm = recommendMethods({ ...base, light: 'aydınlık gece', waveM: 0.1, currentMs: 0 }).ranked.find((m) => m.id === 'samandira')!;
    expect(litCalm.reasons.some((r) => /ışık altında/.test(r.text))).toBe(true);
  });
});

describe('ladder', () => {
  it('one variable per step, in order; natural steps talk about sinker and bait', () => {
    const a = recommendMethods({ ...base, mode: 'dogal' });
    const l = ladder(a.primary, a.secondary);
    expect(l.map((s) => s.change)).toEqual(['katman', 'ağırlık / saydırma', 'boy / profil', 'renk', 'yöntem']);
    expect(l[1]!.detail).toMatch(/kurşun/);
    expect(l[4]!.detail).toMatch(/dene/);
    const s = recommendMethods({ ...base, mode: 'suni' });
    expect(ladder(s.primary, s.secondary)[3]!.detail).toMatch(/siluet/);
    expect(ladder(s.primary, null)[4]!.detail).toBe('başka yönteme geç');
    expect(ladder(s.primary, s.secondary)[4]!.detail).toBe(`${s.secondary.name} dene`); // artificial: no bait in brackets
    expect(SINK_NOTE).toMatch(/ölçülmüş derinlik değildir/);
  });
});
