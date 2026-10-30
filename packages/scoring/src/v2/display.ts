// v2 display rules (docs/MODEL.md §11): colour bands on the calibrated 0–100 scale and when the rank, not the
// number, leads the card (wide uncertainty band).
import type { Band } from '../suitability';

/** ≥ good → good (green), ≥ warn → warn (amber), else bad. Calibrated scale: 65 ≈ a clearly good hour, 40 ≈ fair. */
export const BANDS_V2 = { good: 65, warn: 40 } as const;

export function bandV2(total: number | null): Band {
  if (total === null) return 'neutral';
  if (total >= BANDS_V2.good) return 'good';
  if (total >= BANDS_V2.warn) return 'warn';
  return 'bad';
}

/** 10–90 % band wider than this → the card leads with the rank among spots; narrower → with the score. */
export const RANK_FIRST_WIDTH = 30;

export function leadWithRank(p10: number | null, p90: number | null): boolean {
  return p10 === null || p90 === null || p90 - p10 > RANK_FIRST_WIDTH;
}
