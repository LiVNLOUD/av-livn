import { describe, expect, it } from 'vitest';
import { clamp01 } from '../src/index';

describe('clamp01', () => {
  it('clamps below, above and inside the range', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.4)).toBe(0.4);
  });
  it('maps NaN to 0', () => {
    expect(clamp01(Number.NaN)).toBe(0);
  });
});
