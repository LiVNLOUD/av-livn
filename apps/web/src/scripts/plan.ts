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
  if (/aydınlatma|ışığı görüldü/.test(t)) return 'lamba';
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
/**
 * P2 (MODEL.md §19): agreement of the weather models at one hour. Wind [min, max, sd] km/h and gust [min, max, sd]
 * across ICON, ECMWF IFS, GFS and ARPEGE. "gate": some models put the gust over the 40 km/h safety gate and
 * others under it; "wide": wind range over 12 km/h or sd over 5 km/h; null = models agree.
 */
export const GATE_GUST = 40;
export function modelAgreement(w: [number, number, number] | null, g: [number, number, number] | null): { split: 'gate' | 'wide' | null; text: string } | null {
  if (!w) return null;
  const rng = `${Math.round(w[0])}–${Math.round(w[1])} km/sa`;
  if (g && g[0] < GATE_GUST && g[1] >= GATE_GUST) return { split: 'gate', text: `Hava modelleri güvenlik konusunda ayrışıyor (hamle ${Math.round(g[0])}–${Math.round(g[1])} km/sa)` };
  if (w[1] - w[0] > 12 || w[2] > 5) return { split: 'wide', text: `Hava modelleri farklı şeyler söylüyor (rüzgar ${rng})` };
  return { split: null, text: `Hava modelleri uyuşuyor (rüzgar ${rng})` };
}

export function trust(w: PlanWin, opts: { calibrated?: boolean; weather?: 'gate' | 'wide' | null } = {}): { level: TrustLevel; text: string } {
  if (w.assumed) {
    const d = driverOf(w.why ?? w.reason);
    const what =
      d === 'yapi' ? 'yer tipine dair varsayıma dayanıyor; sahada doğrulanmadı.'
      : d === 'lamba' ? 'iskele aydınlatmasına dair bir varsayıma dayanıyor; ışık sahada doğrulanmadı.'
      : d === 'derinlik' ? 'tahmini su derinliğine dayanıyor; derinlik ölçülmedi.'
      : 'doğrulanmamış bir varsayıma dayanıyor.';
    return { level: 'Düşük', text: `Bu öneri çoğunlukla ${what}` };
  }
  if (w.missing) return { level: 'Düşük', text: 'Bazı hava ya da deniz verileri eksik; öneri eksik veriyle hesaplandı.' };
  // P2: when the weather models disagree about the safety gate, the hour may not be safe at all
  if (opts.weather === 'gate') return { level: 'Düşük', text: 'Hava modelleri bu saatin güvenli olup olmadığında ayrışıyor (hamle eşiği); öneri belirsiz.' };
  if (w.tier === 'goreli') return { level: 'Orta', text: 'Bugünün en iyisi, ama koşullar genel olarak zayıf.' };
  const wide = w.p10 !== null && w.p90 !== null && w.p90 - w.p10 > 30;
  if ((w.top3 != null && w.top3 < 0.6) || wide) return { level: 'Orta', text: 'Yer ve saat iyi görünüyor, ama yakın seçeneklerden net ayrılmıyor.' };
  if (opts.weather === 'wide') return { level: 'Orta', text: 'Yer iyi görünüyor, ama hava modelleri rüzgarda ayrışıyor; tahmin belirsiz.' };
  // N3 (MODEL.md §17): "Yüksek" only after the forward calibration has passed its first check
  if (!opts.calibrated) return { level: 'Orta', text: 'Koşullar güçlü ve öne çıkaran etken ölçülmüş veriye dayanıyor; ama model ileriye dönük av kaydıyla henüz doğrulanmadı (en fazla Orta).' };
  return { level: 'Yüksek', text: 'Koşullar güçlü, öne çıkaran etken ölçülmüş veriye dayanıyor ve model ileriye dönük av kaydında basit tahminleri geçti.' };
}

