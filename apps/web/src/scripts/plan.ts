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
export function trust(w: PlanWin, opts: { calibrated?: boolean } = {}): { level: TrustLevel; text: string } {
  if (w.assumed) {
    const d = driverOf(w.why ?? w.reason);
    const what =
      d === 'yapi' ? 'yer tipine dair varsayıma dayanıyor; sahada doğrulanmadı.'
      : d === 'lamba' ? 'iskelede ışık olması muhtemel varsayımına dayanıyor; ışık sahada doğrulanmadı.'
      : d === 'derinlik' ? 'tahmini su derinliğine dayanıyor; derinlik ölçülmedi.'
      : 'doğrulanmamış bir varsayıma dayanıyor.';
    return { level: 'Düşük', text: `Bu öneri çoğunlukla ${what}` };
  }
  if (w.missing) return { level: 'Düşük', text: 'Bazı hava ya da deniz verileri eksik; öneri eksik veriyle hesaplandı.' };
  if (w.tier === 'goreli') return { level: 'Orta', text: 'Bugünün en iyisi, ama koşullar genel olarak zayıf.' };
  const wide = w.p10 !== null && w.p90 !== null && w.p90 - w.p10 > 30;
  if ((w.top3 != null && w.top3 < 0.6) || wide) return { level: 'Orta', text: 'Yer ve saat iyi görünüyor, ama yakın seçeneklerden net ayrılmıyor.' };
  // N3 (MODEL.md §17): "Yüksek" only after the forward calibration has passed its first check
  if (!opts.calibrated) return { level: 'Orta', text: 'Koşullar güçlü ve öne çıkaran etken ölçülmüş veriye dayanıyor; ama model ileriye dönük av kaydıyla henüz doğrulanmadı (en fazla Orta).' };
  return { level: 'Yüksek', text: 'Koşullar güçlü, öne çıkaran etken ölçülmüş veriye dayanıyor ve model ileriye dönük av kaydında basit tahminleri geçti.' };
}

type Ev = 'saha' | 'uzaktan' | 'masabasi' | 'varsayim' | 'olcum' | 'enterp' | 'uzunluk' | 'bolgesel' | 'hesap' | null;
/** N2: evidence type of a reason line, from its source note (precompute_v2 EVIDENCE_TR texts). */
export function evidenceOf(text: string | null | undefined): Ev {
  const t = (text ?? '').toLocaleLowerCase('tr');
  if (/saha/.test(t)) return 'saha';
  if (/uzaktan/.test(t)) return 'uzaktan';
  if (/masa başı/.test(t)) return 'masabasi';
  if (/enterpolasyon/.test(t)) return 'enterp';
  if (/yapı uzunluğundan/.test(t)) return 'uzunluk';
  if (/emodnet ölçümü/.test(t)) return 'olcum';
  if (/euseamap|bölgesel/.test(t)) return 'bolgesel';
  if (/kıyı geometrisinden/.test(t)) return 'hesap';
  if (/varsayım|kanıt yok|kanıt c/.test(t)) return 'varsayim';
  return null;
}

