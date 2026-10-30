/** Clamp a number into [0, 1]. Shared helper for all score components. */
export function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.min(1, Math.max(0, x));
}
