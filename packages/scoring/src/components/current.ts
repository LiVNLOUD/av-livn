import type { Component } from '../types';
import { paramsOf } from '../params';
import { isNum } from '../util';

/** Current speed (m/s): slack penalised, moderate ideal, strong penalised to 0. */
export function currentValue(v: number, [lo, hi]: [number, number] = [0.05, 0.25], max = 0.6): number {
  if (v < lo) return 0.3 + 0.7 * (v / lo);
  if (v <= hi) return 1;
  if (v >= max) return 0;
  return 1 - (v - hi) / (max - hi);
}

export function currentLabel(v: number, [lo, hi]: [number, number]): string {
  return v < lo ? 'durgun' : v <= hi ? 'orta' : 'sert';
}

export const akinti: Component = ({ series, profile }) => {
  const v = series.now?.curVel;
  if (!isNum(v)) return { value: null, reason: 'akıntı verisi yok' };
  const prm = paramsOf(profile);
  return { value: currentValue(v, prm.current_ideal_ms, prm.current_max_ms), reason: `akıntı ${v.toFixed(2)} m/s, ${currentLabel(v, prm.current_ideal_ms)}` };
};
