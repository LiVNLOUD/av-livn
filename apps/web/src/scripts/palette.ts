// Suitability palette: the single source for condition colours, breakdown bars and the score ring.
// Bands come from the scoring engine (bandOf); colours are checked for ≥ 4.5:1 contrast on the page background.
import type { Band } from '@av-livn/scoring';

export const PAGE_BG = '#0e1c27';

export const PALETTE: Record<Band, { color: string; icon: string; label: string }> = {
  good: { color: '#5fd08a', icon: '✓', label: 'uygun' },
  warn: { color: '#f0a35e', icon: '~', label: 'sınırda' },
  bad: { color: '#ff7a6b', icon: '✕', label: 'uygun değil' },
  neutral: { color: '#8ba2ad', icon: '·', label: 'değerlendirilemedi' },
};

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m) as [number, number];
  return (x + 0.05) / (y + 0.05);
}