type Ev = 'saha' | 'uzaktan' | 'masabasi' | 'varsayim' | 'olcum' | 'enterp' | 'uzunluk' | 'bolgesel' | 'hesap' | 'lidar' | 'uydu' | null;
/** N2: evidence type of a reason line, from its source note (precompute_v2 EVIDENCE_TR texts). */
export function evidenceOf(text: string | null | undefined): Ev {
  const t = (text ?? '').toLocaleLowerCase('tr');
  if (/saha/.test(t)) return 'saha';
  if (/uzaktan/.test(t)) return 'uzaktan';
  if (/masa başı/.test(t)) return 'masabasi';
  if (/icesat|uydu lazer/.test(t)) return 'lidar';
  if (/sentinel|uydu görüntüsünden/.test(t)) return 'uydu';
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
      if (/aydınlatması bilinmiyor/i.test(why ?? '')) return 'İskele aydınlatması bilinmiyor; puan bu konuda bir varsayıma dayanıyor (sahada doğrulanmadı).';
      if (/ışığı görüldü/i.test(why ?? '')) return `Fotoğrafta/uzaktan iskele ışığı görüldü; gece çalıştığı doğrulanmadı (${ev === 'masabasi' ? 'harita/fotoğraf verisi' : 'uzaktan gözlem'}).`;
      if (/aydınlatması yok/i.test(why ?? '')) return `İskelede ışık yok (${ev === 'saha' ? 'sahada görüldü' : ev === 'uzaktan' ? 'uzaktan gözlem, sahada doğrulanmadı' : 'harita/fotoğraf verisi, sahada doğrulanmadı'}).`;
      return ev === 'saha' ? 'İskele ışığı sahada doğrulandı; model ışığı bu tür için olumlu sayıyor.'
        : ev === 'uzaktan' ? 'İskelede ışık var görünüyor (uzaktan gözlem, sahada doğrulanmadı).'
        : ev === 'masabasi' ? 'İskelede ışık var gibi görünüyor (harita/fotoğraf verisi, sahada doğrulanmadı).'
        : 'İskelede ışık olması muhtemel (doğrulanmadı).';
    case 'yapi':
      return ev === 'saha' ? 'Yapı sahada doğrulandı; model bu yer tipini avantajlı sayıyor.' : `${Kind}: model bu yer tipini avantajlı sayıyor (tip tercihi varsayım, av kaydıyla doğrulanmadı).`;
    case 'derinlik': {
      const src = ev === 'saha' ? 'sahada ölçüldü' : ev === 'olcum' ? 'deniz haritası ölçümü' : ev === 'lidar' ? 'uydu lazer ölçümü' : ev === 'uydu' ? 'uydu görüntüsünden tahmin, ölçülmedi' : ev === 'enterp' ? 'harita tahmini, ölçülmedi' : ev === 'uzunluk' ? 'yapı boyundan tahmin, ölçülmedi' : 'kaynağı doğrulanmadı';
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

/** Window fields the plan's choice needs (server plan candidates: marinas and outside spots already removed). */
export interface PickWin { spot_id: string; name: string; total: number; tier?: 'guclu' | 'goreli'; top3?: number | null; p10: number | null; p90: number | null }
/** K3 (MODEL.md §16): below this chance of staying in the top 3, the pick and overlapping alternatives are equals. */
export const EQ_TOP3 = 0.6;
/**
 * The plan card's choice (I9 + K3), shared by the card and by the early detail request (Q2): today's strong window,
 * else the nearest strong one in 72 h, else the relative best; up to two other spots; equal options (pick not
 * separable) listed by name, the first of which the card shows until the visitor picks another.
 */
export function planPick<W extends PickWin>(today: W[], all: W[]): { m: W; todayStrong: W | undefined; nextStrong: W | undefined; eqList: W[]; rest: W[] } | null {
  if (!all.length) return null;
  for (const w of today) w.tier ??= w.total >= 65 ? 'guclu' : 'goreli';
  const todayStrong = today.find((w) => w.tier === 'guclu');
  const nextStrong = all.find((w) => w.tier === 'guclu');
  const m = todayStrong ?? nextStrong ?? all[0]!;
  const pool = todayStrong ? [...today, ...all] : all;
  const others = pool.filter((w, i, arr) => w.spot_id !== m.spot_id && arr.findIndex((x) => x.spot_id === w.spot_id) === i).slice(0, 2);
  const overlaps = (w: W) => w.p90 !== null && m.p10 !== null && w.p90 >= m.p10;
  const eq = m.top3 != null && m.top3 < EQ_TOP3 ? [m, ...others.filter(overlaps)] : [m];
  const rest = others.filter((w) => !eq.includes(w));
  const eqList = eq.length >= 2 ? [...eq].sort((x, y) => x.name.localeCompare(y.name, 'tr')) : [m];
  return { m, todayStrong, nextStrong, eqList, rest };
}

// ---------------------------------------------------------------- V1.2: decision language and three trusts
/**
 * The headline answer. Never an unconditional "Evet": the wording follows the overall trust, so low trust can
 * only ever say "worth a try" (REVISION-V V1.2).
 */
export function verdictText(o: { todayStrong: boolean; nextStrong: boolean; trust: TrustLevel }): string {
  if (!o.todayStrong) return o.nextStrong ? 'Bugün zayıf görünüyor' : 'Zayıf görünüyor';
  return o.trust === 'Yüksek' ? 'İyi görünüyor' : o.trust === 'Orta' ? 'Uygun görünüyor' : 'Denemeye değer görünüyor';
}
export const trustTail = (l: TrustLevel): string =>
  l === 'Düşük' ? 'güven düşük (çoğunlukla varsayıma dayalı)' : l === 'Orta' ? 'güven orta' : 'güven yüksek';

export type FieldKinds = { lamba: string | null; derinlik: string | null; yapi: string | null; taban?: string | null } | null | undefined;
export interface TrustRow { key: 'hava' | 'mera' | 'av'; label: string; level: TrustLevel | null; value: string; text: string }

/** Spot knowledge from the kinds of evidence on record (field, remote/desk, none) for lamp, depth and structure. */
export function spotKnowledge(kinds: FieldKinds, lampState?: string | null): TrustRow {
  const k = kinds ?? { lamba: null, derinlik: null, yapi: null };
  const lamp = lampState === 'dogrulandi' || lampState === 'yok' ? 'saha' : lampState === 'goruldu' ? 'uzaktan' : k.lamba;
  const items: [string, string | null][] = [['lamba', lamp], ['derinlik', k.derinlik], ['yapı', k.yapi]];
  const field = items.filter(([, v]) => v === 'saha').map(([n]) => n);
  const seen = items.filter(([, v]) => v === 'uzaktan' || v === 'masabasi').map(([n]) => n);
  const none = items.filter(([, v]) => !v).map(([n]) => n);
  const level: TrustLevel = field.length >= 2 && field.includes('derinlik') ? 'Yüksek' : field.length >= 1 || seen.length >= 2 ? 'Orta' : 'Düşük';
  const join = (a: string[]) => a.join(' ve ');
  const parts = [field.length ? `${join(field)} sahada` : '', seen.length ? `${join(seen)} uzaktan/fotoğraftan` : '', none.length ? `${join(none)} tahmin ya da bilinmiyor` : ''].filter(Boolean);
  return { key: 'mera', label: 'Mera bilgisi', level, value: level, text: parts.join('; ') };
}

/** Weather trust from the model agreement (modelAgreement); null when the comparison is not available yet. */
export function weatherTrust(ag: ReturnType<typeof modelAgreement>): TrustRow {
  if (!ag) return { key: 'hava', label: 'Hava tahmini', level: null, value: 'Karşılaştırma yok', text: 'model karşılaştırması henüz yok' };
  const level: TrustLevel = ag.split === 'gate' ? 'Düşük' : ag.split === 'wide' ? 'Orta' : 'Yüksek';
  return { key: 'hava', label: 'Hava tahmini', level, value: ag.split === null ? 'Uyumlu' : ag.split === 'wide' ? 'Ayrışıyor' : 'Güvenlikte ayrışıyor', text: ag.text.replace(/^Hava modelleri /, 'modeller ') };
}

/** Catch verification: forward check of the model against logged sessions (/api/trust-gate). */
export function catchTrust(gate: { passed: boolean; n: number; min: number } | null): TrustRow {
  if (!gate) return { key: 'av', label: 'Av verimi doğrulaması', level: null, value: 'Bilinmiyor', text: 'doğrulama durumu alınamadı' };
  if (gate.passed) return { key: 'av', label: 'Av verimi doğrulaması', level: 'Yüksek', value: 'Doğrulandı', text: `${gate.n} kayıtlı seansta model basit tahminleri geçti` };
  return { key: 'av', label: 'Av verimi doğrulaması', level: 'Düşük', value: gate.n ? 'Yetersiz' : 'Yok', text: `kayıtlı av n = ${gate.n} (en az ${gate.min} gerekli); uygunluk puanı yerel avla doğrulanmadı` };
}
