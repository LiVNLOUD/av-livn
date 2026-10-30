import { describe, expect, it } from 'vitest';
import { contrast, PAGE_BG, PALETTE } from '../src/scripts/palette';

describe('suitability palette', () => {
  it.each(Object.entries(PALETTE))('%s colour has ≥ 4.5:1 contrast on the page background', (_band, p) => {
    expect(contrast(p.color, PAGE_BG)).toBeGreaterThanOrEqual(4.5);
  });

  it('every band carries an icon and a label, not colour alone', () => {
    for (const p of Object.values(PALETTE)) {
      expect(p.icon.length).toBeGreaterThan(0);
      expect(p.label.length).toBeGreaterThan(2);
    }
  });

  it('contrast is symmetric and 21:1 for black/white', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#000000')).toBeCloseTo(21, 5);
  });
});
