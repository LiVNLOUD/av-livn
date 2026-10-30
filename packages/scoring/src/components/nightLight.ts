import { getTimes } from 'suncalc';
import type { Component } from '../types';
import { TZ_OFFSET_MIN, clamp01 } from '../util';

const LIGHT_FACTOR = { yes: 1, unknown: 0.75, no: 0.5 } as const;

/** Night-window value for a time given that day's sunrise/sunset (all instants). */
export function nightWindowValue(at: Date, sunrise: Date, sunset: Date): { value: number; phase: string } {
  const t = at.getTime();
  if (t < sunrise.getTime()) return { value: 0.5, phase: 'gece yarısından sonra' };
  if (t < sunset.getTime()) return { value: 0.1, phase: 'gündüz' };
  const rampEnd = sunset.getTime() + 3_600_000;
  if (t < rampEnd) return { value: clamp01((t - sunset.getTime()) / 3_600_000), phase: 'gün batımı sonrası' };
  // `at` and `sunset` share the same local civil day, so t is before the next local midnight here.
  return { value: 1, phase: 'ışık penceresi' };
}

export function lightFactor(hasLight: boolean | null): number {
  if (hasLight === null) return LIGHT_FACTOR.unknown;
  return hasLight ? LIGHT_FACTOR.yes : LIGHT_FACTOR.no;
}

export const gece_isik_penceresi: Component = ({ series, spot }) => {
  const times = getTimes(series.at, spot.lat, spot.lon, 0, TZ_OFFSET_MIN);
  const { value, phase } = nightWindowValue(series.at, times.sunrise!, times.sunset!);
  const f = lightFactor(spot.hasLight);
  const lamp = spot.hasLight === null ? 'lamba bilinmiyor' : spot.hasLight ? 'lamba var' : 'lamba yok';
  return { value: value * f, reason: `${phase}; ${lamp}` };
};
