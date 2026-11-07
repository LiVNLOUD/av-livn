// O4: tackle picture for the plan — rod tip and line, jighead + soft lure (size by grams and cm, colour), the water
// column with the target layer highlighted and the count range. Conditional advice (lamp unknown) draws two small
// variants ("ışık suya düşüyorsa" / "karanlıksa"). No brand, no product shapes. Pure string builder.

export type Zone = 'yüzeye yakın' | 'orta su' | 'dibe yakın';
export interface RigVariant { label?: string; weightG: number; lureCm: number; color: string; zone: Zone; sink: string | null }

const ZONES: Zone[] = ['yüzeye yakın', 'orta su', 'dibe yakın'];
const COLOR: [RegExp, string][] = [[/şeffaf|beyaz|gümüş|simli/, '#e3edf2'], [/koyu|siyah|mor|siluet/, '#463f63'], [/parlak|chartreuse/, '#e8e23a'], [/doğal/, '#c9b28a']];
export const lureFill = (c: string) => COLOR.find(([re]) => re.test(c))?.[1] ?? '#c9b28a';
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function panel(v: RigVariant, ox: number, w: number): string {
  const top = v.label ? 22 : 8;
  const water = top + 14;
  const band = 30;
  const zi = Math.max(0, ZONES.indexOf(v.zone));
  const y = water + band * zi + band / 2;
  const r = Math.max(3, Math.min(8, 2.5 + Math.sqrt(v.weightG) * 1.4));
  const len = Math.max(14, Math.min(34, v.lureCm * 3.2));
  const cx = ox + w * 0.52;
  const p: string[] = [];
  if (v.label) p.push(`<text class="rg-var" x="${ox + 4}" y="14">${esc(v.label)}</text>`);
  // rod tip and line from above the surface
  p.push(`<path d="M${ox + 6} ${top + 2} Q${cx - 30} ${top - 2} ${cx} ${top + 4}" stroke="#9fb3bd" stroke-width="2" fill="none"/>`);
  ZONES.forEach((z, k) => {
    const yy = water + band * k;
    p.push(`<rect x="${ox}" y="${yy}" width="${w}" height="${band}" fill="${k === zi ? '#1d4a63' : k === 0 ? '#12324a' : k === 1 ? '#0f2b40' : '#0c2335'}"${k === zi ? ' stroke="#f5a83c" stroke-width="1.5"' : ''}/>`);
    p.push(`<text class="rg-zone${k === zi ? ' on' : ''}" x="${ox + 4}" y="${yy + 12}">${z}</text>`);
  });
  p.push(`<rect x="${ox}" y="${water + band * 3}" width="${w}" height="6" fill="#3b3326"/>`);
  p.push(`<path d="M${ox} ${water} q${w / 4} -4 ${w / 2} 0 t${w / 2} 0" stroke="#6fa3bf" fill="none" stroke-width="1.5"/>`);
  p.push(`<line x1="${cx}" y1="${top + 4}" x2="${cx}" y2="${y - r}" stroke="#dbe6ea" stroke-width="1" stroke-dasharray="3 2"/>`);
  p.push(`<circle class="rg-jig" cx="${cx}" cy="${y}" r="${r.toFixed(1)}" fill="#b9c4cc"/>`);
  p.push(`<path class="rg-lure" d="M${cx + r} ${y} q${len * 0.5} -${len * 0.22} ${len} ${len * 0.08} q-${len * 0.45} ${len * 0.2} -${len} -${len * 0.08}z" fill="${lureFill(v.color)}" stroke="#0e1c27" stroke-width=".6"/>`);
  const cap = `${String(v.weightG).replace('.', ',')} g · ${v.lureCm} cm${v.sink ? ` · say ${v.sink}` : ''}`;
  p.push(`<text class="rg-cap" x="${ox + 4}" y="${water + band * 3 + 20}">${esc(cap)}</text>`);
  return p.join('');
}

export function rigSvg(variants: RigVariant[], width = 320): string {
  const vs = variants.slice(0, 2);
  const gap = 12;
  const w = vs.length > 1 ? (width - gap) / 2 : width;
  const H = (vs.some((v) => v.label) ? 22 : 8) + 14 + 90 + 28;
  const body = vs.map((v, k) => panel(v, k * (w + gap), w)).join('');
  const desc = vs.map((v) => `${v.label ? `${v.label}: ` : ''}${v.weightG} g, ${v.lureCm} cm ${v.color} silikon, ${v.zone}`).join('; ');
  return `<svg class="rig-svg" viewBox="0 0 ${width} ${H}" width="100%" role="img" aria-label="${esc(`Takım görseli: ${desc}`)}">${body}</svg>`;
}
