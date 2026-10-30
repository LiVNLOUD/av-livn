// Per-condition suitability for the "Koşullar" panel. Every value is derived from the same functions the
// score uses, with the species profile's own thresholds, so colours change automatically with the species.
import { currentLabel, currentValue } from './components/current';
import { MOON_NEUTRAL, moonState, moonValue } from './components/moon';
import { pressureLabel, pressureRate, pressureValue } from './components/pressure';
import { su_sicakligi_ve_3g_trend } from './components/sst';
import { waveValue, windSide, windValue } from './components/windWave';
import { indexSeries, view, type SeriesIndex } from './engine';
import { gece_carpani } from './multipliers/night';
import { nightOf, paramsOf } from './params';
import type { HourlyPoint, SpeciesProfile, SpotInput } from './types';
import { isNum } from './util';

export type Band = 'good' | 'warn' | 'bad' | 'neutral';

/** Band thresholds on a 0..1 suitability: ≥ good → good, ≥ warn → warn, else bad. */
export const BAND_THRESHOLDS = { good: 0.75, warn: 0.4 } as const;

export function bandOf(suitability: number | null): Band {
  if (suitability === null) return 'neutral';
  if (suitability >= BAND_THRESHOLDS.good) return 'good';
  if (suitability >= BAND_THRESHOLDS.warn) return 'warn';
  return 'bad';
}

export interface ConditionView {
  key: string;
  label: string;
  /** Formatted value, or null when there is no data for this hour. */
  display: string | null;
  suitability: number | null;
  band: Band;
  /** One-line target from the species profile. */
  target: string;
  /** False when the value does not enter the score (shown grey). */
  affects: boolean;
}

/** Gust suitability: below the comfort limit 1, up to the safety limit 0.5, at/above it 0. */
export function gustValue(g: number, okKmh: number, maxKmh: number): number {
  if (g < okKmh) return 1;
  if (g < maxKmh) return 0.5;
  return 0;
}

const fmt = (x: number, d: number) => (Math.round(x * 1e6) / 1e6).toFixed(d).replace('-', '−');
const arrow = (delta: number, flat: number) => (delta > flat ? '↑' : delta < -flat ? '↓' : '→');

function cond(key: string, label: string, display: string | null, suitability: number | null, target: string, affects = true): ConditionView {
  const s = affects && display !== null ? suitability : null;
  return { key, label, display, suitability: s, band: bandOf(s), target, affects };
}

