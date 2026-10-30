import type { Component } from '../types';
import { clamp01, isNum } from '../util';

export function sstLevel(t: number, [lo, hi]: [number, number]): number {
  if (t < lo) return clamp01(1 - (lo - t) / 4);
  if (t > hi) return clamp01(1 - (t - hi) / 4);
  return 1;
}

/** 1 for |Δ| ≤ 0.5 °C over 3 days, 0 at ≥ 2 °C. */
export function sstTrend(delta: number): number {
  return 1 - clamp01((Math.abs(delta) - 0.5) / 1.5);
}

export const su_sicakligi_ve_3g_trend: Component = ({ series, profile }) => {
  const now = series.now?.sst;
  if (!isNum(now)) return { value: null, reason: 'su sıcaklığı verisi yok' };
  const level = sstLevel(now, profile.params.sst_ideal_c ?? [14, 20]);
  const before = series.offset(-72)?.sst;
  if (!isNum(before)) return { value: level, reason: `su ${now.toFixed(1)} °C (3 günlük trend yok)` };
  const delta = now - before;
  return {
    value: 0.7 * level + 0.3 * sstTrend(delta),
    reason: `su ${now.toFixed(1)} °C, 3 günde ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} °C`,
  };
};
