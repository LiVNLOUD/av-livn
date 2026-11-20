// V2.3: small, consistent, brand-free product drawings for the inventory (24×24, currentColor strokes).
// Teaching sketches, not product photos; the same drawings label the rig scene's parts.
export type GearIcon = 'jighead' | 'silikon' | 'mikroJig' | 'kursun' | 'igne' | 'samandira' | 'capari' | 'hamsi' | 'karides' | 'midye';

const P: Record<GearIcon, string> = {
  // round lead head with an eye on top and the hook shank running back and up
  jighead: '<circle cx="8" cy="12" r="4"/><path d="M8 8V5"/><path d="M12 12h6a3 3 0 0 1-3 3"/><path d="M15 15l1.5-1"/>',
  // soft lure: tapered body, segmented, paddle tail
  silikon: '<path d="M3 12c3-3 9-3 13 0-4 3-10 3-13 0z"/><path d="M7 10.5v3M10 10v4"/><path d="M16 12l4-3v6z"/>',
  // slim metal blade with assist hook
  mikroJig: '<path d="M5 9l12-3-2 8-12 3z"/><path d="M5 9l-1-3"/><path d="M15 14l3 3a2 2 0 0 1-3 0"/>',
  // pear sinker with a line eye
  kursun: '<path d="M12 4v3"/><path d="M12 7c-3 3-5 7-3 10a4 4 0 0 0 6 0c2-3 0-7-3-10z"/>',
  // plain hook: eye, shank, bend, point
  igne: '<circle cx="12" cy="4" r="1.5"/><path d="M12 5.5v10a4 4 0 0 1-8 0v-2"/><path d="M4 13.5l2 1.5"/>',
  // float: antenna, body, stem
  samandira: '<path d="M12 2v5"/><path d="M12 7c-3 1-4 4-4 7s2 5 4 5 4-2 4-5-1-6-4-7z"/><path d="M8 13h8"/><path d="M12 19v3"/>',
  // sabiki: main line with three dropper hooks and feathers
  capari: '<path d="M12 2v20"/><path d="M12 6h4l1 2M12 11h4l1 2M12 16h4l1 2"/><path d="M16 6l2-1M16 11l2-1M16 16l2-1"/>',
  // anchovy piece: cut fish body
  hamsi: '<path d="M4 12c4-4 10-4 14 0l-2 0c-4 3-8 3-12 0z"/><path d="M18 12l2-2v4z"/><circle cx="7" cy="11.5" r=".6"/>',
  // shrimp: curled segmented body with antennae
  karides: '<path d="M18 8c-5-3-12 0-12 6 0 3 3 5 6 4"/><path d="M12 18l-2 2M9 11l2 2M12 9l1 3M15 9l0 3"/><path d="M18 8l3-3M18 8l4 0"/>',
  // mussel: elongated shell with growth lines
  midye: '<path d="M5 18c-2-6 4-14 12-14 2 6-4 14-12 14z"/><path d="M8 15c2-3 5-6 8-8M7 12c2-2 4-4 7-5"/>',
};

/** Inline SVG for a gear item (aria-hidden; the chip carries the text). */
export function gearSvg(name: GearIcon, size = 22): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="gear-ic">${P[name]}</svg>`;
}
export const GEAR_ICONS = Object.keys(P) as GearIcon[];
