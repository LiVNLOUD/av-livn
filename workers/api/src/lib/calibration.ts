// N3 (docs/MODEL.md §17): the trust cap. Until the forward calibration (analysis/calibrate.py, D1 meta
// calibration_report[:species]) has passed its first check, no suggestion is shown with trust "Yüksek".

export const MIN_SESSIONS = 30;

interface Report {
  status?: string;
  n?: number;
  temporal?: { status?: string; model_beats_baselines?: boolean } | null;
}

/** First check passed: ≥ 30 forward sessions, a fitted model and, on the later held-out sessions, a better
 *  log-likelihood than every simple baseline (one rate, hour band, spot). */
export function calibrationPassed(r: Report | null | undefined): boolean {
  return !!r && r.status === 'tamam' && (r.n ?? 0) >= MIN_SESSIONS && r.temporal?.status === 'tamam' && r.temporal.model_beats_baselines === true;
}

export const reportKey = (species: string) => (species === 'istavrit' ? 'calibration_report' : `calibration_report:${species}`);

export function parseReport(json: string | null | undefined): Report | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as unknown;
    return v && typeof v === 'object' ? (v as Report) : null;
  } catch {
    return null;
  }
}
