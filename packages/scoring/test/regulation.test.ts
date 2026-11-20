import { describe, expect, it } from 'vitest';
import { BAG_KG, LEGAL_MIN_CM, OTHER_SPECIES, bagCheck, sizeWarning } from '../src/regulation';
import { LEGAL_MIN_ISTAVRIT_CM, LEGAL_MIN_LEVREK_CM } from '../src/tackle';

describe('regulation (6/2 Tebliğ, 2026/26)', () => {
  it('istavrit minimum is 12 cm since 2026/26; the engine reads the same table', () => {
    expect(LEGAL_MIN_CM.istavrit).toBe(12);
    expect(LEGAL_MIN_ISTAVRIT_CM).toBe(12);
    expect(LEGAL_MIN_LEVREK_CM).toBe(25);
  });
  it('izmarit is not in Çizelge 7: no minimum size', () => {
    expect(OTHER_SPECIES).toContain('izmarit');
    expect(LEGAL_MIN_CM.izmarit).toBeUndefined();
    expect(sizeWarning('izmarit', 8)).toBeNull();
  });
  it('size warning below the minimum only, with a comma decimal', () => {
    expect(sizeWarning('istavrit', 11.5)).toBe('11,5 cm istavrit yasal asgari boyun (12 cm) altında — denize geri bırakın.');
    expect(sizeWarning('istavrit', 12)).toBeNull();
    expect(sizeWarning('istavrit', null)).toBeNull();
  });
  it('bag check follows md. 15(4) sentence by sentence', () => {
    // (6, 6): one fish of 6 kg — "tek bireyin 5 kg'ı geçmesi halinde, bu birey yasal limitler dâhilinde kabul edilir"
    expect(bagCheck(6, 6).level).not.toBe('asti');
    // (5,5, 3): total over 5, rest 2,5 ≤ 4 — "geri kalan balıkların toplam ağırlığının 4 kg'ı geçmemesi halinde … kabul edilir"
    expect(bagCheck(5.5, 3).level).not.toBe('asti');
    // (4,5, 0,2): total ≤ 5 — "5 kg'ı geçemez" is met; the 4 kg rest rule only matters above 5 kg (rest 4,3)
    expect(bagCheck(4.5, 0.2).level).not.toBe('asti');
    // (5,2, 1,5): total over 5, rest 3,7 ≤ 4 — sentence 3, legal
    expect(bagCheck(5.2, 1.5).level).not.toBe('asti');
    // (5,6, 1): total over 5 and rest 4,6 over 4 — neither sentence 1 nor sentence 3 holds
    expect(bagCheck(5.6, 1).level).toBe('asti');
    expect(bagCheck(5.6, 1).text).toMatch(/md\. 15\(4\)/);
    // information line near the limit, nothing far below it
    expect(bagCheck(4.5, 0.2)).toMatchObject({ level: 'yaklasti' });
    expect(bagCheck(BAG_KG - 0.5).level).toBe('yaklasti');
    expect(bagCheck(2)).toEqual({ level: 'ok', text: '' });
    // largest fish larger than the total is read as the total; negative as none
    expect(bagCheck(3, 9).level).toBe('ok');
    expect(bagCheck(3.5, -1).level).toBe('yaklasti');
  });
});
