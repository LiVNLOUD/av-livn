import { bandOf, bandV2, KIND_LABEL_TR, kindTitle } from '@av-livn/scoring';

/** Spot type titles (G1: one source in @av-livn/scoring, no "undefined"). */
export const KIND_TR: Record<string, string> = Object.fromEntries(Object.keys(KIND_LABEL_TR).map((k) => [k, kindTitle(k)]));
export const STATUS_TR: Record<string, string> = { candidate: 'Doğrulanmadı', verified: 'Sahada doğrulandı', rejected: 'Elendi', proposed: 'Aday (onay bekliyor)' };

export const COMPONENT_TR: Record<string, string> = {
  ruzgar_dalga_kiyiya_gore: 'Rüzgar ve dalga (kıyıya göre)',
  su_sicakligi_ve_3g_trend: 'Su sıcaklığı ve 3 günlük eğilim',
  basinc_trendi_3_6s: 'Basınç eğilimi',
  ay_evresi: 'Ay',
  akinti: 'Akıntı',
  mevsim_katsayisi: 'Mevsim',
};

const tf = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit' });
const df = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'short', day: 'numeric', month: 'short' });
const wf = new Intl.DateTimeFormat('tr-TR', { timeZone: 'Europe/Istanbul', weekday: 'long' });

export const fmtTime = (iso: string) => tf.format(new Date(iso));
/** H5: full weekday first, then the date: "Pazar 1 Kas" (never "Paz"/"Pzt"). */
export const fmtDay = (iso: string) => {
  const parts = Object.fromEntries(df.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${wf.format(new Date(iso))} ${parts.day} ${parts.month}`;
};
export const fmtWeekday = (iso: string) => wf.format(new Date(iso));

export function fmtAgo(iso: string | null): string {
  if (!iso) return 'Hava verisi henüz alınmadı';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 2) return 'Veriler az önce güncellendi';
  if (min < 60) return `Veriler ${min} dk önce güncellendi`;
  return `Veriler ${Math.round(min / 60)} sa önce güncellendi`;
}

/** Fill a .lamp element for a score; colour band comes from the scoring engine's thresholds. */
export function lamp(el: HTMLElement, total: number | null, gated: boolean): void {
  const band = total === null ? 'none' : bandOf(total / 100);
  el.classList.remove('good', 'warn', 'bad', 'neutral', 'none');
  el.classList.add(band);
  el.classList.toggle('gated', gated);
  el.style.setProperty('--s', total === null ? '0' : String(Math.max(0, Math.min(1, total / 100))));
  el.textContent = total === null ? '–' : String(Math.round(total));
  el.setAttribute('aria-label', total === null ? 'Puan yok' : `Puan ${Math.round(total)} / 100${gated ? ', güvenlik uyarısı' : ''}`);
}

/** v2: same lamp, colour from the calibrated v2 bands (docs/MODEL.md §11). */
export function lampV2(el: HTMLElement, total: number | null, gated: boolean): void {
  lamp(el, total, gated);
  el.classList.remove('good', 'warn', 'bad', 'neutral', 'none');
  el.classList.add(total === null ? 'none' : bandV2(total));
}

export const compass = (deg: number | null): string =>
  deg === null ? '' : ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'][Math.round(((deg % 360) + 360) % 360 / 45) % 8]!;

export function esc(s: string | null | undefined): string {
  return (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * E7: 6/2 Tebliğ md. 16(5) — 1 Nisan–15 Kasım arası şamandıralı yüzme alanlarında avcılık yasak (docs/REGULATION.md).
 * Shown on beach spots for dates in that range: a warning, since buoyed areas are not mapped.
 */
export function swimRule(kind: string, iso: string | Date): string | null {
  if (kind !== 'beach') return null;
  const d = new Date(new Date(iso).getTime() + 3 * 3_600_000);
  const md = (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
  return md >= 401 && md <= 1115 ? 'Şamandıralı yüzme alanında avcılık yasak (1 Nis–15 Kas)' : null;
}

/** Asgari boy (cm), 6/2 Tebliğ Çizelge 7 — mirrors workers/api/src/routes/catch.ts LEGAL_MIN_CM. */
export const LEGAL_MIN_CM: Record<string, number> = { istavrit: 13, levrek: 25, 'lüfer': 18, kolyoz: 18, 'karagöz': 18, sargos: 21, 'çipura': 20, mezgit: 13 };
