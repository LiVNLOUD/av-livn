import type { SpotV2, Weather } from '../../src';

export const BASE: SpotV2 = {
  kind: 'pier', ferry: false, lengthM: 184, dtm: { d0_50: 6.4, d50_150: 11.6, interpolated: true },
  substrate: { eusm: 'Sandy mud', conf: 2 }, fetchKm: [0.4, 0.5, 1, 3, 8, 20, 40, 60, 99, 60, 30, 10, 4, 1, 0.5, 0.4], lamp: null,
};
export const CALM: Weather = {
  sunAlt: -30, moonAlt: -10, moonFrac: 0.5, cloud: 20, windKmh: 8, gustKmh: 12, windDir: 0, waveM: 0.2, waveDir: 0,
  rain48: 0, sstD48: 0, sstDev: null, pressD3: 0, currentMs: 0.1, doy: 300,
};
