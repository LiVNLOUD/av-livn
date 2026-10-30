import type { Component } from '../types';
import { clamp01, isNum } from '../util';

/** Pressure tendency (hPa/h) → value. Stable or slow fall best, fast rise worst. */
export function pressureValue(rate: number): number {
  if (rate > 0.3) return 1 - clamp01((rate - 0.3) / 1.2);
  if (rate < -0.5) return 1 - 0.7 * clamp01((-0.5 - rate) / 1.5);
  return 1;
}

export const basinc_trendi_3_6s: Component = ({ series }) => {
  const p0 = series.now?.pressure;
  if (!isNum(p0)) return { value: null, reason: 'basınç verisi yok' };
  const rates: number[] = [];
  const p3 = series.offset(-3)?.pressure;
  const p6 = series.offset(-6)?.pressure;
  if (isNum(p3)) rates.push((p0 - p3) / 3);
  if (isNum(p6)) rates.push((p0 - p6) / 6);
  if (rates.length === 0) return { value: null, reason: 'basınç geçmişi yok' };
  const rate = rates.reduce((a, b) => a + b, 0) / rates.length;
  const label = rate > 0.3 ? 'yükseliyor' : rate < -0.5 ? 'hızlı düşüyor' : rate < -0.1 ? 'yavaş düşüyor' : 'stabil';
  return { value: pressureValue(rate), reason: `${p0.toFixed(0)} hPa, ${label} (${rate >= 0 ? '+' : ''}${rate.toFixed(2)} hPa/sa)` };
};
