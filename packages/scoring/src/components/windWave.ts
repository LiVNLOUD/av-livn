import type { Component, SpeciesParams } from '../types';
import { DEFAULT_PARAMS, paramsOf } from '../params';
import { angleDiff, clamp01, isNum } from '../util';

type WindCfg = SpeciesParams['wind'];

/** Wind value from speed (km/h) and angle between wind-from direction and the seaward shore normal. */
export function windValue(speedKmh: number, angleDeg: number | null, cfg: WindCfg = DEFAULT_PARAMS.wind): number {
  const onshore = angleDeg === null ? 0 : Math.cos((angleDeg * Math.PI) / 180);
  if (onshore > 1e-9) return 1 - onshore * clamp01((speedKmh - cfg.onshore_start_kmh) / cfg.onshore_span_kmh);
  return 1 - 0.5 * clamp01((speedKmh - cfg.offshore_ok_kmh) / cfg.offshore_span_kmh);
}

/** Wave factor: flat up to soft/2, falls to 0.7 at the soft limit, then to 0 at the hard limit. */
export function waveValue(h: number, soft = 0.6, hard = 1.2): number {
  const flat = soft / 2;
  if (h <= flat) return 1;
  if (h <= soft) return 1 - 0.3 * ((h - flat) / (soft - flat));
  return 0.7 * (1 - clamp01((h - soft) / (hard - soft)));
}

/** Wind direction relative to the shore: angle (or null) and a Turkish label. */
export function windSide(windDir: number | null | undefined, shoreNormalDeg: number | null): { angle: number | null; label: string } {
  if (!isNum(windDir) || shoreNormalDeg === null) return { angle: null, label: 'yön bilinmiyor' };
  const angle = angleDiff(windDir, shoreNormalDeg);
  const a = Math.abs(angle);
  return { angle, label: a < 60 ? 'kıyıya vuruyor' : a > 120 ? 'karadan' : 'yandan' };
}

export const ruzgar_dalga_kiyiya_gore: Component = ({ series, spot, profile }) => {
  const p = series.now;
  const hasWind = isNum(p?.windSpeed);
  const hasWave = isNum(p?.waveH);
  if (!hasWind && !hasWave) return { value: null, reason: 'rüzgar/dalga verisi yok' };
  const prm = paramsOf(profile);
  const parts: string[] = [];
  let value = 1;
  if (hasWind) {
    const side = windSide(p!.windDir, spot.shoreNormalDeg);
    value *= windValue(p!.windSpeed!, side.angle, prm.wind);
    parts.push(`rüzgar ${Math.round(p!.windSpeed!)} km/sa, ${side.label}`);
  }
  if (hasWave) {
    value *= waveValue(p!.waveH!, prm.wave_soft_limit_m, profile.safety.wave_m_max);
    parts.push(`dalga ${p!.waveH!.toFixed(1)} m`);
  }
  return { value, reason: parts.join('; ') };
};
