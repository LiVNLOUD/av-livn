import type { Component } from '../types';
import { paramsOf } from '../params';
import { clamp01, isNum } from '../util';

export function sstLevel(t: number, [lo, hi]: [number, number]): number {
  if (t < lo) return clamp01(1 - (lo - t) / 4);
  if (t > hi) return clamp01(1 - (t - hi) / 4);
  return 1;
}

/** 1 for |Δ| ≤ ok °C over 3 days, 0 at ≥ zero °C. */
export function sstTrend(delta: number, ok = 0.5, zero = 2): number {
  return 1 - clamp01((Math.abs(delta) - ok) / (zero - ok));
}

export const su_sicakligi_ve_3g_trend: Component = ({ series, profile }) => {
  const now = series.now?.sst;
  if (!isNum(now)) return { value: null, reason: 'su sıcaklığı verisi yok' };
  const prm = paramsOf(profile);
  const level = sstLevel(now, prm.sst_ideal_c);
  const before = series.offset(-72)?.sst;
  if (!isNum(before)) return { value: level, reason: `su ${now.toFixed(1)} °C (3 günlük trend yok)` };
  const delta = now - before;
  return {
    value: 0.7 * level + 0.3 * sstTrend(delta, prm.sst_trend_ok_c, prm.sst_trend_zero_c),
    reason: `su ${now.toFixed(1)} °C, 3 günde ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} °C`,
  };
};
