// G1: one source for the Turkish spot type names (reason lines, cards, lists). Every kind the engine accepts has a
// label; the test fails when a new kind is added without one.
import type { StructureKind } from './v2/model';

export const KIND_LABEL_TR: Record<StructureKind, string> = {
  pier: 'iskele',
  breakwater: 'mendirek',
  groyne: 'mahmuz',
  manual: 'elle eklenen yapı',
  quay: 'rıhtım',
  harbour: 'liman içi',
  rocky: 'kayalık kıyı',
  beach: 'kumsal',
  river_mouth: 'dere ağzı',
};

/** Lower-case label; unknown kinds read "yapı", never "undefined". */
export function kindLabel(kind: string): string {
  return (KIND_LABEL_TR as Record<string, string>)[kind] ?? 'yapı';
}

/** Sentence-case label for list/card subtitles. */
export function kindTitle(kind: string): string {
  const l = kindLabel(kind);
  return l.charAt(0).toLocaleUpperCase('tr') + l.slice(1);
}
