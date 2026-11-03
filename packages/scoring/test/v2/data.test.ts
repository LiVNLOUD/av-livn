import { describe, expect, it } from 'vitest';
import { dataTier, MISSING, missingKeys, missingMask, missingNote } from '../../src/v2/data';

const full = { windKmh: 10, waveM: 0.3, currentMs: 0.1, rain48: 0, sstD48: 0.2 };

describe('data sufficiency (I2)', () => {
  it('complete data → tam, no note', () => {
    expect(missingMask(full)).toBe(0);
    expect(dataTier(0)).toBe('tam');
    expect(missingNote(0)).toBeNull();
  });
  it('wind or wave missing → no recommendation (safety cannot be checked)', () => {
    for (const k of ['windKmh', 'waveM'] as const) {
      const m = missingMask({ ...full, [k]: null });
      expect(dataTier(m)).toBe('yok');
      expect(missingNote(m)).toMatch(/öneri verilmez/);
    }
  });
  it('current or turbidity missing → at most relative', () => {
    expect(dataTier(missingMask({ ...full, currentMs: null }))).toBe('goreli');
    expect(dataTier(missingMask({ ...full, rain48: null }))).toBe('goreli');
    expect(missingNote(MISSING.akinti)).toBe('eksik veri: akıntı');
  });
  it('only water temperature change missing → still tam, but listed', () => {
    const m = missingMask({ ...full, sstD48: null });
    expect(dataTier(m)).toBe('tam');
    expect(missingKeys(m)).toEqual(['su_sicakligi']);
  });
});
