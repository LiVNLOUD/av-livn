import { akinti } from './components/current';
import { ay_evresi } from './components/moon';
import { gece_isik_penceresi } from './components/nightLight';
import { basinc_trendi_3_6s } from './components/pressure';
import { mevsim_katsayisi } from './components/season';
import { su_sicakligi_ve_3g_trend } from './components/sst';
import { ruzgar_dalga_kiyiya_gore } from './components/windWave';
import type { Component, HourlyPoint, ScoreResult, ScoredComponent, SeriesView, SpeciesProfile, SpotInput } from './types';
import { hourKey, isNum, round1 } from './util';

export const COMPONENTS: Record<string, Component> = {
  gece_isik_penceresi,
  ruzgar_dalga_kiyiya_gore,
  su_sicakligi_ve_3g_trend,
  basinc_trendi_3_6s,
  ay_evresi,
  akinti,
  mevsim_katsayisi,
};

/** Throws when a profile cannot be scored (e.g. TODO species with empty weights or unknown keys). */
export function assertScorable(profile: SpeciesProfile): void {
  const keys = Object.keys(profile.weights);
  if (keys.length === 0) throw new Error(`species profile "${profile.id}" has no weights (TODO)`);
  for (const k of keys) if (!COMPONENTS[k]) throw new Error(`unknown component "${k}" in profile "${profile.id}"`);
}

export function indexSeries(points: HourlyPoint[]): Map<string, HourlyPoint> {
  return new Map(points.map((p) => [hourKey(new Date(p.ts)), p]));
}

function view(index: Map<string, HourlyPoint>, at: Date): SeriesView {
  const base = new Date(hourKey(at)).getTime();
  return {
    at,
    now: index.get(hourKey(at)),
    offset: (h) => index.get(hourKey(new Date(base + h * 3_600_000))),
  };
}

/** Safety gate: gust above limit or waves above limit (strict >). */
export function safetyGate(p: HourlyPoint | undefined, profile: SpeciesProfile): string[] {
  const w: string[] = [];
  if (isNum(p?.windGust) && p.windGust > profile.safety.gust_kmh_max)
    w.push(`Hamle ${Math.round(p.windGust)} km/sa > ${profile.safety.gust_kmh_max} km/sa — güvenli değil`);
  if (isNum(p?.waveH) && p.waveH > profile.safety.wave_m_max)
    w.push(`Dalga ${p.waveH.toFixed(1)} m > ${profile.safety.wave_m_max} m — güvenli değil`);
  return w;
}

export function scoreAt(
  args: { spot: SpotInput; at: Date; profile: SpeciesProfile } & ({ points: HourlyPoint[] } | { index: Map<string, HourlyPoint> }),
): ScoreResult {
  const { spot, at, profile } = args;
  assertScorable(profile);
  const index = 'index' in args ? args.index : indexSeries(args.points);
  const series = view(index, at);
  const components: ScoredComponent[] = Object.entries(profile.weights).map(([key, weight]) => {
    const r = COMPONENTS[key]!({ series, spot, profile });
    return { key, weight, value: r.value, reason: r.reason, contribution: r.value === null ? null : weight * r.value };
  });
  const available = components.filter((c) => c.value !== null && c.weight > 0);
  const wSum = available.reduce((a, c) => a + c.weight, 0);
  const raw = wSum > 0 ? round1((available.reduce((a, c) => a + c.contribution!, 0) / wSum) * 100) : null;
  const warnings = safetyGate(series.now, profile);
  const gated = warnings.length > 0;
  const total = raw === null ? null : gated ? Math.min(raw, profile.safety.cap) : raw;
  return {
    ts: hourKey(at),
    total,
    raw,
    gated,
    warnings,
    missing: components.filter((c) => c.value === null).map((c) => c.key),
    components,
  };
}

/** Score `hours` consecutive hours starting at the hour containing `from`. */
export function scoreSeries(args: { spot: SpotInput; from: Date; hours: number; profile: SpeciesProfile; points: HourlyPoint[] }): ScoreResult[] {
  const index = indexSeries(args.points);
  const start = new Date(hourKey(args.from)).getTime();
  return Array.from({ length: args.hours }, (_, i) =>
    scoreAt({ spot: args.spot, profile: args.profile, index, at: new Date(start + i * 3_600_000) }),
  );
}
