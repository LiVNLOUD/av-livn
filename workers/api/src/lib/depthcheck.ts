// V2.5 / D4: automatic consistency check for a raw field depth ("Dip: __ m", sinker on the bottom during fishing).
// The raw value is always stored as observed, with a method note and an assigned uncertainty. If every check passes
// it is used at once (with its uncertainty); otherwise it waits for the admin (status 'onaysiz'). Pure.

export interface DepthCheckInput {
  depthM: number;
  /** Distance from the shore/structure edge if the angler gave it; null = unknown (then not judged). */
  distanceM: number | null;
  /** Spot kind (iskele/mendirek edges can drop steeply). */
  kind: string;
  /** Approved field depths already on this spot (m). */
  neighbours: number[];
  /** DTM-based deepest point within 100 m of the spot (m, positive down), when known. */
  dtmMax100m: number | null;
}
export interface DepthCheck { name: 'olabilirlik' | 'kiyi_uzakligi' | 'komsu_kayitlar' | 'diger_kaynaklar'; ok: boolean; note: string }
export interface DepthCheckResult { ok: boolean; checks: DepthCheck[]; uncertaintyM: number; methodNote: string }

/** Plausible range for a sinker reaching the bottom from the shore in the Gemlik–Mudanya coast (m). */
export const DEPTH_RANGE: [number, number] = [0.2, 40];
export const METHOD_NOTE = 'kurşun dibe değince okundu; misina açısı ve akıntı belirsiz';

const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };
const f1 = (x: number) => String(Math.round(x * 10) / 10).replace('.', ',');

export function depthCheck(i: DepthCheckInput): DepthCheckResult {
  const d = i.depthM;
  const checks: DepthCheck[] = [];
  const [lo, hi] = DEPTH_RANGE;
  checks.push({ name: 'olabilirlik', ok: d >= lo && d <= hi, note: `${f1(d)} m, kıyıdan av için ${f1(lo)}–${hi} m aralığı` });
  if (i.distanceM !== null && i.distanceM > 0) {
    // steepest believable average slope: 1:1 off a pier or breakwater edge, 1:2 elsewhere
    const steep = i.kind === 'iskele' || i.kind === 'mendirek' || i.kind === 'rihtim' ? 1 : 0.5;
    const max = i.distanceM * steep + 2;
    checks.push({ name: 'kiyi_uzakligi', ok: d <= max, note: `${f1(i.distanceM)} m uzakta en çok ~${f1(max)} m beklenir` });
  } else checks.push({ name: 'kiyi_uzakligi', ok: true, note: 'uzaklık girilmedi; değerlendirilmedi' });
  if (i.neighbours.length) {
    const m = med(i.neighbours);
    const tol = Math.max(2, 0.5 * m);
    checks.push({ name: 'komsu_kayitlar', ok: Math.abs(d - m) <= tol, note: `aynı meradaki ${i.neighbours.length} kayıt medyanı ${f1(m)} m (±${f1(tol)} m)` });
  } else checks.push({ name: 'komsu_kayitlar', ok: true, note: 'bu merada başka saha kaydı yok' });
  if (i.dtmMax100m !== null) {
    // DTM smooths the near-shore bottom towards shallow (Tirilye: DTM 0–2 m, field ~5 m): only a gross mismatch fails
    const max = 3 * Math.max(0, i.dtmMax100m) + 6;
    checks.push({ name: 'diger_kaynaklar', ok: d <= max, note: `DTM 100 m içinde en derin ${f1(i.dtmMax100m)} m; DTM kıyıda sığa yumuşatır, ${f1(max)} m'ye kadar kabul` });
  } else checks.push({ name: 'diger_kaynaklar', ok: true, note: 'karşılaştırılacak kaynak yok' });
  // a sinker read on a sloping line overstates depth; current and line angle add spread
  const uncertaintyM = Math.round(Math.max(0.5, 0.15 * d) * 10) / 10;
  return { ok: checks.every((c) => c.ok), checks, uncertaintyM, methodNote: METHOD_NOTE };
}
