import type { Component, SeriesView, SpeciesParams } from '../types';
import { DEFAULT_PARAMS, paramsOf } from '../params';
import { clamp01, isNum } from '../util';

type PressureCfg = SpeciesParams['pressure'];

/** Pressure tendency (hPa/h) → value. Stable or slow fall best, fast rise worst. */
export function pressureValue(rate: number, cfg: PressureCfg = DEFAULT_PARAMS.pressure): number {
  const [lo, hi] = cfg.ok;
  if (rate > hi) return 1 - clamp01((rate - hi) / (cfg.rise_zero - hi));
  if (rate < lo) return 1 - (1 - cfg.fall_floor) * clamp01((lo - rate) / (lo - cfg.fall_floor_at));
  return 1;
}

/** Mean of the 3 h and 6 h tendencies (hPa/h), or null without history. */
export function pressureRate(series: SeriesView): number | null {
  const p0 = series.now?.pressure;
  if (!isNum(p0)) return null;
  const rates: number[] = [];
  const p3 = series.offset(-3)?.pressure;
  const p6 = series.offset(-6)?.pressure;
  if (isNum(p3)) rates.push((p0 - p3) / 3);
  if (isNum(p6)) rates.push((p0 - p6) / 6);
  return rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
}

export function pressureLabel(rate: number, cfg: PressureCfg = DEFAULT_PARAMS.pressure): string {
  return rate > cfg.ok[1] ? 'yükseliyor' : rate < cfg.ok[0] ? 'hızlı düşüyor' : rate < -0.1 ? 'yavaş düşüyor' : 'stabil';
}

export const basinc_trendi_3_6s: Component = ({ series, profile }) => {
  const p0 = series.now?.pressure;
  if (!isNum(p0)) return { value: null, reason: 'basınç verisi yok' };
  const rate = pressureRate(series);
  if (rate === null) return { value: null, reason: 'basınç geçmişi yok' };
  const cfg = paramsOf(profile).pressure;
  return {
    value: pressureValue(rate, cfg),
    reason: `${p0.toFixed(0)} hPa, ${pressureLabel(rate, cfg)} (${rate >= 0 ? '+' : ''}${rate.toFixed(2)} hPa/sa)`,
  };
};
