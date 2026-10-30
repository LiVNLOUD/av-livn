export const TZ_OFFSET_MIN = 180; // Europe/Istanbul, fixed UTC+3 since 2016

export function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

export function isNum(x: number | null | undefined): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

/** Signed smallest difference a − b in degrees, range (−180, 180]. */
export function angleDiff(a: number, b: number): number {
  const d = (((a - b) % 360) + 540) % 360 - 180;
  return d === -180 ? 180 : d;
}

/** Local (UTC+3) wall-clock parts of an instant. */
export function localParts(d: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const l = new Date(d.getTime() + TZ_OFFSET_MIN * 60_000);
  return {
    year: l.getUTCFullYear(),
    month: l.getUTCMonth() + 1,
    day: l.getUTCDate(),
    hour: l.getUTCHours(),
    minute: l.getUTCMinutes(),
  };
}

/** Instant of the next local midnight after `d`. */
export function nextLocalMidnight(d: Date): Date {
  const p = localParts(d);
  return new Date(Date.UTC(p.year, p.month - 1, p.day + 1) - TZ_OFFSET_MIN * 60_000);
}

export function hourKey(d: Date): string {
  const h = new Date(d);
  h.setUTCMinutes(0, 0, 0);
  return h.toISOString().slice(0, 13) + ':00Z';
}

export const round1 = (x: number): number => Math.round(x * 10) / 10;
