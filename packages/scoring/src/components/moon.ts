import { moonState } from '../astro';
import type { Component } from '../types';

/** Darker is better under lamps: 1 − illuminated fraction, damped when the moon is below the horizon. */
export function moonValue(fraction: number, moonUp: boolean): number {
  return 1 - fraction * (moonUp ? 1 : 0.4);
}

/** Neutral value used where there is no (known) lamp, until calibration says otherwise. */
export const MOON_NEUTRAL = 0.5;

export { moonState };

export const ay_evresi: Component = ({ series, spot }) => {
  const { fraction, up } = moonState(series.at, spot.lat, spot.lon);
  const desc = `ay %${Math.round(fraction * 100)} dolu, ${up ? 'ufkun üstünde' : 'ufkun altında'}`;
  if (spot.hasLight !== true) return { value: MOON_NEUTRAL, reason: `${desc}; lambasız merada nötr` };
  return { value: moonValue(fraction, up), reason: desc };
};
