// "Why is this spot ranked here?" — term-level ablation (docs/MODEL.md §11). For each driver the spot's value
// is replaced in turn by every other spot's value (same hour, same weather); the driver whose replacement moves
// the score most (mean change) is the main reason. Positive delta: the driver lifts this spot above the others.
import { calibrate } from './calibrate';
import { lampPrior, rawScore, staticTerms, type SpotV2, type TermOverrides, type Weather } from './model';
import type { Params } from './params';

export type DriverKey = 'lamba' | 'yapi' | 'derinlik' | 'taban' | 'maruziyet';
export const DRIVERS: DriverKey[] = ['lamba', 'yapi', 'derinlik', 'taban', 'maruziyet'];

export interface Reason {
  key: DriverKey;
  /** Score of this spot minus the mean score with the driver taken from each other spot. */
  delta: number;
}

/** Main reason per spot at one hour (weather per spot). Empty input or a single spot → no reasons. */
export function explain(spots: SpotV2[], weather: Weather[], p: Params): (Reason | null)[] {
  if (spots.length < 2) return spots.map(() => null);
  const terms = spots.map((s) => staticTerms(s, p));
  const score = (s: SpotV2, w: Weather, ov?: TermOverrides) => calibrate(rawScore(s, w, p, undefined, ov).raw);
  const swap: Record<DriverKey, (i: number, j: number) => number> = {
    lamba: (i, j) => {
      const f = spots[j]!;
      const q = f.lamp === null ? lampPrior(f) : f.lamp ? 1 : 0;
      return score({ ...spots[i]!, lamp: null, lampP: q }, weather[i]!);
    },
    yapi: (i, j) => score(spots[i]!, weather[i]!, { struct: terms[j]!.struct }),
    derinlik: (i, j) => score(spots[i]!, weather[i]!, { depth: terms[j]!.depth }),
    taban: (i, j) => score(spots[i]!, weather[i]!, { substrate: terms[j]!.substrate }),
    maruziyet: (i, j) => score({ ...spots[i]!, fetchKm: spots[j]!.fetchKm }, weather[i]!),
  };
  return spots.map((s, i) => {
    const base = score(s, weather[i]!);
    let best: Reason | null = null;
    for (const key of DRIVERS) {
      let sum = 0;
      for (let j = 0; j < spots.length; j++) if (j !== i) sum += swap[key](i, j);
      const delta = Math.round((base - sum / (spots.length - 1)) * 10) / 10;
      if (!best || Math.abs(delta) > Math.abs(best.delta)) best = { key, delta };
    }
    return best;
  });
}
