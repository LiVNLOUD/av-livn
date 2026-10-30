import type { Component } from '../types';
import { angleDiff, clamp01, isNum } from '../util';

/** Wind value from speed (km/h) and angle between wind-from direction and the seaward shore normal. */
export function windValue(speedKmh: number, angleDeg: number | null): number {
  const onshore = angleDeg === null ? 0 : Math.cos((angleDeg * Math.PI) / 180);
  if (onshore > 1e-9) return 1 - onshore * clamp01((speedKmh - 10) / 25);
  return 1 - 0.5 * clamp01((speedKmh - 20) / 20);
}

/** Wave factor: flat up to soft/2, falls to 0.7 at the soft limit, then to 0 at the hard limit. */
export function waveValue(h: number, soft = 0.6, hard = 1.2): number {
  const flat = soft / 2;
  if (h <= flat) return 1;
  if (h <= soft) return 1 - 0.3 * ((h - flat) / (soft - flat));
  return 0.7 * (1 - clamp01((h - soft) / (hard - soft)));
}

export const ruzgar_dalga_kiyiya_gore: Component = ({ series, spot, profile }) => {
  const p = series.now;
  const hasWind = isNum(p?.windSpeed);
  const hasWave = isNum(p?.waveH);
  if (!hasWind && !hasWave) return { value: null, reason: 'rüzgar/dalga verisi yok' };
  const parts: string[] = [];
  let value = 1;
  if (hasWind) {
    const angle = isNum(p!.windDir) && spot.shoreNormalDeg !== null ? angleDiff(p!.windDir, spot.shoreNormalDeg) : null;
    value *= windValue(p!.windSpeed!, angle);
    const side = angle === null ? 'yön bilinmiyor' : Math.abs(angle) < 60 ? 'kıyıya vuruyor' : Math.abs(angle) > 120 ? 'karadan' : 'yandan';
    parts.push(`rüzgar ${Math.round(p!.windSpeed!)} km/sa, ${side}`);
  }
  if (hasWave) {
    value *= waveValue(p!.waveH!, profile.params.wave_soft_limit_m, profile.safety.wave_m_max);
    parts.push(`dalga ${p!.waveH!.toFixed(1)} m`);
  }
  return { value, reason: parts.join('; ') };
};
