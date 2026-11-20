// Amateur fishing rules used by the app — one source for the engine, the worker and the web (docs/REGULATION.md).
// 6/2 Tebliğ No 2024/21 (RG 11.08.2024/32629), as amended by 2025/12 (RG 16.04.2025) and 2026/26
// (RG 16.09.2026/33372, in force on publication). Valid 01.09.2024–31.08.2028.

/** Minimum size (cm), Çizelge 7 "Denizlerde avlanabilecek türler"; total length unless marked otherwise. */
export const LEGAL_MIN_CM: Readonly<Record<string, number>> = {
  istavrit: 12, // 2026/26 md. 5: "13 cm" → "12 cm" (T. trachurus and T. mediterraneus)
  levrek: 25,
  'lüfer': 18,
  kolyoz: 18,
  'karagöz': 18, // Diplodus vulgaris
  sargos: 21,
  'çipura': 20,
  mezgit: 13,
};

/** Species the app records but Çizelge 7 does not list ("Diğer türler": no minimum size, counted in the kg limit). */
export const OTHER_SPECIES = ['izmarit', 'mırmır'] as const;

export const REG_SOURCE = '6/2 Tebliğ 2024/21, Çizelge 7 (2026/26 ile değişik)';

/** Daily quantity for kg-limited species, 6/2 Tebliğ md. 15(4) (RG 11.08.2024/32629), verbatim in docs/REGULATION.md:
 *  "…avlanılan tür tek veya karışık olsun 5 kg'ı geçemez. … tek bireyin 5 kg'ı geçmesi halinde, bu birey yasal limitler
 *  dâhilinde kabul edilir. Avlanan balıklardan en büyüğünün hariç tutulduğu durumda, geri kalan balıkların toplam
 *  ağırlığının 4 kg'ı geçmemesi halinde, avlanan balıklar alıkonulabilir miktar dâhiline kabul edilir."
 *  Per person (md. 15(5): "bir amatör balıkçının beraberinde götürebileceği toplam balık miktarı"). */
export const BAG_KG = 5;
export const BAG_KG_WITHOUT_LARGEST = 4;

export type BagLevel = 'ok' | 'yaklasti' | 'asti';
/**
 * Bag check for one person's catch of kg-limited species, on weights the user entered (never estimated here).
 * Legal when the total is ≤ 5 kg (sentence 1), or when the rest without the largest fish is ≤ 4 kg (sentence 3; a
 * single fish over 5 kg is its special case, sentence 2). So 'asti' only when total > 5 AND rest > 4.
 * 'yaklasti' is an information line, not a legal threshold: total ≥ 4 or rest ≥ 3,5 while still legal.
 */
export function bagCheck(totalKg: number, largestKg = 0): { level: BagLevel; text: string } {
  const largest = Math.min(Math.max(0, largestKg), totalKg);
  const rest = Math.max(0, totalKg - largest);
  if (totalKg > BAG_KG && rest > BAG_KG_WITHOUT_LARGEST)
    return { level: 'asti', text: `Günlük miktar aşıldı: toplam ${BAG_KG} kg'ı, en büyük balık hariç kalan ${BAG_KG_WITHOUT_LARGEST} kg'ı geçiyor (md. 15(4)).` };
  if (totalKg >= BAG_KG - 1 || rest >= 3.5)
    return { level: 'yaklasti', text: `Bilgi: kişi başı ${BAG_KG} kg; toplam ${BAG_KG} kg'ı geçerse en büyük balık hariç kalan ${BAG_KG_WITHOUT_LARGEST} kg'ı geçemez (md. 15(4)).` };
  return { level: 'ok', text: '' };
}

/** Size warning for one fish; null when the species has no minimum or the length is unknown. %5 tolerance (md. 15(2))
 *  is a matter for inspection, so the app warns at the minimum itself. */
export function sizeWarning(species: string, lengthCm: number | null): string | null {
  const min = LEGAL_MIN_CM[species];
  if (min === undefined || lengthCm === null) return null;
  return lengthCm < min ? `${String(lengthCm).replace('.', ',')} cm ${species} yasal asgari boyun (${min} cm) altında — denize geri bırakın.` : null;
}
