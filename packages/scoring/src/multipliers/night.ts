import { sunTimes } from '../astro';
import type { MultiplierResult, NightMultiplierConfig, NightPhase, SpeciesProfile, SpotInput } from '../types';
import { nightOf } from '../params';

const MIN = 60_000;
const PHASE_TR: Record<NightPhase, string> = { full: 'tam gece', twilight: 'alacakaranlık', day: 'gündüz' };

/** Phase of `at` given the sunrise/sunset of its local civil day. */
export function nightPhase(at: Date, sunrise: Date, sunset: Date, cfg: NightMultiplierConfig): NightPhase {
  const t = at.getTime();
  const sr = sunrise.getTime();
  const ss = sunset.getTime();
  if (t < sr - cfg.dawn_before_min * MIN) return 'full';
  if (t < sr + cfg.dawn_after_min * MIN) return 'twilight';
  if (t < ss - cfg.dusk_before_min * MIN) return 'day';
  if (t < ss + cfg.dusk_after_min * MIN) return 'twilight';
  return 'full';
}

/** Multiplier for a phase; spots without a (known) lamp get no_light_factor at night and twilight. */
export function nightValue(phase: NightPhase, hasLight: boolean | null, cfg: NightMultiplierConfig): number {
  const base = cfg[phase];
  return phase === 'day' || hasLight === true ? base : base * cfg.no_light_factor;
}

export function gece_carpani(at: Date, spot: SpotInput, profile: SpeciesProfile): MultiplierResult {
  const cfg = nightOf(profile);
  const times = sunTimes(at, spot.lat, spot.lon);
  const phase = nightPhase(at, times.sunrise, times.sunset, cfg);
  const value = nightValue(phase, spot.hasLight, cfg);
  const lamp = spot.hasLight === true ? 'lamba var' : spot.hasLight === false ? 'lamba yok' : 'lamba bilinmiyor, lambasız sayıldı';
  return { key: 'gece_carpani', value, phase, reason: `${PHASE_TR[phase]}${phase === 'day' ? '' : `; ${lamp}`}` };
}
