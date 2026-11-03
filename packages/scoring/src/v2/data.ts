// I2: data sufficiency per hour (docs/MODEL.md §15). A missing input is never read as calm or clear water.
// The geometric mean leaves a missing term out; these rules decide what the hour may still be used for.
//   wind or wave missing      → 'yok'    : the safety gate cannot be checked, no recommendation
//   current or turbidity      → 'goreli' : at most a relative pick, shown with an "eksik veri" badge
//   water temperature change  → 'tam'    : listed as missing, but the term is small (w_sst 0.05)
import type { Weather } from './model';

export const MISSING = { ruzgar: 1, dalga: 2, akinti: 4, bulaniklik: 8, su_sicakligi: 16 } as const;
export type MissingKey = keyof typeof MISSING;
export type DataTier = 'tam' | 'goreli' | 'yok';

export const MISSING_TR: Record<MissingKey, string> = {
  ruzgar: 'rüzgar',
  dalga: 'dalga',
  akinti: 'akıntı',
  bulaniklik: 'bulanıklık (yağış)',
  su_sicakligi: 'su sıcaklığı değişimi',
};

/** Bit mask of the decision-relevant inputs that are missing at this hour (0 = complete). */
export function missingMask(w: Pick<Weather, 'windKmh' | 'waveM' | 'currentMs' | 'rain48' | 'sstD48'>): number {
  return (
    (w.windKmh === null ? MISSING.ruzgar : 0) |
    (w.waveM === null ? MISSING.dalga : 0) |
    (w.currentMs === null ? MISSING.akinti : 0) |
    (w.rain48 === null ? MISSING.bulaniklik : 0) |
    (w.sstD48 === null ? MISSING.su_sicakligi : 0)
  );
}

export function dataTier(mask: number): DataTier {
  if (mask & (MISSING.ruzgar | MISSING.dalga)) return 'yok';
  if (mask & (MISSING.akinti | MISSING.bulaniklik)) return 'goreli';
  return 'tam';
}

export function missingKeys(mask: number): MissingKey[] {
  return (Object.keys(MISSING) as MissingKey[]).filter((k) => mask & MISSING[k]);
}

/** Short Turkish note for a badge, or null when complete. */
export function missingNote(mask: number): string | null {
  if (!mask) return null;
  const tier = dataTier(mask);
  const list = missingKeys(mask).map((k) => MISSING_TR[k]).join(', ');
  return tier === 'yok' ? `${list} verisi yok: güvenlik denetlenemiyor, öneri verilmez` : `eksik veri: ${list}`;
}
