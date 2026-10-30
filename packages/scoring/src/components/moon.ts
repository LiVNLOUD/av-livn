import { getMoonIllumination, getMoonPosition } from 'suncalc';
import type { Component } from '../types';

/** Darker is better under lamps: 1 − illuminated fraction, damped when the moon is below the horizon. */
export function moonValue(fraction: number, moonUp: boolean): number {
  return 1 - fraction * (moonUp ? 1 : 0.4);
}

export const ay_evresi: Component = ({ series, spot }) => {
  const { fraction } = getMoonIllumination(series.at);
  const up = getMoonPosition(series.at, spot.lat, spot.lon).altitude > 0;
  return { value: moonValue(fraction, up), reason: `ay %${Math.round(fraction * 100)} dolu, ${up ? 'ufkun üstünde' : 'ufkun altında'}` };
};
