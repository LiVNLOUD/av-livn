// M1: plain-language answers for the home plan card. Pure; the technical detail (band, top-3 share, evidence
// letters) stays under "Neden?" and never in these sentences.

export interface PlanWin {
  why: string | null;
  reason?: string | null;
  assumed: boolean;
  tier?: 'guclu' | 'goreli';
  missing?: string | null;
  top3?: number | null;
  p10: number | null;
  p90: number | null;
}

export type TrustLevel = 'Düşük' | 'Orta' | 'Yüksek';
type Driver = 'yapi' | 'lamba' | 'derinlik' | 'maruziyet' | 'taban' | null;

/** Which model term the reason line names (the texts of workers/api precompute_v2 reasonText). */
export function driverOf(text: string | null | undefined): Driver {
  const t = (text ?? '').toLocaleLowerCase('tr');
  if (/ tipi\b|^yapı \(/.test(t) || /^[^(]*tipi/.test(t)) return 'yapi';
  if (/aydınlatma/.test(t)) return 'lamba';
  if (/m su \(|derinlik/.test(t)) return 'derinlik';
  if (/rüzgar(ın)?a daha|rüzgara daha/.test(t)) return 'maruziyet';
  if (/^dip|dip:/.test(t)) return 'taban';
  return null;
}

/**
 * Trust of a suggestion (L1 rule): when its largest contribution rests on an assumption (evidence C, a prior or an
 * estimate that is not a measurement), trust is low and the sentence says so in plain words. Missing weather data
 * is also low. A relative-best window, a wide band or a pick the model cannot separate from others is medium.
 */
export function trust(w: PlanWin): { level: TrustLevel; text: string } {
  if (w.assumed) {
    const d = driverOf(w.why ?? w.reason);
    const what =
      d === 'yapi' ? 'yer tipine dair varsayıma dayanıyor; sahada doğrulanmadı.'
      : d === 'lamba' ? 'iskelede gece ışığı olduğu varsayımına dayanıyor; sahada doğrulanmadı.'
      : d === 'derinlik' ? 'tahmini su derinliğine dayanıyor; derinlik ölçülmedi.'
      : 'doğrulanmamış bir varsayıma dayanıyor.';
    return { level: 'Düşük', text: `Bu öneri çoğunlukla ${what}` };
  }
  if (w.missing) return { level: 'Düşük', text: 'Bazı hava ya da deniz verileri eksik; öneri eksik veriyle hesaplandı.' };
  if (w.tier === 'goreli') return { level: 'Orta', text: 'Bugünün en iyisi, ama koşullar genel olarak zayıf.' };
  const wide = w.p10 !== null && w.p90 !== null && w.p90 - w.p10 > 30;
  if ((w.top3 != null && w.top3 < 0.6) || wide) return { level: 'Orta', text: 'Yer ve saat iyi görünüyor, ama yakın seçeneklerden net ayrılmıyor.' };
  return { level: 'Yüksek', text: 'Koşullar güçlü ve öne çıkaran etken ölçülmüş veriye dayanıyor; yine de av kaydıyla doğrulanmadı.' };
}

/** Plain sentence for the reason line's driver. */
export function driverSentence(why: string | null | undefined): string | null {
  const d = driverOf(why);
  const kind = (why ?? '').replace(/ tipi.*$/i, '').replace(/\s*\(.*$/, '').trim();
  switch (d) {
    case 'yapi': return `${kind ? kind.charAt(0).toLocaleUpperCase('tr') + kind.slice(1) : 'Yapı'}: model bu yer tipini istavrit için avantajlı sayıyor.`;
    case 'lamba': return 'Gece iskele ışığı olabilir; model ışığı istavrit için olumlu sayıyor.';
    case 'derinlik': return 'Atış mesafesinde yeterli su var (tahmin).';
    case 'maruziyet': return 'Bu saatte rüzgardan diğer yerlere göre az etkileniyor.';
    case 'taban': return 'Deniz tabanının türü uygun görünüyor.';
    default: return why ? why.replace(/\s*\([^)]*\)\s*$/, '') + '.' : null;
  }
}

/** Plain sentence for the weather at the peak hour (tackle inputs: wind, gust, wave). */
export function weatherSentence(windKmh: number | null, gustKmh: number | null, waveM: number | null): string {
  if (windKmh === null && waveM === null) return 'Rüzgar ve dalga verisi eksik.';
  const wnd = windKmh === null ? '' : `rüzgar ${Math.round(windKmh)} km/sa`;
  const wav = waveM === null ? '' : `dalga ${waveM.toFixed(1).replace('.', ',')} m`;
  const g = gustKmh ?? windKmh ?? 0;
  const head = (windKmh ?? 0) < 15 && (waveM ?? 0) < 0.5 && g < 25 ? 'Hava sakin' : (windKmh ?? 0) < 25 && (waveM ?? 0) < 1 ? 'Hafif rüzgarlı' : 'Rüzgarlı';
  return `${head}: ${[wnd, wav].filter(Boolean).join(', ')}.`;
}

/** Plain sentence for the light at the best hour. */
export function lightSentence(sunAlt: number | null, time: string): string {
  if (sunAlt === null) return `En iyi saat ${time}.`;
  return `En iyi saat ${time}, ${sunAlt > 0 ? 'gündüz' : sunAlt > -6 ? 'alacakaranlık' : 'hava kararmışken'}.`;
}

/** "Two places look equally good" in words, for 2–3 equivalent options. */
export function equalText(n: number): string {
  const w = n === 2 ? 'İki' : n === 3 ? 'Üç' : String(n);
  return `${w} yer de aynı derecede iyi görünüyor; model birini öne çıkaramıyor.`;
}
