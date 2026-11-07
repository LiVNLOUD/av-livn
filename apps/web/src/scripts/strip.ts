// O4: 24-hour strip of one spot on the plan card — score colour per hour, night/day band, safety hours hatched,
// the suggested window framed and the selected hour marked. Pure string builder; the page wires the clicks.
import { skyAt } from '@av-livn/scoring';
import { scoreColor } from './heatmap';

export interface StripIn {
  /** Epoch hour of the first column (now). */
  fromHour: number;
  /** Scores for the columns (null = no score). */
  t: (number | null)[];
  /** Columns under the safety cap. */
  gated: number[];
  /** Suggested window as column range [a, b) or null. */
  window: [number, number] | null;
  selected: number;
  lat?: number;
  lon?: number;
}

const TZ = 3;
export function stripSvg(o: StripIn, width = 640): string {
  const n = Math.min(24, o.t.length);
  const L = 0, top = 18, sky = 6;
  const cw = (width - L) / n;
  const ch = Math.round(Math.max(34, Math.min(56, cw * 0.9))); // O4: taller cells when the strip is wide
  const H = top + sky + ch + 18;
  const x = (c: number) => L + c * cw;
  const p: string[] = [
    '<defs><pattern id="st-gate" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1.6" height="5" fill="#ff7a6b" opacity="0.85"/></pattern></defs>',
  ];
  for (let c = 0; c < n; c++) {
    const alt = skyAt(new Date((o.fromHour + c + 0.5) * 3_600_000), o.lat ?? 40.42, o.lon ?? 28.98).sunAlt;
    p.push(`<rect class="st-sky" x="${x(c)}" y="${top}" width="${cw}" height="${sky}" fill="${alt < -6 ? '#06101a' : alt < 0 ? '#2a3a63' : '#3f5d72'}"/>`);
    const v = o.t[c] ?? null;
    const g = o.gated.includes(c);
    const lh = (o.fromHour + c + TZ) % 24;
    const label = v === null ? 'puan yok' : g ? 'güvenlik saati' : `puan ${Math.round(v)}`;
    p.push(`<rect class="st-cell${g ? ' gated' : ''}" data-c="${c}" x="${x(c) + 0.5}" y="${top + sky + 2}" width="${cw - 1}" height="${ch}" fill="${v === null ? '#132632' : g ? '#3a1c1f' : scoreColor(v)}"><title>${String(lh).padStart(2, '0')}:00 · ${label}</title></rect>`);
    if (g) p.push(`<rect x="${x(c) + 0.5}" y="${top + sky + 2}" width="${cw - 1}" height="${ch}" fill="url(#st-gate)" pointer-events="none"/>`);
    if (lh % 3 === 0) p.push(`<text class="st-tick" x="${x(c) + 2}" y="${top - 5}">${String(lh).padStart(2, '0')}</text>`);
  }
  if (o.window) {
    const [a, b] = [Math.max(0, o.window[0]), Math.min(n, o.window[1])];
    if (b > a) p.push(`<rect class="st-win" x="${x(a) + 1}" y="${top + sky + 1}" width="${(b - a) * cw - 2}" height="${ch + 2}" fill="none" stroke="#f5a83c" stroke-width="2" rx="3" pointer-events="none"/>`);
  }
  if (o.selected >= 0 && o.selected < n) {
    p.push(`<path class="st-sel" d="M${x(o.selected) + cw / 2 - 5} ${H - 2} l5 -7 l5 7z" fill="#dbe6ea"/>`);
  }
  return `<svg class="strip" viewBox="0 0 ${width} ${H}" width="100%" role="img" aria-label="Önümüzdeki 24 saat: puan, gece/gündüz, güvenlik saatleri ve önerilen pencere">${p.join('')}</svg>`;
}
