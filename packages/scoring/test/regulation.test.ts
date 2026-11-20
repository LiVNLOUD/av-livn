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
  it('bag: 5 kg total, 4 kg without the largest fish (md. 15(4))', () => {
    expect(bagCheck(2).level).toBe('ok');
    expect(bagCheck(2).text).toBe('');
    expect(bagCheck(4.1, 0.2).level).toBe('yaklasti'); // rest 3.9, total within 1 kg of 5
    expect(bagCheck(4.2, 0.1).level).toBe('asti'); // rest 4.1 > 4
    expect(bagCheck(4.0, 0.5).level).toBe('yaklasti'); // total within 1 kg of 5
    expect(bagCheck(4.5, 0.4).level).toBe('asti'); // rest 4.1 > 4
    expect(bagCheck(BAG_KG + 0.1, 3).level).toBe('asti');
    expect(bagCheck(4.6, 1.5).level).toBe('yaklasti'); // rest 3.1, total ≥ 4
    expect(bagCheck(3.5).level).toBe('ok');
    expect(bagCheck(3.5, -1).level).toBe('ok');
    expect(bagCheck(5.2, 1.5).text).toMatch(/md\. 15\(4\)/);
  });
});
