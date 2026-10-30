import { describe, expect, it } from 'vitest';
import { bandV2, leadWithRank, RANK_FIRST_WIDTH } from '../../src';

describe('v2 display rules', () => {
  it('bands on the calibrated scale', () => {
    expect([bandV2(null), bandV2(10), bandV2(40), bandV2(64.9), bandV2(65), bandV2(92)]).toEqual(['neutral', 'bad', 'warn', 'warn', 'good', 'good']);
  });
  it('leads with the rank when the band is wide or missing', () => {
    expect(leadWithRank(20, 20 + RANK_FIRST_WIDTH + 1)).toBe(true);
    expect(leadWithRank(20, 20 + RANK_FIRST_WIDTH)).toBe(false);
    expect(leadWithRank(null, 50)).toBe(true);
    expect(leadWithRank(10, null)).toBe(true);
  });
});
