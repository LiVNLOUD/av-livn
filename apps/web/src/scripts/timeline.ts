// V1.3 "av zaman çizelgesi": one horizontal chart per spot for the next 24 h. Rows share one hour axis and the selected
// hour is a single vertical line through all of them:
//   day/night band · suitability bars (fixed sequential scale, colour-blind safe) · wind line + gust band + direction
//   arrows · rain columns · wave line · safety hours · suggested window · missing data hatched.
// Pure string builder (tested); the page wires the clicks (data-c on the hit columns) to the hour store.
import { skyAt } from '@av-livn/scoring';

export interface TimelineIn {
  /** epoch hour of column 0 */
  fromHour: number;
  /** suitability 0–100 per column; null = no score */
  fit: (number | null)[];
  /** columns under the safety cap */
  gated: number[];
  /** suggested window as columns [a, b) */
  window: [number, number] | null;
  selected: number;
  /** km/h; null = missing. Absent arrays = not loaded yet (row shows "yükleniyor") */
  wind?: (number | null)[];
  gust?: (number | null)[];
  /** wind direction, degrees the wind comes FROM */
  dir?: (number | null)[];
  /** mm/h */
  rain?: (number | null)[];
  /** significant wave height, m */
  wave?: (number | null)[];
  /** sun altitude, degrees (else computed for lat/lon) */
  sun?: (number | null)[];
  lat?: number;
  lon?: number;
}

export const FIT_STEPS = [30, 45, 60, 75] as const;
/** Step 0–4 of the suitability scale (tokens --fit-0..4). */
export const fitStep = (v: number | null): number | null => (v === null ? null : FIT_STEPS.filter((s) => v >= s).length);

const TZ = 3;
const R = (v: number) => Math.round(v * 10) / 10;

