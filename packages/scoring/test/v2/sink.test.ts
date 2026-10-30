import { describe, expect, it } from 'vitest';
import { calibrateSink, fieldDepths, PRIOR_REL_SD, sinkSpeed } from '../../src';

describe('sink-time depth conversion', () => {
  it('prior speed grows with jighead weight', () => {
    expect(sinkSpeed(4)).toBeCloseTo(0.5, 6);
    expect(sinkSpeed(1)).toBeLessThan(sinkSpeed(2));
  });

  it('without plumb pairs uses the prior with ±40 %', () => {
    const { depths, calibration } = fieldDepths([{ distance_m: 30, sink_s: 10, jig_g: 4 }, { distance_m: 50, sink_s: 0, jig_g: 4 }], []);
    expect(calibration).toBeNull();
    expect(depths).toEqual([{ distance_m: 30, depth_m: 5, sd_m: 5 * PRIOR_REL_SD, quality: 'sink' }]);
  });

  it('calibrates the spot factor from plumb pairs (median) and narrows the uncertainty', () => {
    // true speed is 0.8 × prior: plumb 4 m where 2 g sinks for 14.14 s
    const t = 4 / (0.8 * sinkSpeed(2));
    const sinks = [{ distance_m: 20, sink_s: t, jig_g: 2 }, { distance_m: 100, sink_s: 20, jig_g: 2 }, { distance_m: 300, sink_s: 9, jig_g: 2 }];
    const plumbs = [{ distance_m: 25, depth_m: 4 }, { distance_m: 95, depth_m: 8 }, { distance_m: 105, depth_m: 8 }];
    const cal = calibrateSink(sinks, plumbs)!;
    expect(cal.pairs).toBe(2);
    expect(cal.k).toBeCloseTo((0.8 + 8 / (sinkSpeed(2) * 20)) / 2, 6);
    const { depths } = fieldDepths(sinks, plumbs);
    const far = depths.find((d) => d.distance_m === 300)!;
    expect(far.quality).toBe('sink_cal');
    expect(far.depth_m).toBeCloseTo(Math.round(cal.k * sinkSpeed(2) * 9 * 10) / 10, 6);
    expect(depths.filter((d) => d.quality === 'plumb').map((d) => d.sd_m)).toEqual([0.2, 0.4, 0.4]);
  });

  it('a single pair gets a default 15 % spread; zero sink times are ignored', () => {
    const cal = calibrateSink([{ distance_m: 10, sink_s: 10, jig_g: 1 }, { distance_m: 10, sink_s: 0, jig_g: 1 }], [{ distance_m: 12, depth_m: 2 }])!;
    expect(cal.pairs).toBe(1);
    expect(cal.k).toBeCloseTo(0.8, 6);
    expect(cal.relSd).toBeCloseTo(Math.sqrt(0.15 ** 2 + 0.1 ** 2), 6);
    expect(fieldDepths([{ distance_m: 5, sink_s: 3, jig_g: 0 }], [{ distance_m: 5, depth_m: 1 }]).depths.map((d) => d.quality)).toEqual(['plumb']);
  });
});
