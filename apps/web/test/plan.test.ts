import { describe, expect, it } from 'vitest';
import { driverOf, driverSentence, equalText, evidenceOf, lightSentence, trust, weatherSentence, type PlanWin } from '../src/scripts/plan';
import { fromServer, parseMy, personalLine, toProfiles } from '../src/scripts/mytackle';
import { DEFAULT_PROFILES } from '@av-livn/scoring';

const w = (o: Partial<PlanWin>): PlanWin => ({ why: null, assumed: false, tier: 'guclu', missing: null, top3: 0.8, p10: 60, p90: 80, ...o });
// real reason texts (workers/api precompute_v2 reasonText, after plainReason)
const YAPI = 'Mendirek tipi (tip tercihi varsayım, kanıt C; OSM)';
const LAMBA = 'İskele aydınlatması olasılığı 0,50 (varsayım, kanıt yok)';
const DEPTH = 'Atış mesafesinde ~1.8 m su (EMODnet enterpolasyonu, ölçüm değil)';
const EXPO = 'Kuzey rüzgarına daha az açık (20 km/sa) (kıyı geometrisinden hesap, OSM; rüzgar Open-Meteo modeli)';

describe('M1 plan sentences', () => {
  it('driver of a reason line', () => {
    expect([YAPI, LAMBA, DEPTH, EXPO, 'Dip: kum (EUSeaMap bölgesel sınıflandırma)', 'başka', null].map(driverOf)).toEqual(['yapi', 'lamba', 'derinlik', 'maruziyet', 'taban', null, null]);
  });
  it('L1 rule: largest contribution on an assumption → low trust, said in plain words', () => {
    expect(trust(w({ why: YAPI, assumed: true }))).toEqual({ level: 'Düşük', text: 'Bu öneri çoğunlukla yer tipine dair varsayıma dayanıyor; sahada doğrulanmadı.' });
    expect(trust(w({ why: LAMBA, assumed: true })).text).toMatch(/ışık olması muhtemel varsayımına/);
    expect(trust(w({ why: DEPTH, assumed: true })).text).toMatch(/derinlik ölçülmedi/);
    expect(trust(w({ why: 'x', assumed: true })).text).toMatch(/doğrulanmamış bir varsayıma/);
    expect(trust(w({ missing: 'eksik veri: akıntı' })).level).toBe('Düşük');
    expect(trust(w({ tier: 'goreli' })).level).toBe('Orta');
    expect(trust(w({ top3: 0.4 })).level).toBe('Orta');
    expect(trust(w({ p10: 40, p90: 85 })).level).toBe('Orta');
    for (const x of [w({ why: YAPI, assumed: true }), w({ top3: 0.4 }), w({})]) expect(trust(x).text).not.toMatch(/kanıt [ABC]|bant|ilk 3|%/);
  });
  it('N3: "Yüksek" only after the forward calibration has passed; until then at most "Orta"', () => {
    expect(trust(w({ why: EXPO }))).toMatchObject({ level: 'Orta', text: expect.stringMatching(/ileriye dönük av kaydıyla henüz doğrulanmadı \(en fazla Orta\)/) });
    expect(trust(w({ why: EXPO }), { calibrated: false }).level).toBe('Orta');
    expect(trust(w({ why: EXPO }), { calibrated: true }).level).toBe('Yüksek');
    // the cap never lifts a lower level
    expect(trust(w({ why: YAPI, assumed: true }), { calibrated: true }).level).toBe('Düşük');
  });
  it('N2: every reason sentence carries its evidence type in plain words', () => {
    // lamp: prior, desk data, remote observation, field
    expect(driverSentence(LAMBA)).toBe('İskelede ışık olması muhtemel (doğrulanmadı).');
    expect(driverSentence('İskele aydınlatması olasılığı 0,60 (masa başı veri, onay bekliyor)')).toBe('İskelede ışık var gibi görünüyor (harita/fotoğraf verisi, sahada doğrulanmadı).');
    expect(driverSentence('İskele aydınlatması olasılığı 0,60 (uzaktan gözlem)')).toMatch(/\(uzaktan gözlem, sahada doğrulanmadı\)/);
    expect(driverSentence('İskele aydınlatması (saha bilgisi, değer gizli)')).toMatch(/^İskele ışığı sahada doğrulandı/);
    expect(driverSentence('İskele aydınlatması yok (masa başı veri)')).toMatch(/^İskelede ışık yok \(harita\/fotoğraf/);
    expect(driverSentence('İskele aydınlatması yok (saha ölçümü)')).toMatch(/sahada görüldü/);
    expect(driverSentence('İskele aydınlatması yok (uzaktan gözlem)')).toMatch(/uzaktan gözlem, sahada doğrulanmadı/);
    // an unobserved lamp is never stated as a fact
    for (const t of [LAMBA, 'İskele aydınlatması olasılığı 0,60 (masa başı veri, onay bekliyor)']) expect(driverSentence(t)).not.toMatch(/^(Gece )?iskele ışığı/i);
    // structure, depth, bottom, exposure
    expect(driverSentence(YAPI)).toBe('Mendirek: model bu yer tipini avantajlı sayıyor (tip tercihi varsayım, av kaydıyla doğrulanmadı).');
    expect(driverSentence('yapı (saha bilgisi, değer gizli)')).toMatch(/^Yapı sahada doğrulandı/);
    expect(driverSentence(DEPTH)).toBe('Atış mesafesinde yeterli su var (harita tahmini, ölçülmedi).');
    expect(driverSentence('Atış mesafesinde ~4 m su (EMODnet ölçümü)')).toMatch(/\(deniz haritası ölçümü\)/);
    expect(driverSentence('Atış mesafesinde ~3 m su (yapı uzunluğundan tahmin, ölçüm değil)')).toMatch(/\(yapı boyundan tahmin, ölçülmedi\)/);
    expect(driverSentence('Derinlik (saha ölçümü, değer gizli)')).toMatch(/\(sahada ölçüldü\)/);
    expect(driverSentence('Atış mesafesinde ~3 m su (x)')).toMatch(/\(kaynağı doğrulanmadı\)/);
    expect(driverSentence('Dip: kum (EUSeaMap bölgesel sınıflandırma)')).toMatch(/\(bölgesel harita, ölçülmedi\)/);
    expect(driverSentence('Dip (saha bilgisi, değer gizli)')).toMatch(/\(sahada gözlendi\)/);
    expect(driverSentence(EXPO)).toMatch(/rüzgardan .*\(kıyı şekli ve rüzgar tahmininden hesap\)/);
    expect(driverSentence('Başka bir şey (x)')).toBe('Başka bir şey (kaynağı doğrulanmadı).');
    expect(driverSentence(null)).toBeNull();
    expect(evidenceOf('x (EUSeaMap)')).toBe('bolgesel');
    expect(evidenceOf(null)).toBeNull();
  });
  it('plain weather, light and equal-options sentences (no jargon)', () => {
    expect(weatherSentence(8, 12, 0.2)).toBe('Hava sakin: rüzgar 8 km/sa, dalga 0,2 m (hava tahmini).');
    expect(weatherSentence(20, 30, null)).toBe('Hafif rüzgarlı: rüzgar 20 km/sa (hava tahmini).');
    expect(weatherSentence(35, null, 1.4)).toMatch(/^Rüzgarlı/);
    expect(weatherSentence(null, null, null)).toBe('Rüzgar ve dalga verisi eksik.');
    expect([lightSentence(-20, '21:00'), lightSentence(-3, '18:00'), lightSentence(30, '12:00'), lightSentence(null, '09:00')]).toEqual(['En iyi saat 21:00, hava kararmışken.', 'En iyi saat 18:00, alacakaranlık.', 'En iyi saat 12:00, gündüz.', 'En iyi saat 09:00.']);
    expect(equalText(2)).toBe('İki yer de aynı derecede iyi görünüyor; model birini öne çıkaramıyor.');
    expect(equalText(3)).toMatch(/^Üç yer/);
    expect(equalText(4)).toMatch(/^4 yer/);
  });
});

describe('M2 device tackle profile', () => {
  it('parse, profiles and personal line', () => {
    expect(parseMy(null)).toBeNull();
    expect(parseMy('{bad')).toBeNull();
    expect(parseMy('{"light":{"min":3,"max":1}}')).toBeNull();
    const my = parseMy(JSON.stringify({ light: { min: 0.6, max: 3, line: 'PE 0.3', leader: 'FC 4 lb' } }))!;
    expect(my).toEqual({ light: { min: 0.6, max: 3, line: 'PE 0.3', leader: 'FC 4 lb' }, heavy: null });
    const { profiles, personal } = toProfiles(my);
    expect(personal).toEqual({ lrf: true, spin: false });
    expect(profiles[0]).toMatchObject({ id: 'lrf', jigMin: 0.6, jigMax: 3, line: 'PE 0.3 + FC 4 lb', name: 'Senin hafif takımın (0,6–3 g)' });
    expect(profiles[1]).toEqual(DEFAULT_PROFILES[1]);
    expect(toProfiles(null).profiles).toEqual(DEFAULT_PROFILES);
    expect(toProfiles({ light: null, heavy: { min: 7, max: 21, line: '', leader: '' } }).profiles[1]!.line).toBe(DEFAULT_PROFILES[1]!.line);
    expect(personalLine('Ultra hafif LRF · 1 g sabit jighead', 'lrf', personal)).toBe('Hafif takımın · 1 g sabit jighead');
    expect(personalLine('Hafif spin · 8 g', 'spin', personal)).toBe('Hafif spin · 8 g');
    expect(personalLine('Spin · 21 g', 'spin', { lrf: false, spin: true })).toBe('Ağır takımın · 21 g');
  });
  it('moving the server set to the device keeps the values', () => {
    const m = fromServer([{ id: 'lrf', name: 'x', jigMin: 0.6, jigMax: 5, maxGustKmh: 25, line: 'PE 0.2 + FC 0.8–1.2 numara (≈3–5 lb)' }, { id: 'spin', name: 'y', jigMin: 6, jigMax: 32, maxGustKmh: 50, line: 'PE 0.8' }]);
    expect(m).toEqual({ light: { min: 0.6, max: 5, line: 'PE 0.2', leader: 'FC 0.8–1.2 numara (≈3–5 lb)' }, heavy: { min: 6, max: 32, line: 'PE 0.8', leader: '' } });
    expect(fromServer([])).toEqual({ light: null, heavy: null });
  });
});