/** Plain sentence for the reason line's driver, carrying the evidence type in everyday words (N2). */
export function driverSentence(why: string | null | undefined): string | null {
  const d = driverOf(why);
  const ev = evidenceOf(why);
  const kind = (why ?? '').replace(/ tipi.*$/i, '').replace(/\s*\(.*$/, '').trim();
  const Kind = kind ? kind.charAt(0).toLocaleUpperCase('tr') + kind.slice(1) : 'Yapı';
  switch (d) {
    case 'lamba':
      if (/aydınlatması yok/i.test(why ?? '')) return `İskelede ışık yok (${ev === 'saha' ? 'sahada görüldü' : ev === 'uzaktan' ? 'uzaktan gözlem, sahada doğrulanmadı' : 'harita/fotoğraf verisi, sahada doğrulanmadı'}).`;
      return ev === 'saha' ? 'İskele ışığı sahada doğrulandı; model ışığı bu tür için olumlu sayıyor.'
        : ev === 'uzaktan' ? 'İskelede ışık var görünüyor (uzaktan gözlem, sahada doğrulanmadı).'
        : ev === 'masabasi' ? 'İskelede ışık var gibi görünüyor (harita/fotoğraf verisi, sahada doğrulanmadı).'
        : 'İskelede ışık olması muhtemel (doğrulanmadı).';
    case 'yapi':
      return ev === 'saha' ? 'Yapı sahada doğrulandı; model bu yer tipini avantajlı sayıyor.' : `${Kind}: model bu yer tipini avantajlı sayıyor (tip tercihi varsayım, av kaydıyla doğrulanmadı).`;
    case 'derinlik': {
      const src = ev === 'saha' ? 'sahada ölçüldü' : ev === 'olcum' ? 'deniz haritası ölçümü' : ev === 'enterp' ? 'harita tahmini, ölçülmedi' : ev === 'uzunluk' ? 'yapı boyundan tahmin, ölçülmedi' : 'kaynağı doğrulanmadı';
      return `Atış mesafesinde yeterli su var (${src}).`;
    }
    case 'maruziyet': return 'Bu saatte rüzgardan diğer yerlere göre az etkileniyor (kıyı şekli ve rüzgar tahmininden hesap).';
    case 'taban': return `Deniz tabanının türü uygun görünüyor (${ev === 'saha' ? 'sahada gözlendi' : 'bölgesel harita, ölçülmedi'}).`;
    default: return why ? `${why.replace(/\s*\([^)]*\)\s*$/, '')} (kaynağı doğrulanmadı).` : null;
  }
}

/** Plain sentence for the weather at the peak hour (tackle inputs: wind, gust, wave). */
export function weatherSentence(windKmh: number | null, gustKmh: number | null, waveM: number | null): string {
  if (windKmh === null && waveM === null) return 'Rüzgar ve dalga verisi eksik.';
  const wnd = windKmh === null ? '' : `rüzgar ${Math.round(windKmh)} km/sa`;
  const wav = waveM === null ? '' : `dalga ${waveM.toFixed(1).replace('.', ',')} m`;
  const g = gustKmh ?? windKmh ?? 0;
  const head = (windKmh ?? 0) < 15 && (waveM ?? 0) < 0.5 && g < 25 ? 'Hava sakin' : (windKmh ?? 0) < 25 && (waveM ?? 0) < 1 ? 'Hafif rüzgarlı' : 'Rüzgarlı';
  return `${head}: ${[wnd, wav].filter(Boolean).join(', ')} (hava tahmini).`;
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

/**
 * O3: one line on the card when the plan's hour differs from now: why "now" scores low (safety cap: gusts or
 * waves) and from when it calms down. `calmFrom` = first hour after now without the cap (local "HH:MM").
 */
export function nowVsPlan(o: { nowGated: boolean; gustKmh: number | null; waveM: number | null; calmFrom: string | null; planIsNow: boolean; nowTotal: number | null; planTime: string }): string | null {
  if (o.planIsNow) return null;
  if (o.nowGated) {
    const why = o.gustKmh !== null && o.gustKmh >= 40 ? `rüzgar sert (hamle ${Math.round(o.gustKmh)} km/sa, güvenli değil)`
      : o.waveM !== null && o.waveM >= 1.2 ? `dalga yüksek (${o.waveM.toFixed(1).replace('.', ',')} m, güvenli değil)`
      : 'güvenlik sınırı aşılıyor (rüzgar ya da dalga)';
    return `Şu an ${why}; ${o.calmFrom ? `${o.calmFrom}'${ablative(o.calmFrom)} sonra yatışıyor` : 'önümüzdeki saatlerde de sürüyor'}.`;
  }
  return o.nowTotal !== null ? `Şu an puan ${Math.round(o.nowTotal)}; en iyi saat ${o.planTime}.` : null;
}

/** Turkish ablative suffix for a clock time read by its hour ("20:00'den", "19:00'dan", "03:00'ten"). */
export function ablative(hhmm: string): string {
  const h = Number(hhmm.slice(0, 2));
  const last = h === 0 ? 'sıfır' : h % 10 === 0 ? (h === 10 ? 'on' : 'yirmi') : ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'][h % 10]!;
  const vowel = [...last].reverse().find((c) => 'aıoueiöü'.includes(c))!;
  const back = 'aıou'.includes(vowel);
  const hard = /[çfhkpsşt]$/.test(last);
  return `${hard ? 't' : 'd'}${back ? 'a' : 'e'}n`;
}
