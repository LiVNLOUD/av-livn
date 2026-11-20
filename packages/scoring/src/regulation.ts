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

/** Daily quantity for kg-limited species, md. 15(4): 5 kg per person, single or mixed species; with the largest
 *  fish removed the rest may not exceed 4 kg. Limits are per person — the app divides by the people on the outing. */
export const BAG_KG = 5;
export const BAG_KG_WITHOUT_LARGEST = 4;

export type BagLevel = 'ok' | 'yaklasti' | 'asti';
/**
 * Bag check for one person's catch of kg-limited species (kg values entered by the user; never estimated here).
 * 'asti': over 5 kg, or over 4 kg once the largest fish is set aside. 'yaklasti': the rest has reached 4 kg
 * (one more fish may break the rule) or the total is within 1 kg of 5.
 */
export function bagCheck(totalKg: number, largestKg = 0): { level: BagLevel; text: string } {
  const rest = Math.max(0, totalKg - Math.max(0, largestKg));
  if (totalKg > BAG_KG || rest > BAG_KG_WITHOUT_LARGEST)
    return { level: 'asti', text: `Günlük sınır aşıldı: kişi başı ${BAG_KG} kg (en büyük balık hariç ${BAG_KG_WITHOUT_LARGEST} kg), md. 15(4).` };
  if (rest >= BAG_KG_WITHOUT_LARGEST || totalKg >= BAG_KG - 1)
    return { level: 'yaklasti', text: `Günlük sınıra yaklaştınız: kişi başı ${BAG_KG} kg (en büyük balık hariç ${BAG_KG_WITHOUT_LARGEST} kg), md. 15(4).` };
  return { level: 'ok', text: '' };
}

/** Size warning for one fish; null when the species has no minimum or the length is unknown. %5 tolerance (md. 15(2))
 *  is a matter for inspection, so the app warns at the minimum itself. */
export function sizeWarning(species: string, lengthCm: number | null): string | null {
  const min = LEGAL_MIN_CM[species];
  if (min === undefined || lengthCm === null) return null;
  return lengthCm < min ? `${String(lengthCm).replace('.', ',')} cm ${species} yasal asgari boyun (${min} cm) altında — denize geri bırakın.` : null;
}
