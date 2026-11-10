// V1.0 icon set (apps/web/src/icons, Tabler-based + custom, docs/DESIGN.md): inline SVG strings, currentColor.
// Vite inlines the files at build time; no sprite request. Labels come from icons.json (Turkish).
import meta from '../icons/icons.json';

const RAW = import.meta.glob('../icons/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const BY_NAME: Record<string, string> = Object.fromEntries(Object.entries(RAW).map(([p, s]) => [p.replace(/^.*\/|\.svg$/g, ''), s]));

export type IconName = keyof typeof meta;
export const ICON_LABEL = Object.fromEntries(Object.entries(meta).map(([k, v]) => [k, (v as { label: string }).label])) as Record<IconName, string>;

/** Inline SVG markup for an icon; `label` makes it an image with a title, otherwise it is decorative (aria-hidden). */
export function icon(name: IconName, opts: { cls?: string; size?: number; label?: string } = {}): string {
  const src = BY_NAME[name];
  if (!src) throw new Error(`unknown icon: ${name}`);
  const size = opts.size ?? 20;
  const a11y = opts.label ? `role="img" aria-label="${opts.label.replace(/"/g, '&quot;')}"` : 'aria-hidden="true" focusable="false"';
  return src.replace('<svg ', `<svg class="i${opts.cls ? ' ' + opts.cls : ''}" ${a11y} `).replace(/width="24" height="24"/, `width="${size}" height="${size}"`);
}

/** Spot kind → icon (the map and lists use the same mapping). */
export const KIND_ICON: Record<string, IconName> = {
  pier: 'iskele', breakwater: 'mendirek', groyne: 'mendirek', promenade: 'kordon', seawall: 'kordon', rocky: 'kaya', rock: 'kaya',
  beach: 'kumsal', river_mouth: 'dere-agzi', harbour: 'liman', harbor: 'liman', quay: 'liman', marina: 'marina', manual: 'iskele',
};
export const kindIcon = (kind: string | null | undefined): IconName => KIND_ICON[kind ?? ''] ?? 'iskele';