export function timelineSvg(o: TimelineIn, width = 640, opts: { compact?: boolean } = {}): string {
  const n = Math.min(24, o.fit.length || 24);
  const labW = opts.compact ? 0 : 0;
  const cw = (width - labW) / n;
  const x = (c: number) => R(labW + c * cw);
  const rows = { head: 0, sky: 16, fit: 30, wind: 30 + 40 + 8, rain: 0, wave: 0, safe: 0, end: 0 };
  const FIT_H = opts.compact ? 32 : 40;
  const WIND_H = opts.compact ? 46 : 58;
  rows.fit = 30;
  rows.wind = rows.fit + FIT_H + 10;
  rows.rain = rows.wind + WIND_H + 8;
  rows.wave = rows.rain + 22;
  rows.safe = rows.wave + 22;
  rows.end = rows.safe + 14;
  const p: string[] = [
    '<defs><pattern id="tl-miss" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="1.5" height="6" class="tl-miss-l"/></pattern></defs>',
  ];
  // hour labels (local time); midnight carries the day
  for (let c = 0; c < n; c++) {
    const lh = (o.fromHour + c + TZ) % 24;
    if (lh % 3 === 0) p.push(`<text class="tl-hr" x="${R(x(c) + 2)}" y="11">${String(lh).padStart(2, '0')}</text>`);
  }
  // day / night band
  for (let c = 0; c < n; c++) {
    const alt = o.sun?.[c] ?? skyAt(new Date((o.fromHour + c + 0.5) * 3_600_000), o.lat ?? 40.42, o.lon ?? 28.98).sunAlt;
    p.push(`<rect class="tl-sky ${alt > 0 ? 'day' : alt > -6 ? 'tw' : 'night'}" x="${x(c)}" y="${rows.sky}" width="${R(cw + 0.4)}" height="8"/>`);
  }
  // suitability bars: height and colour step both encode the value
  for (let c = 0; c < n; c++) {
    const v = o.fit[c] ?? null;
    if (v === null) { p.push(`<rect class="tl-nodata" x="${R(x(c) + 1)}" y="${rows.fit}" width="${R(cw - 2)}" height="${FIT_H}" fill="url(#tl-miss)"/>`); continue; }
    const h = R(Math.max(3, (FIT_H * v) / 100));
    p.push(`<rect class="tl-fit f${fitStep(v)}" x="${R(x(c) + 1)}" y="${R(rows.fit + FIT_H - h)}" width="${R(cw - 2)}" height="${h}" rx="1.5"><title>${String((o.fromHour + c + TZ) % 24).padStart(2, '0')}:00 · uygunluk ${Math.round(v)}</title></rect>`);
  }
  // wind: gust band, mean line, arrows (fixed axis 0–40 km/h so the picture does not rescale with the weather)
  const WMAX = 40;
  const wy = (v: number) => R(rows.wind + 12 + (WIND_H - 12) * (1 - Math.min(v, WMAX) / WMAX));
  const cx = (c: number) => R(x(c) + cw / 2);
  if (!o.wind) p.push(`<text class="tl-note" x="4" y="${rows.wind + WIND_H / 2 + 4}">rüzgar yükleniyor…</text>`);
  else {
    for (const v of [10, 20, 30]) p.push(`<line class="tl-grid" x1="0" x2="${width}" y1="${wy(v)}" y2="${wy(v)}"/><text class="tl-ax" x="${width - 2}" y="${wy(v) - 2}" text-anchor="end">${v}</text>`);
    const segs: string[][] = [[]];
    o.wind.slice(0, n).forEach((v, c) => { if (v === null) segs.push([]); else segs[segs.length - 1]!.push(`${cx(c)},${wy(v)}`); });
    const gs = o.gust ?? [];
    for (let c = 0; c < n; c++) {
      const v = o.wind[c] ?? null, g = gs[c] ?? null;
      if (v === null) p.push(`<rect class="tl-nodata" x="${R(x(c) + 1)}" y="${rows.wind + 12}" width="${R(cw - 2)}" height="${WIND_H - 12}" fill="url(#tl-miss)"/>`);
      else if (g !== null && g > v) p.push(`<rect class="tl-gust" x="${R(x(c))}" y="${wy(g)}" width="${R(cw + 0.4)}" height="${R(wy(v) - wy(g))}"/>`);
    }
    for (const s of segs) if (s.length > 1) p.push(`<polyline class="tl-wind" points="${s.join(' ')}"/>`);
    (o.dir ?? []).slice(0, n).forEach((d, c) => {
      if (d === null || c % 2) return;
      p.push(`<path class="tl-arr" d="M0,-5 L3.5,3 L0,1.2 L-3.5,3 Z" transform="translate(${cx(c)},${rows.wind + 6}) rotate(${Math.round((d + 180) % 360)})"/>`);
    });
  }
  // rain: columns; 0 mm draws nothing, missing is hatched, not loaded says so
  if (!o.rain) p.push(`<text class="tl-note" x="4" y="${rows.rain + 14}">yağış yükleniyor…</text>`);
  else {
    const any = o.rain.slice(0, n).some((v) => (v ?? 0) >= 0.1);
    o.rain.slice(0, n).forEach((v, c) => {
      if (v === null) p.push(`<rect class="tl-nodata" x="${R(x(c) + 1)}" y="${rows.rain}" width="${R(cw - 2)}" height="18" fill="url(#tl-miss)"/>`);
      else if (v >= 0.1) { const h = R(Math.max(2, 18 * Math.min(v, 4) / 4)); p.push(`<rect class="tl-rain" x="${R(x(c) + 2)}" y="${R(rows.rain + 18 - h)}" width="${R(cw - 4)}" height="${h}"/>`); }
    });
    if (!any && o.rain.slice(0, n).some((v) => v !== null)) p.push(`<text class="tl-note" x="4" y="${rows.rain + 14}">yağış yok</text>`);
  }
  // wave: line on a fixed 0–2 m axis; no direction in the source grid
  if (!o.wave) p.push(`<text class="tl-note" x="4" y="${rows.wave + 14}">dalga yükleniyor…</text>`);
  else {
    const vy = (v: number) => R(rows.wave + 18 - 18 * Math.min(v, 2) / 2);
    const pts = o.wave.slice(0, n).map((v, c) => (v === null ? null : `${cx(c)},${vy(v)}`));
    if (pts.every((q) => q === null)) p.push(`<rect class="tl-nodata" x="0" y="${rows.wave}" width="${width}" height="18" fill="url(#tl-miss)"/><text class="tl-note" x="4" y="${rows.wave + 14}">dalga verisi yok</text>`);
    else {
      p.push(`<polyline class="tl-wave" points="${pts.filter(Boolean).join(' ')}"/>`);
      if (o.wave.every((v) => v === null || v < 0.05)) p.push(`<text class="tl-note" x="4" y="${rows.wave + 12}">dalga ≈ 0 m</text>`);
    }
  }
  // safety hours
  const gated = o.gated.filter((c) => c >= 0 && c < n);
  for (const c of gated) p.push(`<rect class="tl-gate" x="${R(x(c) + 1)}" y="${rows.safe}" width="${R(cw - 2)}" height="10"><title>güvenlik sınırı</title></rect>`);
  if (!gated.length) p.push(`<text class="tl-note" x="4" y="${rows.safe + 9}">güvenlik sınırı aşılan saat yok</text>`);
  // suggested window
  if (o.window) {
    const a = Math.max(0, o.window[0]), b = Math.min(n, o.window[1]);
    if (b > a) p.push(`<rect class="tl-win" x="${R(x(a) + 0.5)}" y="${rows.fit - 3}" width="${R((b - a) * cw - 1)}" height="${FIT_H + 6}" rx="4"/>`);
  }
  // the selected hour: one line through every row, with its label
  if (o.selected >= 0 && o.selected < n) {
    const sx = cx(o.selected);
    const lh = (o.fromHour + o.selected + TZ) % 24;
    p.push(`<line class="tl-sel" x1="${sx}" x2="${sx}" y1="${rows.sky - 2}" y2="${rows.end}"/><rect class="tl-sel-tag" x="${R(sx - 19)}" y="0" width="38" height="14" rx="3"/><text class="tl-sel-t" x="${sx}" y="11" text-anchor="middle">${String(lh).padStart(2, '0')}:00</text>`);
  }
  // hit columns for clicks / taps (full height)
  for (let c = 0; c < n; c++) p.push(`<rect class="tl-hit" data-c="${c}" x="${x(c)}" y="0" width="${R(cw)}" height="${rows.end}"><title>${String((o.fromHour + c + TZ) % 24).padStart(2, '0')}:00</title></rect>`);
  return `<svg class="timeline" viewBox="0 0 ${width} ${rows.end}" width="100%" role="img" aria-label="Av zaman çizelgesi: 24 saat, uygunluk, rüzgar, yağış, dalga, güvenlik ve önerilen pencere">${p.join('')}</svg>`;
}

/** Row labels (left column outside the SVG), same vertical positions as timelineSvg. */
export function timelineRows(compact = false): { label: string; top: number; h: number; icon: string }[] {
  const FIT_H = compact ? 32 : 40, WIND_H = compact ? 46 : 58;
  const fit = 30, wind = fit + FIT_H + 10, rain = wind + WIND_H + 8, wave = rain + 22, safe = wave + 22;
  return [
    { label: 'Gün / gece', top: 16, h: 8, icon: 'ay' },
    { label: 'Uygunluk', top: fit, h: FIT_H, icon: '' },
    { label: 'Rüzgar · hamle', top: wind, h: WIND_H, icon: 'ruzgar' },
    { label: 'Yağış', top: rain, h: 18, icon: 'yagis' },
    { label: 'Dalga', top: wave, h: 18, icon: 'dalga' },
    { label: 'Güvenlik', top: safe, h: 10, icon: 'guvenlik' },
  ];
}