export function conditionsAt(
  args: { spot: SpotInput; at: Date; profile: SpeciesProfile } & ({ points: HourlyPoint[] } | { index: SeriesIndex }),
): ConditionView[] {
  const { spot, at, profile } = args;
  const index = 'index' in args ? args.index : indexSeries(args.points);
  const series = view(index, at);
  const p = series.now;
  const prm = paramsOf(profile);
  const nm = nightOf(profile);
  const out: ConditionView[] = [];

  const night = gece_carpani(at, spot, profile);
  const phaseTr = { full: 'tam gece', twilight: 'alacakaranlık', day: 'gündüz' }[night.phase];
  out.push(
    cond('gece_carpani', 'Gece çarpanı', `×${fmt(night.value, 2)}, ${phaseTr}`, night.value,
      `Tam gece ×${nm.full}, alacakaranlık ×${nm.twilight}, gündüz ×${nm.day}${spot.hasLight === true ? '' : `; lambasız ×${nm.no_light_factor}`}`),
  );

  const wind = isNum(p?.windSpeed) ? p.windSpeed : null;
  const side = windSide(p?.windDir, spot.shoreNormalDeg);
  out.push(
    cond('ruzgar', 'Rüzgar', wind === null ? null : `${Math.round(wind)} km/sa, ${side.label}`, wind === null ? null : windValue(wind, side.angle, prm.wind),
      `Karadan veya yandan ≤ ${prm.wind.offshore_ok_kmh} km/sa; kıyıya vuran ≤ ${prm.wind.onshore_start_kmh} km/sa`),
  );

  const gust = isNum(p?.windGust) ? p.windGust : null;
  out.push(
    cond('hamle', 'Hamle', gust === null ? null : `${Math.round(gust)} km/sa`, gust === null ? null : gustValue(gust, prm.gust_ok_kmh, profile.safety.gust_kmh_max),
      `< ${prm.gust_ok_kmh} km/sa; ${profile.safety.gust_kmh_max} km/sa ve üstü güvenli değil`),
  );

  const wave = isNum(p?.waveH) ? p.waveH : null;
  out.push(
    cond('dalga', 'Dalga', wave === null ? null : `${fmt(wave, 1)} m`, wave === null ? null : waveValue(wave, prm.wave_soft_limit_m, profile.safety.wave_m_max),
      `≤ ${prm.wave_soft_limit_m / 2} m ideal; ${prm.wave_soft_limit_m} m üstü cezalı; ${profile.safety.wave_m_max} m üstü güvenli değil`),
  );

  const sst = isNum(p?.sst) ? p.sst : null;
  const sstBefore = series.offset(-72)?.sst;
  const sstComp = su_sicakligi_ve_3g_trend({ series, spot, profile });
  const sstDisplay = sst === null ? null : `${fmt(sst, 1)} °C${isNum(sstBefore) ? ` ${arrow(sst - sstBefore, 0.25)} ${sst - sstBefore >= 0 ? '+' : ''}${fmt(sst - sstBefore, 1)} (3 gün)` : ''}`;
  out.push(
    cond('su', 'Su sıcaklığı', sstDisplay, sstComp.value,
      `${prm.sst_ideal_c[0]}–${prm.sst_ideal_c[1]} °C; 3 günde ±${prm.sst_trend_ok_c} °C`),
  );

  const pr = isNum(p?.pressure) ? p.pressure : null;
  const rate = pressureRate(series);
  const prLabel = rate === null ? '' : pressureLabel(rate, prm.pressure);
  const prArrow = prLabel === 'yükseliyor' ? '↑' : prLabel === 'stabil' ? '→' : '↓';
  const prDisplay = pr === null ? null : rate === null ? `${Math.round(pr)} hPa` : `${Math.round(pr)} hPa ${prArrow} ${rate >= 0 ? '+' : ''}${fmt(rate, 2)} hPa/sa, ${prLabel}`;
  out.push(
    cond('basinc', 'Basınç', prDisplay, rate === null ? null : pressureValue(rate, prm.pressure),
      `Stabil veya yavaş düşüş (${fmt(prm.pressure.ok[0], 1)}…+${prm.pressure.ok[1]} hPa/sa)`),
  );

  const cur = isNum(p?.curVel) ? p.curVel : null;
  out.push(
    cond('akinti', 'Akıntı', cur === null ? null : `${fmt(cur, 2)} m/s, ${currentLabel(cur, prm.current_ideal_ms)}`, cur === null ? null : currentValue(cur, prm.current_ideal_ms, prm.current_max_ms),
      `${prm.current_ideal_ms[0]}–${prm.current_ideal_ms[1]} m/s; ${prm.current_max_ms} m/s üstü çok sert`),
  );

  const moon = moonState(at, spot.lat, spot.lon);
  const moonDisplay = `%${Math.round(moon.fraction * 100)} dolu, ${moon.up ? 'ufkun üstünde' : 'ufkun altında'}`;
  out.push(
    spot.hasLight === true
      ? cond('ay', 'Ay', moonDisplay, moonValue(moon.fraction, moon.up), 'Lamba altında karanlık gece iyi')
      : cond('ay', 'Ay', moonDisplay, MOON_NEUTRAL, `Lambasız merada nötr (sabit ${MOON_NEUTRAL})`, false),
  );

  const temp = isNum(p?.temp) ? p.temp : null;
  out.push(cond('hava', 'Hava sıcaklığı', temp === null ? null : `${Math.round(temp)} °C`, null, 'Puanı etkilemez', false));
  const cloud = isNum(p?.cloud) ? p.cloud : null;
  out.push(cond('bulut', 'Bulut', cloud === null ? null : `%${Math.round(cloud)}`, null, 'Puanı etkilemez', false));
  return out;
}
